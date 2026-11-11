// Program template → personal calendar (09-CALENDARS.md §4). Bounded horizon, deterministic
// idempotency keys, so retries and the daily horizon extension never create duplicates.
import type { Prisma } from '@project/db'
import { addDays, addMonths, diffDays, fromDbDate, localToUtc, toDbDate, type LocalDate } from '../../lib/time'
import { parseFrequency } from '../programs/schedule'

export const HORIZON_DAYS = 84 // 12 weeks (05 §9)

type Tx = Prisma.TransactionClient
type Enrollment = { id: string; userId: string; startLocalDate: Date; timezone: string; groupId: string | null; participationStartDate?: Date | null }
type Version = { id: string; programId: string; durationDays: number | null; cycleDays: number | null; frequency?: Prisma.JsonValue }
type Item = { id: string; activityId: string; activityRevisionId: string; relativeDay: number; position: number; localTime: string | null; targetOverrides: Prisma.JsonValue }

/**
 * Group occurrence key (10 §2): the same Activity on the same absolute Program Day of the same
 * Program, whatever version each member follows. Schedule item and version ids are regenerated for
 * every version, so they cannot identify an occurrence across versions. `ordinal` separates repeated
 * placements of one Activity on one day. Must match the 20261109000000 data migration.
 */
export function occurrenceKey(programId: string, activityId: string, programDayIndex: number, ordinal: number) {
  return `${programId}:${activityId}:${programDayIndex}:${ordinal}`
}

/** Rank of each placement among the same Activity on the same relative day, by (position, id). */
export function sameDayOrdinals(items: { id: string; activityId: string; relativeDay: number; position: number }[]) {
  const sorted = [...items].sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const seen = new Map<string, number>()
  const out = new Map<string, number>()
  for (const i of sorted) {
    const slot = `${i.activityId}:${i.relativeDay}`
    const n = seen.get(slot) ?? 0
    out.set(i.id, n)
    seen.set(slot, n + 1)
  }
  return out
}

/**
 * 07 §6: after accepting an update, the participant's done, in-progress, moved and removed items
 * from the earlier version stay. Each one already fills its (Activity, Program Day) slot, so the new
 * version must not add a second copy beside it. Matched by count, since a Program Day may hold the
 * same Activity more than once. Items of the version being materialized are deduplicated by their
 * idempotency keys instead.
 */
async function dropSlotsKeptFromOtherVersions(tx: Tx, enrollmentId: string, items: Item[], rows: Prisma.CalendarItemCreateManyInput[]) {
  if (!rows.length) return
  const days = [...new Set(rows.map((r) => r.programDayIndex!))]
  const kept = await tx.calendarItem.findMany({
    where: {
      enrollmentId,
      programDayIndex: { in: days },
      OR: [{ sourceScheduleItemId: null }, { sourceScheduleItemId: { notIn: items.map((i) => i.id) } }],
    },
    select: { activityId: true, programDayIndex: true },
  })
  if (!kept.length) return
  const occupied = new Map<string, number>()
  for (const k of kept) occupied.set(`${k.activityId}:${k.programDayIndex}`, (occupied.get(`${k.activityId}:${k.programDayIndex}`) ?? 0) + 1)
  for (let i = rows.length - 1; i >= 0; i--) {
    const slot = `${rows[i]!.activityId}:${rows[i]!.programDayIndex}`
    const n = occupied.get(slot) ?? 0
    if (n > 0) {
      occupied.set(slot, n - 1)
      rows.splice(i, 1)
    }
  }
}

/**
 * Creates Calendar Items for an enrollment between `from` and `through` (inclusive local dates).
 * Each placement becomes its own item with independent status, sessions, and results.
 */
export async function materializeEnrollment(
  tx: Tx,
  e: Enrollment,
  version: Version,
  items: Item[],
  window: { from?: LocalDate; through: LocalDate },
) {
  const start = fromDbDate(e.startLocalDate)
  // Dates before the participant joined keep the original schedule but read Not Participating (09 §4.11).
  const joined = e.participationStartDate ? fromDbDate(e.participationStartDate) : null
  const finite = version.durationDays !== null
  const monthly = !finite && parseFrequency(version.frequency).kind === 'MONTHLY'
  const cycle = finite ? version.durationDays! : version.cycleDays ?? 7
  const ordinals = sameDayOrdinals(items)
  const rows: Prisma.CalendarItemCreateManyInput[] = []
  const pushItem = (item: Item, localDate: LocalDate, cycleIndex: number, programDayIndex: number) => {
    if (localDate > window.through || (window.from && localDate < window.from)) return
    rows.push({
      ownerId: e.userId,
      activityId: item.activityId,
      activityRevisionId: item.activityRevisionId,
      enrollmentId: e.id,
      sourceScheduleItemId: item.id,
      idempotencyKey: `${e.id}:${item.id}:${cycleIndex}`,
      groupOccurrenceKey: e.groupId ? occurrenceKey(version.programId, item.activityId, programDayIndex, ordinals.get(item.id)!) : null,
      programDayIndex,
      localDate: toDbDate(localDate),
      localTime: item.localTime,
      scheduledAtUtc: item.localTime ? localToUtc(localDate, item.localTime, e.timezone) : null,
      targetOverrides: (item.targetOverrides ?? undefined) as Prisma.InputJsonValue | undefined,
      ...(joined && localDate < joined ? { status: 'NOT_PARTICIPATING' as const } : {}),
    })
  }
  if (monthly) {
    for (let m = 0; ; m++) {
      if (addMonths(start, m) > window.through) break
      for (const item of items) {
        const localDate = addMonths(addDays(start, item.relativeDay), m)
        pushItem(item, localDate, m, diffDays(localDate, start))
      }
    }
  } else {
    for (let c = 0; ; c++) {
      const cycleStart = addDays(start, c * cycle)
      if (cycleStart > window.through) break
      for (const item of items) {
        pushItem(item, addDays(cycleStart, item.relativeDay), c, c * cycle + item.relativeDay)
      }
      if (finite) break
    }
  }
  await dropSlotsKeptFromOtherVersions(tx, e.id, items, rows)
  const created = rows.length ? (await tx.calendarItem.createMany({ data: rows, skipDuplicates: true })).count : 0
  const end = finite ? addDays(start, cycle - 1) : window.through
  await tx.programEnrollment.update({
    where: { id: e.id },
    data: { generatedThroughDate: toDbDate(end < window.through ? end : window.through) },
  })
  return created
}
