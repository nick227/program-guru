// In-app notifications and the daily email opt-out (12-SOCIAL.md §6).
import { createHmac, timingSafeEqual } from 'crypto'
import { db, type NotificationType, type Prisma } from '@project/db'
import { notFound } from '../../lib/errors'
import { decodeCursor, encodeCursor, normalizeLimit } from '../../lib/pagination'
import { pageOrder, type PageQuery } from '../../lib/paging'
import { toUserSummary } from '../users/mapper'

export type NotificationFilter =
  | 'all'
  | 'unread'
  | 'direct'
  | 'groups'
  | 'reminder'
  | 'group'
  | 'participation'
  | 'achievement'
  | 'program'

export const GROUP_WINDOW_MS = 6 * 60 * 60 * 1000
const MAX_AVATAR_ACTORS = 5

const FILTER_TYPES: Partial<Record<NotificationFilter, NotificationType[]>> = {
  direct: [
    'FOLLOW_REQUEST',
    'FOLLOW_ACCEPTED',
    'GROUP_INVITE',
    'COMPLETION_COMMENT',
    'GROUP_MEDIA_COMMENT',
    'COMPLETION_REACTION',
    'PROGRAM_ACCESS',
    'CONTRIBUTION_APPROVED',
    'PAYMENT_ISSUE',
  ],
  groups: [
    'GROUP_INVITE',
    'MEMBER_JOINED',
    'COMPLETION_SHARED',
    'COMPLETION_REACTION',
    'COMPLETION_COMMENT',
    'GROUP_MEDIA_SHARED',
    'GROUP_MEDIA_COMMENT',
  ],
  reminder: ['ACTIVITY_REMINDER', 'DAILY_SUMMARY'],
  group: ['GROUP_INVITE', 'MEMBER_JOINED'],
  participation: [
    'COMPLETION_SHARED',
    'COMPLETION_REACTION',
    'COMPLETION_COMMENT',
    'GROUP_MEDIA_SHARED',
    'GROUP_MEDIA_COMMENT',
  ],
  achievement: ['ACHIEVEMENT_EARNED'],
  program: [
    'FOLLOW_REQUEST',
    'FOLLOW_ACCEPTED',
    'CONTRIBUTION_APPROVED',
    'PROGRAM_ACCESS',
    'PROGRAM_UPDATE',
    'PAYMENT_ISSUE',
  ],
}

export function notificationFilterWhere(filter?: NotificationFilter): Prisma.NotificationWhereInput {
  if (!filter || filter === 'all') return {}
  if (filter === 'unread') return { readAt: null }
  const types = FILTER_TYPES[filter]
  return types ? { type: { in: types } } : {}
}

type ActorSummary = ReturnType<typeof toUserSummary>

export type NotificationRowLike = {
  id: string
  type: NotificationType
  title: string
  deepLink: string
  entityKind: string
  entityId: string
  groupOccurrenceKey: string | null
  createdAt: Date
  readAt: Date | null
  actor: ActorSummary | null
}

type GroupFamily = 'REACTION' | 'COMMENT' | 'COMPLETION_SHARED' | 'GROUP_MEDIA_SHARED' | 'MEMBER_JOINED'

function groupingSpec(row: NotificationRowLike): { family: GroupFamily; target: string } | null {
  switch (row.type) {
    case 'COMPLETION_REACTION':
      return { family: 'REACTION', target: row.groupOccurrenceKey ?? `${row.entityKind}:${row.entityId}` }
    case 'COMPLETION_COMMENT':
    case 'GROUP_MEDIA_COMMENT':
      return { family: 'COMMENT', target: `${row.entityKind}:${row.entityId}` }
    case 'COMPLETION_SHARED':
      return { family: 'COMPLETION_SHARED', target: row.groupOccurrenceKey ?? `${row.entityKind}:${row.entityId}` }
    case 'GROUP_MEDIA_SHARED':
      return { family: 'GROUP_MEDIA_SHARED', target: row.groupOccurrenceKey ?? `${row.entityKind}:${row.entityId}` }
    case 'MEMBER_JOINED':
      return { family: 'MEMBER_JOINED', target: `${row.entityKind}:${row.entityId}` }
    default:
      return null
  }
}

function isStrictlyAfterCursor(
  row: { createdAt: Date; id: string },
  cursor: { createdAt: Date; id: string } | null,
): boolean {
  if (!cursor) return true
  const rowMs = row.createdAt.getTime()
  const curMs = cursor.createdAt.getTime()
  if (rowMs < curMs) return true
  if (rowMs === curMs && row.id < cursor.id) return true
  return false
}

