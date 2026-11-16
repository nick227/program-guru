/**
 * Bulk Calendar management (03-UX §5): which selected entries an action applies to, where a bulk
 * Move puts each one, and a runner that applies per-entry operations and reports each result.
 * There is no bulk endpoint: every entry goes through the same update/cancel, scope and version
 * check as a single change, and repeating entries change only that occurrence (This one).
 */
import { addDays } from '@/lib/dates'
import { canMoveCalendarEntry } from '@/lib/calendarGrouping'

export type BulkEntry = {
  id: string
  title: string
  day: string
  localTime?: string | null
  status?: string | null
  done?: boolean
  locked?: boolean | null
  recurrenceId?: string | null
  gatheringId?: string | null
  updatedAt?: string
}

export type SkipReason = 'completed' | 'locked' | 'not open'

export type BulkPlan<T extends BulkEntry> = {
  /** Entries the action applies to, in date/time order. */
  apply: T[]
  /** Entries left untouched, with why. */
  skipped: { entry: T; reason: SkipReason }[]
  recurring: number
  inGathering: number
}

const diffDays = (to: string, from: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)

const order = (a: BulkEntry, b: BulkEntry) =>
  a.day.localeCompare(b.day) || (a.localTime ?? '').localeCompare(b.localTime ?? '') || a.id.localeCompare(b.id)

const reasonOf = (e: BulkEntry): SkipReason =>
  e.locked ? 'locked' : e.done || e.status === 'DONE' ? 'completed' : 'not open'

/** Move and Remove both act on open entries only: completed, skipped, removed and locked ones stay. */
export function planBulk<T extends BulkEntry>(entries: T[]): BulkPlan<T> {
  const sorted = [...entries].sort(order)
  const apply = sorted.filter((e) => canMoveCalendarEntry(e))
  return {
    apply,
    skipped: sorted.filter((e) => !canMoveCalendarEntry(e)).map((entry) => ({ entry, reason: reasonOf(entry) })),
    recurring: apply.filter((e) => e.recurrenceId).length,
    inGathering: apply.filter((e) => e.gatheringId).length,
  }
}

/**
 * Where each entry lands when the earliest selected date moves to `toDate`: every entry shifts by
 * the same number of days, so relative dates and all times are kept (a single-day selection simply
 * lands on `toDate`).
 */
export function planBulkMove<T extends BulkEntry>(entries: T[], toDate: string) {
  const first = [...entries].sort(order)[0]
  const shift = first ? diffDays(toDate, first.day) : 0
  return {
    shift,
    moves: entries.map((entry) => ({ entry, toDate: addDays(entry.day, shift) })),
  }
}

export type BulkResult<T> = { entry: T; ok: true; value: unknown } | { entry: T; ok: false; error: string }

/**
 * Applies `run` to each entry in turn (sequential: no request bursts, predictable per-entry version
 * checks) and reports progress and every result; one failure never stops the rest.
 */
export async function runBulk<T>(
  entries: T[],
  run: (entry: T) => Promise<unknown>,
  onProgress?: (done: number, total: number) => void,
): Promise<BulkResult<T>[]> {
  const results: BulkResult<T>[] = []
  for (const [index, entry] of entries.entries()) {
    try {
      results.push({ entry, ok: true, value: await run(entry) })
    } catch (err) {
      results.push({ entry, ok: false, error: err instanceof Error ? err.message : 'Failed' })
    }
    onProgress?.(index + 1, entries.length)
  }
  return results
}

/** Entries between two ids (inclusive) in date/time order: Shift-click range selection. */
export function rangeBetween<T extends BulkEntry>(entries: T[], fromId: string, toId: string): string[] {
  const sorted = [...entries].sort(order)
  const a = sorted.findIndex((e) => e.id === fromId)
  const b = sorted.findIndex((e) => e.id === toId)
  if (a < 0 || b < 0) return [toId]
  const [lo, hi] = a <= b ? [a, b] : [b, a]
  return sorted.slice(lo, hi + 1).map((e) => e.id)
}
