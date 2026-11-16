import { describe, expect, it } from 'vitest'
import { runProgress } from './useEnrollmentProgress'

describe('Program run progress (MR 6)', () => {
  it('gives the share, percent and line every surface shows', () => {
    expect(runProgress({ completed: 3, planned: 12 })).toEqual({ completed: 3, planned: 12, ratio: 0.25, percent: 25, label: '3 of 12 done' })
    expect(runProgress({ completed: 1, planned: 3 })?.percent).toBe(33)
  })

  it('is null when nothing is planned, and never exceeds 100%', () => {
    expect(runProgress(null)).toBeNull()
    expect(runProgress({ completed: 0, planned: 0 })).toBeNull()
    expect(runProgress({ completed: 14, planned: 12 })).toMatchObject({ ratio: 1, percent: 100, label: '14 of 12 done' })
  })
})
