import { describe, expect, it } from 'vitest'
import { completionOpen, completionOpensLabel } from './completionWindow'

// 09 §3: the server's instant decides; the label uses the item's own local date and time.
describe('completion window', () => {
  const future = new Date(Date.now() + 86_400_000).toISOString()
  it('is open once completionOpensAt has passed', () => {
    expect(completionOpen({ completionOpensAt: new Date(Date.now() - 1000).toISOString() })).toBe(true)
    expect(completionOpen({ completionOpensAt: future })).toBe(false)
  })
  it('labels a closed personal item by its date and a gathering by its date and time', () => {
    expect(completionOpensLabel({ completionOpensAt: future, localDate: '2026-11-16' })).toBe('Available Mon, Nov 16')
    expect(completionOpensLabel({ completionOpensAt: future, localDate: '2026-12-06', localTime: '15:00', gatheringId: 'g' })).toBe('Available Sun, Dec 6 at 3:00 PM')
    expect(completionOpensLabel({ completionOpensAt: new Date(0).toISOString(), localDate: '2026-11-16' })).toBeNull()
  })
})
