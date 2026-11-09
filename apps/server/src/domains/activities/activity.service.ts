// 08-ACTIVITIES.md §6: drafts are edited in place on an unpublished revision; publishing freezes it.
// Editing after publish starts a new draft revision copied from the latest published one, keeping
// instructionKey stable so contributions and media survive revisions.
import { randomUUID } from 'crypto'
import { db, type Activity, type Prisma } from '@project/db'
import { badRequest, forbidden, notFound, versionConflict } from '../../lib/errors'
import { offsetArgs, toOffsetPage, type PageQuery } from '../../lib/paging'
import { canReadRevision, canUseActivity, isOwner } from './access'
import { isPublishingRestricted } from '../social/moderation.service'
import { allocateActivitySlug } from '../programs/slug.service'
import {
  activityInclude,
  loadRevisions,
  revisionInclude,
  toActivitySummary,
  toInstruction,
  toMediaThumb,
  toMetricBinding,
  toToolBinding,
  type ActivityWithCreator,
  type RevisionFull,
} from './mapper'

type Tx = Prisma.TransactionClient

// ── Reading ─────────────────────────────────────────────────────────────────

async function latestRevisionId(activityId: string) {
  const r = await db.activityRevision.findFirst({ where: { activityId }, orderBy: { revisionNumber: 'desc' }, select: { id: true } })
  return r?.id ?? null
}

/** Owners see their working revision; everyone else sees the latest published one. */
async function revisionForViewer(a: Activity, viewerId: string | null) {
  return isOwner(a, viewerId) ? await latestRevisionId(a.id) : a.latestPublishedRevisionId
}

export async function getDetail(viewerId: string | null, activityId: string, revisionId?: string) {
  const a = await db.activity.findUnique({ where: { id: activityId }, include: activityInclude })
  if (!a) throw notFound('Activity')
  const revId = revisionId ?? (await revisionForViewer(a, viewerId))
  const rev = revId ? await db.activityRevision.findFirst({ where: { id: revId, activityId }, include: revisionInclude }) : null
  if (!rev || !(await canReadRevision(viewerId, a, rev))) throw notFound('Activity')
  return toDetail(viewerId, a, rev)
}

async function toDetail(viewerId: string | null, a: ActivityWithCreator, rev: RevisionFull) {
  let sourceActivity = null
  if (a.sourceActivityId) {
    const src = await db.activity.findUnique({ where: { id: a.sourceActivityId }, include: activityInclude })
    if (src && canUseActivity(src, viewerId)) {
      const srcRev = (await loadRevisions([src.latestPublishedRevisionId ?? ''])).get(src.latestPublishedRevisionId ?? '') ?? null
      sourceActivity = toActivitySummary(src, srcRev)
    }
  }
  const owner = isOwner(a, viewerId)
  return {
    ...toActivitySummary(a, rev),
    instructions: rev.instructions.map(toInstruction),
    media: rev.attachments.map((x) => toMediaThumb(x)),
    metrics: rev.metrics.map(toMetricBinding),
    tools: rev.tools.map(toToolBinding),
    sourceActivity,
    draftRevision: owner ? a.draftRevision : 0,
    canEdit: owner && a.status !== 'ARCHIVED',
    canCopy: !!viewerId && canUseActivity(a, viewerId),
  }
}

async function detailForOwner(userId: string, activityId: string) {
  return getDetail(userId, activityId)
}

