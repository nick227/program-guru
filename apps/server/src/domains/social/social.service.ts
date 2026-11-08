// Discovery, creator portfolio, engagement (12-SOCIAL.md, 13-PROFILES-AND-EXPERIENCE.md §3).
import { db, type Prisma } from '@project/db'
import { sha256 } from '../../lib/auth'
import { badRequest, notFound } from '../../lib/errors'
import { withIdempotency } from '../../lib/idempotency'
import { enqueue } from '../../lib/outbox'
import { afterCursor, offsetArgs, pageArgs, pageOrder, toOffsetPage, toPage, type PageQuery } from '../../lib/paging'
import { loadRevisions, activityInclude, toActivitySummary } from '../activities/mapper'
import { canSeeProgram, discoverableProgramWhere } from '../programs/access'
import { programInclude, toProgramSummary } from '../programs/mapper'
import { canSeePublication } from '../media/media.service'
import { mediaUrl } from '../media/urls'
import { toUserSummary } from '../users/mapper'
import { userIdForHandle } from '../users/directory.service'
import { isBlockedEitherWay } from '../users/follow.service'

const MAX_PUBLIC_MEDIA_PER_CREATOR = 3

type DiscoverQuery = PageQuery & {
  kind: 'PROGRAM' | 'ACTIVITY' | 'CREATOR'
  q?: string
  categoryId?: string
  programTypeId?: string
  focusId?: string
  accessMode?: 'OPEN' | 'APPROVAL' | 'PAID'
  sort?: 'RELEVANT' | 'NEW' | 'POPULAR'
}

async function blockedIds(viewerId: string | null) {
  if (!viewerId) return []
  const rows = await db.userBlock.findMany({ where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] } })
  return rows.map((b) => (b.blockerId === viewerId ? b.blockedId : b.blockerId))
}

export async function discover(viewerId: string | null, query: DiscoverQuery) {
  const { limit, skip, take } = offsetArgs(query)
  const hidden = await blockedIds(viewerId)
  const q = query.q?.trim()

  if (query.kind === 'PROGRAM') {
    const where: Prisma.ProgramWhereInput = {
      ...discoverableProgramWhere,
      ...(hidden.length ? { OR: [{ creatorId: null }, { creatorId: { notIn: hidden } }] } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.programTypeId ? { programTypeId: query.programTypeId } : {}),
      ...(query.focusId ? { focusId: query.focusId } : {}),
      ...(query.accessMode ? { policy: { accessMode: query.accessMode } } : {}),
      ...(q ? { AND: [{ OR: [{ title: { contains: q } }, { description: { contains: q } }] }] } : {}),
    }
    // RELEVANT: seeded Programs lead (12 §5), then completion/retention rank (decision 19), then recency.
    const orderBy: Prisma.ProgramOrderByWithRelationInput[] =
      query.sort === 'NEW'
        ? [{ createdAt: 'desc' }, { id: 'desc' }]
        : query.sort === 'POPULAR'
          ? [{ stat: { enrollmentCount: 'desc' } }, { createdAt: 'desc' }, { id: 'desc' }]
          : [{ creatorId: { sort: 'asc', nulls: 'first' } }, { stat: { rankScore: 'desc' } }, { createdAt: 'desc' }, { id: 'desc' }]
    const rows = await db.program.findMany({ where, orderBy, skip, take, include: programInclude })
    return toOffsetPage(rows, limit, skip, (p) => ({ kind: 'PROGRAM' as const, program: toProgramSummary(p, 'PREVIEW'), activity: null, creator: null }))
  }

  if (query.kind === 'ACTIVITY') {
    const rows = await db.activity.findMany({
      where: {
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        moderatedAt: null,
        latestPublishedRevisionId: { not: null },
        ...(hidden.length ? { OR: [{ creatorId: null }, { creatorId: { notIn: hidden } }] } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.focusId ? { focuses: { some: { focusId: query.focusId } } } : {}),
        ...(q ? { AND: [{ OR: [{ title: { contains: q } }, { summary: { contains: q } }] }] } : {}),
      },
      orderBy:
        query.sort === 'NEW'
          ? [{ createdAt: 'desc' }, { id: 'desc' }]
          : query.sort === 'POPULAR'
            ? // Usage, not ratings: scheduled occurrences, Program placements, then personal copies.
              [{ calendarItems: { _count: 'desc' } }, { scheduleItems: { _count: 'desc' } }, { copies: { _count: 'desc' } }, { title: 'asc' }, { id: 'asc' }]
            : [{ creatorId: { sort: 'asc', nulls: 'first' } }, { title: 'asc' }, { id: 'asc' }],
      skip,
      take,
      include: activityInclude,
    })
    const revs = await loadRevisions(rows.map((a) => a.latestPublishedRevisionId!))
    return toOffsetPage(rows, limit, skip, (a) => ({ kind: 'ACTIVITY' as const, program: null, activity: toActivitySummary(a, revs.get(a.latestPublishedRevisionId!) ?? null), creator: null }))
  }

  const rows = await db.userProfile.findMany({
    where: {
      user: { status: 'ACTIVE', programs: { some: discoverableProgramWhere } },
      ...(hidden.length ? { userId: { notIn: hidden } } : {}),
      ...(q ? { OR: [{ handle: { startsWith: q.toLowerCase() } }, { displayName: { contains: q } }] } : {}),
    },
    orderBy: [{ handle: 'asc' }],
    skip,
    take,
  })
  return toOffsetPage(rows, limit, skip, (p) => ({ kind: 'CREATOR' as const, program: null, activity: null, creator: toUserSummary(p) }))
}

