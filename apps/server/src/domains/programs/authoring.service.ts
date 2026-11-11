// Program authoring (07-PROGRAMS.md §6–7, 03-UX.md §3–4).
// The draft is a ProgramVersion with publishedAt = null. Publishing freezes it; the next edit opens
// a new draft copied from the latest published version. Program.draftRevision guards concurrent edits.
import { Prisma, db, type ProgramLevel, type ProgramVersion, type SessionPresentation } from '@project/db'
import { badRequest, forbidden, notFound, versionConflict } from '../../lib/errors'
import { enqueue } from '../../lib/outbox'
import { afterCursor, pageArgs, pageOrder, toPage } from '../../lib/paging'
import { canReadRevision, canUseActivity, isOpenlyReadable } from '../activities/access'
import { loadRevisions, summarizeRevision } from '../activities/mapper'
import { publish as publishActivityRevision } from '../activities/activity.service'
import { canSeeProgram, isProgramOwner, marketplaceEnabled } from './access'
import { isPublishingRestricted } from '../social/moderation.service'
import { allocateProgramSlug } from './slug.service'
import { programInclude, toPlacement, toPrice, toProgramSummary } from './mapper'
import { authorFor, type Author } from '../admin/authors'
import { audit } from '../admin/audit'
import {
  DEFAULT_DURATION_DAYS,
  DEFAULT_FREQUENCY,
  countPlacements,
  frequencyLabel,
  generatePlacements,
  parseFrequency,
  programDays,
  type Frequency,
  type GenerationMode,
} from './schedule'

type Tx = Prisma.TransactionClient
type Visibility = 'PRIVATE' | 'UNLISTED' | 'PUBLIC'
type AccessMode = 'OPEN' | 'APPROVAL' | 'PAID'

// ── Draft plumbing ──────────────────────────────────────────────────────────

/** The owner's Program, or a platform Program for an active admin (12 §7a). */
async function ownedProgram(tx: Tx, userId: string, programId: string, opts: { allowArchived?: boolean } = {}) {
  const p = await tx.program.findUnique({ where: { id: programId } })
  if (!p || !(await authorFor(userId, tx)).program(p)) throw notFound('Program')
  if (p.status === 'ARCHIVED' && !opts.allowArchived) throw forbidden('Archived programs cannot be edited')
  return p
}

/** Admin changes to platform content are audited; owners' own changes are not moderation. */
const auditPlatform = (tx: Tx, author: Author, p: { id: string; creatorId: string | null }, action: 'PUBLISH' | 'ARCHIVE', reason: string) =>
  author.platform && p.creatorId === null ? audit(tx, author.userId, 'PROGRAM', p.id, action, reason) : null

async function draftVersion(tx: Tx, programId: string) {
  return tx.programVersion.findFirst({ where: { programId, publishedAt: null } })
}

/** The editable draft, creating one from the latest published version when needed. */
async function openDraftVersion(tx: Tx, userId: string, programId: string): Promise<ProgramVersion> {
  const existing = await draftVersion(tx, programId)
  if (existing) return existing
  const latest = await tx.programVersion.findFirst({ where: { programId, publishedAt: { not: null } }, orderBy: { versionNumber: 'desc' }, include: { items: true } })
  if (!latest) throw notFound('Program')
  const { id: _id, publishedAt: _p, createdAt: _c, items, ...rest } = latest
  return tx.programVersion.create({
    data: {
      ...rest,
      frequency: latest.frequency as Prisma.InputJsonValue,
      versionNumber: latest.versionNumber + 1,
      createdById: userId,
      items: {
        create: items.map(({ id: _i, programVersionId: _v, frequency, targetOverrides, ...item }) => ({
          ...item,
          frequency: (frequency ?? undefined) as Prisma.InputJsonValue | undefined,
          targetOverrides: (targetOverrides ?? undefined) as Prisma.InputJsonValue | undefined,
        })),
      },
    },
  })
}

/** Optimistic lock: bump Program.draftRevision only if it still equals expectedRevision. */
async function bump(tx: Tx, programId: string, expectedRevision: number) {
  const r = await tx.program.updateMany({ where: { id: programId, draftRevision: expectedRevision }, data: { draftRevision: { increment: 1 } } })
  if (r.count === 0) throw versionConflict()
}

async function refreshCounts(tx: Tx, versionId: string) {
  const items = await tx.programScheduleItem.findMany({ where: { programVersionId: versionId }, select: { relativeDay: true } })
  await tx.programVersion.update({ where: { id: versionId }, data: countPlacements(items) })
}

type SelectedActivity = { activityId: string; activityRevisionId: string; frequency: Frequency | null; localTime: string | null }

