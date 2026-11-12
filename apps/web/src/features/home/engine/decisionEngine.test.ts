import { describe, expect, it } from 'vitest'
import { resolveTurn } from './decisionEngine'
import { buildPresentationItems } from './presentationFeed'
import { rankHomeSignals } from './rankHomeSignals'
import type { HomeSignals } from './types'

function makeBaseSignals(overrides: Partial<HomeSignals> = {}): HomeSignals {
  return {
    isSignedIn: false,
    todayItems: [],
    activeEnrollments: [],
    liveSessions: [],
    popularPrograms: [
      {
        kind: 'PROGRAM',
        program: {
          id: 'prog-1',
          title: 'Build your Core',
          description: null,
          type: { id: 't1', slug: 'fitness', label: 'Fitness' },
          focus: null,
          level: 'BEGINNER',
          sessionMinutes: 15,
          coverUrl: null,
          durationDays: 28,
          programDays: 20,
          placements: 20,
          frequencyLabel: '5x / week',
          visibility: 'PUBLIC',
          accessMode: 'OPEN',
          prices: [],
          viewerAccess: {
            hasAccess: true,
            canJoin: true,
            requiresPurchase: false,
            requiresApproval: false,
            pendingRequest: false,
          },
          isPlatform: false,
        } as never,
        activity: null,
        creator: null,
        participantCount: 42,
      },
    ],
    newPrograms: [],
    activities: [
      {
        kind: 'ACTIVITY',
        program: null,
        activity: {
          id: 'act-10',
          revisionId: 'rev-1',
          title: 'Morning Movement',
          summary: null,
          durationMinutes: 10,
          targetTime: null,
          creator: null,
          categoryId: 'cat-fit',
          focusIds: [],
          thumbnailUrl: null,
          instructionCount: 3,
          mediaCount: 0,
          metricLabels: [],
          visibility: 'PUBLIC',
          status: 'PUBLISHED',
        } as never,
        creator: null,
      },
      {
        kind: 'ACTIVITY',
        program: null,
        activity: {
          id: 'act-30',
          revisionId: 'rev-2',
          title: 'Deep Mobility Flow',
          summary: null,
          durationMinutes: 30,
          targetTime: null,
          creator: null,
          categoryId: 'cat-fit',
          focusIds: [],
          thumbnailUrl: null,
          instructionCount: 5,
          mediaCount: 0,
          metricLabels: [],
          visibility: 'PUBLIC',
          status: 'PUBLISHED',
        } as never,
        creator: null,
      },
    ],
    creators: [
      {
        kind: 'CREATOR',
        program: null,
        activity: null,
        creator: {
          id: 'user-1',
          handle: 'alex',
          displayName: 'Alex Rivera',
          avatarUrl: null,
        },
      },
    ],
    categories: [{ id: 'cat-fit', name: 'Fitness' }],
    ...overrides,
  }
}

describe('rankHomeSignals', () => {
  it('prioritizes today scheduled activity for signed-in users', () => {
    const signals = makeBaseSignals({
      isSignedIn: true,
      todayItems: [
        {
          id: 'cal-1',
          localDate: '2026-11-12',
          localTime: '08:00',
          status: 'PLANNED',
          title: 'Morning Movement',
          activityId: 'act-10',
          activityRevisionId: 'rev-1',
          programTitle: 'Fitness',
          enrollmentId: null,
          programDayIndex: null,
          durationMinutes: 10,
          recurrenceId: null,
          conflict: false,
          locked: false,
          thumbnailUrl: null,
          participantAvatars: [],
          unreadCount: 0,
          updatedAt: '2026-11-12T08:00:00Z',
        },
      ],
    })

    const turn = rankHomeSignals(signals)
    expect(turn.question).toBe('You have one Activity left today.')
    expect(turn.contextLine).toBe('Want to finish it right now?')
    expect(turn.card?.title).toBe('Morning Movement')
    expect(turn.card?.primaryAction).toEqual({
      type: 'open_occurrence',
      itemId: 'cal-1',
    })
    const showDay = turn.choices.find((c) => c.id === 'show-day')
    expect(showDay?.effect).toEqual({
      type: 'transition',
      nodeId: 'day_schedule',
    })
  })

  it('falls back to popular program for guests with no live sessions', () => {
    const turn = rankHomeSignals(makeBaseSignals())
    expect(turn.card?.kind).toBe('program')
    expect(turn.card?.title).toBe('Build your Core')
  })
})

