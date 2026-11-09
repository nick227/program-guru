// Program template → personal calendar (09-CALENDARS.md §4). Bounded horizon, deterministic
// idempotency keys, so retries and the daily horizon extension never create duplicates.
import type { Prisma } from '@project/db'
import { addDays, fromDbDate, localToUtc, toDbDate, type LocalDate } from '../../lib/time'

export const HORIZON_DAYS = 84 // 12 weeks (05 §9)

type Tx = Prisma.TransactionClient
type Enrollment = { id: string; userId: string; startLocalDate: Date; timezone: string; groupId: string | null; participationStartDate?: Date | null }
type Version = { id: string; durationDays: number | null; cycleDays: number | null }
type Item = { id: string; activityId: string; activityRevisionId: string; relativeDay: number; localTime: string | null; targetOverrides: Prisma.JsonValue }

export function occurrenceKey(versionId: string, scheduleItemId: string, cycleIndex: number) {
  return `${versionId}:${scheduleItemId}:${cycleIndex}`
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
  const cycle = finite ? version.durationDays! : version.cycleDays ?? 7
  const rows: Prisma.CalendarItemCreateManyInput[] = []
  for (let c = 0; ; c++) {
    const cycleStart = addDays(start, c * cycle)
    if (cycleStart > window.through) break
    for (const item of items) {
      const localDate = addDays(cycleStart, item.relativeDay)
      if (localDate > window.through || (window.from && localDate < window.from)) continue
      rows.push({
        ownerId: e.userId,
        activityId: item.activityId,
        activityRevisionId: item.activityRevisionId,
        enrollmentId: e.id,
        sourceScheduleItemId: item.id,
        idempotencyKey: `${e.id}:${item.id}:${c}`,
        groupOccurrenceKey: e.groupId ? occurrenceKey(version.id, item.id, c) : null,
        programDayIndex: c * cycle + item.relativeDay,
        localDate: toDbDate(localDate),
        localTime: item.localTime,
        scheduledAtUtc: item.localTime ? localToUtc(localDate, item.localTime, e.timezone) : null,
        targetOverrides: (item.targetOverrides ?? undefined) as Prisma.InputJsonValue | undefined,
        ...(joined && localDate < joined ? { status: 'NOT_PARTICIPATING' as const } : {}),
      })
    }
    if (finite) break
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
