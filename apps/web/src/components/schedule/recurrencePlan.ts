import type { components } from '@project/sdk'
import { addDays, addMonths, dateLabel } from '@/lib/dates'

type RecurrenceRule = components['schemas']['RecurrenceRule']

/** Add to Schedule's repeat choices (03-UX §2a), mapped onto the existing recurrence rules (09 §4.8). */
export type Repeat = 'ONCE' | 'DAILY' | 'WEEKLY' | 'MONTHLY'
export type Ends = 'ONGOING' | 'WEEKS_2' | 'MONTH_1' | 'MONTHS_3' | 'ON_DATE'

export interface RecurrenceChoice {
  repeat: Repeat
  startDate: string
  /** WEEKLY only; 0 = Sunday … 6 = Saturday (the API's convention). */
  weekdays: number[]
  ends: Ends
  /** ON_DATE only. */
  endDate?: string | null
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function weekdayOf(localDate: string): number {
  return new Date(`${localDate}T12:00:00Z`).getUTCDay()
}

/** The inclusive last day for a preset length, or the chosen end date; null when ongoing. */
export function untilDateFor(choice: Pick<RecurrenceChoice, 'startDate' | 'ends' | 'endDate'>): string | null {
  switch (choice.ends) {
    case 'ONGOING':
      return null
    case 'WEEKS_2':
      return addDays(choice.startDate, 13)
    case 'MONTH_1':
      return addDays(addMonths(choice.startDate, 1), -1)
    case 'MONTHS_3':
      return addDays(addMonths(choice.startDate, 3), -1)
    case 'ON_DATE':
      return choice.endDate && choice.endDate >= choice.startDate ? choice.endDate : null
  }
}

/** The `recurrence` and `untilDate` of AddCalendarItemInput; Once sends neither. */
export function buildRecurrence(choice: RecurrenceChoice): { recurrence: RecurrenceRule | null; untilDate: string | null } {
  if (choice.repeat === 'ONCE') return { recurrence: null, untilDate: null }
  const recurrence: RecurrenceRule =
    choice.repeat === 'WEEKLY'
      ? { kind: 'WEEKLY', weekdays: [...new Set(choice.weekdays.length ? choice.weekdays : [weekdayOf(choice.startDate)])].sort((a, b) => a - b) }
      : { kind: choice.repeat }
  return { recurrence, untilDate: untilDateFor(choice) }
}

const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  return `${n}${s}`
}

/** "Every week on Mon, Wed · until Dec 14" — what Save will do, in words. */
export function recurrenceSummary(choice: RecurrenceChoice): string {
  if (choice.repeat === 'ONCE') return 'Once'
  const { recurrence, untilDate } = buildRecurrence(choice)
  const rule =
    choice.repeat === 'DAILY'
      ? 'Every day'
      : choice.repeat === 'WEEKLY'
        ? `Every week on ${(recurrence?.weekdays ?? []).map((d) => SHORT_DAYS[d]).join(', ')}`
        : `Every month on the ${ordinal(Number(choice.startDate.slice(8, 10)))}`
  return `${rule} · ${untilDate ? `until ${dateLabel(untilDate, { month: 'short', day: 'numeric' })}` : 'ongoing'}`
}