export async function list(
  viewerId: string | null,
  query: PageQuery & { q?: string; categoryId?: string; focusId?: string; source?: 'PLATFORM' | 'MINE' | 'PUBLIC' },
) {
  const { limit, skip, take } = offsetArgs(query)
  const published: Prisma.ActivityWhereInput = { status: 'PUBLISHED', moderatedAt: null, latestPublishedRevisionId: { not: null } }
  const platform: Prisma.ActivityWhereInput = { ...published, creatorId: null }
  const publicOthers: Prisma.ActivityWhereInput = { ...published, visibility: 'PUBLIC', creatorId: { not: null } }
  const mine: Prisma.ActivityWhereInput | null = viewerId ? { creatorId: viewerId, status: { not: 'ARCHIVED' } } : null

  let scope: Prisma.ActivityWhereInput
  switch (query.source) {
    case 'PLATFORM':
      scope = platform
      break
    case 'PUBLIC':
      scope = publicOthers
      break
    case 'MINE':
      if (!mine) return { data: [], meta: { hasMore: false, nextCursor: null } }
      scope = mine
      break
    default:
      scope = { OR: [platform, publicOthers, ...(mine ? [mine] : [])] }
  }
  const q = query.q?.trim()
  const rows = await db.activity.findMany({
    where: {
      AND: [
        scope,
        ...(query.categoryId ? [{ categoryId: query.categoryId }] : []),
        ...(query.focusId ? [{ focuses: { some: { focusId: query.focusId } } }] : []),
        ...(q ? [{ OR: [{ title: { contains: q } }, { summary: { contains: q } }] }] : []),
      ],
    },
    // Seeded activities first (08 §9), then alphabetical.
    orderBy: [{ creatorId: { sort: 'asc', nulls: 'first' } }, { title: 'asc' }, { id: 'asc' }],
    include: { ...activityInclude, revisions: { orderBy: { revisionNumber: 'desc' }, take: 1, select: { id: true } } },
    skip,
    take,
  })
  const revIds = rows.map((a) => (isOwner(a, viewerId) ? a.revisions[0]?.id : a.latestPublishedRevisionId) ?? '')
  const revs = await loadRevisions(revIds)
  return toOffsetPage(rows, limit, skip, (a) => {
    const id = isOwner(a, viewerId) ? a.revisions[0]?.id : a.latestPublishedRevisionId
    return toActivitySummary(a, id ? revs.get(id) ?? null : null)
  })
}

// ── Draft lifecycle ─────────────────────────────────────────────────────────

async function cloneRevision(tx: Tx, from: RevisionFull, activityId: string, revisionNumber: number, editorId: string, mediaFilter?: (ownerId: string | null) => boolean) {
  const keep = (ownerId: string | null) => (mediaFilter ? mediaFilter(ownerId) : true)
  const rev = await tx.activityRevision.create({
    data: { activityId, revisionNumber, titleSnapshot: from.titleSnapshot, summarySnapshot: from.summarySnapshot, editorId },
  })
  for (const m of from.metrics) {
    await tx.activityMetric.create({
      data: { activityRevisionId: rev.id, metricDefinitionId: m.metricDefinitionId, position: m.position, required: m.required, defaults: m.defaults ?? undefined },
    })
  }
  for (const t of from.tools) {
    await tx.activityTool.create({ data: { activityRevisionId: rev.id, toolDefinitionId: t.toolDefinitionId, position: t.position, config: t.config ?? undefined } })
  }
  for (const a of from.attachments.filter((x) => keep(x.media.ownerId))) {
    await tx.mediaAttachment.create({ data: { mediaId: a.mediaId, activityRevisionId: rev.id, purpose: a.purpose, position: a.position } })
  }
  for (const i of from.instructions) {
    const ins = await tx.instruction.create({
      data: { activityRevisionId: rev.id, instructionKey: i.instructionKey, position: i.position, title: i.title, body: i.body, mediaLayoutHint: i.mediaLayoutHint },
    })
    for (const m of i.metrics) {
      await tx.activityMetric.create({
        data: { instructionId: ins.id, metricDefinitionId: m.metricDefinitionId, position: m.position, required: m.required, defaults: m.defaults ?? undefined, rollupToMetricKey: m.rollupToMetricKey },
      })
    }
    for (const t of i.tools) {
      await tx.activityTool.create({ data: { instructionId: ins.id, toolDefinitionId: t.toolDefinitionId, position: t.position, config: t.config ?? undefined } })
    }
    for (const a of i.attachments.filter((x) => keep(x.media.ownerId))) {
      await tx.mediaAttachment.create({ data: { mediaId: a.mediaId, instructionId: ins.id, purpose: a.purpose, position: a.position } })
    }
  }
  return rev
}

