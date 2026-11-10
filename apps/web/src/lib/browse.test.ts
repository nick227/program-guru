import { describe, expect, it } from 'vitest'
import {
  buildBrowseUrl,
  matchesBrowseDuration,
  resolveBrowseDuration,
  resolveBrowseFilters,
} from './browse'

describe('browse URL and filter helpers', () => {
  it('builds composable /browse URLs with explicit category, type, and focus params', () => {
    expect(buildBrowseUrl()).toBe('/browse')
    expect(
      buildBrowseUrl({
        kind: 'programs',
        category: 'cat-1',
        type: 'type-1',
        focus: 'focus-1',
      }),
    ).toBe('/browse?category=cat-1&type=type-1&focus=focus-1')

    expect(
      buildBrowseUrl({
        kind: 'activities',
        category: 'cat-1',
        focus: 'focus-2',
        pick: 'activity',
        returnTo: '/add-activity',
      }),
    ).toBe(
      '/browse?kind=activities&category=cat-1&focus=focus-2&pick=activity&returnTo=%2Fadd-activity',
    )
  })

  it('resolves explicit filters and keeps legacy ?facet= compatibility', () => {
    expect(
      resolveBrowseFilters(
        new URLSearchParams('type=type-1&facet=focus-1'),
        'programs',
      ),
    ).toEqual({
      q: '',
      category: '',
      type: 'type-1',
      focus: 'focus-1',
      sort: 'POPULAR',
      creator: 'ALL',
    })

    expect(
      resolveBrowseFilters(
        new URLSearchParams('kind=activities&facet=cat-1'),
        'activities',
      ),
    ).toEqual({
      q: '',
      category: 'cat-1',
      type: '',
      focus: '',
      sort: 'POPULAR',
      creator: 'ALL',
    })

    expect(
      resolveBrowseFilters(
        new URLSearchParams('category=cat-2&focus=focus-2&facet=legacy'),
        'programs',
        'locked-type',
      ),
    ).toEqual({
      q: '',
      category: 'cat-2',
      type: 'locked-type',
      focus: 'focus-2',
      sort: 'POPULAR',
      creator: 'ALL',
    })
  })

  it('resolves and matches duration buckets for programs and activities', () => {
    expect(resolveBrowseDuration(new URLSearchParams('duration=medium'), 'programs')).toBe('medium')
    expect(resolveBrowseDuration(new URLSearchParams('duration=ongoing'), 'programs')).toBe('ongoing')
    expect(resolveBrowseDuration(new URLSearchParams('duration=ongoing'), 'activities')).toBe('')
    expect(resolveBrowseDuration(new URLSearchParams('duration=bogus'), 'programs')).toBe('')

    expect(matchesBrowseDuration('short', 'programs', { durationDays: 14 })).toBe(true)
    expect(matchesBrowseDuration('medium', 'programs', { durationDays: 28 })).toBe(true)
    expect(matchesBrowseDuration('long', 'programs', { durationDays: 56 })).toBe(true)
    expect(matchesBrowseDuration('ongoing', 'programs', { durationDays: null })).toBe(true)
    expect(matchesBrowseDuration('short', 'programs', { durationDays: null })).toBe(false)

    expect(matchesBrowseDuration('short', 'activities', { durationMinutes: 15 })).toBe(true)
    expect(matchesBrowseDuration('medium', 'activities', { durationMinutes: 30 })).toBe(true)
    expect(matchesBrowseDuration('long', 'activities', { durationMinutes: 45 })).toBe(true)
    expect(matchesBrowseDuration('short', 'activities', { durationMinutes: null })).toBe(false)
  })
})

