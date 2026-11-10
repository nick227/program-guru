import { describe, it, expect } from 'vitest'
import { slugify, isUuid, slugRegistry } from './slugs'
import {
  buildProfileUrl,
  buildProgramUrl,
  buildActivityUrl,
  buildWorkspaceUrl,
  buildOccurrenceUrl,
  buildGroupUrl,
} from './urls'

describe('slug utilities', () => {
  it('slugifies simple and special strings', () => {
    expect(slugify('Beginner Core & Strength')).toBe('beginner-core-strength')
    expect(slugify('Morning Mobility')).toBe('morning-mobility')
    expect(slugify('Warm-Up & Cool Down!')).toBe('warm-up-cool-down')
    expect(slugify('Café au Lait Workout')).toBe('cafe-au-lait-workout')
    expect(slugify('   multiple   spaces   and---hyphens   ')).toBe('multiple-spaces-and-hyphens')
  })

  it('detects UUIDs correctly', () => {
    expect(isUuid('e1b6f0e2-632b-426c-85d7-ecf8595cb640')).toBe(true)
    expect(isUuid('E1B6F0E2-632B-426C-85D7-ECF8595CB640')).toBe(true)
    expect(isUuid('beginner-core-strength')).toBe(false)
    expect(isUuid('12345')).toBe(false)
    expect(isUuid('')).toBe(false)
    expect(isUuid(null)).toBe(false)
  })

  it('registers and resolves program slugs with alias tracking on rename', () => {
    const id = '11111111-2222-3333-4444-555555555555'
    slugRegistry.registerProgram(id, 'Initial Title', 'coach-sarah')

    const initial = slugRegistry.resolveProgram('initial-title')
    expect(initial).not.toBeNull()
    expect(initial?.id).toBe(id)
    expect(initial?.canonicalSlug).toBe('initial-title')
    expect(initial?.isAlias).toBe(false)

    // Creator-scoped lookup
    const scoped = slugRegistry.resolveProgram('initial-title', 'coach-sarah')
    expect(scoped?.id).toBe(id)

    // Title rename: register new slug
    slugRegistry.registerProgram(id, 'Updated Advanced Title', 'coach-sarah')

    // Resolving old slug returns alias pointing to updated canonical slug
    const oldSlugResolution = slugRegistry.resolveProgram('initial-title')
    expect(oldSlugResolution?.id).toBe(id)
    expect(oldSlugResolution?.canonicalSlug).toBe('updated-advanced-title')
    expect(oldSlugResolution?.isAlias).toBe(true)

    // Resolving new slug
    const newSlugResolution = slugRegistry.resolveProgram('updated-advanced-title')
    expect(newSlugResolution?.id).toBe(id)
    expect(newSlugResolution?.canonicalSlug).toBe('updated-advanced-title')
    expect(newSlugResolution?.isAlias).toBe(false)
  })
})

describe('url builders', () => {
  it('builds profile URL in /@handle namespace', () => {
    expect(buildProfileUrl('nick')).toBe('/@nick')
    expect(buildProfileUrl('@nick')).toBe('/@nick')
    expect(buildProfileUrl('sarah_fit')).toBe('/@sarah_fit')
  })

  it('builds friendly program URLs', () => {
    const p1 = {
      id: 'e1b6f0e2-632b-426c-85d7-ecf8595cb640',
      title: 'Beginner Core & Strength',
    }
    expect(buildProgramUrl(p1)).toBe('/programs/beginner-core-strength')

    const pScoped = {
      id: 'e1b6f0e2-632b-426c-85d7-ecf8595cb640',
      title: 'Beginner Core & Strength',
      creatorHandle: 'nick',
    }
    expect(buildProgramUrl(pScoped, { scoped: true })).toBe('/@nick/beginner-core-strength')
    expect(buildProgramUrl(pScoped, { scoped: false })).toBe('/programs/beginner-core-strength')

    // Preserves query params
    expect(buildProgramUrl(p1, { returnTo: '/discover' })).toBe(
      '/programs/beginner-core-strength?returnTo=%2Fdiscover',
    )
    expect(buildProgramUrl({ id: '' })).toBe('/browse')
  })

  it('builds friendly activity URLs', () => {
    const a1 = {
      id: '22222222-3333-4444-5555-666666666666',
      title: 'Morning Mobility',
    }
    expect(buildActivityUrl(a1)).toBe('/activities/morning-mobility')
    expect(buildActivityUrl(a1, { returnTo: '/calendar' })).toBe(
      '/activities/morning-mobility?returnTo=%2Fcalendar',
    )
    expect(buildActivityUrl({ id: '' })).toBe('/browse?kind=activities')
    expect(buildActivityUrl(a1, { edit: true, returnTo: '/calendar' })).toBe(
      '/activities/morning-mobility?edit=1&returnTo=%2Fcalendar',
    )
  })

  it('builds workspace, occurrence, and group URLs with UUIDs', () => {
    const uuid = 'e1b6f0e2-632b-426c-85d7-ecf8595cb640'
    expect(buildWorkspaceUrl(uuid)).toBe(`/programs/${uuid}/workspace`)
    expect(buildWorkspaceUrl(uuid, { step: 'activities' })).toBe(
      `/programs/${uuid}/workspace?step=activities`,
    )
    expect(buildWorkspaceUrl(uuid, { panel: 'activities' })).toBe(
      `/programs/${uuid}/workspace?panel=activities`,
    )
    expect(buildOccurrenceUrl(uuid)).toBe(`/occurrences/${uuid}`)
    expect(buildGroupUrl(uuid)).toBe(`/groups/${uuid}`)
  })
})