// ── Creator portfolio (13 §3): public content only, never private logs ──────

export async function userPrograms(viewerId: string | null, handle: string, query: PageQuery) {
  const profile = await userIdForHandle(viewerId, handle)
  const { limit, take } = pageArgs(query)
  const own = viewerId === profile.userId
  const rows = await db.program.findMany({
    where: { creatorId: profile.userId, ...(own ? { status: { not: 'DRAFT' } } : discoverableProgramWhere), ...afterCursor(query.cursor) },
    orderBy: pageOrder,
    take,
    include: programInclude,
  })
  return toPage(rows, limit, (p) => toProgramSummary(p, own ? 'OWNER' : 'PREVIEW'))
}

export async function userActivities(viewerId: string | null, handle: string, query: PageQuery) {
  const profile = await userIdForHandle(viewerId, handle)
  const { limit, take } = pageArgs(query)
  const rows = await db.activity.findMany({
    where: { creatorId: profile.userId, status: 'PUBLISHED', visibility: 'PUBLIC', moderatedAt: null, latestPublishedRevisionId: { not: null }, ...afterCursor(query.cursor) },
    orderBy: pageOrder,
    take,
    include: activityInclude,
  })
  const revs = await loadRevisions(rows.map((a) => a.latestPublishedRevisionId!))
  return toPage(rows, limit, (a) => toActivitySummary(a, revs.get(a.latestPublishedRevisionId!) ?? null))
}

const publicThumb = (p: Prisma.MediaPublicationGetPayload<{ include: { media: true; publishedBy: { include: { profile: true } } } }>, likedByMe: boolean) => ({
  id: p.media.id,
  thumbnailUrl: mediaUrl(p.media.id, 'thumb', { publicationId: p.id }),
  type: p.media.type,
  durationMs: p.media.durationMs,
  alt: p.media.alt ?? '',
  canSelect: false,
  publicationId: p.id,
  creator: p.publishedBy.profile ? toUserSummary(p.publishedBy.profile) : null,
  likes: p.likeCount,
  views: p.viewCount,
  likedByMe,
  license: p.license,
  attribution: p.media.attribution,
})

async function likedSet(viewerId: string | null, ids: string[]) {
  if (!viewerId || !ids.length) return new Set<string>()
  return new Set((await db.mediaReaction.findMany({ where: { userId: viewerId, publicationId: { in: ids } } })).map((r) => r.publicationId))
}

export async function userPublications(viewerId: string | null, handle: string, query: PageQuery) {
  const profile = await userIdForHandle(viewerId, handle)
  const { limit, take } = pageArgs(query)
  // Group-shared media is never part of the public portfolio (13 §3).
  const rows = await db.mediaPublication.findMany({
    where: { publishedById: profile.userId, audience: 'PUBLIC', status: 'APPROVED', media: { deletedAt: null, state: 'READY' }, ...afterCursor(query.cursor) },
    orderBy: pageOrder,
    take,
    include: { media: true, publishedBy: { include: { profile: true } } },
  })
  const liked = await likedSet(viewerId, rows.map((r) => r.id))
  return toPage(rows, limit, (p) => publicThumb(p, liked.has(p.id)))
}

