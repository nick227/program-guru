// Completion opens on the item's day, or at the gathering's time (09 §3). The server decides the
// instant (`completionOpensAt`); the client only compares it with the clock and says when it opens.
import { dateLabel } from './dates'
import { formatTargetTime } from './targetTime'

export function completionOpen(item: { completionOpensAt?: string | null }, now = Date.now()): boolean {
  if (!item.completionOpensAt) return true
  return now >= Date.parse(item.completionOpensAt)
}

/**
 * "Available Mon, Nov 16" or, for a timed gathering, "Available Sun, Dec 6 at 3:00 PM". Worded from
 * the item's own local date and time, like every other Calendar label, never the browser's zone.
 */
export function completionOpensLabel(
  item: { completionOpensAt?: string | null; gatheringId?: string | null; localDate: string; localTime?: string | null },
): string | null {
  if (completionOpen(item)) return null
  const day = dateLabel(item.localDate, { weekday: 'short', month: 'short', day: 'numeric' })
  return item.gatheringId && item.localTime ? `Available ${day} at ${formatTargetTime(item.localTime)}` : `Available ${day}`
}
