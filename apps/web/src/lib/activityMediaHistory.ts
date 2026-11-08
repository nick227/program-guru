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
