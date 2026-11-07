import { describe, it, expect } from 'vitest'
import { countPlacements, frequencyLabel, generatePlacements, programDays } from '../../domains/programs/schedule'
import { addDays, localToUtc, todayIn, weekday } from '../../lib/time'

describe('automatic scheduling (07 §7)', () => {
  it('3 activities, 3 days/week, 8 weeks: 24 program days; 72 placements all-each-day, 24 rotating', () => {
    const f = { kind: 'N_PER_WEEK' as const, n: 3 }
    const all = generatePlacements(3, f, 56, 'ALL_EACH_DAY')
    const rot = generatePlacements(3, f, 56, 'ROTATE')
    expect(countPlacements(all)).toEqual({ programDayCount: 24, placementCount: 72 })
    expect(countPlacements(rot)).toEqual({ programDayCount: 24, placementCount: 24 })
    expect(rot.slice(0, 4).map((p) => p.activityIndex)).toEqual([0, 1, 2, 0])
    expect(frequencyLabel(f)).toBe('3 days/week')
  })

  it('uses Mon/Wed/Fri-style offsets and never places past the duration', () => {
    expect(programDays({ kind: 'N_PER_WEEK', n: 3 }, 14)).toEqual([0, 2, 4, 7, 9, 11])
    expect(programDays({ kind: 'WEEKDAYS' }, 10)).toEqual([0, 1, 2, 3, 4, 7, 8, 9])
    expect(programDays({ kind: 'DAILY' }, 30)).toHaveLength(30)
    expect(programDays({ kind: 'CUSTOM', offsets: [6, 1, 1, 9] }, 7)).toEqual([1, 6])
  })

  it('ongoing programs (no duration) store one 7-day cycle', () => {
    expect(programDays({ kind: 'DAILY' }, null)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('ROTATE never drops a selected activity when there are fewer days than activities', () => {
    const placed = generatePlacements(5, { kind: 'N_PER_WEEK', n: 2 }, 7, 'ROTATE')
    expect(new Set(placed.map((p) => p.activityIndex))).toEqual(new Set([0, 1, 2, 3, 4]))
    expect(countPlacements(placed).programDayCount).toBe(2)
  })

  it('is deterministic', () => {
    const f = { kind: 'N_PER_WEEK' as const, n: 4 }
    expect(generatePlacements(2, f, 28, 'ALL_EACH_DAY')).toEqual(generatePlacements(2, f, 28, 'ALL_EACH_DAY'))
  })
})

describe('time model (09 §4)', () => {
  it('converts local wall-clock time to UTC across DST', () => {
    expect(localToUtc('2026-01-15', '08:00', 'America/Chicago').toISOString()).toBe('2026-01-15T14:00:00.000Z')
    expect(localToUtc('2026-07-15', '08:00', 'America/Chicago').toISOString()).toBe('2026-07-15T13:00:00.000Z')
  })

  it('moves a nonexistent spring-forward time to the next valid time', () => {
    // 2026-03-08 02:30 does not exist in Chicago; 03:00 CDT = 08:00Z
    const t = localToUtc('2026-03-08', '02:30', 'America/Chicago')
    expect(t.toISOString() >= '2026-03-08T08:00:00.000Z').toBe(true)
    expect(t.toISOString() <= '2026-03-08T08:30:00.000Z').toBe(true)
  })

  it('resolves an ambiguous fall-back time to the first occurrence', () => {
    // 2026-11-01 01:30 happens twice in Chicago; first is CDT = 06:30Z
    expect(localToUtc('2026-11-01', '01:30', 'America/Chicago').toISOString()).toBe('2026-11-01T06:30:00.000Z')
  })

  it('does date arithmetic on local dates', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01')
    expect(weekday('2026-11-09')).toBe(1)
    expect(todayIn('Pacific/Auckland', new Date('2026-11-07T12:00:00Z'))).toBe('2026-11-08')
  })
})
