import { describe, expect, it } from 'vitest'
import { dateLabel, isLocalDate } from './dates'

describe('dates utility', () => {
  describe('dateLabel', () => {
    it('formats YYYY-MM-DD local dates correctly', () => {
      expect(dateLabel('2026-11-11')).toBe('Nov 11')
      expect(dateLabel('2026-11-11', { month: 'long', day: 'numeric', year: 'numeric' })).toBe('November 11, 2026')
    })

    it('formats ISO 8601 timestamps without throwing RangeError', () => {
      expect(dateLabel('2026-11-11T14:32:00.000Z')).toBe('Nov 11')
      expect(dateLabel('2026-11-11T00:00:00Z')).toBe('Nov 11')
    })

    it('safely handles empty or invalid date strings without crashing', () => {
      expect(dateLabel('')).toBe('')
      expect(dateLabel('invalid-date')).toBe('invalid-date')
    })
  })

  describe('isLocalDate', () => {
    it('validates strictly formatted local dates', () => {
      expect(isLocalDate('2026-11-11')).toBe(true)
      expect(isLocalDate('2026-02-31')).toBe(false)
      expect(isLocalDate('2026-11-11T12:00:00Z')).toBe(false)
      expect(isLocalDate(null)).toBe(false)
    })
  })
})

