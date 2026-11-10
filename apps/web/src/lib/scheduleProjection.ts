import type { SurfaceItem } from '@/components/calendar/CalendarSurface'
import { addDays } from './dates'

export type PlacementLike = {
  id: string
  activityId: string
  title: string
  relativeDay: number
  localTime?: string | null
}

/**
 * Returns difference in whole days between dateA and dateB (dateA - dateB).
 * Safe for UTC-midnight arithmetic on YYYY-MM-DD.
 */
export function dayDifference(dateA: string, dateB: string): number {
  const utcA = Date.parse(`${dateA}T12:00:00Z`)
  const utcB = Date.parse(`${dateB}T12:00:00Z`)
  return Math.round((utcA - utcB) / (24 * 60 * 60 * 1000))
}

/**
 * Projects program placements into calendar SurfaceItems across a given date range.
 *
 * For fixed duration (durationDays is a number):
 * Placements with relativeDay < durationDays fall on addDays(startDate, relativeDay).
 *
 * For ongoing programs (durationDays is null):
 * Placements repeat weekly in a rolling projection from startDate into the future.
 */
export function projectProgramPlacements({
  placements,
  startDate,
  durationDays,
  dates,
}: {
  placements: PlacementLike[]
  startDate: string
  durationDays: number | null
  dates: string[]
}): SurfaceItem[] {
  if (!placements.length || !dates.length) return []

  const items: SurfaceItem[] = []

  for (const date of dates) {
    const offset = dayDifference(date, startDate)
    if (offset < 0) continue

    if (durationDays !== null) {
      if (offset >= durationDays) continue
      // Fixed duration: match exact relativeDay
      const matching = placements.filter((p) => p.relativeDay === offset)
      for (const p of matching) {
        items.push({
          id: `projected-${p.id}-${date}`,
          day: date,
          title: p.title,
          localTime: p.localTime ?? undefined,
          detail: 'Projected',
          done: false,
          status: 'PLANNED',
        })
      }
    } else {
      // Ongoing program: weekly rolling projection
      const cycleDay = offset % 7
      const matching = placements.filter((p) => (p.relativeDay % 7) === cycleDay)
      for (const p of matching) {
        items.push({
          id: `projected-${p.id}-${date}`,
          day: date,
          title: p.title,
          localTime: p.localTime ?? undefined,
          detail: 'Projected',
          done: false,
          status: 'PLANNED',
        })
      }
    }
  }

  return items
}

