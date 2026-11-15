/**
 * Calendar display preferences (03-UX §5): Day or Month, the Activity filter and Focused Hours / All 24h.
 *
 * They only change what the Calendar renders, never occurrences or account settings, and are stored
 * locally per user and browser. An explicit `view` in the URL (a shared link) overrides the stored view.
 */
import { useCallback, useEffect, useState } from 'react'

export type CalendarView = 'day' | 'month'

export const CALENDAR_CATEGORY_FILTERS = [
  { id: 'all', label: 'All Activities' },
  { id: 'fitness', label: 'Fitness' },
  { id: 'wellness', label: 'Wellness' },
  { id: 'education', label: 'Education' },
  { id: 'finance', label: 'Finance' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'group', label: 'Group' },
] as const

export type CalendarCategoryFilter = (typeof CALENDAR_CATEGORY_FILTERS)[number]['id']

export interface CalendarPrefs {
  view: CalendarView
  category: CalendarCategoryFilter
  allHours: boolean
}

export const DEFAULT_CALENDAR_PREFS: CalendarPrefs = { view: 'day', category: 'all', allHours: false }

const CATEGORY_IDS = new Set<string>(CALENDAR_CATEGORY_FILTERS.map((f) => f.id))

/** Parse stored preferences defensively; anything malformed falls back to the default. */
export function parseCalendarPrefs(raw: string | null): CalendarPrefs {
  if (!raw) return DEFAULT_CALENDAR_PREFS
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof CalendarPrefs, unknown>>
    return {
      view: value.view === 'month' ? 'month' : 'day',
      category:
        typeof value.category === 'string' && CATEGORY_IDS.has(value.category)
          ? (value.category as CalendarCategoryFilter)
          : 'all',
      allHours: value.allHours === true,
    }
  } catch {
    return DEFAULT_CALENDAR_PREFS
  }
}

/** The URL's explicit view wins (shared links); otherwise the stored one. */
export function resolveCalendarView(urlView: string | null, prefs: CalendarPrefs): CalendarView {
  if (urlView === 'month' || urlView === 'day') return urlView
  return prefs.view
}

export const calendarPrefsStorageKey = (userId: string) => `pg.calendarPrefs.v1.${userId}`

function read(userId: string): CalendarPrefs {
  try {
    return parseCalendarPrefs(window.localStorage.getItem(calendarPrefsStorageKey(userId)))
  } catch {
    return DEFAULT_CALENDAR_PREFS
  }
}

function write(userId: string, prefs: CalendarPrefs) {
  try {
    window.localStorage.setItem(calendarPrefsStorageKey(userId), JSON.stringify(prefs))
  } catch {
    // Storage unavailable (private mode, quota): the choice still applies for this visit.
  }
}

/** Calendar preferences remembered per user in this browser. */
export function useCalendarPrefs(userId: string) {
  const [prefs, setPrefs] = useState<CalendarPrefs>(() => read(userId))

  useEffect(() => {
    setPrefs(read(userId))
  }, [userId])

  const updatePrefs = useCallback(
    (patch: Partial<CalendarPrefs>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...patch }
        write(userId, next)
        return next
      })
    },
    [userId],
  )

  return [prefs, updatePrefs] as const
}
