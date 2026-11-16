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

describe('entry state (MR 7)', () => {
  it('session first, then the entry; one label and tone for every surface', async () => {
    const { entryPhase, ENTRY_PHASE_LABEL, ENTRY_PHASE_TONE } = await import('./activitySession')
    expect(entryPhase('PLANNED', 'ACTIVE')).toBe('active')
    expect(entryPhase('PLANNED', 'PAUSED')).toBe('paused')
    expect(entryPhase('DONE', 'COMPLETED')).toBe('completed')
    expect(entryPhase('NOT_PARTICIPATING', undefined)).toBe('not-participating')
    expect(entryPhase('PLANNED', null)).toBe('ready')
    expect(ENTRY_PHASE_LABEL.ready).toBe('To do')
    expect(ENTRY_PHASE_TONE['not-participating']).toBe('unavailable')
  })
})
