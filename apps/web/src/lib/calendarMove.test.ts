import { describe, expect, it } from 'vitest'
import { canDropOnTarget, resolveDrop } from './calendarMove'

const today = '2026-11-16'
const planned = { day: '2026-11-18', localTime: '07:30', status: 'PLANNED' }

describe('calendar drop rules (03-UX §5)', () => {
  it('a date cell moves the date and keeps the time', () => {
    expect(canDropOnTarget(planned, { date: '2026-11-20' }, today)).toBe(true)
    expect(resolveDrop(planned, { date: '2026-11-20' })).toEqual({ localDate: '2026-11-20', localTime: '07:30' })
    expect(canDropOnTarget(planned, { date: '2026-11-18' }, today)).toBe(false)
  })

  it('an hour slot sets the time; the same hour or a past date is refused', () => {
    expect(canDropOnTarget(planned, { date: '2026-11-18', time: '09:00' }, today)).toBe(true)
    expect(resolveDrop(planned, { date: '2026-11-18', time: '09:00' })).toEqual({ localDate: '2026-11-18', localTime: '09:00' })
    expect(canDropOnTarget(planned, { date: '2026-11-18', time: '07:00' }, today)).toBe(false)
    expect(canDropOnTarget(planned, { date: '2026-11-15', time: '09:00' }, today)).toBe(false)
  })

  it('Any time only for a timed entry on the same day', () => {
    expect(canDropOnTarget(planned, { date: '2026-11-18', time: null }, today)).toBe(true)
    expect(canDropOnTarget({ ...planned, localTime: null }, { date: '2026-11-18', time: null }, today)).toBe(false)
  })

  it('completed, skipped and locked entries never drop', () => {
    expect(canDropOnTarget({ ...planned, status: 'DONE' }, { date: '2026-11-20' }, today)).toBe(false)
    expect(canDropOnTarget({ ...planned, status: 'SKIPPED' }, { date: '2026-11-20' }, today)).toBe(false)
    expect(canDropOnTarget({ ...planned, locked: true }, { date: '2026-11-20' }, today)).toBe(false)
  })
})