/** Approved public media for an Activity's canonical hub; the given Program creator's media first (11 §5). */
export async function activityPublicMedia(viewerId: string | null, activityId: string, query: PageQuery & { programId?: string }) {
  const hidden = await blockedIds(viewerId)
  const a = await db.activity.findUnique({ where: { id: activityId } })
  if (!a || a.status !== 'PUBLISHED' || a.visibility === 'PRIVATE' || a.moderatedAt) throw notFound('Activity')
  if (a.creatorId && hidden.includes(a.creatorId)) throw notFound('Activity')
  const root = a.canonicalActivityId ?? a.id
  const ids = (
    await db.activity.findMany({
      where: {
        OR: [{ id: root }, { canonicalActivityId: root }],
        status: 'PUBLISHED',
        visibility: { not: 'PRIVATE' },
        moderatedAt: null,
      },
      select: { id: true },
    })
  ).map((x) => x.id)
  let creatorId: string | null = null
  if (query.programId) {
    const program = await db.program.findUnique({ where: { id: query.programId } })
    if (program && (await canSeeProgram(viewerId, program)) && (!program.creatorId || !hidden.includes(program.creatorId))) {
      creatorId = program.creatorId
    }
  }
  const { limit, skip, take } = offsetArgs(query)
  const rows = await db.mediaPublication.findMany({
    where: {
      audience: 'PUBLIC',
      status: 'APPROVED',
      license: { not: null },
      activityId: { in: ids },
      media: { deletedAt: null, state: 'READY' },
      publishedBy: { status: 'ACTIVE' },
      ...(hidden.length ? { publishedById: { notIn: hidden } } : {}),
      OR: [
        { programId: null },
        {
          program: {
            status: 'PUBLISHED',
            visibility: 'PUBLIC',
            moderatedAt: null,
            OR: [{ policy: null }, { policy: { accessMode: 'OPEN' } }],
          },
        },
      ],
    },
    include: { media: true, publishedBy: { include: { profile: true } } },
    orderBy: [{ rankScore: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    take: Math.max(200, skip + take * 4),
  })
  // 11 §5: Featured Program creator's approved public media first, then ranked community media with repeated contributions per creator capped.
  const featured = creatorId ? rows.filter((r) => r.publishedById === creatorId) : []
  const perCreatorCount = new Map<string, number>()
  const community = rows.filter((r) => {
    if (creatorId && r.publishedById === creatorId) return false
    const c = perCreatorCount.get(r.publishedById) ?? 0
    if (c >= MAX_PUBLIC_MEDIA_PER_CREATOR) return false
    perCreatorCount.set(r.publishedById, c + 1)
    return true
  })
  const ordered = [...featured, ...community]
  const window = ordered.slice(skip, skip + take)
  const liked = await likedSet(viewerId, window.map((r) => r.id))
  return toOffsetPage(window, limit, skip, (p) => publicThumb(p, liked.has(p.id)))
}

// ── Engagement ──────────────────────────────────────────────────────────────

async function publicPublication(publicationId: string, viewerId?: string | null) {
  const p = await db.mediaPublication.findUnique({ where: { id: publicationId }, include: { media: true } })
  if (!p || p.audience !== 'PUBLIC' || p.status !== 'APPROVED' || p.media.deletedAt) throw notFound('Publication')
  if (viewerId && p.publishedById !== viewerId && (await isBlockedEitherWay(viewerId, p.publishedById))) throw notFound('Publication')
  return p
}

export async function like(userId: string, publicationId: string) {
  const p = await publicPublication(publicationId, userId)
  // Idempotent toggle (12 §4): counts move only when a row is actually created or removed.
  const likes = await db.$transaction(async (tx) => {
    const created = await tx.mediaReaction.createMany({ data: [{ publicationId: p.id, userId, type: 'LIKE' }], skipDuplicates: true })
    if (created.count) await tx.mediaPublication.update({ where: { id: p.id }, data: { likeCount: { increment: 1 } } })
    return (await tx.mediaPublication.findUniqueOrThrow({ where: { id: p.id } })).likeCount
  })
  return { liked: true, likes }
}

export async function unlike(userId: string, publicationId: string) {
  const p = await publicPublication(publicationId, userId)
  const likes = await db.$transaction(async (tx) => {
    const removed = await tx.mediaReaction.deleteMany({ where: { publicationId: p.id, userId, type: 'LIKE' } })
    if (removed.count) await tx.mediaPublication.update({ where: { id: p.id }, data: { likeCount: { decrement: removed.count } } })
    return (await tx.mediaPublication.findUniqueOrThrow({ where: { id: p.id } })).likeCount
  })
  return { liked: false, likes }
}

/** A qualified view, deduplicated per viewer per day with a non-identifying hash (12 §4). */
export async function recordView(viewerId: string | null, fingerprint: string, publicationId: string) {
  const p = await publicPublication(publicationId, viewerId)
  const day = new Date().toISOString().slice(0, 10)
  const viewerHash = sha256(`${p.id}:${viewerId ?? fingerprint}:${day}`)
  const created = await db.publicationView.createMany({ data: [{ publicationId: p.id, viewerHash }], skipDuplicates: true })
  if (created.count) await db.mediaPublication.update({ where: { id: p.id }, data: { viewCount: { increment: 1 } } })
}

// ── Comments: group-shared media only in P1 ─────────────────────────────────

async function commentablePublication(userId: string, publicationId: string) {
  const p = await db.mediaPublication.findUnique({ where: { id: publicationId }, include: { media: true, group: true } })
  if (!p || !(await canSeePublication(userId, p))) throw notFound('Publication')
  if (p.audience !== 'GROUP') throw badRequest('Comments are available on group-shared media')
  return p
}

const toComment = (c: Prisma.MediaCommentGetPayload<{ include: { author: { include: { profile: true } } } }>, canDelete: boolean) => ({
  id: c.id,
  publicationId: c.publicationId,
  author: toUserSummary(c.author.profile!),
  body: c.body,
  createdAt: c.createdAt.toISOString(),
  editedAt: c.editedAt?.toISOString() ?? null,
  canDelete,
})

export async function listComments(userId: string, publicationId: string, query: PageQuery) {
  const p = await commentablePublication(userId, publicationId)
  const { limit, take } = pageArgs(query)
  const rows = await db.mediaComment.findMany({
    where: { publicationId: p.id, deletedAt: null, status: 'VISIBLE', ...afterCursor(query.cursor) },
    orderBy: pageOrder,
    take,
    include: { author: { include: { profile: true } } },
  })
  const moderator = p.publishedById === userId || p.group?.ownerId === userId
  return toPage(rows, limit, (c) => toComment(c, moderator || c.authorId === userId))
}

export async function addComment(userId: string, publicationId: string, body: string, idempotencyKey?: string) {
  const p = await commentablePublication(userId, publicationId)
  const text = body.trim()
  if (!text) throw badRequest('Write a comment', { body: 'is empty' })
  const createOnce = async () => {
    const c = await db.$transaction(async (tx) => {
      const row = await tx.mediaComment.create({ data: { publicationId: p.id, authorId: userId, body: text }, include: { author: { include: { profile: true } } } })
      await tx.mediaPublication.update({ where: { id: p.id }, data: { commentCount: { increment: 1 } } })
      await enqueue(tx, 'GroupMediaCommented', { commentId: row.id, publicationId: p.id, authorId: userId, recipientId: p.publishedById, groupId: p.groupId, occurrenceKey: p.occurrenceKey })
      return row
    })
    return { ref: c.id, result: toComment(c, true) }
  }
  if (!idempotencyKey) return (await createOnce()).result
  return withIdempotency({
    userId,
    scope: `comment:${p.id}`,
    key: idempotencyKey,
    request: { publicationId: p.id, body: text },
    load: async (ref) => {
      const existing = await db.mediaComment.findUniqueOrThrow({ where: { id: ref }, include: { author: { include: { profile: true } } } })
      return toComment(existing, true)
    },
    run: createOnce,
  })
}

export async function deleteComment(userId: string, commentId: string) {
  const c = await db.mediaComment.findUnique({ where: { id: commentId }, include: { publication: { include: { group: true } } } })
  if (!c || c.deletedAt) throw notFound('Comment')
  const allowed = c.authorId === userId || c.publication.publishedById === userId || c.publication.group?.ownerId === userId
  if (!allowed) throw notFound('Comment')
  await db.$transaction([
    db.mediaComment.update({ where: { id: c.id }, data: { deletedAt: new Date() } }),
    db.mediaPublication.update({ where: { id: c.publicationId }, data: { commentCount: { decrement: 1 } } }),
  ])
}
