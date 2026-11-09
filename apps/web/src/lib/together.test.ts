import { describe, expect, it } from 'vitest'
import { orderMembers, participationLine, stateLabel } from './together'

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
