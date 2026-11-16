import { describe, expect, it } from 'vitest'
import { orderMembers, participationLine, stateLabel, summarizeCollaborators } from './together'

const user = (id: string) => ({ id, handle: id, displayName: id, avatarUrl: null })
const member = (id: string, status: any, completedAt: string | null = null) => ({
  user: user(id),
  status,
  completionShareId: status === 'DONE' ? `s-${id}` : null,
  completedAt,
  reactions: [],
})

describe('Activity together row', () => {
  it('puts finished first (latest first), then started, then not yet, then private', () => {
    const rows = orderMembers([
      member('pat', 'PENDING'),
      member('sam', 'UNKNOWN'),
      member('ann', 'DONE', '2026-11-08T08:00:00Z'),
      member('lee', 'IN_PROGRESS'),
      member('kim', 'DONE', '2026-11-08T10:00:00Z'),
    ] as any)
    expect(rows.map((r) => r.user.id)).toEqual(['kim', 'ann', 'lee', 'pat', 'sam'])
  })
  it('labels states without implying live presence', () => {
    const now = Date.parse('2026-11-08T12:00:00Z')
    expect(stateLabel(member('a', 'DONE', '2026-11-08T10:00:00Z') as any, now)).toBe('Finished 2h ago')
    expect(stateLabel(member('a', 'IN_PROGRESS') as any)).toBe('Started')
    expect(stateLabel(member('a', 'UNKNOWN') as any)).toBe('Not sharing')
  })
})

describe('My Programs participation line', () => {
  it('hides suppressed counts and shows people, not runs', () => {
    expect(participationLine({ participantCount: null, activeMemberCount: null, friends: [], friendCount: 0 })).toBeNull()
    expect(participationLine({ participantCount: 10, activeMemberCount: 4, friends: [], friendCount: 0 })).toBe('10 participants · 4 active this week')
    expect(participationLine({ participantCount: 7, activeMemberCount: 0, friends: [], friendCount: 0 })).toBe('7 participants')
  })
})

describe('shared collaborator summary (MR 4)', () => {
  const c = (members: ReturnType<typeof member>[], finishedCount: number, totalCount: number) =>
    ({ groupId: 'g', occurrenceKey: 'k', unreadCount: 0, members, finishedCount, totalCount }) as never

  it('splits others by state, keeps the viewer apart, and leads with the most active fact', () => {
    const s = summarizeCollaborators(
      c([member('me', 'DONE', '2026-11-16T08:00:00Z'), member('a', 'IN_PROGRESS'), member('b', 'PENDING'), member('c', 'DONE', '2026-11-16T07:00:00Z'), member('d', 'UNKNOWN')], 2, 5),
      'me',
    )
    expect(s.me?.user.id).toBe('me')
    expect(s.others.map((m) => m.user.id)).toEqual(['c', 'a', 'b', 'd'])
    expect([s.doingNow.length, s.waiting.length, s.finished.length]).toEqual([1, 1, 1])
    expect(s.activityLabel).toBe('1 doing it now')
    expect(s.sessionLabel).toBe('2 of 5 finished in this session')
  })

  it('without a viewer everyone is "others"; no facts means no label', () => {
    expect(summarizeCollaborators(c([member('a', 'PENDING')], 0, 3), undefined).activityLabel).toBe('1 scheduled today')
    expect(summarizeCollaborators(c([member('a', 'DONE')], 1, 1)).activityLabel).toBe('1 completed recently')
    const empty = summarizeCollaborators(c([], 0, 3))
    expect(empty.activityLabel).toBeNull()
    expect(empty.sessionLabel).toBe('3 in this session')
    expect(summarizeCollaborators(null).totalCount).toBe(0)
  })
})
