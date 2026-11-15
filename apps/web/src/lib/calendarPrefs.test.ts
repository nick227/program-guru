import { describe, expect, it } from 'vitest'
import { DEFAULT_CALENDAR_PREFS, parseCalendarPrefs, resolveCalendarView } from './calendarPrefs'

describe('calendar preferences', () => {
  it('parses stored prefs and falls back on anything malformed', () => {
    expect(parseCalendarPrefs(JSON.stringify({ view: 'month', category: 'wellness', allHours: true }))).toEqual({
      view: 'month',
      category: 'wellness',
      allHours: true,
    })
    expect(parseCalendarPrefs(null)).toEqual(DEFAULT_CALENDAR_PREFS)
    expect(parseCalendarPrefs('{not json')).toEqual(DEFAULT_CALENDAR_PREFS)
    expect(parseCalendarPrefs(JSON.stringify({ view: 'week', category: 'cooking', allHours: 'yes' }))).toEqual(
      DEFAULT_CALENDAR_PREFS,
    )
  })

  it('an explicit URL view overrides the stored one', () => {
    const stored = { ...DEFAULT_CALENDAR_PREFS, view: 'month' as const }
    expect(resolveCalendarView(null, stored)).toBe('month')
    expect(resolveCalendarView('day', stored)).toBe('day')
    expect(resolveCalendarView('bogus', stored)).toBe('month')
  })
})
