// Activity participation for every surface that shows an Activity (03-UX §2b, 12 §10a). One request for
// many Activities: a fixed number of queries whatever the count, never one per Activity.
import { db, Prisma } from '@project/db'
import { badRequest } from '../../lib/errors'
import { fromDbDate, todayIn, toDbDate } from '../../lib/time'
import { isOpenlyReadable } from './access'
import { blockedIds } from '../users/follow.service'
import { toUserSummary } from '../users/mapper'
import { userTimezone } from '../calendar/calendar.service'
import { parseRule } from '../calendar/recurrence'
import { listForActivities } from '../groups/gathering.service'

/** 12 §10: aggregates below this are never shown as a number. */
export const MIN_PUBLIC_SAMPLE = 5
const MAX_IDS = 50
const AVATARS = 8
const UPCOMING = 3
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** On someone's Calendar now or in the past; CANCELLED and NOT_PARTICIPATING are not participation. */
const PARTICIPATING = ['PLANNED', 'DONE', 'SKIPPED'] as const

/** 0 exactly, 1–4 withheld, 5+ exactly (12 §10a). Never a misleading 0 for a withheld count. */
export function participantBand(people: number): { band: 'NONE' | 'FEW' | 'COUNT'; count: number | null } {
  if (people <= 0) return { band: 'NONE', count: 0 }
  if (people < MIN_PUBLIC_SAMPLE) return { band: 'FEW', count: null }
  return { band: 'COUNT', count: people }
}

export function parseIds(raw: string | undefined) {
  const ids = [...new Set((raw ?? '').split(',').map((s) => s.trim()).filter(Boolean))]
  if (!ids.length || ids.length > MAX_IDS || ids.some((id) => !UUID.test(id))) {
    throw badRequest(`Pass 1 to ${MAX_IDS} Activity ids`, { ids: 'invalid' })
  }
  return ids
}

export async function participation(viewerId: string | null, rawIds: string | undefined) {
  const ids = parseIds(rawIds)
  const [activities, blocked, mine] = await Promise.all([
    db.activity.findMany({
      where: { id: { in: ids } },
      select: { id: true, creatorId: true, status: true, visibility: true, moderatedAt: true, latestPublishedRevisionId: true },
    }),
    blockedIds(viewerId),
    viewerId
      ? db.calendarItem.groupBy({
          by: ['activityId'],
          where: { ownerId: viewerId, activityId: { in: ids }, status: { not: 'NOT_PARTICIPATING' } },
          _max: { createdAt: true },
        })
      : Promise.resolve([]),
  ])
  const onMyCalendar = new Set(mine.map((m) => m.activityId))
  // Owners, openly readable ones whose creator is not blocked either way, and anything already on the
  // viewer's own Calendar (e.g. a private Program's Activity). Others are omitted, never confirmed.
  const allowed = new Set(
    activities
    .filter(
      (a) =>
        (viewerId && a.creatorId === viewerId) ||
        onMyCalendar.has(a.id) ||
        (isOpenlyReadable(a) && !(a.creatorId && blocked.includes(a.creatorId))),
    )
    .map((a) => a.id),
  )
  // In the order asked for, so a surface can render the list as it requested it.
  const visible = ids.filter((id) => allowed.has(id))
  if (!visible.length) return []

  const [people, viewerFacts, gatherings, viewer] = await Promise.all([
    db.$queryRaw<{ activityId: string; people: bigint; withViewer: bigint }[]>`
      SELECT ci.activityId, COUNT(DISTINCT ci.ownerId) AS people,
             MAX(ci.ownerId = ${viewerId ?? ''}) AS withViewer
      FROM CalendarItem ci JOIN User u ON u.id = ci.ownerId
      WHERE ci.activityId IN (${Prisma.join(visible)})
        AND ci.status IN (${Prisma.join([...PARTICIPATING])})
        AND u.status = 'ACTIVE'
      GROUP BY ci.activityId`,
    viewerId ? viewerHistory(viewerId, visible) : Promise.resolve(null),
    listForActivities(viewerId, visible, new Date(), { includeActive: true }),
    viewerId ? db.userProfile.findUnique({ where: { userId: viewerId } }) : Promise.resolve(null),
  ])
  const counts = new Map(people.map((r) => [r.activityId, { people: Number(r.people), withViewer: Number(r.withViewer) === 1 }]))
  const lastAdded = new Map(mine.map((m) => [m.activityId, m._max.createdAt]))

  return visible.map((activityId) => {
    const c = counts.get(activityId) ?? { people: 0, withViewer: false }
    const gs = gatherings.get(activityId) ?? []
    const avatars = new Map<string, ReturnType<typeof toUserSummary>>()
    if (c.withViewer && viewer) avatars.set(viewer.userId, toUserSummary(viewer))
    for (const g of gs) for (const m of g.members) if (!avatars.has(m.id)) avatars.set(m.id, m)
    const upcoming = gs.filter((g) => !g.isPast)
    const facts = viewerFacts?.get(activityId)
    return {
      activityId,
      participants: { ...participantBand(c.people), includesViewer: c.withViewer },
      avatars: [...avatars.values()].slice(0, AVATARS),
      shared: {
        activeNow: gs.reduce((n, g) => n + g.activeCount, 0),
        going: upcoming.reduce((n, g) => n + g.memberCount, 0),
        nextGathering: upcoming[0] ?? null,
      },
      viewer: viewerId
        ? {
            everAdded: lastAdded.has(activityId),
            lastAddedAt: lastAdded.get(activityId)?.toISOString() ?? null,
            completedCount: facts?.completedCount ?? 0,
            lastCompletedDate: facts?.lastCompletedDate ?? null,
            inProgressItemId: facts?.inProgressItemId ?? null,
            upcoming: facts?.upcoming ?? [],
          }
        : null,
    }
  })
}

