import { describe, expect, it } from 'vitest'
import { buildRecurrence, recurrenceSummary, untilDateFor, weekdayOf } from './recurrencePlan'

const base = { startDate: '2026-11-18', weekdays: [], ends: 'ONGOING' as const }

describe('Add to Schedule recurrence (03-UX §2a, 09 §4.8)', () => {
  it('Once sends no rule', () => {
    expect(buildRecurrence({ ...base, repeat: 'ONCE', ends: 'MONTH_1' })).toEqual({ recurrence: null, untilDate: null })
  })

  it('maps Daily and Monthly onto existing rule kinds', () => {
    expect(buildRecurrence({ ...base, repeat: 'DAILY' }).recurrence).toEqual({ kind: 'DAILY' })
    expect(buildRecurrence({ ...base, repeat: 'MONTHLY' }).recurrence).toEqual({ kind: 'MONTHLY' })
  })

  it('Weekly uses the chosen days, sorted and unique, else the start day', () => {
    expect(weekdayOf('2026-11-18')).toBe(3)
    expect(buildRecurrence({ ...base, repeat: 'WEEKLY', weekdays: [5, 1, 5] }).recurrence).toEqual({ kind: 'WEEKLY', weekdays: [1, 5] })
    expect(buildRecurrence({ ...base, repeat: 'WEEKLY' }).recurrence).toEqual({ kind: 'WEEKLY', weekdays: [3] })
  })

  it('turns lengths into an inclusive end date', () => {
    expect(untilDateFor({ startDate: '2026-11-18', ends: 'ONGOING' })).toBeNull()
    expect(untilDateFor({ startDate: '2026-11-18', ends: 'WEEKS_2' })).toBe('2026-12-01')
    expect(untilDateFor({ startDate: '2026-11-18', ends: 'MONTH_1' })).toBe('2026-12-17')
    expect(untilDateFor({ startDate: '2026-11-30', ends: 'MONTHS_3' })).toBe('2027-02-27')
    expect(untilDateFor({ startDate: '2026-11-18', ends: 'ON_DATE', endDate: '2026-12-24' })).toBe('2026-12-24')
    // An end before the start is ignored rather than sent (the server would refuse it).
    expect(untilDateFor({ startDate: '2026-11-18', ends: 'ON_DATE', endDate: '2026-11-01' })).toBeNull()
  })

  it('says what Save will do', () => {
    expect(recurrenceSummary({ ...base, repeat: 'ONCE' })).toBe('Once')
    expect(recurrenceSummary({ ...base, repeat: 'DAILY', ends: 'WEEKS_2' })).toBe('Every day · until Dec 1')
    expect(recurrenceSummary({ ...base, repeat: 'WEEKLY', weekdays: [1, 3] })).toBe('Every week on Mon, Wed · ongoing')
    expect(recurrenceSummary({ ...base, repeat: 'MONTHLY', startDate: '2026-11-22', ends: 'MONTHS_3' })).toBe('Every month on the 22nd · until Feb 21')
  })
})