/**
 * Locks the owner's Activity against `expectedRevision`, returns its editable draft revision
 * (creating one from the latest published revision if needed), and bumps draftRevision.
 */
async function openDraft(tx: Tx, userId: string, activityId: string, expectedRevision: number) {
  const a = await tx.activity.findUnique({ where: { id: activityId } })
  if (!a || !isOwner(a, userId)) throw notFound('Activity')
  if (a.status === 'ARCHIVED') throw forbidden('Archived activities cannot be edited')
  const bumped = await tx.activity.updateMany({ where: { id: activityId, draftRevision: expectedRevision }, data: { draftRevision: { increment: 1 } } })
  if (bumped.count === 0) throw versionConflict()
  const latest = await tx.activityRevision.findFirst({ where: { activityId }, orderBy: { revisionNumber: 'desc' }, include: revisionInclude })
  if (latest && !latest.publishedAt) return { activity: a, draft: latest }
  if (!latest) throw notFound('Activity')
  const draft = await cloneRevision(tx, latest, activityId, latest.revisionNumber + 1, userId)
  return { activity: a, draft: await tx.activityRevision.findUniqueOrThrow({ where: { id: draft.id }, include: revisionInclude }) }
}

async function assertTaxonomy(userId: string, categoryId?: string, focusIds?: string[]) {
  if (categoryId) {
    const c = await db.category.findUnique({ where: { id: categoryId } })
    if (!c || !c.isActive) throw badRequest('Choose a category', { categoryId: 'not found' })
  }
  if (focusIds?.length) {
    const found = await db.focus.count({ where: { id: { in: focusIds }, OR: [{ reviewState: 'APPROVED' }, { createdById: userId }] } })
    if (found !== new Set(focusIds).size) throw badRequest('Choose a focus', { focusIds: 'contains an unknown focus' })
  }
}

export async function create(userId: string, input: { title: string; categoryId: string; focusIds?: string[]; summary?: string | null }) {
  await assertTaxonomy(userId, input.categoryId, input.focusIds)
  const title = input.title.trim()
  if (!title) throw badRequest('Name the activity', { title: 'is required' })
  const a = await db.$transaction(async (tx) => {
    const activity = await tx.activity.create({
      data: {
        creatorId: userId,
        categoryId: input.categoryId,
        title,
        summary: input.summary?.trim() || null,
        focuses: { create: [...new Set(input.focusIds ?? [])].map((focusId) => ({ focusId })) },
      },
    })
    await tx.activityRevision.create({
      data: { activityId: activity.id, revisionNumber: 1, titleSnapshot: title, summarySnapshot: input.summary?.trim() || null, editorId: userId },
    })
    await allocateActivitySlug(tx, { activityId: activity.id, title })
    return activity
  })
  return detailForOwner(userId, a.id)
}

export async function updateDraft(
  userId: string,
  activityId: string,
  input: { title?: string; summary?: string | null; categoryId?: string; focusIds?: string[]; expectedRevision: number },
) {
  await assertTaxonomy(userId, input.categoryId, input.focusIds)
  if (input.title !== undefined && !input.title.trim()) throw badRequest('Name the activity', { title: 'is required' })
  await db.$transaction(async (tx) => {
    const { draft } = await openDraft(tx, userId, activityId, input.expectedRevision)
    const title = input.title?.trim()
    const summary = input.summary === undefined ? undefined : input.summary?.trim() || null
    await tx.activityRevision.update({ where: { id: draft.id }, data: { titleSnapshot: title, summarySnapshot: summary } })
    await tx.activity.update({ where: { id: activityId }, data: { title, summary, categoryId: input.categoryId } })
    if (title) {
      await allocateActivitySlug(tx, { activityId, title })
    }
    if (input.focusIds) {
      await tx.activityFocus.deleteMany({ where: { activityId } })
      await tx.activityFocus.createMany({ data: [...new Set(input.focusIds)].map((focusId) => ({ activityId, focusId })) })
    }
  })
  return detailForOwner(userId, activityId)
}

