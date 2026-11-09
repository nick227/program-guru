import { describe, it, expect } from 'vitest'
import { selectPrograms, type PersonalProgram } from './programLibrary'
const row = (
  title: string,
  status: string,
  owned: boolean,
  sourceVersionId: string | null,
  planned: number,
  completed: number,
  date: string | null,
) =>
  ({
    program: {
      title,
      type: { label: 'Workout' },
      creator: { displayName: 'Taylor' },
    },
    status,
    owned,
    sourceVersionId,
    current: { planned, completed, lastParticipation: date },
  }) as PersonalProgram
const rows = [
  row('Zen', 'Active', true, null, 10, 5, '2026-11-07'),
  row('Alpha', 'Paused', true, 'source', 0, 0, null),
  row('Beta', 'Completed', false, null, 5, 5, '2026-11-08'),
]
describe('Program library selection', () => {
  it('searches title, type and creator case-insensitively and combines filters', () => {
    expect(selectPrograms(rows, ' tAYlor ', 'All', false, 'name')).toHaveLength(
      3,
    )
    expect(
      selectPrograms(rows, 'zen', 'Active', true, 'name').map(
        (r) => r.program.title,
      ),
    ).toEqual(['Zen'])
    expect(selectPrograms(rows, '', 'Paused', true, 'name')).toEqual([])
  })
  it('orders recent participation and name deterministically', () => {
    expect(
      selectPrograms(rows, '', 'All', false, 'recent').map(
        (r) => r.program.title,
      ),
    ).toEqual(['Beta', 'Zen', 'Alpha'])
    expect(
      selectPrograms(rows, '', 'All', false, 'name').map(
        (r) => r.program.title,
      ),
    ).toEqual(['Alpha', 'Beta', 'Zen'])
  })
  it('sorts real progress with unavailable progress last', () => {
    expect(
      selectPrograms(rows, '', 'All', false, 'progress').map(
        (r) => r.program.title,
      ),
    ).toEqual(['Beta', 'Zen', 'Alpha'])
  })
})
