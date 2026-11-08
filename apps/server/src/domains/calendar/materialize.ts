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
  const created = rows.length ? (await tx.calendarItem.createMany({ data: rows, skipDuplicates: true })).count : 0
  const end = finite ? addDays(start, cycle - 1) : window.through
  await tx.programEnrollment.update({
    where: { id: e.id },
    data: { generatedThroughDate: toDbDate(end < window.through ? end : window.through) },
  })
  return created
}