/** Selected Activities in display order: first appearance by day, then position. */
async function selectedActivities(tx: Tx, versionId: string): Promise<SelectedActivity[]> {
  const items = await tx.programScheduleItem.findMany({
    where: { programVersionId: versionId },
    orderBy: [{ relativeDay: 'asc' }, { position: 'asc' }],
    select: { activityId: true, activityRevisionId: true, frequency: true, localTime: true },
  })
  const seen = new Map<string, SelectedActivity>()
  for (const i of items) {
    const existing = seen.get(i.activityId)
    const freq = i.frequency ? parseFrequency(i.frequency) : null
    if (!existing) {
      seen.set(i.activityId, { activityId: i.activityId, activityRevisionId: i.activityRevisionId, frequency: freq, localTime: i.localTime ?? null })
    } else {
      if (!existing.frequency && freq) existing.frequency = freq
      if (!existing.localTime && i.localTime) existing.localTime = i.localTime
    }
  }
  return [...seen.values()]
}

/**
 * Regenerates automatic placements (07 §7). Manual placements survive; a generated slot is skipped
 * when the same Activity already has a manual placement that day.
 */
export async function regenerate(tx: Tx, version: ProgramVersion, order: { activityId: string; activityRevisionId: string; frequency?: Frequency | null; localTime?: string | null }[], keepManual = true) {
  await tx.programScheduleItem.deleteMany({ where: { programVersionId: version.id, ...(keepManual ? { isManual: false } : {}) } })
  const manual = keepManual ? await tx.programScheduleItem.findMany({ where: { programVersionId: version.id }, select: { activityId: true, relativeDay: true } }) : []
  const taken = new Set(manual.map((m) => `${m.activityId}:${m.relativeDay}`))
  const defaultFreq = parseFrequency(version.frequency)
  let rows: Prisma.ProgramScheduleItemCreateManyInput[]
  if (version.generationMode === 'ROTATE') {
    const generated = generatePlacements(order.length, defaultFreq, version.durationDays, version.generationMode, version.cycleDays ?? undefined)
    rows = generated
      .map((g) => {
        const entry = order[g.activityIndex]!
        return {
          activityId: entry.activityId,
          activityRevisionId: entry.activityRevisionId,
          relativeDay: g.relativeDay,
          localTime: entry.localTime ?? null,
          position: g.position,
          frequency: (entry.frequency ?? undefined) as Prisma.InputJsonValue | undefined,
        }
      })
      .filter((r) => !taken.has(`${r.activityId}:${r.relativeDay}`))
      .map((r) => ({ ...r, programVersionId: version.id, isManual: false }))
  } else {
    const dayPositions = new Map<number, number>()
    rows = []
    for (const entry of order) {
      const freq = entry.frequency ?? defaultFreq
      const days = programDays(freq, version.durationDays, version.cycleDays ?? undefined)
      for (const relativeDay of days) {
        if (taken.has(`${entry.activityId}:${relativeDay}`)) continue
        const position = dayPositions.get(relativeDay) ?? 0
        dayPositions.set(relativeDay, position + 1)
        rows.push({
          programVersionId: version.id,
          activityId: entry.activityId,
          activityRevisionId: entry.activityRevisionId,
          relativeDay,
          localTime: entry.localTime ?? null,
          position,
          frequency: (entry.frequency ?? undefined) as Prisma.InputJsonValue | undefined,
          isManual: false,
        })
      }
    }
  }
  if (rows.length) await tx.programScheduleItem.createMany({ data: rows })
  await refreshCounts(tx, version.id)
}

// ── Reading ─────────────────────────────────────────────────────────────────

export async function workspace(userId: string, programId: string) {
  const p = await db.program.findUnique({ where: { id: programId }, include: programInclude })
  const author = await authorFor(userId)
  if (!p || !author.program(p)) throw notFound('Program')
  const draft = await draftVersion(db, programId)
  const version = draft ?? p.latestPublished
  if (!version) throw notFound('Program')
  const items = await db.programScheduleItem.findMany({ where: { programVersionId: version.id }, orderBy: [{ relativeDay: 'asc' }, { position: 'asc' }] })
  const revs = await loadRevisions(items.map((i) => i.activityRevisionId))
  const activities = await db.activity.findMany({ where: { id: { in: [...new Set(items.map((i) => i.activityId))] } } })
  const byId = new Map(activities.map((a) => [a.id, a]))
  const order = await selectedActivities(db, version.id)
  const defaultFreq = parseFrequency(version.frequency)
  const rows = order.map(({ activityId, activityRevisionId, frequency }) => {
    const rev = revs.get(activityRevisionId) ?? null
    const s = summarizeRevision(rev)
    const rowFreq = frequency ?? defaultFreq
    return {
      activityId,
      revisionId: activityRevisionId,
      title: rev?.titleSnapshot ?? byId.get(activityId)?.title ?? 'Activity',
      durationMinutes: rev ? rev.durationMinutesSnapshot : (byId.get(activityId)?.durationMinutes ?? null),
      targetTime: rev ? rev.targetTimeSnapshot : (byId.get(activityId)?.targetTime ?? null),
      frequency: rowFreq,
      frequencyLabel: frequencyLabel(rowFreq) ?? '3 days/week',
      instructionCount: s.instructionCount,
      mediaCount: s.mediaCount,
      metrics: s.metricLabels,
      placementCount: items.filter((i) => i.activityId === activityId).length,
      canEdit: author.activity(byId.get(activityId) ?? { creatorId: '' }),
    }
  })
  return {
    ...toProgramSummary(p, 'OWNER', version),
    status: p.status,
    frequency: parseFrequency(version.frequency),
    generationMode: version.generationMode,
    description: version.description,
    activityCount: rows.length,
    instructionCount: rows.reduce((n, r) => n + r.instructionCount, 0),
    activities: rows,
    draftRevision: p.draftRevision,
    draftVersionId: draft?.id ?? null,
    latestPublishedVersionId: p.latestPublishedVersionId,
    hasUnpublishedChanges: !!draft && !!p.latestPublishedVersionId,
  }
}

