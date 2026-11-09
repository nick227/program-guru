// Data for the locked nine-row Activity page (03-UX.md §6, 09-CALENDARS.md §6):
// Header · Today's Results · Collaborators · Session Controls · My Metrics · My Media ·
// Shared Media · Community Media · Community Stats. Absent rows come back null or empty.
import { db, type Prisma } from '@project/db'
import { notFound } from '../../lib/errors'
import { mediaUrl } from '../media/urls'
import { ownerThumb } from '../media/media.service'
import { revisionInclude, toInstruction, toToolBinding } from '../activities/mapper'
import { toUserSummary } from '../users/mapper'
import { ownItem, toCalendarItems } from './calendar.service'
import { toSession, valueOf } from './session.service'

const MIN_PUBLIC_SAMPLE = 5
const COMMUNITY_LIMIT = 12
type Value = number | string | boolean | null

async function blockedIds(viewerId: string) {
  const rows = await db.userBlock.findMany({ where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] } })
  return rows.map((b) => (b.blockerId === viewerId ? b.blockedId : b.blockerId))
}

/** Same action across public copies: the canonical root plus published public activities mapped to it (02 §6). */
async function canonicalActivityIds(activityId: string) {
  const a = await db.activity.findUniqueOrThrow({ where: { id: activityId } })
  const root = a.canonicalActivityId ?? a.id
  const members = await db.activity.findMany({
    where: {
      OR: [{ id: root }, { canonicalActivityId: root }],
      status: 'PUBLISHED',
      visibility: { not: 'PRIVATE' },
      moderatedAt: null,
    },
    select: { id: true },
  })
  return members.map((m) => m.id)
}

/** Last, Best (only with a meaningful direction), Completed: at most three values (03 §6.5). */
export async function personalStats(userId: string, activityId: string) {
  const primary = await db.activityMetric.findFirst({
    where: { revision: { activityId }, instructionId: null },
    orderBy: [{ activityRevisionId: 'desc' }, { position: 'asc' }],
    include: { metric: true },
  })
  const completed =
    (await db.calendarItem.count({ where: { ownerId: userId, activityId, status: 'DONE' } })) +
    (await db.activitySession.count({ where: { userId, status: 'FINISHED', calendarItemId: null, activityRevision: { activityId } } }))
  const now = new Date().toISOString()
  const stats: { key: string; label: string; value: string; computedAt: string }[] = []
  if (primary && ['INTEGER', 'DECIMAL', 'DURATION'].includes(primary.metric.valueType)) {
    const values = await db.resultMetricValue.findMany({
      where: { metricDefinitionId: primary.metricDefinitionId, entry: { session: { userId, status: 'FINISHED', activityRevision: { activityId } } } },
      orderBy: { entry: { recordedAt: 'desc' } },
      take: 500,
    })
    const nums = values.map((v) => Number(valueOf(v as any))).filter((n) => Number.isFinite(n))
    const fmt = (n: number) => (primary.metric.valueType === 'DURATION' ? `${Math.round(n / 60)} min` : `${n}${primary.metric.unit ? ` ${primary.metric.unit}` : ''}`)
    if (nums.length) {
      stats.push({ key: 'last', label: `Last ${primary.metric.label.toLowerCase()}`, value: fmt(nums[0]!), computedAt: now })
      const dir = primary.metric.betterDirection
      if (dir === 'HIGHER' || dir === 'LOWER') stats.push({ key: 'best', label: `Best ${primary.metric.label.toLowerCase()}`, value: fmt(dir === 'HIGHER' ? Math.max(...nums) : Math.min(...nums)), computedAt: now })
    }
  }
  stats.push({ key: 'completed', label: 'Completed', value: String(completed), computedAt: now })
  return stats.slice(0, 3)
}

