import { describe, expect, it } from 'vitest'
import { buildStageEvents, buildStageMembers } from './stageEvents'
import { getStageTheme, STAGE_THEMES } from './themes/registry'

const member = (id: string, name: string) => ({
  user: { id, handle: name.toLowerCase(), displayName: name, avatarUrl: null },
  role: 'MEMBER' as const,
  status: 'ACTIVE' as const,
  sharedCompletion: true,
})

describe('group stage layers', () => {
  it('grounds member state and stage events in real check-in data', () => {
    const now = Date.parse('2026-11-11T12:00:00Z')
    const members = [member('u1', 'Alex'), member('u2', 'Sam')]
    const checkIns = [
      {
        id: 's1',
        groupId: 'g1',
        user: members[0]!.user,
        activityId: 'a1',
        activityTitle: 'Jog one mile',
        programDayIndex: 0,
        occurrenceKey: 'day:0',
        completedAt: '2026-11-11T11:40:00Z',
        reactions: [{ emoji: '🔥', count: 4, reactedByMe: false }],
        note: 'Steady pace',
      },
    ]

    const nodes = buildStageMembers(members, checkIns, now)
    expect(nodes[0]?.checkedInRecently).toBe(true)
    expect(nodes[0]?.reactionCount).toBe(4)
    expect(nodes[1]?.checkedInRecently).toBe(false)

    const events = buildStageEvents(checkIns)
    expect(events.map((e) => e.kind)).toEqual(['CHECK_IN', 'REACTION'])
  })

  it('provides interchangeable stage animation themes with safe fallback', () => {
    expect(STAGE_THEMES.map((t) => t.id)).toEqual(['constellation', 'campfire', 'sprout'])
    expect(getStageTheme('sprout').label).toBe('Sprout Garden')
    expect(getStageTheme('unknown-theme').id).toBe('constellation')
  })
})