export async function listMine(userId: string, query: { status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; cursor?: string; limit?: number }) {
  const { limit, take } = pageArgs(query)
  const rows = await db.program.findMany({
    where: { creatorId: userId, deletedAt: null, ...(query.status ? { status: query.status } : {}), ...afterCursor(query.cursor) },
    orderBy: pageOrder,
    take,
    include: programInclude,
  })
  const drafts = await db.programVersion.findMany({ where: { programId: { in: rows.map((r) => r.id) }, publishedAt: null } })
  return toPage(rows, limit, (p) => toProgramSummary(p, 'OWNER', drafts.find((d) => d.programId === p.id) ?? p.latestPublished))
}

// ── Creation and editing ────────────────────────────────────────────────────

export async function create(userId: string, input: { programTypeId: string; focusId?: string | null; owner?: 'SELF' | 'PLATFORM' }) {
  const platform = input.owner === 'PLATFORM'
  if (platform && !(await authorFor(userId)).platform) throw forbidden('Only admins create platform programs')
  const creatorId = platform ? null : userId
  const type = await db.programType.findFirst({
    where: { id: input.programTypeId, isActive: true, OR: [{ reviewState: 'APPROVED' }, { createdById: userId }] },
  })
  if (!type) throw badRequest('Choose what you are creating', { programTypeId: 'not found' })
  const focus = input.focusId
    ? await db.focus.findFirst({ where: { id: input.focusId, OR: [{ reviewState: 'APPROVED' }, { createdById: userId }] } })
    : null
  if (input.focusId && !focus) throw badRequest('Choose a focus', { focusId: 'not found' })
  const prefs = await db.userPreference.findUnique({ where: { userId } })
  // A suggested, editable name from the selections (03 §3 stage 7); never a user-entered fact.
  const title = `${platform ? '' : 'My '}${focus ? `${focus.label} ` : ''}${type.label}`.slice(0, 140)
  const p = await db.$transaction(async (tx) => {
    const program = await tx.program.create({
      data: {
        creatorId,
        title,
        categoryId: type.categoryId,
        programTypeId: type.id,
        focusId: focus?.id ?? null,
        visibility: platform ? 'PRIVATE' : prefs?.defaultVisibility ?? 'PRIVATE',
        policy: { create: { accessMode: 'OPEN' } },
      },
    })
    await tx.programVersion.create({
      data: {
        programId: program.id,
        versionNumber: 1,
        title,
        programTypeId: type.id,
        focusId: focus?.id ?? null,
        durationDays: DEFAULT_DURATION_DAYS,
        frequency: DEFAULT_FREQUENCY as Prisma.InputJsonValue,
        createdById: userId,
      },
    })
    await allocateProgramSlug(tx, { programId: program.id, creatorId, title })
    return program
  })
  return workspace(userId, p.id)
}

async function assertCover(userId: string, mediaId: string) {
  const asset = await db.mediaAsset.findFirst({ where: { id: mediaId, deletedAt: null, OR: [{ ownerId: userId }, { ownerId: null }] } })
  if (!asset || (asset.type !== 'PHOTO' && asset.type !== 'VIDEO')) throw badRequest('Choose one of your media files or a platform media file', { coverMediaId: 'not found' })
  if (asset.state !== 'READY') throw badRequest('That media is still processing', { coverMediaId: 'is not ready' })
}

