import { describe, expect, it } from 'vitest'
import { resolveSessionEligibility } from './sessionEligibility'

const item = { status: 'PLANNED' as const, locked: false, localDate: '2026-11-16', localTime: null, gatheringId: null, completionOpensAt: '2026-01-01T00:00:00Z' }
const context = { todayIso: '2026-11-16', online: true, now: Date.parse('2026-11-16T12:00:00Z') }

describe('session eligibility shared by page, inline execution and Calendar', () => {
  it('uses the viewer day for Start and server completion time for Finish', () => {
    expect(resolveSessionEligibility(item, null, context).canStart).toBe(true)
    expect(resolveSessionEligibility({ ...item, localDate: '2026-11-17', completionOpensAt: '2026-11-17T00:00:00Z' }, null, context)).toMatchObject({ canStart: false, canFinish: false })
    expect(resolveSessionEligibility({ ...item, gatheringId: 'g', completionOpensAt: '2026-11-16T18:00:00Z' }, null, context)).toMatchObject({ canStart: true, canFinish: false })
  })
  it('blocks actions while offline, saving, locked or cancelled', () => {
    for (const [entry, options] of [
      [item, { ...context, online: false }], [item, { ...context, busy: true }],
      [{ ...item, locked: true }, context], [{ ...item, status: 'CANCELLED' as const }, context],
      [{ ...item, status: 'NOT_PARTICIPATING' as const }, context],
    ] as const) {
      expect(resolveSessionEligibility(entry, null, options)).toMatchObject({ canStart: false, canFinish: false, canResume: false })
    }
  })
  it('resumes the existing session and requires Undo before starting a completed entry', () => {
    expect(resolveSessionEligibility(item, 'PAUSED', context)).toMatchObject({ canStart: false, canResume: true, canFinish: true })
    expect(resolveSessionEligibility(item, 'ACTIVE', context)).toMatchObject({ canPause: true, canResume: false })
    expect(resolveSessionEligibility({ ...item, status: 'DONE' }, 'FINISHED', context)).toMatchObject({ canStart: false, canFinish: false, canUndo: true })
  })
})
