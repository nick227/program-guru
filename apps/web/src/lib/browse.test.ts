import { describe, expect, it } from 'vitest'
import {
  buildBrowseUrl,
  discoveryShortcuts,
  isShortcutActive,
  toggleShortcut,
  matchesBrowseDuration,
  resolveBrowseDuration,
  resolveBrowseFilters,
  resolveBrowseTiming,
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
        new URLSearchParams('type=type-1&facet=focus-1&level=BEGINNER&session=20&tags=at-home,no-equipment'),
        'programs',
      ),
    ).toEqual({
      q: '',
      category: '',
      type: 'type-1',
      focus: 'focus-1',
      level: 'BEGINNER',
      maxSessionMinutes: '20',
      tags: ['at-home', 'no-equipment'],
      sort: 'POPULAR',
      creator: 'ALL',
    })

    expect(
      resolveBrowseFilters(
        new URLSearchParams('kind=activities&facet=cat-1&level=BEGINNER&tags=at-home'),
        'activities',
      ),
    ).toEqual({
      q: '',
      category: 'cat-1',
      type: '',
      focus: '',
      level: '',
      maxSessionMinutes: '',
      tags: [],
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
      level: '',
      maxSessionMinutes: '',
      tags: [],
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

  it('resolves and serializes group timing filter only for non-picker program discovery', () => {
    expect(resolveBrowseTiming(new URLSearchParams('timing=STARTING_SOON'), 'programs')).toBe('STARTING_SOON')
    expect(resolveBrowseTiming(new URLSearchParams('timing=HAPPENING_NOW'), 'programs')).toBe('ALL')
    expect(resolveBrowseTiming(new URLSearchParams('timing=STARTING_SOON'), 'activities')).toBe('ALL')
    expect(resolveBrowseTiming(new URLSearchParams('timing=STARTING_SOON'), 'programs', true)).toBe('ALL')

    expect(buildBrowseUrl({ kind: 'programs', timing: 'STARTING_SOON' })).toBe('/browse?timing=STARTING_SOON')
    expect(buildBrowseUrl({ kind: 'programs', timing: 'ALL' })).toBe('/browse')
  })
})


describe('discovery shortcuts (12 §5a)', () => {
  const shortcuts = discoveryShortcuts({ domainIdBySlug: { relationships: 'dom-social', 'outdoors-nature': 'dom-out' }, cities: ['Austin'], hasStartingSoon: true })
  const byKey = (k: string) => shortcuts.find((s) => s.key === k)!

  it('only presets existing filters, and shows city and Domain shortcuts only when that data exists', () => {
    expect(shortcuts.map((s) => s.label)).toEqual(['Quick · 15 min', 'Daily habits', 'Social', 'Outdoors', 'In Austin', 'Starting soon'])
    expect(discoveryShortcuts({ domainIdBySlug: {}, cities: [] }).map((s) => s.key)).toEqual(['quick', 'daily'])
  })

  it('applies a shortcut by switching kind and dropping the other kind’s filters', () => {
    const next = toggleShortcut(new URLSearchParams('timing=STARTING_SOON&type=t1&q=chess'), 'programs', byKey('daily'))
    expect(Object.fromEntries(next)).toEqual({ q: 'chess', kind: 'activities', frequency: 'DAILY' })
    const back = toggleShortcut(new URLSearchParams('kind=activities&city=Austin&frequency=DAILY'), 'activities', byKey('starting-soon'))
    expect(Object.fromEntries(back)).toEqual({ timing: 'STARTING_SOON' })
  })

  it('toggles off only its own values and reports active state by kind', () => {
    const on = new URLSearchParams('kind=activities&city=Austin&duration=short')
    expect(isShortcutActive(on, 'activities', byKey('city:Austin'))).toBe(true)
    expect(isShortcutActive(on, 'programs', byKey('city:Austin'))).toBe(false)
    expect(Object.fromEntries(toggleShortcut(on, 'activities', byKey('city:Austin')))).toEqual({ kind: 'activities', duration: 'short' })
  })
})