export async function updateDraft(
  userId: string,
  programId: string,
  input: {
    title?: string
    description?: string | null
    categoryId?: string
    programTypeId?: string
    focusId?: string | null
    level?: ProgramLevel
    sessionMinutes?: number | null
    sessionPresentation?: SessionPresentation
    tagSlugs?: string[]
    coverMediaId?: string | null
    durationDays?: number | null
    frequency?: Frequency
    generationMode?: GenerationMode
    visibility?: Visibility
    expectedRevision: number
  },
) {
  if (input.title !== undefined && !input.title.trim()) throw badRequest('Name the program', { title: 'is required' })
  if (input.sessionMinutes !== undefined && input.sessionMinutes !== null && (!Number.isInteger(input.sessionMinutes) || input.sessionMinutes < 1 || input.sessionMinutes > 1440)) {
    throw badRequest('Choose a valid session length', { sessionMinutes: 'must be between 1 and 1440 minutes' })
  }
  if (input.programTypeId) {
    const t = await db.programType.findFirst({ where: { id: input.programTypeId, OR: [{ reviewState: 'APPROVED' }, { createdById: userId }] } })
    if (!t) throw badRequest('Choose a type', { programTypeId: 'not found' })
    input.categoryId ??= t.categoryId
  }
  if (input.focusId) {
    const f = await db.focus.findFirst({ where: { id: input.focusId, OR: [{ reviewState: 'APPROVED' }, { createdById: userId }] } })
    if (!f) throw badRequest('Choose a focus', { focusId: 'not found' })
  }
  const tagSlugs = input.tagSlugs !== undefined ? [...new Set(input.tagSlugs.map((s) => s.trim()).filter(Boolean))] : undefined
  const resolvedTags = tagSlugs !== undefined
    ? await db.tag.findMany({ where: { slug: { in: tagSlugs }, isActive: true } })
    : undefined
  if (tagSlugs !== undefined && resolvedTags && resolvedTags.length !== tagSlugs.length) {
    const found = new Set(resolvedTags.map((t) => t.slug))
    const missing = tagSlugs.find((s) => !found.has(s))
    throw badRequest(`Unknown tag "${missing}"`, { tagSlugs: `unknown tag "${missing}"` })
  }
  if (input.coverMediaId) await assertCover(userId, input.coverMediaId)
  if (input.frequency?.kind === 'N_PER_WEEK' && !input.frequency.n) throw badRequest('Choose how many days a week', { 'frequency.n': 'is required' })

  await db.$transaction(async (tx) => {
    const program = await ownedProgram(tx, userId, programId)
    await bump(tx, programId, input.expectedRevision)
    const version = await openDraftVersion(tx, userId, programId)
    const scheduleChanged = input.durationDays !== undefined || input.frequency !== undefined || input.generationMode !== undefined
    const title = input.title?.trim()
    const description = input.description === undefined ? undefined : input.description?.trim() || null
    const nextDuration = input.durationDays !== undefined ? input.durationDays : version.durationDays
    const nextFreq = input.frequency ?? parseFrequency(version.frequency)
    const nextCycleDays =
      input.durationDays !== undefined || input.frequency !== undefined
        ? nextDuration === null && nextFreq.kind !== 'MONTHLY'
          ? 7
          : null
        : undefined
    const updated = await tx.programVersion.update({
      where: { id: version.id },
      data: {
        title,
        description,
        programTypeId: input.programTypeId,
        focusId: input.focusId,
        level: input.level,
        sessionMinutes: input.sessionMinutes,
        sessionPresentation: input.sessionPresentation,
        durationDays: input.durationDays,
        cycleDays: nextCycleDays,
        frequency: input.frequency as Prisma.InputJsonValue | undefined,
        generationMode: input.generationMode,
      },
    })
    await tx.program.update({
      where: { id: programId },
      data: {
        title,
        description,
        categoryId: input.categoryId,
        programTypeId: input.programTypeId,
        focusId: input.focusId,
        level: input.level,
        sessionMinutes: input.sessionMinutes,
        sessionPresentation: input.sessionPresentation,
        coverMediaId: input.coverMediaId,
        visibility: input.visibility,
      },
    })
    if (tagSlugs !== undefined && resolvedTags) {
      const bySlug = new Map(resolvedTags.map((t) => [t.slug, t.id]))
      await tx.programTag.deleteMany({ where: { programId } })
      if (tagSlugs.length) {
        await tx.programTag.createMany({
          data: tagSlugs.map((slug, position) => ({ programId, tagId: bySlug.get(slug)!, position })),
        })
      }
    }
    if (title) {
      await allocateProgramSlug(tx, { programId, creatorId: program.creatorId, title })
    }
    if (scheduleChanged) {
      const current = await selectedActivities(tx, updated.id)
      const order = input.frequency !== undefined
        ? current.map((c) => ({ ...c, frequency: input.frequency! }))
        : current
      await regenerate(tx, updated, order)
    }
  })
  return workspace(userId, programId)
}

/** The revision a Program should pin for an Activity right now. */
async function pinnableRevision(author: Author, activityId: string) {
  const a = await db.activity.findUnique({ where: { id: activityId } })
  if (!a || !(author.activity(a) || canUseActivity(a, author.userId)) || a.status === 'ARCHIVED') return null
  if (author.activity(a)) {
    const latest = await db.activityRevision.findFirst({ where: { activityId }, orderBy: { revisionNumber: 'desc' }, select: { id: true, frequencySnapshot: true, targetTimeSnapshot: true } })
    return latest ? { id: latest.id, frequency: latest.frequencySnapshot ? parseFrequency(latest.frequencySnapshot) : null, targetTime: latest.targetTimeSnapshot ?? null } : null
  }
  if (!a.latestPublishedRevisionId) return null
  const rev = await db.activityRevision.findUnique({ where: { id: a.latestPublishedRevisionId }, select: { id: true, frequencySnapshot: true, targetTimeSnapshot: true } })
  return rev ? { id: rev.id, frequency: rev.frequencySnapshot ? parseFrequency(rev.frequencySnapshot) : null, targetTime: rev.targetTimeSnapshot ?? null } : null
}

