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
    knownProgramIds: [],
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

describe('Home program eligibility', () => {
  it('never offers the owned Pump it up Program as new after finishing today', () => {
    const base = makeBaseSignals()
    const popular = base.popularPrograms[0]!
    const pump = {
      ...popular,
      program: {
        ...popular.program!,
        id: 'pump-it-up',
        title: 'Pump it up',
        viewerAccess: 'OWNER',
      },
    } as typeof popular
    const signals = makeBaseSignals({
      isSignedIn: true,
      knownProgramIds: ['pump-it-up'],
      newPrograms: [pump],
      popularPrograms: [pump, popular],
    })
    expect(rankHomeSignals(signals).card?.id).toBe('prog-1')
    expect(resolveTurn('program_result', { excludedIds: [] }, signals).card?.id).toBe('prog-1')
    expect(buildPresentationItems('popular', signals).some((card) => card.id === 'pump-it-up')).toBe(false)
  })

  it('excludes prior member Programs regardless of active, paused, or completed run state', () => {
    const base = makeBaseSignals()
    const prior = {
      ...base.popularPrograms[0]!,
      program: { ...base.popularPrograms[0]!.program!, id: 'previous-program' },
    } as (typeof base.popularPrograms)[number]
    for (const status of ['Active', 'Paused', 'Completed']) {
      const signals = makeBaseSignals({
        isSignedIn: true,
        knownProgramIds: ['previous-program'],
        popularPrograms: [prior, ...base.popularPrograms],
      })
      expect(resolveTurn('program_result', { excludedIds: [] }, signals).card?.id, status).toBe('prog-1')
      expect(buildPresentationItems('for_you', signals).some((card) => card.id === 'previous-program')).toBe(false)
    }
  })

  it('does not offer Programs before the signed-in library is ready', () => {
    const signals = makeBaseSignals({
      isSignedIn: true,
      knownProgramIds: null,
    })
    expect(rankHomeSignals(signals).card?.kind).toBe('activity')
    expect(resolveTurn('program_result', { excludedIds: [] }, signals).card).toBeUndefined()
  })

  it('does not silently ignore an explicit Program category or duration constraint', () => {
    const signals = makeBaseSignals()
    expect(resolveTurn('program_result', {
      excludedIds: [], categoryId: 'unknown-category',
    }, signals).card).toBeUndefined()
    expect(resolveTurn('program_result', {
      excludedIds: [], maxMinutes: 5,
    }, signals).card).toBeUndefined()
  })
})

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
          place: null,
          participantAvatars: [],
          unreadCount: 0,
          completionOpensAt: '2026-01-01T00:00:00Z',
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
    // "Find something to do" is offered either way and enters the existing explore flow.
    for (const menu of [guestMenu, signedInMenu]) {
      const find = menu.choices.find((c) => c.id === 'intent-new')
      expect(find?.label).toBe('Find something to do')
      expect(find?.effect).toEqual({ type: 'transition', nodeId: 'explore_interest' })
    }
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
      place: null,
      participantAvatars: [],
      unreadCount: 0,
      completionOpensAt: '2026-01-01T00:00:00Z',
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
            place: null,
            participantAvatars: [],
            unreadCount: 0,
            completionOpensAt: '2026-01-01T00:00:00Z',
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


describe('Opportunity Radar in "Do something together" (12 §5b)', () => {
  const opportunity = (id: string, label: string) =>
    ({
      gathering: {
        id,
        activity: { id: `act-${id}`, title: 'Swim at Barton Springs', thumbnailUrl: null },
        localDate: '2026-12-12',
        localTime: '18:00',
        place: { name: 'Barton Springs Pool', locality: 'Austin' },
        memberCount: 2,
        members: [],
      },
      reasons: [{ kind: 'ON_YOUR_CALENDAR', label }],
      fitsSchedule: true,
      calendarItemId: 'item-1',
    }) as unknown as NonNullable<HomeSignals['opportunities']>[number]

  it('leads with the top recommendation, its reasons, and one Join action that reuses the item', () => {
    const turn = resolveTurn('together_result', { excludedIds: [] }, makeBaseSignals({ opportunities: [opportunity('g1', 'You have Swim on Sat')] }))
    expect(turn.question).toBe('Swim at Barton Springs, Sat, Dec 12 · 6:00 PM')
    expect(turn.contextLine).toBe('You have Swim on Sat')
    expect(turn.choices[0]).toMatchObject({ label: 'Join', effect: { type: 'execute', action: { type: 'join_gathering', gatheringId: 'g1', calendarItemId: 'item-1' } } })
    expect(turn.choices.filter((c) => c.variant === 'primary')).toHaveLength(1)
  })

  it('"See another" moves through the list; with none left, the existing fallback follows', () => {
    const signals = makeBaseSignals({ opportunities: [opportunity('g1', 'a'), opportunity('g2', 'b')] })
    expect(resolveTurn('together_result', { excludedIds: ['g1'] }, signals).card?.id).toBe('g2')
    const fallback = resolveTurn('together_result', { excludedIds: ['g1', 'g2'] }, signals)
    expect(fallback.card?.kind ?? null).not.toBe('session')
    expect(resolveTurn('together_result', { excludedIds: [] }, makeBaseSignals()).choices.some((c) => c.id === 'join-gathering')).toBe(false)
  })
})

