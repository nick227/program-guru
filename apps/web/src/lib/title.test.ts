import { describe, it, expect } from 'vitest'
import { formatTitle, DEFAULT_TITLE } from './title'

describe('title helpers', () => {
  it('formats titles with the app name suffix', () => {
    expect(formatTitle('Calendar')).toBe('Calendar — Programs')
    expect(formatTitle('Morning Mobility')).toBe('Morning Mobility — Programs')
    expect(formatTitle('Beginner Core & Strength')).toBe('Beginner Core & Strength — Programs')
    expect(formatTitle('@nick')).toBe('@nick — Programs')
  })

  it('falls back to default title for empty or null input', () => {
    expect(formatTitle('')).toBe(DEFAULT_TITLE)
    expect(formatTitle('   ')).toBe(DEFAULT_TITLE)
    expect(formatTitle(null)).toBe(DEFAULT_TITLE)
    expect(formatTitle(undefined)).toBe(DEFAULT_TITLE)
  })
})