export async function addActivities(
  userId: string,
  programId: string,
  input: { activityIds: string[]; frequencies?: Record<string, Frequency>; expectedRevision: number },
) {
  const ids = [...new Set(input.activityIds)]
  if (!ids.length) throw badRequest('Choose at least one activity', { activityIds: 'is empty' })
  if (input.frequencies) {
    for (const freq of Object.values(input.frequencies)) {
      if (freq.kind === 'N_PER_WEEK' && !freq.n) throw badRequest('Choose how many days a week', { 'frequency.n': 'is required' })
    }
  }
  const pinned: SelectedActivity[] = []
  const author = await authorFor(userId)
  for (const activityId of ids) {
    const rev = await pinnableRevision(author, activityId)
    if (!rev) throw badRequest('One of those activities is not available', { activityIds: `not available: ${activityId}` })
    pinned.push({ activityId, activityRevisionId: rev.id, frequency: input.frequencies?.[activityId] ?? rev.frequency, localTime: rev.targetTime })
  }
  await db.$transaction(async (tx) => {
    await ownedProgram(tx, userId, programId)
    await bump(tx, programId, input.expectedRevision)
    const version = await openDraftVersion(tx, userId, programId)
    const current = await selectedActivities(tx, version.id)
    const order = [...current, ...pinned.filter((p) => !current.some((c) => c.activityId === p.activityId))]
    await regenerate(tx, version, order)
  })
  return workspace(userId, programId)
}

export async function updateActivity(
  userId: string,
  programId: string,
  activityId: string,
  input: { frequency: Frequency; expectedRevision: number },
) {
  if (input.frequency.kind === 'N_PER_WEEK' && !input.frequency.n) {
    throw badRequest('Choose how many days a week', { 'frequency.n': 'is required' })
  }
  await db.$transaction(async (tx) => {
    await ownedProgram(tx, userId, programId)
    await bump(tx, programId, input.expectedRevision)
    const version = await openDraftVersion(tx, userId, programId)
    const current = await selectedActivities(tx, version.id)
    if (!current.some((c) => c.activityId === activityId)) {
      throw notFound('Activity in program')
    }
    const order = current.map((c) =>
      c.activityId === activityId ? { ...c, frequency: input.frequency } : c,
    )
    await tx.programScheduleItem.updateMany({
      where: { programVersionId: version.id, activityId },
      data: { frequency: input.frequency as Prisma.InputJsonValue },
    })
    await regenerate(tx, version, order)
  })
  return workspace(userId, programId)
}

export async function removeActivity(userId: string, programId: string, activityId: string, expectedRevision: number) {
  await db.$transaction(async (tx) => {
    await ownedProgram(tx, userId, programId)
    await bump(tx, programId, expectedRevision)
    const version = await openDraftVersion(tx, userId, programId)
    await tx.programScheduleItem.deleteMany({ where: { programVersionId: version.id, activityId } })
    // Remaining activities close ranks so the automatic schedule stays balanced.
    await regenerate(tx, version, await selectedActivities(tx, version.id))
  })
  return workspace(userId, programId)
}

async function placementsFor(versionId: string) {
  const items = await db.programScheduleItem.findMany({ where: { programVersionId: versionId }, orderBy: [{ relativeDay: 'asc' }, { position: 'asc' }] })
  const revs = await loadRevisions(items.map((i) => i.activityRevisionId))
  return items.map((i) => toPlacement(i, revs.get(i.activityRevisionId)?.titleSnapshot ?? 'Activity'))
}

export async function listPlacements(userId: string, programId: string) {
  const p = await db.program.findUnique({ where: { id: programId } })
  if (!p || !(await authorFor(userId)).program(p)) throw notFound('Program')
  const version = (await draftVersion(db, programId)) ?? (p.latestPublishedVersionId ? await db.programVersion.findUnique({ where: { id: p.latestPublishedVersionId } }) : null)
  if (!version) throw notFound('Program')
  return placementsFor(version.id)
}

function assertDayInRange(version: ProgramVersion, relativeDay: number) {
  const span = version.durationDays ?? version.cycleDays ?? 7
  if (relativeDay < 0 || relativeDay >= span) throw badRequest(`Choose a day from 1 to ${span}`, { relativeDay: 'is outside the program' })
}

export async function addPlacement(
  userId: string,
  programId: string,
  input: { activityId: string; relativeDay: number; localTime?: string; position?: number; targetOverrides?: Record<string, unknown> | null; expectedRevision: number },
) {
  const rev = await pinnableRevision(await authorFor(userId), input.activityId)
  if (!rev) throw badRequest('That activity is not available', { activityId: 'not available' })
  const created = await db.$transaction(async (tx) => {
    await ownedProgram(tx, userId, programId)
    await bump(tx, programId, input.expectedRevision)
    const version = await openDraftVersion(tx, userId, programId)
    assertDayInRange(version, input.relativeDay)
    const position = input.position ?? (await tx.programScheduleItem.count({ where: { programVersionId: version.id, relativeDay: input.relativeDay } }))
    const item = await tx.programScheduleItem.create({
      data: {
        programVersionId: version.id,
        activityId: input.activityId,
        activityRevisionId: rev.id,
        relativeDay: input.relativeDay,
        localTime: input.localTime ?? rev.targetTime ?? null,
        position,
        frequency: (rev.frequency ?? undefined) as Prisma.InputJsonValue | undefined,
        targetOverrides: (input.targetOverrides ?? undefined) as Prisma.InputJsonValue | undefined,
        isManual: true,
      },
    })
    await refreshCounts(tx, version.id)
    return item
  })
  return (await placementsFor(created.programVersionId)).find((p) => p.id === created.id)!
}

