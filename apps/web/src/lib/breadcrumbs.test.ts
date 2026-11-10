import { describe, it, expect } from 'vitest'
import {
  buildActivityBreadcrumbs,
  buildGroupBreadcrumbs,
  buildOccurrenceBreadcrumbs,
  buildProfileBreadcrumbs,
  buildProgramBreadcrumbs,
  extractProgramTargetFromPath,
} from './breadcrumbs'

describe('breadcrumbs builders', () => {
  it('builds canonical taxonomy breadcrumbs for direct Program links without duplicate levels', () => {
    const direct = buildProgramBreadcrumbs({
      title: 'Beginner Strength',
      type: { id: 'type-1', label: 'Training' },
      focus: { id: 'focus-1', label: 'Strength' },
    })
    expect(direct.activeNav).toBe('community')
    expect(direct.items).toEqual([
      { label: 'Browse', href: '/browse' },
      { label: 'Training', href: '/browse?type=type-1' },
      { label: 'Strength', href: '/browse?type=type-1&facet=focus-1' },
      { label: 'Beginner Strength' },
    ])

    const filtered = buildProgramBreadcrumbs({
      title: 'Beginner Strength',
      type: { id: 'type-1', label: 'Training' },
      focus: { id: 'focus-1', label: 'Strength' },
      returnTo: '/browse?type=type-1',
    })
    expect(filtered.items).toEqual([
      { label: 'Browse', href: '/browse?type=type-1' },
      { label: 'Strength', href: '/browse?type=type-1&facet=focus-1' },
      { label: 'Beginner Strength' },
    ])
  })

  it('uses My Programs or Calendar context for Program breadcrumbs when navigated from there', () => {
    const fromLibrary = buildProgramBreadcrumbs({
      title: 'Beginner Strength',
      type: { id: 'type-1', label: 'Training' },
      returnTo: '/library?sort=name',
    })
    expect(fromLibrary.activeNav).toBe('programs')
    expect(fromLibrary.items).toEqual([
      { label: 'My Programs', href: '/library?sort=name' },
      { label: 'Beginner Strength' },
    ])

    const fromCalendar = buildProgramBreadcrumbs({
      title: 'Beginner Strength',
      returnTo: '/?view=week&day=2026-11-10',
    })
    expect(fromCalendar.activeNav).toBe('calendar')
    expect(fromCalendar.items).toEqual([
      { label: 'Calendar', href: '/?view=week&day=2026-11-10' },
      { label: 'Beginner Strength' },
    ])
  })

  it('includes parent Program in Activity breadcrumbs and falls back to canonical category for direct links', () => {
    const target = extractProgramTargetFromPath(
      '/programs/beginner-strength?returnTo=%2Flibrary%3Fq%3DStrength',
    )
    expect(target).toEqual({
      slugOrId: 'beginner-strength',
      handle: null,
      nestedReturnTo: '/library?q=Strength',
    })

    const fromProgram = buildActivityBreadcrumbs({
      title: 'Squats',
      parentProgram: {
        title: 'Beginner Strength',
        href: '/programs/beginner-strength?returnTo=%2Flibrary%3Fq%3DStrength',
        nestedReturnTo: target?.nestedReturnTo,
      },
    })
    expect(fromProgram.activeNav).toBe('programs')
    expect(fromProgram.items).toEqual([
      { label: 'My Programs', href: '/library?q=Strength' },
      {
        label: 'Beginner Strength',
        href: '/programs/beginner-strength?returnTo=%2Flibrary%3Fq%3DStrength',
      },
      { label: 'Squats' },
    ])

    const directActivity = buildActivityBreadcrumbs({
      title: 'Morning Mobility',
      category: { id: 'cat-1', label: 'Fitness' },
    })
    expect(directActivity.activeNav).toBe('community')
    expect(directActivity.items).toEqual([
      { label: 'Browse', href: '/browse?kind=activities' },
      { label: 'Fitness', href: '/browse?kind=activities&facet=cat-1' },
      { label: 'Morning Mobility' },
    ])
  })

  it('builds shallow Profile and Group breadcrumbs from context or canonical parent', () => {
    expect(
      buildProfileBreadcrumbs({
        label: 'Coach Maya',
        returnTo: '/programs/beginner-strength',
      }),
    ).toEqual({
      activeNav: 'community',
      items: [
        { label: 'Browse', href: '/browse' },
        { label: 'Program', href: '/programs/beginner-strength' },
        { label: 'Coach Maya' },
      ],
    })

    expect(
      buildGroupBreadcrumbs({
        groupName: 'Morning Crew',
        programTitle: 'Beginner Strength',
        returnTo: '/programs/beginner-strength?returnTo=%2Flibrary',
      }),
    ).toEqual({
      activeNav: 'programs',
      items: [
        { label: 'My Programs', href: '/library' },
        {
          label: 'Beginner Strength',
          href: '/programs/beginner-strength?returnTo=%2Flibrary',
        },
        { label: 'Morning Crew' },
      ],
    })

    expect(
      buildGroupBreadcrumbs({
        groupName: 'Morning Crew',
      }),
    ).toEqual({
      items: [
        { label: 'Notifications', href: '/notifications' },
        { label: 'Morning Crew' },
      ],
    })
  })

  it('builds Occurrence breadcrumbs for Calendar, My Programs, and Program contexts', () => {
    expect(
      buildOccurrenceBreadcrumbs({
        title: 'Squats',
        programTitle: 'Beginner Strength',
        returnTo: '/?view=day&day=2026-11-10',
      }),
    ).toEqual({
      activeNav: 'calendar',
      items: [
        { label: 'Calendar', href: '/?view=day&day=2026-11-10' },
        { label: 'Beginner Strength' },
        { label: 'Squats' },
      ],
    })

    expect(
      buildOccurrenceBreadcrumbs({
        title: 'Squats',
        programTitle: 'Beginner Strength',
        returnTo: '/library?status=Active',
      }),
    ).toEqual({
      activeNav: 'programs',
      items: [
        { label: 'My Programs', href: '/library?status=Active' },
        { label: 'Beginner Strength' },
        { label: 'Squats' },
      ],
    })

    expect(
      buildOccurrenceBreadcrumbs({
        title: 'Squats',
        programTitle: 'Beginner Strength',
        returnTo: '/programs/beginner-strength?returnTo=%2Flibrary',
      }),
    ).toEqual({
      activeNav: 'programs',
      items: [
        { label: 'My Programs', href: '/library' },
        {
          label: 'Beginner Strength',
          href: '/programs/beginner-strength?returnTo=%2Flibrary',
        },
        { label: 'Squats' },
      ],
    })
  })
})
