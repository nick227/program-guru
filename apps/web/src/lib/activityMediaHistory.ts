import type { components } from '@project/sdk'
export type Attempt = components['schemas']['ActivityAttempt']
export type AttemptEntry = components['schemas']['ActivityAttemptEntry']
/** Occurrence dates are date-only; unscheduled attempts use the viewer's timezone. */
export function attemptDate(attempt: Attempt, timezone: string) {
  return (
    attempt.occurrenceDate ??
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(attempt.startedAt ?? attempt.createdAt))
  )
}

/** One tile per asset, retaining publication metadata when an asset is also shared. */
export function mergeRelatedMedia<T extends { id: string }>(...sources: T[][]): T[] {
  const items = new Map<string, T>()
  for (const source of sources) for (const item of source) {
    items.set(item.id, { ...items.get(item.id), ...item })
  }
  return [...items.values()]
}