/** Finds a placement in the current draft by id, following it across a draft that was just opened. */
async function draftPlacement(tx: Tx, userId: string, programId: string, placementId: string) {
  const original = await tx.programScheduleItem.findUnique({ where: { id: placementId }, include: { version: true } })
  if (!original || original.version.programId !== programId) throw notFound('Placement')
  const version = await openDraftVersion(tx, userId, programId)
  if (original.programVersionId === version.id) return { version, item: original }
  // Editing after publish: the draft was just copied, so match the same slot in it.
  const item = await tx.programScheduleItem.findFirst({
    where: { programVersionId: version.id, activityId: original.activityId, relativeDay: original.relativeDay, position: original.position },
  })
  if (!item) throw notFound('Placement')
  return { version, item: { ...item, version } }
}

export async function updatePlacement(
  userId: string,
  programId: string,
  placementId: string,
  input: { relativeDay?: number; localTime?: string | null; position?: number; targetOverrides?: Record<string, unknown> | null; expectedRevision: number },
) {
  const updated = await db.$transaction(async (tx) => {
    await ownedProgram(tx, userId, programId)
    await bump(tx, programId, input.expectedRevision)
    const { version, item } = await draftPlacement(tx, userId, programId, placementId)
    if (input.relativeDay !== undefined) assertDayInRange(version, input.relativeDay)
    const row = await tx.programScheduleItem.update({
      where: { id: item.id },
      data: {
        relativeDay: input.relativeDay,
        localTime: input.localTime,
        position: input.position,
        targetOverrides: input.targetOverrides === null ? Prisma.DbNull : (input.targetOverrides as Prisma.InputJsonValue | undefined),
        isManual: true,
      },
    })
    await refreshCounts(tx, version.id)
    return row
  })
  return (await placementsFor(updated.programVersionId)).find((p) => p.id === updated.id)!
}

export async function deletePlacement(userId: string, programId: string, placementId: string, expectedRevision: number) {
  await db.$transaction(async (tx) => {
    await ownedProgram(tx, userId, programId)
    await bump(tx, programId, expectedRevision)
    const { version, item } = await draftPlacement(tx, userId, programId, placementId)
    await tx.programScheduleItem.delete({ where: { id: item.id } })
    await refreshCounts(tx, version.id)
  })
}

export async function regenerateSchedule(userId: string, programId: string, input: { generationMode?: GenerationMode; keepManual?: boolean; expectedRevision: number }) {
  const versionId = await db.$transaction(async (tx) => {
    await ownedProgram(tx, userId, programId)
    await bump(tx, programId, input.expectedRevision)
    let version = await openDraftVersion(tx, userId, programId)
    if (input.generationMode) version = await tx.programVersion.update({ where: { id: version.id }, data: { generationMode: input.generationMode } })
    await regenerate(tx, version, await selectedActivities(tx, version.id), input.keepManual ?? true)
    return version.id
  })
  return placementsFor(versionId)
}

// ── Publishing ──────────────────────────────────────────────────────────────

type Issue = { code: string; message: string; field: string | null; activityId: string | null }