export async function occurrence(userId: string, itemId: string) {
  const item = await ownItem(db, userId, itemId)
  const [rev, activity, itemViews] = await Promise.all([
    db.activityRevision.findUnique({ where: { id: item.activityRevisionId }, include: revisionInclude }),
    db.activity.findUnique({ where: { id: item.activityId } }),
    toCalendarItems(userId, [item]),
  ])
  if (!rev || !activity) throw notFound('Activity')
  const itemView = itemViews[0]!
  const isLocked = itemView.locked

  // ── Today's Results: targets suggested, never copied into recorded values (03 §6.2).
  const session = await db.activitySession.findFirst({ where: { calendarItemId: item.id, status: { not: 'ABANDONED' } }, orderBy: { createdAt: 'desc' } })
  const latest = session
    ? await db.resultEntry.findMany({ where: { sessionId: session.id }, orderBy: { recordedAt: 'asc' }, include: { values: true } })
    : []
  const recorded = new Map<string, Value>()
  for (const e of latest) for (const v of e.values) recorded.set(`${e.instructionId ?? ''}:${v.metricDefinitionId}`, valueOf(v as any))
  const placement = item.sourceScheduleItemId ? await db.programScheduleItem.findUnique({ where: { id: item.sourceScheduleItemId } }) : null
  const overrides = { ...((placement?.targetOverrides as Record<string, Value>) ?? {}), ...((item.targetOverrides as Record<string, Value>) ?? {}) }
  const bindings = [
    ...rev.metrics.map((m) => ({ m, instructionId: null as string | null })),
    ...(isLocked ? [] : rev.instructions.flatMap((i) => i.metrics.map((m) => ({ m, instructionId: i.id })))),
  ]
  const metricDefIds = [...new Set(bindings.map((b) => b.m.metricDefinitionId))]
  const prevRows = metricDefIds.length
    ? await db.resultMetricValue.findMany({
        where: {
          metricDefinitionId: { in: metricDefIds },
          entry: { session: { userId, status: 'FINISHED', id: session ? { not: session.id } : undefined, activityRevision: { activityId: item.activityId } } },
        },
        orderBy: { entry: { recordedAt: 'desc' } },
      })
    : []
  const prevByMetric = new Map<string, Value>()
  for (const r of prevRows) {
    if (!prevByMetric.has(r.metricDefinitionId)) prevByMetric.set(r.metricDefinitionId, valueOf(r as any))
  }
  const resultInputs = bindings.map(({ m, instructionId }, idx) => {
    const defaults = (m.defaults as { target?: Value } | null) ?? null
    return {
      metricDefinitionId: m.metricDefinitionId,
      key: m.metric.key,
      label: m.metric.label,
      valueType: m.metric.valueType,
      unit: m.metric.unit,
      required: m.required,
      instructionId,
      target: (overrides[m.metric.key] ?? defaults?.target ?? null) as Value,
      previous: prevByMetric.get(m.metricDefinitionId) ?? null,
      recorded: recorded.get(`${instructionId ?? ''}:${m.metricDefinitionId}`) ?? null,
      // 08 §4: show the relevant 1–3 inputs first; the rest sit under More.
      isPrimary: instructionId === null && idx < 3,
    }
  })

  // ── Collaborators: only when this occurrence belongs to a group (omit when solo).
  let collaborators = null
  const groupId = item.enrollment?.groupId ?? null
  if (groupId && item.groupOccurrenceKey) {
    const members = await db.groupMember.findMany({ where: { groupId, status: 'ACTIVE' }, include: { user: { include: { profile: true } } } })
    const shares = await db.completionShare.findMany({
      where: { groupId, occurrenceKey: item.groupOccurrenceKey, revokedAt: null },
      include: { reactions: true },
    })
    const unread = await db.notification.count({ where: { recipientId: userId, readAt: null, groupOccurrenceKey: item.groupOccurrenceKey } })
    // Each member's own item for this occurrence: dated before they joined means Not Participating (10 §3).
    const memberItems = await db.calendarItem.findMany({
      where: { groupOccurrenceKey: item.groupOccurrenceKey, ownerId: { in: members.map((m) => m.userId) }, enrollment: { groupId } },
      select: {
        ownerId: true,
        status: true,
        localDate: true,
        enrollment: { select: { participationStartDate: true } },
        // Started-not-finished is shared under the same consent as completion (10 §4). It means a
        // session exists, never that the member is online right now.
        sessions: { where: { status: { in: ['ACTIVE', 'PAUSED'] } }, select: { id: true }, take: 1 },
      },
    })
    const started = new Set(memberItems.filter((i) => i.status === 'PLANNED' && i.sessions.length).map((i) => i.ownerId))
    const preJoin = new Set(
      memberItems.filter((i) => i.status === 'NOT_PARTICIPATING' || (i.enrollment?.participationStartDate && i.localDate < i.enrollment.participationStartDate)).map((i) => i.ownerId),
    )
    // Members may follow different versions: only those whose calendar holds this same occurrence
    // (same Activity on the same Program Day) are compared. Nobody reads as missing an Activity
    // their version doesn't schedule. A share keeps its author in the row (pre-update history).
    const scheduled = new Set([...memberItems.map((i) => i.ownerId), ...shares.map((s) => s.userId)])
    const statuses = members.filter((m) => scheduled.has(m.userId)).map((m) => {
      const share = shares.find((s) => s.userId === m.userId)
      const counts = new Map<string, { count: number; mine: boolean }>()
      for (const r of share?.reactions ?? []) {
        const c = counts.get(r.emoji) ?? { count: 0, mine: false }
        counts.set(r.emoji, { count: c.count + 1, mine: c.mine || r.userId === userId })
      }
      return {
        user: toUserSummary(m.user.profile!),
        // Members who turned sharing off read as UNKNOWN, never as "not done".
        status: share
          ? ('DONE' as const)
          : preJoin.has(m.userId)
            ? ('NOT_PARTICIPATING' as const)
            : !m.sharedCompletionEnabled
              ? ('UNKNOWN' as const)
              : started.has(m.userId)
                ? ('IN_PROGRESS' as const)
                : ('PENDING' as const),
        counted: !preJoin.has(m.userId),
        completionShareId: share?.id ?? null,
        completedAt: share?.completedAt.toISOString() ?? null,
        reactions: [...counts].map(([emoji, c]) => ({ emoji, count: c.count, reactedByMe: c.mine })),
      }
    })
    collaborators = {
      groupId,
      occurrenceKey: item.groupOccurrenceKey,
      members: statuses.map(({ counted: _counted, ...s }) => s),
      // Pre-join dates are excluded from the group's finished-of-total (10 §3).
      finishedCount: statuses.filter((s) => s.counted && s.status === 'DONE').length,
      totalCount: statuses.filter((s) => s.counted).length,
      unreadCount: unread,
    }
  }

  // ── My Media: the user's own attachments on results for this Activity, newest first.
  const mine = await db.mediaAttachment.findMany({
    where: { resultEntry: { session: { userId, activityRevision: { activityId: item.activityId } } }, media: { deletedAt: null } },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: { media: true },
  })
  const myMedia = mine.map((a) => ({ id: a.media.id, thumbnailUrl: ownerThumb(a.media), type: a.media.type, durationMs: a.media.durationMs, alt: a.media.alt ?? '', canSelect: true }))

  // ── Shared Media: explicitly group-shared for this occurrence.
  const sharedMedia = groupId && item.groupOccurrenceKey
    ? (
        await db.mediaPublication.findMany({
          where: { audience: 'GROUP', groupId, occurrenceKey: item.groupOccurrenceKey, status: 'APPROVED', media: { deletedAt: null, state: 'READY' } },
          orderBy: { createdAt: 'desc' },
          take: 30,
          include: { media: true, publishedBy: { include: { profile: true } } },
        })
      ).map((p) => ({
        id: p.media.id,
        thumbnailUrl: mediaUrl(p.media.id, 'thumb', { publicationId: p.id }),
        type: p.media.type,
        durationMs: p.media.durationMs,
        alt: p.media.alt ?? '',
        canSelect: false,
        publicationId: p.id,
        owner: toUserSummary(p.publishedBy.profile!),
        commentCount: p.commentCount,
        caption: p.caption,
      }))
    : []

  // ── Community Media: approved public media for the same action, Program creator first (11 §5).
  const [activityIds, hidden] = await Promise.all([canonicalActivityIds(item.activityId), blockedIds(userId)])
  const creatorId = !isLocked ? item.enrollment?.program.creatorId ?? null : null
  const publicWhere: Prisma.MediaPublicationWhereInput = {
    audience: 'PUBLIC',
    status: 'APPROVED',
    license: { not: null },
    activityId: { in: activityIds },
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
  }
  const canShowPublicHub = activityIds.length > 0 && !(isLocked && activity.visibility === 'PRIVATE')
  const featured =
    canShowPublicHub && creatorId && !hidden.includes(creatorId)
      ? await db.mediaPublication.findMany({
          where: { ...publicWhere, publishedById: creatorId },
          orderBy: { rankScore: 'desc' },
          take: COMMUNITY_LIMIT,
          include: { media: true, publishedBy: { include: { profile: true } }, reactions: { where: { userId } } },
        })
      : []
  const rest =
    canShowPublicHub && featured.length < COMMUNITY_LIMIT
      ? await db.mediaPublication.findMany({
          where: { ...publicWhere, id: { notIn: featured.map((f) => f.id) } },
          orderBy: [{ rankScore: 'desc' }, { createdAt: 'desc' }],
          take: COMMUNITY_LIMIT - featured.length,
          include: { media: true, publishedBy: { include: { profile: true } }, reactions: { where: { userId } } },
        })
      : []
  const communityMedia = [...featured, ...rest].map((p) => ({
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
    likedByMe: p.reactions.length > 0,
    license: p.license,
    attribution: p.media.attribution,
  }))

  // ── Community Stats: privacy-safe aggregates, hidden for small samples (12 §10).
  const [participants, completions] = canShowPublicHub
    ? await Promise.all([
        db.calendarItem.groupBy({ by: ['ownerId'], where: { activityId: { in: activityIds }, status: 'DONE' } }).then((r) => r.length),
        db.calendarItem.count({ where: { activityId: { in: activityIds }, status: 'DONE' } }),
      ])
    : [0, 0]
  const communityStats = canShowPublicHub && participants >= MIN_PUBLIC_SAMPLE ? { participants, completions, publicMediaCount: await db.mediaPublication.count({ where: publicWhere }) } : null

  // 01 §6.12, 03 §10, 07 §8: When a Program enrollment is locked (entitlement expired/revoked),
  // withhold locked Program instructional content while preserving the user's personal logs and media.
  return {
    item: itemView,
    session: session ? toSession(session) : null,
    resultInputs,
    collaborators,
    personalStats: await personalStats(userId, item.activityId),
    instructions: isLocked ? [] : rev.instructions.map(toInstruction),
    tools: isLocked ? [] : rev.tools.map(toToolBinding),
    myMedia,
    sharedMedia,
    communityMedia,
    communityStats,
  }
}