function formatGroupedTitle(family: GroupFamily, type: NotificationType, actors: ActorSummary[], count: number): string {
  const first = actors[0]?.displayName ?? 'Someone'
  const second = actors[1]?.displayName ?? 'someone'
  const actorCount = actors.length

  switch (family) {
    case 'REACTION':
      if (actorCount <= 1) return `${first} reacted ${count} times to your activity`
      if (actorCount === 2) return `${first} and ${second} reacted to your activity`
      return `${first} and ${actorCount - 1} others reacted to your activity`
    case 'COMMENT': {
      const target = type === 'GROUP_MEDIA_COMMENT' ? 'your shared media' : 'your check-in'
      if (actorCount <= 1) return `${first} left ${count} comments on ${target}`
      if (actorCount === 2) return `${first} and ${second} commented on ${target}`
      return `${first} and ${actorCount - 1} others commented on ${target}`
    }
    case 'COMPLETION_SHARED':
      if (actorCount <= 1) return `${first} completed ${count} activities`
      if (actorCount === 2) return `${first} and ${second} completed today's activity`
      return `${first} and ${actorCount - 1} others completed today's activity`
    case 'GROUP_MEDIA_SHARED':
      if (actorCount <= 1) return `${first} shared ${count} photos or videos`
      if (actorCount === 2) return `${first} and ${second} shared photos or videos`
      return `${first} and ${actorCount - 1} others shared photos or videos`
    case 'MEMBER_JOINED':
      if (actorCount <= 1) return `${first} joined your group`
      if (actorCount === 2) return `${first} and ${second} joined your group`
      return `${first} and ${actorCount - 1} others joined your group`
  }
}

type GroupAccumulator = {
  key: string
  family: GroupFamily | null
  newestAt: Date
  newestId: string
  afterCursor: boolean
  rows: NotificationRowLike[]
}

function serializeGroup(group: GroupAccumulator) {
  const lead = group.rows[0]!
  const items = group.rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    actor: r.actor,
    createdAt: r.createdAt.toISOString(),
    readAt: r.readAt?.toISOString() ?? null,
    deepLink: r.deepLink,
  }))

  const seenActors = new Set<string>()
  const distinctActors: ActorSummary[] = []
  for (const r of group.rows) {
    if (r.actor && !seenActors.has(r.actor.id)) {
      seenActors.add(r.actor.id)
      distinctActors.push(r.actor)
    }
  }

  const unreadCount = group.rows.filter((r) => r.readAt === null).length
  const latestReadAt = group.rows.reduce<Date | null>((max, r) => {
    if (!r.readAt) return max
    return !max || r.readAt > max ? r.readAt : max
  }, null)

  const title =
    group.rows.length > 1 && group.family
      ? formatGroupedTitle(group.family, lead.type, distinctActors, group.rows.length)
      : lead.title

  return {
    id: lead.id,
    type: lead.type,
    title,
    actor: lead.actor,
    createdAt: lead.createdAt.toISOString(),
    readAt: unreadCount > 0 ? null : (latestReadAt?.toISOString() ?? null),
    deepLink: lead.deepLink,
    entityKind: lead.entityKind,
    entityId: lead.entityId,
    groupOccurrenceKey: lead.groupOccurrenceKey,
    groupKey: group.key,
    ids: group.rows.map((r) => r.id),
    count: group.rows.length,
    unreadCount,
    actors: distinctActors.slice(0, MAX_AVATAR_ACTORS),
    actorCount: distinctActors.length > 0 ? distinctActors.length : group.rows.length,
    items,
  }
}

/**
 * Groups pre-sorted (createdAt desc, id desc) notification rows before pagination.
 * When a cursor is provided, rows must start from (cursor.createdAt + windowMs) so any
 * older row absorbed by a group emitted on an earlier page is excluded cleanly.
 */
export function groupAndPaginateNotifications(
  rows: NotificationRowLike[],
  options: { cursor?: string; limit: number; windowMs?: number; exhausted?: boolean },
) {
  const windowMs = options.windowMs ?? GROUP_WINDOW_MS
  const decoded = decodeCursor(options.cursor)
  let parsedCursor: { createdAt: Date; id: string } | null = null
  if (decoded) {
    const at = new Date(decoded.createdAt)
    if (!Number.isNaN(at.getTime())) {
      parsedCursor = { createdAt: at, id: decoded.id }
    }
  }

  const activeGroups = new Map<string, GroupAccumulator>()
  const emitted: GroupAccumulator[] = []

  for (const row of rows) {
    const spec = groupingSpec(row)
    if (!spec) {
      if (!isStrictlyAfterCursor(row, parsedCursor)) continue
      emitted.push({
        key: row.id,
        family: null,
        newestAt: row.createdAt,
        newestId: row.id,
        afterCursor: true,
        rows: [row],
      })
      continue
    }

    const mapKey = `${spec.family}:${spec.target}`
    const existing = activeGroups.get(mapKey)
    if (existing && existing.newestAt.getTime() - row.createdAt.getTime() <= windowMs) {
      existing.rows.push(row)
      continue
    }

    const afterCursor = isStrictlyAfterCursor(row, parsedCursor)
    const bucket = Math.floor(row.createdAt.getTime() / windowMs)
    const acc: GroupAccumulator = {
      key: `${mapKey}:${bucket}:${row.id}`,
      family: spec.family,
      newestAt: row.createdAt,
      newestId: row.id,
      afterCursor,
      rows: [row],
    }
    activeGroups.set(mapKey, acc)
    if (afterCursor) {
      emitted.push(acc)
    }
  }

  const hasMore = emitted.length > options.limit
  const pageGroups = hasMore ? emitted.slice(0, options.limit) : emitted
  const lastGroup = pageGroups.at(-1)
  return {
    groups: pageGroups.map(serializeGroup),
    hasMore,
    nextCursor:
      hasMore && lastGroup
        ? encodeCursor({ createdAt: lastGroup.newestAt.toISOString(), id: lastGroup.newestId })
        : null,
    ready:
      Boolean(options.exhausted) ||
      (emitted.length > options.limit &&
        rows.length > 0 &&
        rows[rows.length - 1]!.createdAt.getTime() <
          emitted[options.limit - 1]!.newestAt.getTime() - windowMs),
  }
}

