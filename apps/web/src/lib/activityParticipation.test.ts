import { describe, expect, it } from 'vitest'
import type { ActivityParticipation } from '@project/sdk'
import { peopleLabelOf, resolveParticipation } from './activityParticipation'

const TODAY = '2026-11-16'
const ctx = { signedIn: true, todayIso: TODAY }
const viewer = (over: Partial<NonNullable<ActivityParticipation['viewer']>> = {}) => ({
  everAdded: false,
  lastAddedAt: null,
  completedCount: 0,
  lastCompletedDate: null,
  inProgressItemId: null,
  upcoming: [],
  ...over,
})
const make = (over: Partial<ActivityParticipation> = {}): ActivityParticipation => ({
  activityId: 'a1',
  participants: { band: 'NONE', count: 0, includesViewer: false },
  avatars: [],
  shared: { activeNow: 0, going: 0, nextGathering: null },
  viewer: viewer(),
  ...over,
})
const item = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  title: 'Squats',
  localDate: '2026-11-19',
  localTime: '07:30',
  recurrenceId: null,
  gatheringId: null,
  enrollmentId: null,
  updatedAt: '2026-11-16T00:00:00Z',
  recurrence: null,
  ...over,
})

describe('participant count (12 §10a)', () => {
  it('always shows a count, including zero, and never a guessed zero', () => {
    expect(peopleLabelOf(make())).toBe('0 participants')
    expect(peopleLabelOf(make({ participants: { band: 'FEW', count: null, includesViewer: true } }))).toBe('Fewer than 5 participants · including you')
    expect(peopleLabelOf(make({ participants: { band: 'COUNT', count: 12 } }))).toBe('12 participants')
    expect(peopleLabelOf(null)).toBe('… participants')
  })
})

describe('resolveParticipation (03-UX §2b)', () => {
  it('never added: Start now and Add to Schedule, no Reschedule', () => {
    const v = resolveParticipation(make(), ctx)
    expect(v).toMatchObject({ status: 'NEVER', statusLabel: 'Not on your Calendar', actions: ['start', 'schedule'] })
  })

  it('scheduled once: its date and time, and Reschedule', () => {
    const v = resolveParticipation(make({ viewer: viewer({ everAdded: true, upcoming: [item()] }) }), ctx)
    expect(v).toMatchObject({ status: 'SCHEDULED', statusLabel: 'Scheduled Thu, Nov 19 · 7:30 AM', detail: null })
    expect(v.actions).toEqual(['start', 'schedule', 'reschedule'])
    expect(v.next?.id).toBe('i1')
  })

  it('recurring: shows the rule and its end', () => {
    const v = resolveParticipation(
      make({ viewer: viewer({ everAdded: true, upcoming: [item({ localDate: TODAY, recurrenceId: 'r1', recurrence: { rule: { kind: 'WEEKLY', weekdays: [1, 3] }, untilDate: '2026-12-14' } })] }) }),
      ctx,
    )
    expect(v.statusLabel).toBe('Scheduled Today · 7:30 AM')
    expect(v.detail).toBe('Every week on Mon, Wed · until Dec 14')
  })

  it('completed in the past, then scheduled again: scheduled leads, completions stay visible', () => {
    const past = resolveParticipation(make({ viewer: viewer({ everAdded: true, completedCount: 3, lastCompletedDate: '2026-11-02' }) }), ctx)
    expect(past).toMatchObject({ status: 'COMPLETED', statusLabel: 'Done 3 times · last Nov 2' })
    const again = resolveParticipation(make({ viewer: viewer({ everAdded: true, completedCount: 1, lastCompletedDate: '2026-11-02', upcoming: [item()] }) }), ctx)
    expect(again).toMatchObject({ status: 'SCHEDULED', detail: 'Done once · last Nov 2' })
  })

  it('in progress leads and offers Resume', () => {
    const v = resolveParticipation(make({ viewer: viewer({ everAdded: true, inProgressItemId: 'i9', upcoming: [item()] }) }), ctx)
    expect(v).toMatchObject({ status: 'IN_PROGRESS', statusLabel: 'In progress', inProgressItemId: 'i9' })
    expect(v.actions[0]).toBe('resume')
  })

  it('added before but nothing now: Added before with the last date', () => {
    const v = resolveParticipation(make({ viewer: viewer({ everAdded: true, lastAddedAt: '2026-10-30T12:00:00Z' }) }), ctx)
    expect(v).toMatchObject({ status: 'PREVIOUSLY_ADDED', statusLabel: 'Added before · last Oct 30' })
  })

  it('shared: now versus later, and Join or Open', () => {
    const gathering = { id: 'g1', localDate: '2026-11-21', localTime: '09:00', joinPolicy: 'OPEN', viewerIsMember: false, isFull: false } as never
    const v = resolveParticipation(make({ shared: { activeNow: 2, going: 4, nextGathering: gathering } }), ctx)
    expect(v.sharedLabel).toBe('2 doing it now · 4 going · Sat, Nov 21 · 9:00 AM')
    expect(v.actions).toEqual(['start', 'join', 'schedule'])
    const member = resolveParticipation(make({ shared: { activeNow: 0, going: 1, nextGathering: { ...(gathering as object), viewerIsMember: true } as never } }), ctx)
    expect(member.actions).toEqual(['start', 'open_gathering', 'schedule'])
  })

  it('signed out: no personal status, the count still shows, actions ask to sign in', () => {
    const v = resolveParticipation(make({ viewer: null, participants: { band: 'FEW', count: null } }), { signedIn: false, todayIso: TODAY })
    expect(v).toMatchObject({ status: 'SIGNED_OUT', statusLabel: null, peopleLabel: 'Fewer than 5 participants', actions: ['start', 'schedule'] })
  })
})