describe('discovery quality on Home (12 §5c)', () => {
  const base = makeBaseSignals({ isSignedIn: true })
  const programItem = (id: string, title: string, extra: Record<string, unknown> = {}) =>
    ({
      ...base.popularPrograms[0]!,
      program: { ...base.popularPrograms[0]!.program!, id, title, creator: { id: 'u-maya', handle: 'maya', displayName: 'Maya', avatarUrl: null } },
      ...extra,
    }) as HomeSignals['popularPrograms'][number]

  it('the opening leads with a followed creator and says so truthfully', () => {
    const turn = rankHomeSignals({ ...base, followedPrograms: [programItem('p-follow', 'Morning Pages')], newPrograms: [programItem('p-new', 'Brand New')] })
    expect(turn.card?.id).toBe('p-follow')
    expect(turn.contextLine).toBe('From Maya, who you follow')
  })

  it('the first signed-in suggestion walks FOR_YOU with its reason; cold start uses Explore, not the newest Program', () => {
    const interest = programItem('p-int', 'Sketch Daily', { reason: { kind: 'YOUR_INTERESTS', label: 'Matches your Sketching Activities' } })
    expect(rankHomeSignals({ ...base, forYouPrograms: [interest] }).contextLine).toBe('Matches your Sketching Activities')
    const explore = programItem('p-exp', 'Explore Me', { reason: { kind: 'EXPLORE', label: 'Explore Fitness' } })
    const explore2 = programItem('p-exp2', 'Next Domain', { reason: { kind: 'EXPLORE', label: 'New in Music' } })
    const cold = rankHomeSignals({ ...base, forYouPrograms: [explore, explore2], newPrograms: [programItem('p-new', 'Brand New')] })
    expect(cold.card?.id).toBe('p-exp')
    expect(cold.contextLine).toBe('Explore Fitness')
    expect(cold.question).not.toMatch(/^New:/)
    // Another idea continues down the same order, still with a reason.
    const next = rankHomeSignals({ ...base, forYouPrograms: [explore, explore2], newPrograms: [programItem('p-new', 'Brand New')] }, ['p-exp'])
    expect([next.card?.id, next.contextLine]).toEqual(['p-exp2', 'New in Music'])
    // Only with no FOR_YOU result does the newest Program appear, labelled New.
    const empty = rankHomeSignals({ ...base, forYouPrograms: [], newPrograms: [programItem('p-new', 'Brand New')] })
    expect([empty.card?.id, empty.question]).toEqual(['p-new', 'New: Brand New'])
  })

  it('"Start a Program" picks For You first and shows its reason; already-known Programs are skipped', () => {
    const signals = {
      ...base,
      knownProgramIds: ['p-known'],
      forYouPrograms: [
        programItem('p-known', 'Known', { reason: { kind: 'YOUR_INTERESTS', label: 'x' } }),
        programItem('p-fy', 'For You', { reason: { kind: 'EXPLORE', label: 'Explore Fitness' } }),
      ],
    }
    const turn = resolveTurn('program_result', { excludedIds: [] }, signals)
    expect(turn.card?.id).toBe('p-fy')
    expect(turn.contextLine).toBe('Explore Fitness')
  })

  it('Following mode shows only actual follows, never creators in general', () => {
    const generic = { kind: 'CREATOR', program: null, activity: null, creator: { id: 'u-gen', handle: 'gen', displayName: 'Generic', avatarUrl: null } } as HomeSignals['creators'][number]
    const followedCreator = { ...generic, creator: { ...generic.creator!, id: 'u-maya', handle: 'maya', displayName: 'Maya' } }
    const items = buildPresentationItems('following', { ...base, creators: [generic], followedCreators: [followedCreator], followedPrograms: [programItem('p-follow', 'Morning Pages')] })
    expect(items.map((i) => i.id)).toEqual(['p-follow', 'u-maya'])
    expect(items[0]!.subtitle).toMatch(/^From Maya, who you follow/)
    expect(buildPresentationItems('following', { ...base, creators: [generic] })).toEqual([])
  })
})
