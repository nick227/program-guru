/**
 * Where a Calendar entry may be dropped (03-UX §5). One rule set for mouse, touch and Move to date, so
 * the UI never offers a drop the server would refuse and never mutates on an invalid one.
 */
import { canMoveCalendarEntry } from '@/lib/calendarGrouping'

/**
 * A drop target. `time` undefined keeps the entry's time (a date cell); `null` is Any time; `HH:mm`
 * is an hour slot.
 */
export type CalendarDropTarget = { date: string; time?: string | null }

export type MovableEntry = {
  day: string
  localTime?: string | null
  status?: string | null
  done?: boolean
  locked?: boolean | null
}

const hourOf = (time: string | null | undefined) => (time ? time.slice(0, 2) : null)

/** The entry's date and time after a drop on this target. */
export function resolveDrop(entry: MovableEntry, target: CalendarDropTarget) {
  return {
    localDate: target.date,
    localTime: target.time === undefined ? (entry.localTime ?? null) : target.time,
  }
}

/** Whether dropping the entry here changes anything and is allowed. */
export function canDropOnTarget(entry: MovableEntry, target: CalendarDropTarget, todayIso: string): boolean {
  if (!canMoveCalendarEntry(entry)) return false
  if (target.date < todayIso) return false
  if (target.date !== entry.day) return true
  if (target.time === undefined) return false
  // Same day: an hour slot must be a different hour; Any time only for a timed entry.
  if (target.time === null) return Boolean(entry.localTime)
  return hourOf(entry.localTime) !== hourOf(target.time)
}
