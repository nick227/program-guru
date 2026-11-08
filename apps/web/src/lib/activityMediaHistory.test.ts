import { describe, expect, it } from 'vitest'
import {
  groupActivityMedia,
  historyDate,
  type HistoryItem,
} from './activityMediaHistory'
import { queryKeys } from '@project/sdk'
const row = (id: string, sessionId: string): HistoryItem => ({
  sessionId,
  sessionStatus: 'FINISHED',
  resultEntryId: `result-${sessionId}`,
  calendarItemId: null,
  occurrenceDate: null,
  instructionId: null,
  recordedAt: '2026-11-07T01:00:00Z',
  attachment: {
    id,
    mediaId: 'same-asset',
    target: { kind: 'RESULT_ENTRY', id: `result-${sessionId}` },
    purpose: 'JOURNAL',
    position: 0,
    mediaDeleted: false,
    mediaState: 'READY',
    media: {
      id: 'same-asset',
      alt: '',
      type: 'PHOTO',
      thumbnailUrl: null,
      durationMs: null,
      canSelect: true,
    },
  },
})
describe('Activity media history', () => {
  it('merges page boundaries by session and deduplicates links, never assets', () => {
    const first = row('link-1', 'session-1')
    const groups = groupActivityMedia([
      first,
      row('link-2', 'session-2'),
      first,
      row('link-3', 'session-1'),
    ])
    expect(
      groups.map((group) => [
        group.sessionId,
        group.items.map((item) => item.attachment.id),
      ]),
    ).toEqual([
      ['session-1', ['link-1', 'link-3']],
      ['session-2', ['link-2']],
    ])
  })
  it('keeps occurrence dates literal and falls back for unscheduled sessions', () => {
    expect(
      historyDate({ ...row('1', '1'), occurrenceDate: '2026-11-06' }),
    ).toBe('2026-11-06')
    expect(historyDate(row('1', '1'))).toBe('2026-11-07')
  })
  it('isolates Activity and optional filters beneath the media invalidation key', () => {
    const all = queryKeys.activityMyMedia('a')
    expect(all[0]).toBe('media')
    expect(all).not.toEqual(queryKeys.activityMyMedia('b'))
    expect(all).not.toEqual(
      queryKeys.activityMyMedia('a', { calendarItemId: 'item' }),
    )
    expect(all).not.toEqual(queryKeys.activityMyMedia('a', { type: 'VIDEO' }))
  })
})