export async function list(userId: string, query: PageQuery & { filter?: NotificationFilter }) {
  const limit = normalizeLimit(query.limit, 100, 20)
  const filterWhere = notificationFilterWhere(query.filter)

  const decoded = decodeCursor(query.cursor)
  let lookbackWhere: Prisma.NotificationWhereInput = {}
  if (decoded) {
    const cursorAt = new Date(decoded.createdAt)
    if (!Number.isNaN(cursorAt.getTime())) {
      lookbackWhere = { createdAt: { lte: new Date(cursorAt.getTime() + GROUP_WINDOW_MS) } }
    }
  }

  const chunkSize = Math.min(Math.max(limit * 4, 80), 250)
  const collected: NotificationRowLike[] = []
  let dbCursor: { createdAt: Date; id: string } | null = null
  let exhausted = false

  type DbNotificationRow = Prisma.NotificationGetPayload<{
    include: { actor: { include: { profile: true } } }
  }>

  for (let round = 0; round < 10; round++) {
    const chunkCursorWhere: Prisma.NotificationWhereInput = dbCursor
      ? { OR: [{ createdAt: { lt: dbCursor.createdAt } }, { createdAt: dbCursor.createdAt, id: { lt: dbCursor.id } }] }
      : {}

    const rows: DbNotificationRow[] = await db.notification.findMany({
      where: {
        recipientId: userId,
        ...filterWhere,
        ...(dbCursor ? chunkCursorWhere : lookbackWhere),
      },
      orderBy: pageOrder,
      take: chunkSize,
      include: { actor: { include: { profile: true } } },
    })

    for (const r of rows) {
      collected.push({
        id: r.id,
        type: r.type,
        title: r.title,
        deepLink: r.deepLink,
        entityKind: r.entityKind,
        entityId: r.entityId,
        groupOccurrenceKey: r.groupOccurrenceKey,
        createdAt: r.createdAt,
        readAt: r.readAt,
        actor: r.actor?.profile ? toUserSummary(r.actor.profile) : null,
      })
    }

    if (rows.length < chunkSize) {
      exhausted = true
      break
    }

    const last = rows[rows.length - 1]!
    dbCursor = { createdAt: last.createdAt, id: last.id }

    const probe = groupAndPaginateNotifications(collected, {
      cursor: query.cursor,
      limit,
      exhausted: false,
    })
    if (probe.ready) {
      return {
        data: probe.groups,
        meta: { hasMore: probe.hasMore, nextCursor: probe.nextCursor },
      }
    }
  }

  const result = groupAndPaginateNotifications(collected, {
    cursor: query.cursor,
    limit,
    exhausted: exhausted || true,
  })
  return {
    data: result.groups,
    meta: { hasMore: result.hasMore, nextCursor: result.nextCursor },
  }
}

export async function unreadCount(userId: string) {
  return { count: await db.notification.count({ where: { recipientId: userId, readAt: null } }) }
}

export async function markRead(userId: string, input: { ids?: string[]; all?: boolean }) {
  await db.notification.updateMany({
    where: { recipientId: userId, readAt: null, ...(input.all ? {} : { id: { in: input.ids ?? [] } }) },
    data: { readAt: new Date() },
  })
}

const secret = () => process.env.EMAIL_LINK_SECRET ?? process.env.SESSION_SECRET ?? 'dev-only-email-secret'

/** One-click unsubscribe token for the daily reminder email: does not expire, only opts out. */
export function unsubscribeToken(userId: string) {
  return `${userId}.${createHmac('sha256', secret()).update(`unsubscribe:${userId}`).digest('base64url')}`
}

export async function unsubscribe(token: string) {
  const [userId, sig] = token.split('.')
  if (!userId || !sig) throw notFound('Subscription')
  const expected = Buffer.from(unsubscribeToken(userId).split('.')[1]!)
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw notFound('Subscription')
  await db.userPreference.updateMany({ where: { userId }, data: { dailyEmailEnabled: false } })
}
