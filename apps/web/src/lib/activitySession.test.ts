import { describe, expect, it } from 'vitest'
import { formatElapsed, metricKey } from './activitySession'

describe('activity session controller helpers', () => {
  it('formats active time', () => {
    expect([0, 9, 75, 3725, -3].map(formatElapsed)).toEqual(['0s', '9s', '1m 15s', '1h 2m', '0s'])
  })

  it('keys a metric by its step and definition, so the same metric in two steps stays separate', () => {
    const base = { metricDefinitionId: 'reps' } as Parameters<typeof metricKey>[0]
    expect(metricKey({ ...base, instructionId: 'step-1' })).toBe('step-1:reps')
    expect(metricKey({ ...base, instructionId: null })).toBe(':reps')
  })
})
