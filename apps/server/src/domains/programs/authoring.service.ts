// Program authoring (07-PROGRAMS.md §6–7, 03-UX.md §3–4).
// The draft is a ProgramVersion with publishedAt = null. Publishing freezes it; the next edit opens
// a new draft copied from the latest published version. Program.draftRevision guards concurrent edits.
import { Prisma, db, type ProgramVersion } from '@project/db'
import { badRequest, forbidden, notFound, versionConflict } from '../../lib/errors'
import { enqueue } from '../../lib/outbox'
import { afterCursor, pageArgs, pageOrder, toPage } from '../../lib/paging'
import { canReadRevision, canUseActivity, isOpenlyReadable, isOwner as isActivityOwner } from '../activities/access'
import { loadRevisions, summarizeRevision } from '../activities/mapper'
import { publish as publishActivityRevision } from '../activities/activity.service'
import { canSeeProgram, isProgramOwner, marketplaceEnabled } from './access'
import { isPublishingRestricted } from '../social/moderation.service'
import { allocateProgramSlug } from './slug.service'
import { programInclude, toPlacement, toPrice, toProgramSummary } from './mapper'
import {
  DEFAULT_DURATION_DAYS,
  DEFAULT_FREQUENCY,
  countPlacements,
  generatePlacements,
  parseFrequency,
  type Frequency,
  type GenerationMode,
} from './schedule'

type Tx = Prisma.TransactionClient
type Visibility = 'PRIVATE' | 'UNLISTED' | 'PUBLIC'
type AccessMode = 'OPEN' | 'APPROVAL' | 'PAID'

// ── Draft plumbing ──────────────────────────────────────────────────────────

