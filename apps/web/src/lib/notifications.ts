import { buildProfileUrl } from './urls'
import type { components } from '@project/sdk'
import { dateLabel, safeReturn, today } from './dates'
import { formatTargetTime } from './targetTime'

type S = components['schemas']
export type NotificationItem = S['Notification']
export type NotificationType = S['NotificationType']
export type CalendarItem = S['CalendarItem']
export type UserPreferences = S['UserPreferences']

export type NotificationCategory =
  | 'all'
  | 'unread'
  | 'reminder'
  | 'group'
  | 'participation'
  | 'achievement'
  | 'program'

export interface NotificationMeta {
  category: Exclude<NotificationCategory, 'all' | 'unread'>
  label: string
  actionLabel: string
}

export const NOTIFICATION_META: Record<NotificationType, NotificationMeta> = {
  ACTIVITY_REMINDER: {
    category: 'reminder',
    label: 'Activity reminder',
    actionLabel: 'Open Activity',
  },
  DAILY_SUMMARY: {
    category: 'reminder',
    label: 'Daily summary',
    actionLabel: 'Open Calendar',
  },
  FOLLOW_REQUEST: {
    category: 'program',
    label: 'Follow request',
    actionLabel: 'Review requests',
  },
  FOLLOW_ACCEPTED: {
    category: 'program',
    label: 'Follow accepted',
    actionLabel: 'View profile',
  },
  GROUP_INVITE: {
    category: 'group',
    label: 'Group invitation',
    actionLabel: 'Review invitation',
  },
  MEMBER_JOINED: {
    category: 'group',
    label: 'Group member',
    actionLabel: 'Open Group',
  },
  COMPLETION_SHARED: {
    category: 'participation',
    label: 'Activity completed',
    actionLabel: 'View Activity',
  },
  COMPLETION_REACTION: {
    category: 'participation',
    label: 'Reaction',
    actionLabel: 'View reaction',
  },
  COMPLETION_COMMENT: {
    category: 'participation',
    label: 'Check-in comment',
    actionLabel: 'View comment',
  },
  GROUP_MEDIA_SHARED: {
    category: 'participation',
    label: 'Shared media',
    actionLabel: 'View media',
  },
  GROUP_MEDIA_COMMENT: {
    category: 'participation',
    label: 'Media comment',
    actionLabel: 'View discussion',
  },
  CONTRIBUTION_APPROVED: {
    category: 'program',
    label: 'Contribution approved',
    actionLabel: 'View media',
  },
  PROGRAM_ACCESS: {
    category: 'program',
    label: 'Program access',
    actionLabel: 'Open Program',
  },
  PROGRAM_UPDATE: {
    category: 'program',
    label: 'Program update',
    actionLabel: 'Review update',
  },
  ACHIEVEMENT_EARNED: {
    category: 'achievement',
    label: 'Achievement',
    actionLabel: 'View achievements',
  },
  PAYMENT_ISSUE: {
    category: 'program',
    label: 'Billing',
    actionLabel: 'Review billing',
  },
}

export function getNotificationMeta(type: NotificationType): NotificationMeta {
  return (
    NOTIFICATION_META[type] ?? {
      category: 'program',
      label: 'Notification',
      actionLabel: 'Open',
    }
  )
}

/**
 * Resolves a notification deepLink to a safe internal route with contextual fallback.
 */
export function resolveNotificationLink(
  notification: Pick<NotificationItem, 'type' | 'deepLink' | 'actor'>,
): string {
  const raw = notification.deepLink?.trim() ?? ''
  const safe = safeReturn(raw, '')
  if (safe) return safe

  switch (notification.type) {
    case 'FOLLOW_REQUEST':
      return '/settings/follow-requests'
    case 'FOLLOW_ACCEPTED':
      return notification.actor?.handle
        ? buildProfileUrl(notification.actor.handle)
        : '/'
    case 'ACHIEVEMENT_EARNED':
      return '/achievements'
    case 'PAYMENT_ISSUE':
      return '/settings/billing'
    default:
      return '/'
  }
}

export const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'UTC',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Singapore',
  'Australia/Sydney',
] as const

export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function getAvailableTimezones(currentTz?: string): string[] {
  const set = new Set<string>(COMMON_TIMEZONES)
  if (currentTz && isValidTimezone(currentTz)) {
    set.add(currentTz)
  }
  try {
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (browserTz && isValidTimezone(browserTz)) {
      set.add(browserTz)
    }
  } catch {
    /* ignore */
  }
  return Array.from(set)
}

export function isValidReminderTime(value: string): boolean {
  return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value)
}