async function collectIssues(userId: string, programId: string, target?: { visibility: Visibility; accessMode: AccessMode }) {
  const p = await db.program.findUnique({ where: { id: programId }, include: { policy: true, prices: { where: { active: true } } } })
  const author = await authorFor(userId)
  if (!p || !author.program(p)) throw notFound('Program')
  const draft = (await draftVersion(db, programId)) ?? null
  // 07 §6: an archived Program is restored by publishing it again, with or without new changes.
  const restoring = !draft && p.status === 'ARCHIVED' && !!p.latestPublishedVersionId
  const version = draft ?? (restoring ? await db.programVersion.findUnique({ where: { id: p.latestPublishedVersionId! } }) : null)
  const issues: Issue[] = []
  const add = (code: string, message: string, field: string | null = null, activityId: string | null = null) => issues.push({ code, message, field, activityId })
  const visibility = target?.visibility ?? p.visibility
  const accessMode = target?.accessMode ?? p.policy?.accessMode ?? 'OPEN'
  const payout = await db.creatorPayoutAccount.findUnique({ where: { userId } })

  if (!version) add('NOTHING_TO_PUBLISH', 'There are no unpublished changes')
  if (version && !version.title.trim()) add('TITLE_REQUIRED', 'Give the program a name', 'title')
  const items = version ? await db.programScheduleItem.findMany({ where: { programVersionId: version.id } }) : []
  if (version && items.length === 0) add('NO_ACTIVITIES', 'Add at least one activity', 'activities')
  if (version?.durationDays) {
    const outside = items.find((i) => i.relativeDay >= version.durationDays!)
    if (outside) add('PLACEMENT_OUTSIDE_DURATION', 'Some activities are scheduled after the program ends', 'schedule', outside.activityId)
  }
  // 07 §6: another person's Activity must be openly available; your own private Activity is
  // published as a pinned snapshot without becoming public.
  const activities = await db.activity.findMany({ where: { id: { in: [...new Set(items.map((i) => i.activityId))] } } })
  for (const a of activities) {
    if (author.activity(a)) {
      if (a.status === 'ARCHIVED') add('ACTIVITY_ARCHIVED', `"${a.title}" is archived`, 'activities', a.id)
    } else if (!isOpenlyReadable(a)) {
      add('ACTIVITY_NOT_AVAILABLE', `"${a.title}" is not available to publish with`, 'activities', a.id)
    }
  }
  if (visibility !== 'PRIVATE' && (await isPublishingRestricted(userId))) add('PUBLISHING_RESTRICTED', 'Publishing is restricted on this account', 'visibility')
  if (visibility === 'PRIVATE' && accessMode !== 'OPEN') add('PRIVATE_NOT_OPEN', 'Private programs can only use open access', 'accessMode')
  if (accessMode === 'PAID') {
    if (p.creatorId === null) add('PLATFORM_NOT_PAID', 'Platform programs cannot be sold', 'accessMode')
    if (!marketplaceEnabled()) add('MARKETPLACE_DISABLED', 'Paid programs are not available yet', 'accessMode')
    if (payout?.status !== 'ACTIVE') add('PAYOUT_ACCOUNT_REQUIRED', 'Set up payouts before selling', 'accessMode')
    if (!p.prices.length) add('PRICE_REQUIRED', 'Set a price', 'prices')
  }
  return { program: p, author, draft, restoring, version, items, activities, issues, payoutActive: payout?.status === 'ACTIVE' }
}

export async function publishCheck(userId: string, programId: string) {
  const { issues, payoutActive } = await collectIssues(userId, programId)
  return { canPublish: issues.length === 0, issues, marketplaceEnabled: marketplaceEnabled(), payoutAccountActive: payoutActive }
}

export async function publish(userId: string, programId: string, input: { visibility: Visibility; accessMode: AccessMode; expectedRevision: number }) {
  const check = await collectIssues(userId, programId, input)
  if (check.issues.length) throw badRequest(check.issues[0]!.message, Object.fromEntries(check.issues.map((i) => [i.field ?? i.code, i.message])))
  const version = check.version!
  await db.$transaction(async (tx) => {
    await ownedProgram(tx, userId, programId, { allowArchived: true })
    await bump(tx, programId, input.expectedRevision)
    await auditPlatform(tx, check.author, check.program, 'PUBLISH', check.restoring ? 'Restored from archive' : `Published ${input.visibility} ${input.accessMode}`)
    if (check.restoring) {
      await tx.program.update({
        where: { id: programId },
        data: { status: 'PUBLISHED', visibility: input.visibility, policy: { upsert: { create: { accessMode: input.accessMode }, update: { accessMode: input.accessMode } } } },
      })
      return
    }
    // Pin every placement to an immutable revision as of now.
    for (const a of check.activities) {
      const revisionId = check.author.activity(a) ? await publishActivityRevision(tx, userId, a.id, a.visibility) : a.latestPublishedRevisionId!
      await tx.programScheduleItem.updateMany({ where: { programVersionId: version.id, activityId: a.id }, data: { activityRevisionId: revisionId } })
    }
    const published = await tx.programVersion.update({ where: { id: version.id }, data: { publishedAt: new Date() } })
    const previous = check.program.latestPublishedVersionId
    await tx.program.update({
      where: { id: programId },
      data: { status: 'PUBLISHED', visibility: input.visibility, latestPublishedVersionId: published.id, policy: { upsert: { create: { accessMode: input.accessMode }, update: { accessMode: input.accessMode } } } },
    })
    if (!check.program.slug) {
      await allocateProgramSlug(tx, { programId, creatorId: check.program.creatorId, title: check.program.title })
    }
    if (previous) {
      // 07 §6: existing participants keep their version and are offered the update.
      await tx.programEnrollment.updateMany({
        where: { programId, status: { in: ['ACTIVE', 'PAUSED'] }, programVersionId: { not: published.id } },
        data: { pendingVersionId: published.id },
      })
      await enqueue(tx, 'ProgramVersionPublished', { programId, versionId: published.id })
    }
  })
  return workspace(userId, programId)
}

export async function archive(userId: string, programId: string) {
  const p = await db.program.findUnique({ where: { id: programId } })
  const author = await authorFor(userId)
  if (!p || !author.program(p)) throw notFound('Program')
  // Removes discovery and new joins; enrollments, history, and access keep working (07 §6).
  await db.$transaction(async (tx) => {
    await tx.program.update({ where: { id: programId }, data: { status: 'ARCHIVED' } })
    await auditPlatform(tx, author, p, 'ARCHIVE', 'Archived')
  })
  return workspace(userId, programId)
}