type Upcoming = {
  id: string
  title: string
  localDate: string
  localTime: string | null
  recurrenceId: string | null
  gatheringId: string | null
  enrollmentId: string | null
  updatedAt: string
  recurrence: { rule: ReturnType<typeof parseRule>; untilDate: string | null } | null
}

/** The viewer's own facts per Activity: completions, a running session, and the next few planned items. */
async function viewerHistory(viewerId: string, ids: string[]) {
  const today = todayIn(await userTimezone(viewerId))
  const [done, active, next] = await Promise.all([
    db.calendarItem.groupBy({
      by: ['activityId'],
      where: { ownerId: viewerId, activityId: { in: ids }, status: 'DONE' },
      _count: { _all: true },
      _max: { localDate: true },
    }),
    db.activitySession.findMany({
      where: { userId: viewerId, status: { in: ['ACTIVE', 'PAUSED'] }, calendarItem: { activityId: { in: ids } } },
      select: { calendarItemId: true, calendarItem: { select: { activityId: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    // Up to three per Activity, so a daily recurrence never crowds out the rest.
    db.$queryRaw<
      { id: string; activityId: string; localDate: Date; localTime: string | null; recurrenceId: string | null; gatheringId: string | null; enrollmentId: string | null; updatedAt: Date }[]
    >`
      SELECT t.id, t.activityId, t.localDate, t.\`localTime\`, t.recurrenceId, t.gatheringId, t.enrollmentId, t.updatedAt FROM (
        SELECT ci.id, ci.activityId, ci.localDate, ci.\`localTime\`, ci.recurrenceId, ci.gatheringId, ci.enrollmentId, ci.updatedAt,
               ROW_NUMBER() OVER (PARTITION BY ci.activityId ORDER BY ci.localDate, ci.\`localTime\` IS NULL, ci.\`localTime\`, ci.id) AS rn
        FROM CalendarItem ci
        WHERE ci.ownerId = ${viewerId} AND ci.activityId IN (${Prisma.join(ids)})
          AND ci.status = 'PLANNED' AND ci.localDate >= ${toDbDate(today)}
      ) t WHERE t.rn <= ${UPCOMING}
      -- \`localTime\` must be quoted: unquoted, MySQL reads it as the LOCALTIME function.
      ORDER BY t.localDate, t.\`localTime\``,
  ])
  const recurrenceIds = [...new Set(next.map((n) => n.recurrenceId).filter((x): x is string => !!x))]
  const [recurrences, titles] = await Promise.all([
    recurrenceIds.length
      ? db.calendarRecurrence.findMany({ where: { id: { in: recurrenceIds } }, select: { id: true, rule: true, untilDate: true } })
      : Promise.resolve([]),
    db.activity.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } }),
  ])
  const rules = new Map(recurrences.map((r) => [r.id, { rule: parseRule(r.rule), untilDate: r.untilDate ? fromDbDate(r.untilDate) : null }]))
  const titleOf = new Map(titles.map((t) => [t.id, t.title]))

  const out = new Map<string, { completedCount: number; lastCompletedDate: string | null; inProgressItemId: string | null; upcoming: Upcoming[] }>()
  const entry = (id: string) => {
    let e = out.get(id)
    if (!e) out.set(id, (e = { completedCount: 0, lastCompletedDate: null, inProgressItemId: null, upcoming: [] }))
    return e
  }
  for (const d of done) Object.assign(entry(d.activityId), { completedCount: d._count._all, lastCompletedDate: d._max.localDate ? fromDbDate(d._max.localDate) : null })
  for (const s of active) {
    const e = entry(s.calendarItem!.activityId)
    if (!e.inProgressItemId) e.inProgressItemId = s.calendarItemId
  }
  for (const n of next) {
    entry(n.activityId).upcoming.push({
      id: n.id,
      title: titleOf.get(n.activityId) ?? '',
      localDate: fromDbDate(n.localDate),
      localTime: n.localTime,
      recurrenceId: n.recurrenceId,
      gatheringId: n.gatheringId,
      enrollmentId: n.enrollmentId,
      updatedAt: n.updatedAt.toISOString(),
      recurrence: n.recurrenceId ? rules.get(n.recurrenceId) ?? null : null,
    })
  }
  return out
}
