import { describe, expect, it } from 'vitest'
import { peopleLine, reusableTodayItem } from './participation'

describe('reusableTodayItem', () => {
  const base = { activityId: 'a1', status: 'PLANNED' as const, enrollmentId: null, gatheringId: null }
  it('reuses a planned personal item of the same Activity', () => {
    expect(reusableTodayItem([{ ...base, id: 'i1' }], 'a1')).toBe('i1')
  })
  it('never reuses Program, gathering, finished or other-Activity items', () => {
    expect(
      reusableTodayItem(
        [
          { ...base, id: 'p', enrollmentId: 'e1' },
          { ...base, id: 'g', gatheringId: 'g1' },
          { ...base, id: 'd', status: 'DONE' },
          { ...base, id: 'o', activityId: 'a2' },
        ],
        'a1',
      ),
    ).toBeNull()
  })
})

describe('peopleLine', () => {
  it('states real counts only', () => {
    expect(peopleLine(null)).toBeNull()
    expect(peopleLine({ memberCount: 0, activeCount: 0, capacity: null })).toBeNull()
    expect(peopleLine({ memberCount: 4, activeCount: 0, capacity: null })).toBe('4 going')
    expect(peopleLine({ memberCount: 4, activeCount: 2, capacity: 6 })).toBe('4 of 6 going · 2 doing it now')
  })
})
