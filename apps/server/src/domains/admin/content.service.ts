// Admin content (12-SOCIAL §7a): one list over Programs and Activities, and moderation of user-owned
// content. Editing, publishing, archiving and deleting go through the ordinary authoring operations.
import { db, type Prisma } from '@project/db'
import { badRequest, notFound } from '../../lib/errors'
import { offsetArgs, toOffsetPage, type PageQuery } from '../../lib/paging'
import { toUserSummary } from '../users/mapper'
import { applyModeration } from '../social/moderation.service'
import { audit } from './audit'

type Kind = 'PROGRAM' | 'ACTIVITY'
type Status = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
type Visibility = 'PRIVATE' | 'UNLISTED' | 'PUBLIC'

export type ContentQuery = PageQuery & {
  kind?: Kind
  owner?: 'PLATFORM' | 'USERS'
  creatorId?: string
  status?: Status
  visibility?: Visibility
  moderated?: boolean
  q?: string
}

const programInclude = {
  creator: { include: { profile: true } },
  programType: true,
  policy: true,
  versions: { where: { publishedAt: null }, select: { id: true, placementCount: true, durationDays: true } },
  latestPublished: { select: { placementCount: true, durationDays: true } },
} satisfies Prisma.ProgramInclude
const activityInclude = {
  creator: { include: { profile: true } },
  category: true,
  revisions: { orderBy: { revisionNumber: 'desc' as const }, take: 1, select: { publishedAt: true } },
} satisfies Prisma.ActivityInclude

type ProgramRow = Prisma.ProgramGetPayload<{ include: typeof programInclude }>
type ActivityRow = Prisma.ActivityGetPayload<{ include: typeof activityInclude }>

const creatorOf = (c: { profile: Parameters<typeof toUserSummary>[0] | null } | null) => (c?.profile ? toUserSummary(c.profile) : null)

function toProgramItem(p: ProgramRow) {
  const draft = p.versions[0] ?? null
  const current = draft ?? p.latestPublished
  return {
    kind: 'PROGRAM' as const,
    id: p.id,
    title: p.title,
    status: p.status,
    visibility: p.visibility,
    accessMode: p.policy?.accessMode ?? 'OPEN',
    isPlatform: p.creatorId === null,
    creator: creatorOf(p.creator),
    typeLabel: p.programType.label,
    durationDays: current?.durationDays ?? null,
    placementCount: current?.placementCount ?? 0,
    moderated: !!p.moderatedAt,
    hasUnpublishedChanges: !!draft && !!p.latestPublishedVersionId,
    draftRevision: p.draftRevision,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }
}

function toActivityItem(a: ActivityRow) {
  return {
    kind: 'ACTIVITY' as const,
    id: a.id,
    title: a.title,
    status: a.status,
    visibility: a.visibility,
    accessMode: null,
    isPlatform: a.creatorId === null,
    creator: creatorOf(a.creator),
    typeLabel: a.category.label,
    durationDays: null,
    placementCount: null,
    moderated: !!a.moderatedAt,
    hasUnpublishedChanges: !!a.latestPublishedRevisionId && !a.revisions[0]?.publishedAt,
    draftRevision: a.draftRevision,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }
}

/** Both tables share these filters; each kind is fetched up to the page end, then merged by recency. */
function sharedWhere(query: ContentQuery) {
  return {
    ...(query.owner === 'PLATFORM' ? { creatorId: null } : query.owner === 'USERS' ? { creatorId: { not: null } } : {}),
    ...(query.creatorId ? { creatorId: query.creatorId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.visibility ? { visibility: query.visibility } : {}),
    ...(query.moderated === undefined ? {} : { moderatedAt: query.moderated ? { not: null } : null }),
  }
}

export async function list(query: ContentQuery) {
  const { limit, skip, take } = offsetArgs(query)
  const q = query.q?.trim()
  const order = [{ updatedAt: 'desc' as const }, { id: 'desc' as const }]
  const window = skip + take
  const [programs, activities] = await Promise.all([
    query.kind === 'ACTIVITY'
      ? []
      : db.program.findMany({
          // Owner-deleted Programs are tombstones kept for participants (07 §6), not content to manage.
          where: { ...sharedWhere(query), deletedAt: null, ...(q ? { title: { contains: q } } : {}) },
          orderBy: order,
          take: window,
          include: programInclude,
        }),
    query.kind === 'PROGRAM'
      ? []
      : db.activity.findMany({
          where: { ...sharedWhere(query), ...(q ? { OR: [{ title: { contains: q } }, { summary: { contains: q } }] } : {}) },
          orderBy: order,
          take: window,
          include: activityInclude,
        }),
  ])
  const merged = [...programs.map(toProgramItem), ...activities.map(toActivityItem)].sort(
    (a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id),
  )
  return toOffsetPage(merged.slice(skip, skip + take), limit, skip, (x) => x)
}

/** Hide, restore or unlist anyone's content without editing it (12 §7, §7a). Audited. */
export async function moderate(actorId: string, kind: Kind, id: string, input: { action: 'HIDE' | 'RESTORE' | 'UNLIST'; reason: string }) {
  const reason = input.reason.trim()
  if (!reason) throw badRequest('Give a reason', { reason: 'is required' })
  if (kind === 'ACTIVITY' && input.action === 'UNLIST') throw badRequest('Activities cannot be unlisted', { action: 'not applicable to activities' })
  await db.$transaction(async (tx) => {
    const exists = kind === 'PROGRAM' ? await tx.program.findUnique({ where: { id }, select: { id: true } }) : await tx.activity.findUnique({ where: { id }, select: { id: true } })
    if (!exists) throw notFound(kind === 'PROGRAM' ? 'Program' : 'Activity')
    await applyModeration(tx, actorId, input.action, kind, id)
    await audit(tx, actorId, kind, id, input.action, reason)
  })
  const row =
    kind === 'PROGRAM'
      ? toProgramItem(await db.program.findUniqueOrThrow({ where: { id }, include: programInclude }))
      : toActivityItem(await db.activity.findUniqueOrThrow({ where: { id }, include: activityInclude }))
  return row
}

/** Audit trail, newest first, optionally for one target or actor. */
export async function auditLog(query: PageQuery & { targetId?: string; actorId?: string }) {
  const { limit, skip, take } = offsetArgs(query)
  const rows = await db.moderationAction.findMany({
    where: { ...(query.targetId ? { targetId: query.targetId } : {}), ...(query.actorId ? { moderatorId: query.actorId } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: { moderator: { include: { profile: true } } },
    skip,
    take,
  })
  return toOffsetPage(rows, limit, skip, (r) => ({
    id: r.id,
    actor: creatorOf(r.moderator),
    targetType: r.targetType,
    targetId: r.targetId,
    action: r.action,
    reason: r.reason,
    reportId: r.reportId,
    createdAt: r.createdAt.toISOString(),
  }))
}
