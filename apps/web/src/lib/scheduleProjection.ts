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

function addMonthsLocal(d: string, months: number): string {
  const year = Number(d.slice(0, 4))
  const month = Number(d.slice(5, 7)) - 1
  const day = Number(d.slice(8, 10))
  const total = year * 12 + month + months
  const targetYear = Math.floor(total / 12)
  const targetMonth = ((total % 12) + 12) % 12
  const maxDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth + 1).padStart(2, '0')}-${String(Math.min(day, maxDay)).padStart(2, '0')}`
}

function occursMonthlyOnDate(anchorDate: string, targetDate: string): boolean {
  const months = (Number(targetDate.slice(0, 4)) - Number(anchorDate.slice(0, 4))) * 12 + (Number(targetDate.slice(5, 7)) - Number(anchorDate.slice(5, 7)))
  return months >= 0 && targetDate === addMonthsLocal(anchorDate, months)
}

/**
 * Projects program placements into calendar SurfaceItems across a given date range.
 *
 * For fixed duration (durationDays is a number):
 * Placements with relativeDay < durationDays fall on addDays(startDate, relativeDay).
 *
 * For ongoing programs (durationDays is null):
 * Monthly programs advance by calendar month; weekly programs repeat in 7-day cycles.
 */
export function projectProgramPlacements({
  placements,
  startDate,
  durationDays,
  dates,
  frequency,
}: {
  placements: PlacementLike[]
  startDate: string
  durationDays: number | null
  dates: string[]
  frequency?: { kind: string } | null
}): SurfaceItem[] {
  if (!placements.length || !dates.length) return []

  const items: SurfaceItem[] = []
  const monthly = durationDays === null && frequency?.kind === 'MONTHLY'

  for (const date of dates) {
    const offset = dayDifference(date, startDate)
    if (offset < 0) continue

    const matching =
      durationDays !== null
        ? offset < durationDays
          ? placements.filter((p) => p.relativeDay === offset)
          : []
        : monthly
          ? placements.filter((p) => occursMonthlyOnDate(addDays(startDate, p.relativeDay), date))
          : placements.filter((p) => p.relativeDay % 7 === offset % 7)

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

  return items
}

