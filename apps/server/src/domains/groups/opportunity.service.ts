// Opportunity Radar (12-SOCIAL §5b): "what's something worthwhile I can actually do, with the right
// people, at the right time?" Deterministic tiers over real records, a stated reason for every item,
// existing gathering permissions. No scoring model.
import { db } from '@project/db'
import { addDays, fromDbDate, todayIn, toDbDate } from '../../lib/time'
import { blockedIds } from '../users/follow.service'
import { get as getGathering, isPast } from './gathering.service'

const HORIZON_DAYS = 84
const MAX_CANDIDATES = 200
const MAX_COMPLETED = 500
const CONFLICT_MINUTES = 60
const MAX_NEEDS_PEOPLE = 10

export type ReasonKind = 'ON_YOUR_CALENDAR' | 'IN_YOUR_PROGRAM' | 'PEOPLE_YOU_KNOW' | 'YOUR_INTERESTS'
const TIER: Record<ReasonKind, number> = { ON_YOUR_CALENDAR: 1, IN_YOUR_PROGRAM: 2, PEOPLE_YOU_KNOW: 3, YOUR_INTERESTS: 4 }

const dayLabel = (d: string) =>
  new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))
function timeLabel(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number) as [number, number]
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number]
  return h * 60 + m
}
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export async function opportunities(userId: string, query: { limit?: number }, now = new Date()) {
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 20)
  const tz = (await db.userPreference.findUnique({ where: { userId } }))?.timezone ?? 'UTC'
  const today = todayIn(tz, now)
  const from = toDbDate(addDays(today, -1))
  const to = toDbDate(addDays(today, HORIZON_DAYS))
  const blocked = await blockedIds(userId)

  // ── Candidates: joinable gatherings only (public open, or a personal invitation to the viewer).
  const candidates = await db.programGroup.findMany({
    where: {
      kind: 'GATHERING',
      status: 'ACTIVE',
      startLocalDate: { gte: from, lte: to },
      activity: { status: 'PUBLISHED', moderatedAt: null },
      ownerId: { notIn: [userId, ...blocked] },
      NOT: { members: { some: { userId, status: 'ACTIVE' } } },
      OR: [
        { visibility: 'PUBLIC', joinPolicy: 'OPEN' },
        { invitations: { some: { kind: 'USER', invitedUserId: userId, status: 'PENDING', expiresAt: { gt: now } } } },
      ],
    },
    select: {
      id: true,
      activityId: true,
      ownerId: true,
      startLocalDate: true,
      startLocalTime: true,
      timezone: true,
      capacity: true,
      activity: {
        select: { title: true, categoryId: true, category: { select: { label: true } }, focuses: { select: { focusId: true, focus: { select: { label: true } } } } },
      },
      // Additional curated Categories (10 §9.12) match interests exactly like inherited ones.
      focuses: { select: { focusId: true, focus: { select: { label: true } } } },
      members: { where: { status: 'ACTIVE' }, select: { userId: true } },
    },
    orderBy: [{ startLocalDate: 'asc' }, { startLocalTime: 'asc' }, { id: 'asc' }],
    take: MAX_CANDIDATES,
  })
  const open = candidates.filter((g) => !isPast(g, now) && (g.capacity === null || g.members.length < g.capacity))

  // ── Viewer signals, each one bounded.
  const [items, enrollments, completed, myGatherings] = await Promise.all([
    db.calendarItem.findMany({
      where: { ownerId: userId, status: { not: 'CANCELLED' }, localDate: { gte: from, lte: to } },
      select: { id: true, activityId: true, localDate: true, localTime: true, status: true, gatheringId: true, groupOccurrenceKey: true, enrollment: { select: { groupId: true } } },
      take: 2000,
    }),
    db.programEnrollment.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { version: { select: { title: true, items: { select: { activityId: true } } } } },
      take: 20,
    }),
    db.calendarItem.findMany({
      where: { ownerId: userId, status: 'DONE' },
      select: { activity: { select: { categoryId: true, focuses: { select: { focusId: true } } } } },
      orderBy: { updatedAt: 'desc' },
      take: MAX_COMPLETED,
    }),
    db.groupMember.findMany({ where: { userId, group: { kind: 'GATHERING' } }, select: { groupId: true }, take: 200 }),
  ])

  // 1. On your Calendar: a planned item of that Activity that day, not in any group.
  const ownByKey = new Map<string, { id: string }>()
  const timedByDate = new Map<string, { id: string; at: number }[]>()
  for (const i of items) {
    const date = fromDbDate(i.localDate)
    if (i.status === 'PLANNED' && !i.gatheringId && !i.groupOccurrenceKey && !i.enrollment?.groupId) {
      const k = `${i.activityId}|${date}`
      if (!ownByKey.has(k)) ownByKey.set(k, { id: i.id })
    }
    if (i.localTime) timedByDate.set(date, [...(timedByDate.get(date) ?? []), { id: i.id, at: minutes(i.localTime) }])
  }
  // 2. In your Program.
  const programByActivity = new Map<string, string>()
  for (const e of enrollments) for (const it of e.version.items) if (!programByActivity.has(it.activityId)) programByActivity.set(it.activityId, e.version.title)
  // 4. Your interests: Domains of completed Activities.
  const doneByDomain = new Map<string, number>()
  const doneByCategory = new Map<string, number>()
  for (const c of completed) {
    doneByDomain.set(c.activity.categoryId, (doneByDomain.get(c.activity.categoryId) ?? 0) + 1)
    for (const f of c.activity.focuses) doneByCategory.set(f.focusId, (doneByCategory.get(f.focusId) ?? 0) + 1)
  }
  // 3. People you've done things with: members of gatherings the viewer was in, minus blocks.
  const coMembers = myGatherings.length
    ? await db.groupMember.findMany({
        where: { groupId: { in: myGatherings.map((m) => m.groupId) }, userId: { notIn: [userId, ...blocked] } },
        select: { userId: true },
        distinct: ['userId'],
        take: 500,
      })
    : []
  const known = new Set(coMembers.map((m) => m.userId))
  const knownInCandidates = new Set(open.flatMap((g) => [g.ownerId, ...g.members.map((m) => m.userId)]).filter((id) => known.has(id)))
  const names = new Map(
    knownInCandidates.size
      ? (await db.userProfile.findMany({ where: { userId: { in: [...knownInCandidates] } }, select: { userId: true, displayName: true } })).map((p) => [p.userId, p.displayName])
      : [],
  )

  const ranked: { id: string; tier: number; date: string; time: string; reasons: { kind: ReasonKind; label: string }[]; fitsSchedule: boolean; calendarItemId: string | null }[] = []
  const seen = new Set<string>()
  for (const g of open) {
    if (seen.has(g.id)) continue
    seen.add(g.id)
    const date = fromDbDate(g.startLocalDate!)
    const title = g.activity!.title
    const own = ownByKey.get(`${g.activityId}|${date}`) ?? null
    // Real Calendar conflicts exclude it (the item it would reuse is not a conflict).
    if (g.startLocalTime) {
      const at = minutes(g.startLocalTime)
      if ((timedByDate.get(date) ?? []).some((t) => t.id !== own?.id && Math.abs(t.at - at) < CONFLICT_MINUTES)) continue
    }
    const reasons: { kind: ReasonKind; label: string }[] = []
    const going = g.members.length
    if (own) {
      reasons.push({
        kind: 'ON_YOUR_CALENDAR',
        label: `You have ${title} on ${dayLabel(date)}; ${plural(going, 'person is', 'people are')} doing it${g.startLocalTime ? ` at ${timeLabel(g.startLocalTime)}` : ' that day'}`,
      })
    }
    const program = programByActivity.get(g.activityId!)
    if (program) reasons.push({ kind: 'IN_YOUR_PROGRAM', label: `Part of ${program}` })
    const friend = known.has(g.ownerId) ? g.ownerId : g.members.find((m) => known.has(m.userId))?.userId
    if (friend && names.get(friend)) {
      reasons.push({
        kind: 'PEOPLE_YOU_KNOW',
        label: friend === g.ownerId ? `${names.get(friend)}, from an earlier gathering, is organizing` : `${names.get(friend)}, from an earlier gathering, is going`,
      })
    }
    // Category first (inherited or added; the most-completed one), then Domain. Completed Activities only.
    const categories = [...g.activity!.focuses, ...g.focuses]
    const best = categories
      .map((f) => ({ label: f.focus.label, done: doneByCategory.get(f.focusId) ?? 0 }))
      .reduce((a, b) => (b.done > a.done ? b : a), { label: '', done: 0 })
    const domainDone = doneByDomain.get(g.activity!.categoryId) ?? 0
    if (best.done > 0) {
      reasons.push({ kind: 'YOUR_INTERESTS', label: `Related to your interest in ${best.label}: you've done ${plural(best.done, `${best.label} Activity`, `${best.label} Activities`)}` })
    } else if (domainDone > 0) {
      reasons.push({ kind: 'YOUR_INTERESTS', label: `You've done ${plural(domainDone, `${g.activity!.category.label} Activity`, `${g.activity!.category.label} Activities`)}` })
    }
    if (!reasons.length) continue
    ranked.push({
      id: g.id,
      tier: Math.min(...reasons.map((r) => TIER[r.kind])),
      date,
      time: g.startLocalTime ?? '',
      reasons,
      fitsSchedule: !!g.startLocalTime,
      calendarItemId: own?.id ?? null,
    })
  }
  ranked.sort((a, b) => a.tier - b.tier || a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id))

  const recommendations = await Promise.all(
    ranked.slice(0, limit).map(async (r) => ({
      gathering: await getGathering(userId, r.id),
      reasons: r.reasons,
      fitsSchedule: r.fitsSchedule,
      calendarItemId: r.calendarItemId,
    })),
  )

  // ── Needs people: gatherings the viewer joined that still have open spots. Share only.
  const mine = await db.programGroup.findMany({
    where: { kind: 'GATHERING', status: 'ACTIVE', capacity: { not: null }, startLocalDate: { gte: from }, members: { some: { userId, status: 'ACTIVE' } } },
    select: { id: true, capacity: true, startLocalDate: true, startLocalTime: true, timezone: true, members: { where: { status: 'ACTIVE' }, select: { userId: true } } },
    orderBy: [{ startLocalDate: 'asc' }, { startLocalTime: 'asc' }],
    take: MAX_NEEDS_PEOPLE * 2,
  })
  const needing = mine.filter((g) => !isPast(g, now) && g.members.length < g.capacity!).slice(0, MAX_NEEDS_PEOPLE)
  const needsPeople = await Promise.all(
    needing.map(async (g) => ({ gathering: await getGathering(userId, g.id), openSpots: g.capacity! - g.members.length })),
  )

  return { recommendations, needsPeople }
}