async function deleteInstructions(tx: Tx, ids: string[]) {
  if (!ids.length) return
  // Children first: these FKs are RESTRICT because their columns carry CHECK constraints.
  await tx.activityMetric.deleteMany({ where: { instructionId: { in: ids } } })
  await tx.activityTool.deleteMany({ where: { instructionId: { in: ids } } })
  await tx.mediaAttachment.deleteMany({ where: { instructionId: { in: ids } } })
  await tx.instruction.deleteMany({ where: { id: { in: ids } } })
}

export async function putInstructions(
  userId: string,
  activityId: string,
  input: { instructions: { instructionKey?: string; title?: string | null; body?: string | null }[]; expectedRevision: number },
) {
  const keys = input.instructions.map((i) => i.instructionKey).filter(Boolean) as string[]
  if (new Set(keys).size !== keys.length) throw badRequest('Each instruction can appear once', { instructions: 'has duplicate instructionKey' })
  await db.$transaction(async (tx) => {
    const { draft } = await openDraft(tx, userId, activityId, input.expectedRevision)
    const existing = new Map(draft.instructions.map((i) => [i.instructionKey, i]))
    const unknown = keys.filter((k) => !existing.has(k))
    if (unknown.length) throw badRequest('Unknown instruction', { instructions: `instructionKey not in this activity: ${unknown[0]}` })
    await deleteInstructions(tx, draft.instructions.filter((i) => !keys.includes(i.instructionKey)).map((i) => i.id))
    // Park remaining rows on negative positions so the (revision, position) unique index never collides.
    for (const [n, i] of draft.instructions.filter((x) => keys.includes(x.instructionKey)).entries()) {
      await tx.instruction.update({ where: { id: i.id }, data: { position: -1 - n } })
    }
    for (const [position, item] of input.instructions.entries()) {
      const data = { position, title: item.title === undefined ? undefined : item.title?.trim() || null, body: item.body === undefined ? undefined : item.body || null }
      if (item.instructionKey) {
        await tx.instruction.update({ where: { id: existing.get(item.instructionKey)!.id }, data })
      } else {
        await tx.instruction.create({ data: { ...data, activityRevisionId: draft.id, instructionKey: randomUUID() } })
      }
    }
  })
  return detailForOwner(userId, activityId)
}

function instructionIdFor(draft: RevisionFull, key: string | null | undefined) {
  if (!key) return null
  const i = draft.instructions.find((x) => x.instructionKey === key)
  if (!i) throw badRequest('Unknown instruction', { instructionKey: `not in this activity: ${key}` })
  return i.id
}

