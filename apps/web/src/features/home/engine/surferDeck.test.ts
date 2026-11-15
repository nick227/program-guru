import { describe, expect, it } from 'vitest'
import type { components } from '@project/sdk'
import { buildSurferDeck, peopleLine, reusableTodayItem, stepIndex, swipeStep } from './surferDeck'

type S = components['schemas']

const activity = (id: string) => ({ id, title: `Activity ${id}` }) as S['ActivitySummary']
const gathering = (id: string, activityId: string, over: Partial<S['Gathering']> = {}) =>
  ({
    id,
    activity: activity(activityId),
    memberCount: 3,
    activeCount: 0,
    capacity: null,
    members: [],
    isPast: false,
    isFull: false,
    viewerCalendarItemId: null,
    ...over,
  }) as S['Gathering']
const opportunity = (g: S['Gathering'], label: string, calendarItemId: string | null = null) =>
  ({ gathering: g, reasons: [{ kind: 'YOUR_INTERESTS', label }], fitsSchedule: true, calendarItemId }) as S['Opportunity']

describe('buildSurferDeck', () => {
  it('orders happening now, Radar, upcoming, then catalog', () => {
    const deck = buildSurferDeck({
      now: [gathering('g1', 'a1', { activeCount: 2 })],
      radar: [opportunity(gathering('g2', 'a2'), 'Part of 30-Day Wellness', 'item-2')],
      upcoming: [gathering('g3', 'a3')],
      catalog: [activity('a4')],
    })
    expect(deck.map((c) => [c.activity.id, c.source])).toEqual([
      ['a1', 'now'],
      ['a2', 'radar'],
      ['a3', 'upcoming'],
      ['a4', 'catalog'],
    ])
    expect(deck[1]).toMatchObject({ reason: 'Part of 30-Day Wellness', calendarItemId: 'item-2' })
    expect(deck[3]!.gathering).toBeNull()
  })

  it('shows each Activity once, keeping its best-placed gathering', () => {
    const deck = buildSurferDeck({
      now: [gathering('g1', 'a1', { activeCount: 1 })],
      radar: [opportunity(gathering('g2', 'a1'), 'Your interests'), opportunity(gathering('g3', 'a2'), 'On your Calendar')],
      upcoming: [gathering('g3', 'a2'), gathering('g4', 'a1'), gathering('g5', 'a5')],
      catalog: [activity('a1'), activity('a2'), activity('a5'), activity('a6'), activity('a6')],
    })
    expect(deck.map((c) => c.activity.id)).toEqual(['a1', 'a2', 'a5', 'a6'])
    expect(deck.map((c) => c.gathering?.id ?? null)).toEqual(['g1', 'g3', 'g5', null])
    expect(new Set(deck.map((c) => c.activity.id)).size).toBe(deck.length)
  })

  it('never treats an idle or past gathering as happening now or upcoming', () => {
    const deck = buildSurferDeck({
      now: [gathering('g1', 'a1', { activeCount: 0 })],
      radar: [opportunity(gathering('g2', 'a2', { isPast: true }), 'Old')],
      upcoming: [gathering('g3', 'a3', { isPast: true })],
      catalog: [activity('a1')],
    })
    expect(deck).toEqual([expect.objectContaining({ source: 'catalog', gathering: null })])
  })

  it('caps the deck', () => {
    const deck = buildSurferDeck({ now: [], radar: [], upcoming: [], catalog: ['1', '2', '3'].map(activity), limit: 2 })
    expect(deck).toHaveLength(2)
  })
})

describe('surfer navigation', () => {
  it('steps without wrapping', () => {
    expect(stepIndex(0, -1, 5)).toBe(0)
    expect(stepIndex(3, 1, 5)).toBe(4)
    expect(stepIndex(4, 1, 5)).toBe(4)
    expect(stepIndex(2, 1, 0)).toBe(0)
  })

  it('reads horizontal swipes and ignores taps and scrolls', () => {
    expect(swipeStep(-80, 10)).toBe(1)
    expect(swipeStep(80, 5)).toBe(-1)
    expect(swipeStep(-20, 0)).toBe(0)
    expect(swipeStep(-60, 70)).toBe(0)
  })
})

describe('reusableTodayItem', () => {
  const base = { activityId: 'a1', status: 'PLANNED' as const, enrollmentId: null, gatheringId: null }
  it('reuses a planned personal item of the same Activity', () => {
    expect(reusableTodayItem([{ ...base, id: 'i1' }], 'a1')).toBe('i1')
  })
  it('never reuses Program, gathering, finished or other-Activity items', () => {
    expect(
      reusableTodayItem(
        [
          { ...base, id: 'p', enrollmentId: 'e1' },
          { ...base, id: 'g', gatheringId: 'g1' },
          { ...base, id: 'd', status: 'DONE' },
          { ...base, id: 'o', activityId: 'a2' },
        ],
        'a1',
      ),
    ).toBeNull()
  })
})

describe('peopleLine', () => {
  it('states real counts only', () => {
    expect(peopleLine(null)).toBeNull()
    expect(peopleLine({ memberCount: 0, activeCount: 0, capacity: null })).toBeNull()
    expect(peopleLine({ memberCount: 4, activeCount: 0, capacity: null })).toBe('4 going')
    expect(peopleLine({ memberCount: 4, activeCount: 2, capacity: 6 })).toBe('4 of 6 going · 2 doing it now')
  })
})
