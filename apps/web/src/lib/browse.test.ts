import { describe, expect, it } from 'vitest'
import { buildBrowseUrl, resolveBrowseFilters } from './browse'

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
})