async function ownedProgram(tx: Tx, userId: string, programId: string) {
  const p = await tx.program.findUnique({ where: { id: programId } })
  if (!p || !isProgramOwner(p, userId)) throw notFound('Program')
  if (p.status === 'ARCHIVED') throw forbidden('Archived programs cannot be edited')
  return p
}

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
        create: items.map(({ id: _i, programVersionId: _v, targetOverrides, ...item }) => ({
          ...item,
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

/** Selected Activities in display order: first appearance by day, then position. */
async function selectedActivities(tx: Tx, versionId: string) {
  const items = await tx.programScheduleItem.findMany({
    where: { programVersionId: versionId },
    orderBy: [{ relativeDay: 'asc' }, { position: 'asc' }],
    select: { activityId: true, activityRevisionId: true },
  })
  const seen = new Map<string, string>()
  for (const i of items) if (!seen.has(i.activityId)) seen.set(i.activityId, i.activityRevisionId)
  return [...seen].map(([activityId, activityRevisionId]) => ({ activityId, activityRevisionId }))
}

/**
 * Regenerates automatic placements (07 §7). Manual placements survive; a generated slot is skipped
 * when the same Activity already has a manual placement that day.
 */
async function regenerate(tx: Tx, version: ProgramVersion, order: { activityId: string; activityRevisionId: string }[], keepManual = true) {
  await tx.programScheduleItem.deleteMany({ where: { programVersionId: version.id, ...(keepManual ? { isManual: false } : {}) } })
  const manual = keepManual ? await tx.programScheduleItem.findMany({ where: { programVersionId: version.id }, select: { activityId: true, relativeDay: true } }) : []
  const taken = new Set(manual.map((m) => `${m.activityId}:${m.relativeDay}`))
  const generated = generatePlacements(order.length, parseFrequency(version.frequency), version.durationDays, version.generationMode, version.cycleDays ?? undefined)
  const rows = generated
    .map((g) => ({ ...order[g.activityIndex]!, relativeDay: g.relativeDay, position: g.position }))
    .filter((r) => !taken.has(`${r.activityId}:${r.relativeDay}`))
    .map((r) => ({ ...r, programVersionId: version.id, isManual: false }))
  if (rows.length) await tx.programScheduleItem.createMany({ data: rows })
  await refreshCounts(tx, version.id)
}

// ── Reading ─────────────────────────────────────────────────────────────────

export async function workspace(userId: string, programId: string) {
  const p = await db.program.findUnique({ where: { id: programId }, include: programInclude })
  if (!p || !isProgramOwner(p, userId)) throw notFound('Program')
  const draft = await draftVersion(db, programId)
  const version = draft ?? p.latestPublished
  if (!version) throw notFound('Program')
  const items = await db.programScheduleItem.findMany({ where: { programVersionId: version.id }, orderBy: [{ relativeDay: 'asc' }, { position: 'asc' }] })
  const revs = await loadRevisions(items.map((i) => i.activityRevisionId))
  const activities = await db.activity.findMany({ where: { id: { in: [...new Set(items.map((i) => i.activityId))] } } })
  const byId = new Map(activities.map((a) => [a.id, a]))
  const order = await selectedActivities(db, version.id)
  const rows = order.map(({ activityId, activityRevisionId }) => {
    const rev = revs.get(activityRevisionId) ?? null
    const s = summarizeRevision(rev)
    return {
      activityId,
      revisionId: activityRevisionId,
      title: rev?.titleSnapshot ?? byId.get(activityId)?.title ?? 'Activity',
      instructionCount: s.instructionCount,
      mediaCount: s.mediaCount,
      metrics: s.metricLabels,
      placementCount: items.filter((i) => i.activityId === activityId).length,
      canEdit: isActivityOwner(byId.get(activityId) ?? { creatorId: null }, userId),
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
    where: { creatorId: userId, ...(query.status ? { status: query.status } : {}), ...afterCursor(query.cursor) },
    orderBy: pageOrder,
    take,
    include: programInclude,
  })
  const drafts = await db.programVersion.findMany({ where: { programId: { in: rows.map((r) => r.id) }, publishedAt: null } })
  return toPage(rows, limit, (p) => toProgramSummary(p, 'OWNER', drafts.find((d) => d.programId === p.id) ?? p.latestPublished))
}

// ── Creation and editing ────────────────────────────────────────────────────

export async function create(userId: string, input: { programTypeId: string; focusId?: string | null }) {
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
  const title = `My ${focus ? `${focus.label} ` : ''}${type.label}`.slice(0, 140)
  const p = await db.$transaction(async (tx) => {
    const program = await tx.program.create({
      data: {
        creatorId: userId,
        title,
        categoryId: type.categoryId,
        programTypeId: type.id,
        focusId: focus?.id ?? null,
        visibility: prefs?.defaultVisibility ?? 'PRIVATE',
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
    await allocateProgramSlug(tx, { programId: program.id, creatorId: userId, title })
    return program
  })
  return workspace(userId, p.id)
}

async function assertCover(userId: string, mediaId: string) {
  const asset = await db.mediaAsset.findFirst({ where: { id: mediaId, deletedAt: null, OR: [{ ownerId: userId }, { ownerId: null }] } })
  if (!asset || asset.type !== 'PHOTO') throw badRequest('Choose one of your images or a platform image', { coverMediaId: 'not found' })
  if (asset.state !== 'READY') throw badRequest('That image is still processing', { coverMediaId: 'is not ready' })
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
    coverMediaId?: string | null
    durationDays?: number | null
    frequency?: Frequency
    generationMode?: GenerationMode
    visibility?: Visibility
    expectedRevision: number
  },
) {
  if (input.title !== undefined && !input.title.trim()) throw badRequest('Name the program', { title: 'is required' })
  if (input.programTypeId) {
    const t = await db.programType.findFirst({ where: { id: input.programTypeId, OR: [{ reviewState: 'APPROVED' }, { createdById: userId }] } })
    if (!t) throw badRequest('Choose a type', { programTypeId: 'not found' })
    input.categoryId ??= t.categoryId
  }
  if (input.focusId) {
    const f = await db.focus.findFirst({ where: { id: input.focusId, OR: [{ reviewState: 'APPROVED' }, { createdById: userId }] } })
    if (!f) throw badRequest('Choose a focus', { focusId: 'not found' })
  }
  if (input.coverMediaId) await assertCover(userId, input.coverMediaId)
  if (input.frequency?.kind === 'N_PER_WEEK' && !input.frequency.n) throw badRequest('Choose how many days a week', { 'frequency.n': 'is required' })

  await db.$transaction(async (tx) => {
    await ownedProgram(tx, userId, programId)
    await bump(tx, programId, input.expectedRevision)
    const version = await openDraftVersion(tx, userId, programId)
    const scheduleChanged = input.durationDays !== undefined || input.frequency !== undefined || input.generationMode !== undefined
    const title = input.title?.trim()
    const description = input.description === undefined ? undefined : input.description?.trim() || null
    const updated = await tx.programVersion.update({
      where: { id: version.id },
      data: {
        title,
        description,
        programTypeId: input.programTypeId,
        focusId: input.focusId,
        durationDays: input.durationDays,
        cycleDays: input.durationDays === null ? 7 : input.durationDays !== undefined ? null : undefined,
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
        coverMediaId: input.coverMediaId,
        visibility: input.visibility,
      },
    })
    if (title) {
      await allocateProgramSlug(tx, { programId, creatorId: userId, title })
    }
    if (scheduleChanged) await regenerate(tx, updated, await selectedActivities(tx, updated.id))
  })
  return workspace(userId, programId)
}

/** The revision a Program should pin for an Activity right now. */
async function pinnableRevision(userId: string, activityId: string) {
  const a = await db.activity.findUnique({ where: { id: activityId } })
  if (!a || !canUseActivity(a, userId) || a.status === 'ARCHIVED') return null
  if (isActivityOwner(a, userId)) {
    const latest = await db.activityRevision.findFirst({ where: { activityId }, orderBy: { revisionNumber: 'desc' }, select: { id: true } })
    return latest?.id ?? null
  }
  return a.latestPublishedRevisionId
}

export async function addActivities(userId: string, programId: string, input: { activityIds: string[]; expectedRevision: number }) {
  const ids = [...new Set(input.activityIds)]
  if (!ids.length) throw badRequest('Choose at least one activity', { activityIds: 'is empty' })
  const pinned: { activityId: string; activityRevisionId: string }[] = []
  for (const activityId of ids) {
    const rev = await pinnableRevision(userId, activityId)
    if (!rev) throw badRequest('One of those activities is not available', { activityIds: `not available: ${activityId}` })
    pinned.push({ activityId, activityRevisionId: rev })
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
  if (!p || !isProgramOwner(p, userId)) throw notFound('Program')
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
  const rev = await pinnableRevision(userId, input.activityId)
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
        activityRevisionId: rev,
        relativeDay: input.relativeDay,
        localTime: input.localTime ?? null,
        position,
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
  if (!p || !isProgramOwner(p, userId)) throw notFound('Program')
  const version = (await draftVersion(db, programId)) ?? null
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
    if (isActivityOwner(a, userId)) {
      if (a.status === 'ARCHIVED') add('ACTIVITY_ARCHIVED', `"${a.title}" is archived`, 'activities', a.id)
    } else if (!isOpenlyReadable(a)) {
      add('ACTIVITY_NOT_AVAILABLE', `"${a.title}" is not available to publish with`, 'activities', a.id)
    }
  }
  if (visibility !== 'PRIVATE' && (await isPublishingRestricted(userId))) add('PUBLISHING_RESTRICTED', 'Publishing is restricted on this account', 'visibility')
  if (visibility === 'PRIVATE' && accessMode !== 'OPEN') add('PRIVATE_NOT_OPEN', 'Private programs can only use open access', 'accessMode')
  if (accessMode === 'PAID') {
    if (!marketplaceEnabled()) add('MARKETPLACE_DISABLED', 'Paid programs are not available yet', 'accessMode')
    if (payout?.status !== 'ACTIVE') add('PAYOUT_ACCOUNT_REQUIRED', 'Set up payouts before selling', 'accessMode')
    if (!p.prices.length) add('PRICE_REQUIRED', 'Set a price', 'prices')
  }
  return { program: p, version, items, activities, issues, payoutActive: payout?.status === 'ACTIVE' }
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
    await ownedProgram(tx, userId, programId)
    await bump(tx, programId, input.expectedRevision)
    // Pin every placement to an immutable revision as of now.
    for (const a of check.activities) {
      const revisionId = isActivityOwner(a, userId) ? await publishActivityRevision(tx, userId, a.id, a.visibility) : a.latestPublishedRevisionId!
      await tx.programScheduleItem.updateMany({ where: { programVersionId: version.id, activityId: a.id }, data: { activityRevisionId: revisionId } })
    }
    const published = await tx.programVersion.update({ where: { id: version.id }, data: { publishedAt: new Date() } })
    const previous = check.program.latestPublishedVersionId
    await tx.program.update({
      where: { id: programId },
      data: { status: 'PUBLISHED', visibility: input.visibility, latestPublishedVersionId: published.id, policy: { upsert: { create: { accessMode: input.accessMode }, update: { accessMode: input.accessMode } } } },
    })
    if (!check.program.slug) {
      await allocateProgramSlug(tx, { programId, creatorId: userId, title: check.program.title })
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
  if (!p || !isProgramOwner(p, userId)) throw notFound('Program')
  // Removes discovery and new joins; enrollments, history, and access keep working (07 §6).
  await db.program.update({ where: { id: programId }, data: { status: 'ARCHIVED' } })
  return workspace(userId, programId)
}

/** Copy and customize someone's Program (or your own) into a new private draft with provenance. */
export async function copy(userId: string, programId: string) {
  const src = await db.program.findUnique({ where: { id: programId } })
  if (!src || !(await canSeeProgram(userId, src))) throw notFound('Program')
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
        coverMediaId: src.coverMediaId,
        visibility: 'PRIVATE',
        policy: { create: { accessMode: 'OPEN' } },
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
