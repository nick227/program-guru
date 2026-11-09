import { describe, expect, it } from 'vitest'
import { timeAgo } from './relativeTime'

describe('timeAgo', () => {
  const now = Date.parse('2026-11-08T12:00:00Z')
  it('reads recent completions compactly', () => {
    expect(timeAgo('2026-11-08T11:59:30Z', now)).toBe('just now')
    expect(timeAgo('2026-11-08T11:55:00Z', now)).toBe('5m ago')
    expect(timeAgo('2026-11-08T09:00:00Z', now)).toBe('3h ago')
    expect(timeAgo('2026-11-06T12:00:00Z', now)).toBe('2d ago')
  })
  it('never shows a negative time for a clock slightly ahead', () => {
    expect(timeAgo('2026-11-08T12:00:20Z', now)).toBe('just now')
  })
})
