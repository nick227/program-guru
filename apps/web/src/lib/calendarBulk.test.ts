import { describe, expect, it } from 'vitest'
import { planBulk, planBulkMove, rangeBetween, runBulk } from './calendarBulk'

const e = (id: string, day: string, localTime: string | null = null, extra: Record<string, unknown> = {}) => ({ id, title: id, day, localTime, status: 'PLANNED', ...extra })

describe('bulk Calendar management (03-UX §5)', () => {
  it('acts on open entries only and says why the rest are skipped', () => {
    const plan = planBulk([
      e('b', '2026-11-19', '09:00', { recurrenceId: 'r1' }),
      e('a', '2026-11-18'),
      e('done', '2026-11-18', null, { status: 'DONE' }),
      e('locked', '2026-11-18', null, { locked: true }),
      e('g', '2026-11-20', null, { gatheringId: 'g1' }),
      e('skipped', '2026-11-20', null, { status: 'SKIPPED' }),
    ])
    expect(plan.apply.map((x) => x.id)).toEqual(['a', 'b', 'g'])
    expect(plan.skipped.map((s) => [s.entry.id, s.reason])).toEqual([
      ['done', 'completed'],
      ['locked', 'locked'],
      ['skipped', 'not open'],
    ])
    expect([plan.recurring, plan.inGathering]).toEqual([1, 1])
  })

  it('a multi-day Move keeps relative dates and times; a single day lands on the chosen date', () => {
    const multi = planBulkMove([e('x', '2026-11-20', '18:00'), e('y', '2026-11-18', '07:30'), e('z', '2026-11-18')], '2026-11-25')
    expect(multi.shift).toBe(7)
    expect(multi.moves.map((m) => [m.entry.id, m.toDate, m.entry.localTime])).toEqual([
      ['x', '2026-11-27', '18:00'],
      ['y', '2026-11-25', '07:30'],
      ['z', '2026-11-25', null],
    ])
    expect(planBulkMove([e('p', '2026-11-30'), e('q', '2026-11-30')], '2026-12-02').moves.map((m) => m.toDate)).toEqual(['2026-12-02', '2026-12-02'])
  })

  it('Shift-click range is in date/time order, either direction', () => {
    const list = [e('c', '2026-11-20'), e('a', '2026-11-18', '07:00'), e('b', '2026-11-18', '09:00'), e('d', '2026-11-21')]
    expect(rangeBetween(list, 'a', 'c')).toEqual(['a', 'b', 'c'])
    expect(rangeBetween(list, 'd', 'b')).toEqual(['b', 'c', 'd'])
  })

  it('runs every entry, reports each result and progress, and never stops at a failure', async () => {
    const progress: number[] = []
    const results = await runBulk(['ok1', 'bad', 'ok2'], async (id) => {
      if (id === 'bad') throw new Error('changed elsewhere')
      return id
    }, (done) => progress.push(done))
    expect(results.map((r) => r.ok)).toEqual([true, false, true])
    expect(results[1]).toMatchObject({ ok: false, error: 'changed elsewhere' })
    expect(progress).toEqual([1, 2, 3])
  })
})
