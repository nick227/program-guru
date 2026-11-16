import { describe, expect, it } from 'vitest'
import { MONTH_CELL, monthVisibleCount } from './calendarGeometry'

describe('Month cell geometry', () => {
  it('216px cells show up to three 44px cards, or two beside +N more', () => {
    expect([0, 1, 2, 3].map((n) => monthVisibleCount(n))).toEqual([0, 1, 2, 3])
    expect(monthVisibleCount(4)).toBe(2)
    expect(monthVisibleCount(12)).toBe(2)
  })

  it('what is shown always fits inside the cell', () => {
    const content = MONTH_CELL.height - 2 * MONTH_CELL.padding - MONTH_CELL.header - MONTH_CELL.gap
    for (const total of [1, 2, 3, 4, 9]) {
      const shown = monthVisibleCount(total)
      const more = total > shown ? MONTH_CELL.gap + MONTH_CELL.more : 0
      expect(shown * MONTH_CELL.card + Math.max(0, shown - 1) * MONTH_CELL.gap + more).toBeLessThanOrEqual(content)
    }
  })

  it('a shorter cell shows fewer, never zero when there are entries', () => {
    expect(monthVisibleCount(5, { ...MONTH_CELL, height: 140 })).toBe(1)
  })
})
