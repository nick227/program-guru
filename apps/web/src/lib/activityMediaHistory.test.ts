import { describe, expect, it } from 'vitest'
import { attemptDate, type Attempt } from './activityMediaHistory'
import { queryKeys } from '@project/sdk'
const attempt: Attempt = {
  sessionId: 'session',
  activityRevisionId: 'revision',
  status: 'READY',
  createdAt: '2026-11-07T01:00:00Z',
  startedAt: null,
  endedAt: null,
  calendarItemId: null,
  occurrenceDate: null,
  entries: [],
}
describe('Activity attempt history', () => {
  it('preserves date-only occurrences even if the session is recorded another day', () => {
    expect(
      attemptDate(
        { ...attempt, occurrenceDate: '2026-11-05' },
        'America/Chicago',
      ),
    ).toBe('2026-11-05')
  })
  it('uses local session start or creation date for unscheduled attempts, including empty sessions', () => {
    expect(attemptDate(attempt, 'America/Chicago')).toBe('2026-11-06')
    expect(
      attemptDate(
        { ...attempt, startedAt: '2026-11-08T12:00:00Z' },
        'America/Chicago',
      ),
    ).toBe('2026-11-08')
    expect(attemptDate(attempt, 'Asia/Tokyo')).toBe('2026-11-07')
  })
  it('isolates Activity and occurrence filters beneath the media invalidation key', () => {
    expect(queryKeys.activityMyAttempts('a').slice(0, 2)).toEqual(
      queryKeys.activityAttempts,
    )
    expect(queryKeys.activityMyAttempts('a')[0]).toBe('media')
    expect(queryKeys.activityMyAttempts('a')).not.toEqual(
      queryKeys.activityMyAttempts('b'),
    )
    expect(queryKeys.activityMyAttempts('a')).not.toEqual(
      queryKeys.activityMyAttempts('a', 'item'),
    )
  })
})
