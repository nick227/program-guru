/**
 * Calendar visibility filters.
 *
 * These filters only change what the Calendar renders. They never modify
 * occurrences, schedules, or notification preferences, and they are stored
 * locally (per user, per browser) rather than in account preferences so they
 * cannot be confused with notification settings.
 */
import { useCallback, useEffect, useState } from 'react'

export type CalendarStatusFilter = 'all' | 'planned' | 'completed' | 'skipped'

export const CALENDAR_STATUS_OPTIONS: { id: CalendarStatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'planned', label: 'Planned' },
  { id: 'completed', label: 'Completed' },
  { id: 'skipped', label: 'Skipped' },
]

export interface CalendarFilters {
  /**
   * Programs the user has hidden. Stored as an exclusion list so newly joined
   * Programs appear by default ("show everything" stays the default).
   */
  hiddenProgramIds: string[]
  status: CalendarStatusFilter
  includeStandalone: boolean
}

export const DEFAULT_CALENDAR_FILTERS: CalendarFilters = {
  hiddenProgramIds: [],
  status: 'all',
  includeStandalone: true,
}

export interface CalendarFilterProgram {
  id: string
  title: string
}

export interface FilterableCalendarItem {
  enrollmentId?: string | null
  status?: string | null
}

const STATUS_MATCH: Record<Exclude<CalendarStatusFilter, 'all'>, string> = {
  planned: 'PLANNED',
  completed: 'DONE',
  skipped: 'SKIPPED',
}

const STATUS_IDS = new Set<CalendarStatusFilter>(['all', 'planned', 'completed', 'skipped'])

export function isDefaultCalendarFilters(filters: CalendarFilters): boolean {
  return (
    filters.status === 'all' &&
    filters.includeStandalone &&
    filters.hiddenProgramIds.length === 0
  )
}

/** Number of filter dimensions currently narrowing the Calendar. */
export function activeCalendarFilterCount(filters: CalendarFilters): number {
  return (
    (filters.status !== 'all' ? 1 : 0) +
    (filters.includeStandalone ? 0 : 1) +
    (filters.hiddenProgramIds.length > 0 ? 1 : 0)
  )
}

/**
 * Whether an occurrence stays visible under the given filters.
 *
 * Program-backed items whose Program cannot be resolved yet (enrollments still
 * loading) stay visible: we never hide what we cannot attribute.
 */
export function matchesCalendarFilters(
  item: FilterableCalendarItem,
  filters: CalendarFilters,
  programIdByEnrollment: ReadonlyMap<string, string>,
): boolean {
  if (filters.status !== 'all' && item.status !== STATUS_MATCH[filters.status]) {
    return false
  }
  if (!item.enrollmentId) return filters.includeStandalone
  if (filters.hiddenProgramIds.length === 0) return true
  const programId = programIdByEnrollment.get(item.enrollmentId)
  if (!programId) return true
  return !filters.hiddenProgramIds.includes(programId)
}

/** Drop hidden Program IDs that no longer correspond to an available Program. */
export function pruneStaleProgramIds(
  filters: CalendarFilters,
  availableProgramIds: Iterable<string>,
): CalendarFilters {
  const available = new Set(availableProgramIds)
  const kept = filters.hiddenProgramIds.filter((id) => available.has(id))
  if (kept.length === filters.hiddenProgramIds.length) return filters
  return { ...filters, hiddenProgramIds: kept }
}

/** Parse persisted filters defensively; anything malformed falls back to defaults. */
export function parseCalendarFilters(raw: string | null): CalendarFilters {
  if (!raw) return DEFAULT_CALENDAR_FILTERS
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof CalendarFilters, unknown>>
    const hidden = Array.isArray(value.hiddenProgramIds)
      ? [...new Set(value.hiddenProgramIds.filter((id): id is string => typeof id === 'string' && id.length > 0))]
      : []
    const status =
      typeof value.status === 'string' && STATUS_IDS.has(value.status as CalendarStatusFilter)
        ? (value.status as CalendarStatusFilter)
        : 'all'
    const includeStandalone =
      typeof value.includeStandalone === 'boolean' ? value.includeStandalone : true
    return { hiddenProgramIds: hidden, status, includeStandalone }
  } catch {
    return DEFAULT_CALENDAR_FILTERS
  }
}

export function calendarFiltersStorageKey(userId: string): string {
  return `pg.calendarFilters.v1.${userId}`
}

function readStored(userId: string): CalendarFilters {
  if (typeof window === 'undefined') return DEFAULT_CALENDAR_FILTERS
  try {
    return parseCalendarFilters(window.localStorage.getItem(calendarFiltersStorageKey(userId)))
  } catch {
    return DEFAULT_CALENDAR_FILTERS
  }
}

function writeStored(userId: string, filters: CalendarFilters) {
  if (typeof window === 'undefined') return
  try {
    const key = calendarFiltersStorageKey(userId)
    if (isDefaultCalendarFilters(filters)) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, JSON.stringify(filters))
  } catch {
    // Storage unavailable (private mode / quota): filters still apply for this visit.
  }
}

/** Calendar filters persisted per user in this browser. */
export function useCalendarFilters(userId: string) {
  const [filters, setFiltersState] = useState<CalendarFilters>(() => readStored(userId))

  useEffect(() => {
    setFiltersState(readStored(userId))
  }, [userId])

  const setFilters = useCallback(
    (next: CalendarFilters | ((prev: CalendarFilters) => CalendarFilters)) => {
      setFiltersState((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next
        if (resolved !== prev) writeStored(userId, resolved)
        return resolved
      })
    },
    [userId],
  )

  const clearFilters = useCallback(
    () => setFilters(DEFAULT_CALENDAR_FILTERS),
    [setFilters],
  )

  return { filters, setFilters, clearFilters }
}

