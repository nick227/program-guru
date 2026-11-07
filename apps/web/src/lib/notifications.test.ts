import { describe, expect, it } from 'vitest'
import {
  formatLocalTime,
  formatNotificationTimestamp,
  getAvailableTimezones,
  getNotificationMeta,
  isValidReminderTime,
  isValidTimezone,
  localNowTime,
  NOTIFICATION_META,
  resolveNotificationLink,
  selectUpcomingReminders,
  type CalendarItem,
} from './notifications'

const makeCalendarItem = (
  overrides: Partial<CalendarItem> = {},
): CalendarItem => ({
  id: '00000000-0000-4000-8000-000000000030',
  localDate: '2099-05-10',
  localTime: '09:30',
  status: 'PLANNED',
  title: 'Morning Mobility',
  activityId: '00000000-0000-4000-8000-000000000020',
  activityRevisionId: '00000000-0000-4000-8000-000000000021',
  programTitle: 'Daily Mobility',
  enrollmentId: '00000000-0000-4000-8000-000000000040',
  programDayIndex: 0,
  recurrenceId: null,
  conflict: false,
  locked: false,
  thumbnailUrl: null,
  participantAvatars: [],
  unreadCount: 0,
  updatedAt: '2026-11-07T12:00:00Z',
  ...overrides,
})

describe('notification metadata & contextual links', () => {
  it('provides metadata for every NotificationType', () => {
    expect(Object.keys(NOTIFICATION_META)).toHaveLength(15)
    expect(getNotificationMeta('ACTIVITY_REMINDER')).toEqual({
      category: 'reminder',
      label: 'Activity reminder',
      actionLabel: 'Open Activity',
    })
    expect(getNotificationMeta('GROUP_INVITE')).toEqual({
      category: 'group',
      label: 'Group invitation',
      actionLabel: 'Review invitation',
    })
    expect(getNotificationMeta('ACHIEVEMENT_EARNED').category).toBe(
      'achievement',
    )
    expect(getNotificationMeta('PROGRAM_UPDATE').category).toBe('program')
  })

  it('resolves valid relative deep links and blocks external URLs', () => {
    expect(
      resolveNotificationLink({
        type: 'ACTIVITY_REMINDER',
        deepLink: '/occurrences/123',
        actor: null,
      }),
    ).toBe('/occurrences/123')

    expect(
      resolveNotificationLink({
        type: 'FOLLOW_ACCEPTED',
        deepLink: 'https://evil.example/phish',
        actor: {
          id: '1',
          handle: 'coach_maya',
          displayName: 'Coach Maya',
          avatarUrl: null,
        },
      }),
    ).toBe('/u/coach_maya')

    expect(
      resolveNotificationLink({
        type: 'FOLLOW_REQUEST',
        deepLink: '//evil.example',
        actor: null,
      }),
    ).toBe('/settings/follow-requests')

    expect(
      resolveNotificationLink({
        type: 'ACHIEVEMENT_EARNED',
        deepLink: '',
        actor: null,
      }),
    ).toBe('/achievements')
  })
})

describe('timezone and reminder time helpers', () => {
  it('validates IANA timezones and 24-hour reminder times', () => {
    expect(isValidTimezone('America/Chicago')).toBe(true)
    expect(isValidTimezone('Asia/Tokyo')).toBe(true)
    expect(isValidTimezone('Invalid/Timezone_Name')).toBe(false)

    expect(isValidReminderTime('08:00')).toBe(true)
    expect(isValidReminderTime('23:59')).toBe(true)
    expect(isValidReminderTime('8:00')).toBe(false)
    expect(isValidReminderTime('24:00')).toBe(false)
  })

  it('computes local HH:mm time across different timezones for the same instant', () => {
    const fixedInstant = new Date('2026-06-15T13:45:00Z')
    expect(localNowTime('UTC', fixedInstant)).toBe('13:45')
    expect(localNowTime('America/Chicago', fixedInstant)).toBe('08:45')
    expect(localNowTime('America/New_York', fixedInstant)).toBe('09:45')
    expect(localNowTime('Asia/Tokyo', fixedInstant)).toBe('22:45')
  })

  it('formats 24-hour local times and notification timestamps', () => {
    expect(formatLocalTime('08:00')).toBe('8:00 AM')
    expect(formatLocalTime('00:05')).toBe('12:05 AM')
    expect(formatLocalTime('12:30')).toBe('12:30 PM')
    expect(formatLocalTime('17:45')).toBe('5:45 PM')
    expect(formatLocalTime(null)).toBe('Anytime')

    const formatted = formatNotificationTimestamp(
      '2026-11-07T14:30:00Z',
      'America/Chicago',
    )
    expect(formatted).toContain('Nov 7')
  })

  it('includes custom valid timezone in getAvailableTimezones', () => {
    const list = getAvailableTimezones('Pacific/Auckland')
    expect(list).toContain('Pacific/Auckland')
    expect(list).toContain('America/Chicago')
  })
})

describe('selectUpcomingReminders', () => {
  it('filters out completed, locked, and past activities and deduplicates identical occurrences', () => {
    const items: CalendarItem[] = [
      makeCalendarItem({
        id: 'item-past',
        localDate: '2020-01-01',
        title: 'Past Activity',
      }),
      makeCalendarItem({
        id: 'item-done',
        localDate: '2099-05-10',
        status: 'DONE',
        title: 'Completed Activity',
      }),
      makeCalendarItem({
        id: 'item-locked',
        localDate: '2099-05-10',
        locked: true,
        title: 'Locked Activity',
      }),
      makeCalendarItem({
        id: 'item-later',
        localDate: '2099-05-11',
        localTime: '07:00',
        title: 'Tomorrow Stretch',
      }),
      makeCalendarItem({
        id: 'item-today-1',
        localDate: '2099-05-10',
        localTime: '14:00',
        title: 'Afternoon Run',
      }),
      // Duplicate composite occurrence on the same date/time/activity/enrollment
      makeCalendarItem({
        id: 'item-today-dup',
        localDate: '2099-05-10',
        localTime: '14:00',
        title: 'Afternoon Run Duplicate',
      }),
      makeCalendarItem({
        id: 'item-today-early',
        localDate: '2099-05-10',
        localTime: null,
        title: 'Morning Squats',
      }),
    ]

    const reminders = selectUpcomingReminders(items, {
      timezone: 'America/Chicago',
      dailyReminderTime: '08:00',
    })

    expect(reminders.map((r) => r.id)).toEqual([
      'item-today-early',
      'item-today-1',
      'item-later',
    ])
    expect(reminders[0]?.effectiveReminderTime).toBe('08:00')
    expect(reminders[1]?.effectiveReminderTime).toBe('14:00')
  })
})

