/**
 * Calendar selection mode (03-UX §5, bulk management). Tiles and date marks read it directly, so
 * Day, Month and grouped workouts behave the same without threading props through every view.
 * While active: a click (or Enter/Space) toggles an entry, Shift-click selects a range, a date mark
 * selects that day, and nothing drags, completes, navigates or quick-adds.
 */
import { createContext, useContext } from 'react'

export type CalendarSelection = {
  active: boolean
  has: (id: string) => boolean
  /** Toggle one entry; with `range`, select everything between the last toggled entry and this one. */
  toggle: (id: string, range?: boolean) => void
  /** Toggle a set (a workout group, or a whole day): all on unless every one is already on. */
  toggleMany: (ids: string[]) => void
  /** Shift-click outside selection mode: start selecting with this entry. */
  start: (id: string) => void
  /** Select (or clear) every entry on a date. */
  toggleDay: (day: string) => void
}

const inactive: CalendarSelection = {
  active: false,
  has: () => false,
  toggle: () => {},
  toggleMany: () => {},
  start: () => {},
  toggleDay: () => {},
}

export const CalendarSelectionContext = createContext<CalendarSelection>(inactive)

export const useCalendarSelection = () => useContext(CalendarSelectionContext)