describe('resolveTurn', () => {
  it('filters activities by time window in Do something now flow', () => {
    const turn = resolveTurn(
      'now_result',
      { maxMinutes: 10, excludedIds: [] },
      makeBaseSignals(),
    )
    expect(turn.card?.kind).toBe('activity')
    expect(turn.card?.title).toBe('Morning Movement')
    expect(turn.contextLine).toContain('10 minutes')
  })

  it('skips excluded items when user asks for a different suggestion', () => {
    const first = resolveTurn(
      'now_result',
      { maxMinutes: 30, excludedIds: [] },
      makeBaseSignals(),
    )
    const second = resolveTurn(
      'now_result',
      { maxMinutes: 30, excludedIds: ['act-10'] },
      makeBaseSignals(),
    )
    expect(second.card?.title).toBe('Deep Mobility Flow')
    expect(second.question).not.toBe(first.question)
    expect(second.question).toContain('Deep Mobility Flow')
  })

  it('never falls back to another category when an explicit category has no matching activities', () => {
    const turn = resolveTurn(
      'now_result',
      { maxMinutes: 10, categoryId: 'cat-fin', categoryName: 'Finance', excludedIds: [] },
      makeBaseSignals(),
    )
    expect(turn.card).toBeUndefined()
    expect(turn.question).toContain('Finance')
  })

  it('includes Continue where I left off in intent menu only when signed in with active work', () => {
    const guestMenu = resolveTurn(
      'intent_menu',
      { excludedIds: [] },
      makeBaseSignals({ isSignedIn: false }),
    )
    expect(guestMenu.choices.some((c) => c.id === 'intent-continue')).toBe(
      false,
    )

    const signedInMenu = resolveTurn(
      'intent_menu',
      { excludedIds: [] },
      makeBaseSignals({
        isSignedIn: true,
        activeEnrollments: [
          {
            id: 'prog-1',
            programId: 'prog-1',
            programTitle: 'Build your Core',
            status: 'ACTIVE',
          },
        ],
      }),
    )
    expect(signedInMenu.choices.some((c) => c.id === 'intent-continue')).toBe(
      true,
    )
  })

  it('renders day_schedule inline ordered by localTime', () => {
    const baseItem = {
      localDate: '2026-11-12',
      status: 'PLANNED' as const,
      activityId: 'act-10',
      activityRevisionId: 'rev-1',
      programTitle: 'Fitness',
      enrollmentId: null,
      programDayIndex: null,
      durationMinutes: 10,
      recurrenceId: null,
      conflict: false,
      locked: false,
      thumbnailUrl: null,
      participantAvatars: [],
      unreadCount: 0,
      updatedAt: '2026-11-12T08:00:00Z',
    }
    const turn = resolveTurn(
      'day_schedule',
      { excludedIds: [] },
      makeBaseSignals({
        isSignedIn: true,
        todayItems: [
          { ...baseItem, id: 'cal-2', localTime: '17:00', title: 'Evening Stretch' },
          { ...baseItem, id: 'cal-1', localTime: '08:00', title: 'Morning Movement' },
        ],
      }),
    )
    expect(turn.cards?.map((c) => c.title)).toEqual([
      'Morning Movement',
      'Evening Stretch',
    ])
    expect(turn.choices.some((c) => c.label === 'Open Calendar')).toBe(true)

    const partialDone = resolveTurn(
      'day_schedule',
      { excludedIds: [] },
      makeBaseSignals({
        isSignedIn: true,
        todayItems: [
          { ...baseItem, id: 'cal-any', localTime: null, status: 'PLANNED', title: 'Anytime Walk' },
          { ...baseItem, id: 'cal-1', localTime: '08:00', status: 'DONE', title: 'Morning Movement' },
        ],
      }),
    )
    expect(partialDone.cards?.map((c) => [c.title, c.status, c.localTime])).toEqual([
      ['Morning Movement', 'DONE', '08:00'],
      ['Anytime Walk', 'PLANNED', null],
    ])
    expect(partialDone.contextLine).toBe('1 of 2 done · 1 left today.')
    expect(partialDone.choices.some((c) => c.label === 'Do next')).toBe(true)
  })

  it('uses inline preview actions for program results instead of route navigation', () => {
    const turn = resolveTurn(
      'program_result',
      { excludedIds: [] },
      makeBaseSignals(),
    )
    const primary = turn.choices[0]
    expect(primary?.effect).toEqual({
      type: 'execute',
      action: { type: 'preview', target: { kind: 'program', id: 'prog-1' } },
    })
    expect(turn.whyReason).toBeTruthy()
  })

  it('reacts to Activity completion with post_completion choices', () => {
    const turn = resolveTurn(
      'post_completion',
      { lastCompletedTitle: 'Push-ups', excludedIds: [] },
      makeBaseSignals({
        isSignedIn: true,
        todayItems: [
          {
            id: 'cal-next',
            localDate: '2026-11-12',
            localTime: '17:00',
            status: 'PLANNED',
            title: 'Evening Stretch',
            activityId: 'act-30',
            activityRevisionId: 'rev-2',
            programTitle: null,
            enrollmentId: null,
            programDayIndex: null,
            durationMinutes: 15,
            recurrenceId: null,
            conflict: false,
            locked: false,
            thumbnailUrl: null,
            participantAvatars: [],
            unreadCount: 0,
            updatedAt: '2026-11-12T08:00:00Z',
          },
        ],
      }),
    )
    expect(turn.question).toBe('Push-ups completed.')
    expect(turn.contextLine).toBe('You have one more Activity scheduled today.')
    expect(turn.choices.map((c) => c.label)).toEqual([
      'Do next',
      'Show my day',
      "I'm done",
    ])
  })

  it('builds Presentation items excluding the active conversation card', () => {
    const items = buildPresentationItems('popular', makeBaseSignals(), 'prog-1')
    expect(items.some((i) => i.id === 'prog-1')).toBe(false)
    expect(items.length).toBeGreaterThan(0)
    expect(items.length).toBeLessThanOrEqual(4)
  })
})

