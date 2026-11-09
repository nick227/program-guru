import { describe, expect, it } from 'vitest'
import { dayDifference, projectProgramPlacements } from './scheduleProjection'

describe('scheduleProjection', () => {
  it('computes exact whole-day differences between local dates', () => {
    expect(dayDifference('2026-11-08', '2026-11-08')).toBe(0)
    expect(dayDifference('2026-11-09', '2026-11-08')).toBe(1)
    expect(dayDifference('2026-11-07', '2026-11-08')).toBe(-1)
    expect(dayDifference('2026-12-01', '2026-11-01')).toBe(30)
  })

  it('projects fixed duration placements onto exact dates', () => {
    const placements = [
      { id: 'p1', activityId: 'a1', title: 'Squat', relativeDay: 0, localTime: '08:00' },
      { id: 'p2', activityId: 'a2', title: 'Bench', relativeDay: 2, localTime: null },
      { id: 'p3', activityId: 'a3', title: 'Deadlift', relativeDay: 4, localTime: '17:00' },
    ]

    const dates = [
      '2026-11-01', // day 0
      '2026-11-02', // day 1
      '2026-11-03', // day 2
      '2026-11-04', // day 3
      '2026-11-05', // day 4
      '2026-11-06', // day 5
    ]

    const projected = projectProgramPlacements({
      placements,
      startDate: '2026-11-01',
      durationDays: 14,
      dates,
    })

    expect(projected).toHaveLength(3)
    expect(projected[0]?.day).toBe('2026-11-01')
    expect(projected[0]?.title).toBe('Squat')
    expect(projected[1]?.day).toBe('2026-11-03')
    expect(projected[1]?.title).toBe('Bench')
    expect(projected[2]?.day).toBe('2026-11-05')
    expect(projected[2]?.title).toBe('Deadlift')
  })

  it('respects durationDays boundary for fixed programs', () => {
    const placements = [
      { id: 'p1', activityId: 'a1', title: 'Day 1', relativeDay: 0 },
      { id: 'p2', activityId: 'a2', title: 'Day 15', relativeDay: 14 },
    ]

    const dates = ['2026-11-01', '2026-11-15']

    const projected = projectProgramPlacements({
      placements,
      startDate: '2026-11-01',
      durationDays: 7, // 1-week program
      dates,
    })

    // Day 15 is outside the 7-day program duration
    expect(projected).toHaveLength(1)
    expect(projected[0]?.title).toBe('Day 1')
  })

  it('projects ongoing programs with rolling weekly projection', () => {
    const placements = [
      { id: 'p1', activityId: 'a1', title: 'Monday Run', relativeDay: 0 },
      { id: 'p2', activityId: 'a2', title: 'Wednesday Swim', relativeDay: 2 },
    ]

    // 3 weeks of dates
    const dates = [
      '2026-11-02', // Week 1 Mon (offset 0)
      '2026-11-04', // Week 1 Wed (offset 2)
      '2026-11-09', // Week 2 Mon (offset 7)
      '2026-11-11', // Week 2 Wed (offset 9)
      '2026-11-16', // Week 3 Mon (offset 14)
      '2026-11-18', // Week 3 Wed (offset 16)
    ]

    const projected = projectProgramPlacements({
      placements,
      startDate: '2026-11-02',
      durationDays: null, // ongoing
      dates,
    })

    expect(projected).toHaveLength(6)
    expect(projected[0]).toMatchObject({ day: '2026-11-02', title: 'Monday Run' })
    expect(projected[1]).toMatchObject({ day: '2026-11-04', title: 'Wednesday Swim' })
    expect(projected[2]).toMatchObject({ day: '2026-11-09', title: 'Monday Run' })
    expect(projected[3]).toMatchObject({ day: '2026-11-11', title: 'Wednesday Swim' })
    expect(projected[4]).toMatchObject({ day: '2026-11-16', title: 'Monday Run' })
    expect(projected[5]).toMatchObject({ day: '2026-11-18', title: 'Wednesday Swim' })
  })
})