/** Copy and customize someone's Program (or your own) into a new private draft with provenance. */
export async function copy(userId: string, programId: string) {
  const src = await db.program.findUnique({ where: { id: programId }, include: { tags: true } })
  if (!src || src.deletedAt || !(await canSeeProgram(userId, src))) throw notFound('Program')
  const owner = isProgramOwner(src, userId)
  const from = owner
    ? (await draftVersion(db, programId)) ?? (await db.programVersion.findUnique({ where: { id: src.latestPublishedVersionId ?? '' } }))
    : await db.programVersion.findUnique({ where: { id: src.latestPublishedVersionId ?? '' } })
  if (!from) throw notFound('Program')
  const items = await db.programScheduleItem.findMany({ where: { programVersionId: from.id } })
  const activities = await db.activity.findMany({ where: { id: { in: [...new Set(items.map((i) => i.activityId))] } } })
  const revisions = await db.activityRevision.findMany({ where: { id: { in: [...new Set(items.map((i) => i.activityRevisionId))] } } })
  const usable = new Set<string>()
  for (const r of revisions) {
    const a = activities.find((x) => x.id === r.activityId)!
    // Only carry Activities the copier may use independently; another author's private snapshot stays behind.
    if (canUseActivity(a, userId) && (await canReadRevision(userId, a, r))) usable.add(r.id)
  }
  const sourceVersionId = src.latestPublishedVersionId ?? from.id
  const created = await db.$transaction(async (tx) => {
    const program = await tx.program.create({
      data: {
        creatorId: userId,
        title: from.title,
        description: from.description,
        categoryId: src.categoryId,
        programTypeId: from.programTypeId,
        focusId: from.focusId,
        level: from.level,
        sessionMinutes: from.sessionMinutes,
        sessionPresentation: from.sessionPresentation,
        coverMediaId: src.coverMediaId,
        visibility: 'PRIVATE',
        policy: { create: { accessMode: 'OPEN' } },
        ...(src.tags.length ? { tags: { create: src.tags.map((t) => ({ tagId: t.tagId, position: t.position })) } } : {}),
        ...(src.latestPublishedVersionId ? { source: { create: { sourceProgramVersionId: sourceVersionId, copiedById: userId } } } : {}),
      },
    })
    const version = await tx.programVersion.create({
      data: {
        programId: program.id,
        versionNumber: 1,
        title: from.title,
        description: from.description,
        programTypeId: from.programTypeId,
        focusId: from.focusId,
        level: from.level,
        sessionMinutes: from.sessionMinutes,
        sessionPresentation: from.sessionPresentation,
        durationDays: from.durationDays,
        cycleDays: from.cycleDays,
        frequency: from.frequency as Prisma.InputJsonValue,
        generationMode: from.generationMode,
        createdById: userId,
        items: {
          create: items
            .filter((i) => usable.has(i.activityRevisionId))
            .map((i) => ({
              activityId: i.activityId,
              activityRevisionId: i.activityRevisionId,
              relativeDay: i.relativeDay,
              localTime: i.localTime,
              position: i.position,
              isManual: i.isManual,
              frequency: (i.frequency ?? undefined) as Prisma.InputJsonValue | undefined,
              targetOverrides: (i.targetOverrides ?? undefined) as Prisma.InputJsonValue | undefined,
            })),
        },
      },
    })
    await refreshCounts(tx, version.id)
    await allocateProgramSlug(tx, { programId: program.id, creatorId: userId, title: from.title })
    return program
  })
  return workspace(userId, created.id)
}

export async function setPrices(userId: string, programId: string, input: { prices: { kind: 'ONE_TIME' | 'MONTHLY'; amountMinor: number }[] }) {
  const kinds = input.prices.map((p) => p.kind)
  if (new Set(kinds).size !== kinds.length) throw badRequest('One price per kind', { prices: 'has duplicate kinds' })
  await db.$transaction(async (tx) => {
    await ownedProgram(tx, userId, programId)
    const current = await tx.programPrice.findMany({ where: { programId, active: true } })
    for (const c of current) {
      const next = input.prices.find((p) => p.kind === c.kind)
      if (next && next.amountMinor === c.amountMinor) continue
      // Prices are immutable: retire the old row so existing purchases keep their terms (07 §8).
      await tx.programPrice.update({ where: { id: c.id }, data: { active: false, activeKey: null } })
    }
    for (const p of input.prices) {
      if (current.some((c) => c.kind === p.kind && c.amountMinor === p.amountMinor)) continue
      await tx.programPrice.create({ data: { programId, kind: p.kind, amountMinor: p.amountMinor, currency: 'USD', active: true, activeKey: p.kind } })
    }
  })
  const prices = await db.programPrice.findMany({ where: { programId, active: true }, orderBy: { kind: 'asc' } })
  return prices.map(toPrice)
}