export async function putMetrics(
  userId: string,
  activityId: string,
  input: {
    metrics: { metricDefinitionId: string; instructionKey?: string | null; required?: boolean; defaults?: Record<string, unknown> | null; rollupToMetricKey?: string | null }[]
    expectedRevision: number
  },
) {
  const defIds = [...new Set(input.metrics.map((m) => m.metricDefinitionId))]
  const defs = await db.metricDefinition.findMany({ where: { id: { in: defIds }, OR: [{ ownerId: null }, { ownerId: userId }] } })
  if (defs.length !== defIds.length) throw badRequest('Unknown metric', { metrics: 'contains an unknown metric' })
  const defById = new Map(defs.map((d) => [d.id, d]))
  // One binding per metric per scope (08 §3).
  const scopes = input.metrics.map((m) => `${m.instructionKey ?? ''}:${m.metricDefinitionId}`)
  if (new Set(scopes).size !== scopes.length) throw badRequest('Each metric can appear once per level', { metrics: 'has duplicates' })
  // Roll-ups are explicit and type-compatible, so instruction values are never summed twice (08 §4).
  const activityLevel = new Map(input.metrics.filter((m) => !m.instructionKey).map((m) => [defById.get(m.metricDefinitionId)!.key, defById.get(m.metricDefinitionId)!]))
  for (const m of input.metrics) {
    if (!m.rollupToMetricKey) continue
    const def = defById.get(m.metricDefinitionId)!
    const target = activityLevel.get(m.rollupToMetricKey)
    if (!m.instructionKey) throw badRequest('Only instruction metrics roll up', { rollupToMetricKey: 'requires instructionKey' })
    if (!target || target.valueType !== def.valueType || (target.unit ?? null) !== (def.unit ?? null)) {
      throw badRequest('Roll-up target must be an activity metric of the same type and unit', { rollupToMetricKey: 'is not compatible' })
    }
  }
  await db.$transaction(async (tx) => {
    const { draft } = await openDraft(tx, userId, activityId, input.expectedRevision)
    await tx.activityMetric.deleteMany({ where: { OR: [{ activityRevisionId: draft.id }, { instructionId: { in: draft.instructions.map((i) => i.id) } }] } })
    const positions = new Map<string, number>()
    for (const m of input.metrics) {
      const instructionId = instructionIdFor(draft, m.instructionKey)
      const scope = instructionId ?? 'activity'
      const position = positions.get(scope) ?? 0
      positions.set(scope, position + 1)
      await tx.activityMetric.create({
        data: {
          ...(instructionId ? { instructionId } : { activityRevisionId: draft.id }),
          metricDefinitionId: m.metricDefinitionId,
          position,
          required: m.required ?? false,
          defaults: (m.defaults ?? undefined) as Prisma.InputJsonValue | undefined,
          rollupToMetricKey: m.rollupToMetricKey ?? null,
        },
      })
    }
  })
  return detailForOwner(userId, activityId)
}

export async function putTools(
  userId: string,
  activityId: string,
  input: { tools: { toolDefinitionId: string; instructionKey?: string | null; config?: Record<string, unknown> | null }[]; expectedRevision: number },
) {
  const ids = [...new Set(input.tools.map((t) => t.toolDefinitionId))]
  if ((await db.toolDefinition.count({ where: { id: { in: ids } } })) !== ids.length) throw badRequest('Unknown tool', { tools: 'contains an unknown tool' })
  await db.$transaction(async (tx) => {
    const { draft } = await openDraft(tx, userId, activityId, input.expectedRevision)
    await tx.activityTool.deleteMany({ where: { OR: [{ activityRevisionId: draft.id }, { instructionId: { in: draft.instructions.map((i) => i.id) } }] } })
    const positions = new Map<string, number>()
    for (const t of input.tools) {
      const instructionId = instructionIdFor(draft, t.instructionKey)
      const scope = instructionId ?? 'activity'
      const position = positions.get(scope) ?? 0
      positions.set(scope, position + 1)
      // Tools are declarative configuration for approved components; no executable content (08 §5).
      await tx.activityTool.create({
        data: { ...(instructionId ? { instructionId } : { activityRevisionId: draft.id }), toolDefinitionId: t.toolDefinitionId, position, config: (t.config ?? undefined) as Prisma.InputJsonValue | undefined },
      })
    }
  })
  return detailForOwner(userId, activityId)
}

