import { describe, expect, it } from 'vitest'
import { formatMediaDuration } from './mediaDuration'

describe('formatMediaDuration', () => {
  it('formats milliseconds as M:SS', () => {
    expect(formatMediaDuration(276000)).toBe('4:36')
    expect(formatMediaDuration(307000)).toBe('5:07')
    expect(formatMediaDuration(65000)).toBe('1:05')
  })

  it('returns null when the duration is unknown', () => {
    expect(formatMediaDuration(0)).toBeNull()
    expect(formatMediaDuration(null)).toBeNull()
    expect(formatMediaDuration(undefined)).toBeNull()
  })
})
