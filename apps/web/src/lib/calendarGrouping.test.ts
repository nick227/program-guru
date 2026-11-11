import { describe, expect, it } from 'vitest'
import { groupCalendarEntries, type SurfaceItem } from './calendarGrouping'

const makeItem = (overrides: Partial<SurfaceItem>): SurfaceItem => ({
  id: 'item-1',
  day: '2026-11-12',
  title: 'Bodyweight Warm-Up Flow',
  localTime: '07:30',
  programTitle: 'Beginner Core & Strength',
  enrollmentId: 'enroll-fitness',
  programDayIndex: 1,
  sessionPresentation: 'GROUPED',
  durationMinutes: 5,
  done: false,
  status: 'PLANNED',
  locked: false,
  ...overrides,
})

describe('groupCalendarEntries', () => {
  it('groups 6 Activities from a GROUPED enrollment on the same day into one workout entry', () => {
    const workout = [
      makeItem({ id: 'a1', title: 'Bodyweight Warm-Up Flow', localTime: '07:30', durationMinutes: 5 }),
      makeItem({ id: 'a2', title: 'Dead Bug Core Stability', localTime: '07:35', durationMinutes: 9 }),
      makeItem({ id: 'a3', title: 'Glute Bridge Lift', localTime: '07:45', durationMinutes: 9 }),
      makeItem({ id: 'a4', title: 'Forearm Plank Hold', localTime: '07:55', durationMinutes: 5, done: true, status: 'DONE' }),
      makeItem({ id: 'a5', title: 'Incline Push-Up Progression', localTime: '08:00', durationMinutes: 7 }),
      makeItem({ id: 'a6', title: 'Post-Workout Hip & Spine Cooldown', localTime: '08:05', durationMinutes: 5 }),
    ]

    const entries = groupCalendarEntries(workout)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      kind: 'group',
      enrollmentId: 'enroll-fitness',
      day: '2026-11-12',
      programTitle: 'Beginner Core & Strength',
      programDayIndex: 1,
      localTime: '07:30',
      totalMinutes: 40,
      doneCount: 1,
    })
    if (entries[0]?.kind === 'group') {
      expect(entries[0].items.map((i) => i.id)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6'])
    }
  })

  it('updates visible grouping when one Activity moves to another date (5 remain grouped, 1 renders standalone)', () => {
    const day1 = [
      makeItem({ id: 'a1', day: '2026-11-12', localTime: '07:30', durationMinutes: 5 }),
      makeItem({ id: 'a2', day: '2026-11-12', localTime: '07:35', durationMinutes: 9 }),
      makeItem({ id: 'a3', day: '2026-11-12', localTime: '07:45', durationMinutes: 9 }),
      makeItem({ id: 'a5', day: '2026-11-12', localTime: '08:00', durationMinutes: 7 }),
      makeItem({ id: 'a6', day: '2026-11-12', localTime: '08:05', durationMinutes: 5 }),
    ]
    const day2 = [
      makeItem({ id: 'a4', day: '2026-11-13', title: 'Forearm Plank Hold', localTime: '07:55', durationMinutes: 5 }),
    ]

    const d1Entries = groupCalendarEntries(day1)
    expect(d1Entries).toHaveLength(1)
    expect(d1Entries[0]?.kind).toBe('group')
    if (d1Entries[0]?.kind === 'group') {
      expect(d1Entries[0].items).toHaveLength(5)
      expect(d1Entries[0].totalMinutes).toBe(35)
    }

    const d2Entries = groupCalendarEntries(day2)
    expect(d2Entries).toHaveLength(1)
    expect(d2Entries[0]).toMatchObject({ kind: 'item', key: 'a4' })
  })

  it('keeps SEPARATE Programs ungrouped and never merges different enrollments or standalone items', () => {
    const mixed = [
      makeItem({ id: 'g1', enrollmentId: 'enroll-1', programTitle: 'Program A', localTime: '07:30' }),
      makeItem({ id: 'g2', enrollmentId: 'enroll-1', programTitle: 'Program A', localTime: '07:35' }),
      makeItem({ id: 'other-enroll-1', enrollmentId: 'enroll-2', programTitle: 'Program B', localTime: '07:30' }),
      makeItem({ id: 'other-enroll-2', enrollmentId: 'enroll-2', programTitle: 'Program B', localTime: '07:35' }),
      makeItem({ id: 'mind-1', enrollmentId: 'enroll-mind', sessionPresentation: 'SEPARATE', programTitle: 'Daily Mindfulness', localTime: '08:30' }),
      makeItem({ id: 'mind-2', enrollmentId: 'enroll-mind', sessionPresentation: 'SEPARATE', programTitle: 'Daily Mindfulness', localTime: '20:30' }),
      makeItem({ id: 'solo', enrollmentId: null, sessionPresentation: null, programTitle: null, localTime: '12:00' }),
      makeItem({ id: 'cancelled', enrollmentId: 'enroll-1', status: 'CANCELLED', localTime: '07:45' }),
    ]

    const entries = groupCalendarEntries(mixed)
    expect(entries.map((e) => e.kind)).toEqual(['group', 'group', 'item', 'item', 'item', 'item'])
    if (entries[0]?.kind === 'group' && entries[1]?.kind === 'group') {
      expect(entries[0].enrollmentId).toBe('enroll-1')
      expect(entries[0].items.map((i) => i.id)).toEqual(['g1', 'g2'])
      expect(entries[1].enrollmentId).toBe('enroll-2')
      expect(entries[1].items.map((i) => i.id)).toEqual(['other-enroll-1', 'other-enroll-2'])
    }
  })
})