/** Publishes the draft revision (if any) and sets the Activity's audience. */
export async function publish(tx: Tx, userId: string, activityId: string, visibility: 'PRIVATE' | 'UNLISTED' | 'PUBLIC') {
  const a = await tx.activity.findUnique({ where: { id: activityId } })
  if (!a || !isOwner(a, userId)) throw notFound('Activity')
  if (a.status === 'ARCHIVED') throw forbidden('Archived activities cannot be published')
  const latest = await tx.activityRevision.findFirst({ where: { activityId }, orderBy: { revisionNumber: 'desc' } })
  if (!latest) throw notFound('Activity')
  if (!latest.titleSnapshot.trim()) throw badRequest('Name the activity before publishing', { title: 'is required' })
  if (visibility !== 'PRIVATE') {
    if (await isPublishingRestricted(userId)) throw forbidden('Publishing is restricted on this account')
  }
  const publishedId = latest.publishedAt ? latest.id : (await tx.activityRevision.update({ where: { id: latest.id }, data: { publishedAt: new Date() } })).id
  await tx.activity.update({ where: { id: activityId }, data: { status: 'PUBLISHED', visibility, latestPublishedRevisionId: publishedId } })
  if (!a.slug) {
    await allocateActivitySlug(tx, { activityId, title: latest.titleSnapshot })
  }
  return publishedId
}

export async function publishActivity(userId: string, activityId: string, input: { visibility: 'PRIVATE' | 'UNLISTED' | 'PUBLIC'; expectedRevision: number }) {
  await db.$transaction(async (tx) => {
    const bumped = await tx.activity.updateMany({ where: { id: activityId, creatorId: userId, draftRevision: input.expectedRevision }, data: { draftRevision: { increment: 1 } } })
    if (bumped.count === 0) {
      if (!(await tx.activity.findFirst({ where: { id: activityId, creatorId: userId } }))) throw notFound('Activity')
      throw versionConflict()
    }
    await publish(tx, userId, activityId, input.visibility)
  })
  return detailForOwner(userId, activityId)
}

export async function archive(userId: string, activityId: string) {
  const a = await db.activity.findUnique({ where: { id: activityId } })
  if (!a || !isOwner(a, userId)) throw notFound('Activity')
  // Archiving removes discovery and new use; pinned revisions keep serving existing Programs (02 §4).
  await db.activity.update({ where: { id: activityId }, data: { status: 'ARCHIVED' } })
  return detailForOwner(userId, activityId)
}

/**
 * Customize Copy (08 §6): a new private Activity owned by the user, with source attribution.
 * The original never changes. Choosing to customize this Activity is the author's selection of
 * equivalence, so the copy joins the source's canonical hub (02 §6).
 * Media: platform and the user's own assets are referenced; other people's assets are not copied.
 */
export async function copy(userId: string, activityId: string, input: { sourceRevisionId?: string; newTitle?: string }) {
  const src = await db.activity.findUnique({ where: { id: activityId }, include: { focuses: true } })
  if (!src) throw notFound('Activity')
  const revId = input.sourceRevisionId ?? (isOwner(src, userId) ? await latestRevisionId(src.id) : src.latestPublishedRevisionId)
  const rev = revId ? await db.activityRevision.findFirst({ where: { id: revId, activityId }, include: revisionInclude }) : null
  if (!rev || !(await canReadRevision(userId, src, rev))) throw notFound('Activity')
  const title = (input.newTitle ?? rev.titleSnapshot).trim()
  const created = await db.$transaction(async (tx) => {
    const a = await tx.activity.create({
      data: {
        creatorId: userId,
        categoryId: src.categoryId,
        title,
        summary: rev.summarySnapshot,
        sourceActivityId: src.id,
        canonicalActivityId: src.canonicalActivityId ?? src.id,
        focuses: { create: src.focuses.map((f) => ({ focusId: f.focusId })) },
      },
    })
    const r = await cloneRevision(tx, { ...rev, titleSnapshot: title }, a.id, 1, userId, (ownerId) => ownerId === null || ownerId === userId)
    await tx.activityRevision.update({ where: { id: r.id }, data: { titleSnapshot: title } })
    await allocateActivitySlug(tx, { activityId: a.id, title })
    return a
  })
  return detailForOwner(userId, created.id)
}