export function localNowTime(timeZone: string, now = new Date()): string {
  const safeTz = isValidTimezone(timeZone) ? timeZone : 'UTC'
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('hour')}:${get('minute')}`
}

export function formatLocalTime(hhmm: string | null | undefined): string {
  if (!hhmm || !isValidReminderTime(hhmm)) return 'Anytime'
  return formatTargetTime(hhmm) ?? 'Anytime'
}

export function formatNotificationTimestamp(
  iso: string,
  timeZone?: string,
): string {
  const datePart = iso.slice(0, 10)
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed)) return datePart
  const safeTz = timeZone && isValidTimezone(timeZone) ? timeZone : 'UTC'
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: safeTz,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(parsed))
  } catch {
    return dateLabel(datePart)
  }
}

export interface UpcomingReminderItem {
  id: string
  localDate: string
  localTime: string | null
  effectiveReminderTime: string
  title: string
  programTitle: string | null
  isToday: boolean
  href: string
}

/**
 * Formats a CalendarItemStatus for participant display.
 * NOT_PARTICIPATING always renders as "Not participating", never "Missed".
 */
export function formatCalendarItemStatus(
  status: CalendarItem['status'],
): string {
  switch (status) {
    case 'DONE':
      return 'Completed'
    case 'NOT_PARTICIPATING':
      return 'Not participating'
    case 'SKIPPED':
      return 'Skipped'
    case 'CANCELLED':
      return 'Cancelled'
    default:
      return 'Planned'
  }
}

/**
 * Returns true when a calendar item counts as a pending scheduled Activity.
 * Pre-join Activities (NOT_PARTICIPATING or dated before participationStartDate) are excluded.
 */
export function isPendingCalendarItem(
  item: Pick<CalendarItem, 'status' | 'localDate' | 'locked'>,
  participationStartDate?: string | null,
): boolean {
  if (item.locked || item.status !== 'PLANNED') return false
  if (participationStartDate && item.localDate < participationStartDate) {
    return false
  }
  return true
}

/**
 * Computes deduplicated, chronologically sorted upcoming scheduled Activities
 * respecting the user's timezone and reminder preferences.
 */
export function selectUpcomingReminders(
  items: CalendarItem[],
  options: {
    timezone: string
    dailyReminderTime?: string
    participationStartDate?: string | null
    now?: Date
    limit?: number
  },
): UpcomingReminderItem[] {
  const safeTz = isValidTimezone(options.timezone) ? options.timezone : 'UTC'
  const currentDay = today(safeTz)
  const fallbackTime =
    options.dailyReminderTime && isValidReminderTime(options.dailyReminderTime)
      ? options.dailyReminderTime
      : '08:00'

  const seenOccurrenceIds = new Set<string>()
  const seenCompositeKeys = new Set<string>()
  const upcoming: UpcomingReminderItem[] = []

  const sorted = [...items].sort((a, b) => {
    if (a.localDate !== b.localDate) return a.localDate.localeCompare(b.localDate)
    const timeA = a.localTime ?? fallbackTime
    const timeB = b.localTime ?? fallbackTime
    if (timeA !== timeB) return timeA.localeCompare(timeB)
    return a.title.localeCompare(b.title)
  })

  for (const item of sorted) {
    if (!isPendingCalendarItem(item, options.participationStartDate)) continue
    if (item.localDate < currentDay) continue
    if (seenOccurrenceIds.has(item.id)) continue

    // Deduplicate identical scheduled occurrences on the same date/time/activity/enrollment
    const compositeKey = `${item.localDate}:${item.localTime ?? ''}:${item.activityId}:${item.enrollmentId ?? ''}`
    if (seenCompositeKeys.has(compositeKey)) continue

    seenOccurrenceIds.add(item.id)
    seenCompositeKeys.add(compositeKey)

    upcoming.push({
      id: item.id,
      localDate: item.localDate,
      localTime: item.localTime,
      effectiveReminderTime: item.localTime ?? fallbackTime,
      title: item.title,
      programTitle: item.programTitle,
      isToday: item.localDate === currentDay,
      href: `/occurrences/${item.id}`,
    })

    if (options.limit && upcoming.length >= options.limit) break
  }

  return upcoming
}

const DAILY_EMAIL_PROMPT_KEY_PREFIX = 'programs:daily-email-prompt-seen:'

export function hasSeenDailyEmailPrompt(userId: string): boolean {
  if (!userId || typeof window === 'undefined') return true
  try {
    return (
      window.localStorage.getItem(`${DAILY_EMAIL_PROMPT_KEY_PREFIX}${userId}`) ===
      '1'
    )
  } catch {
    return false
  }
}

export function markDailyEmailPromptSeen(userId: string): void {
  if (!userId || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      `${DAILY_EMAIL_PROMPT_KEY_PREFIX}${userId}`,
      '1',
    )
  } catch {
    /* ignore */
  }
}

