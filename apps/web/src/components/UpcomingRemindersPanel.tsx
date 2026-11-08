import { Link } from 'react-router-dom'
import { useCalendar, useCurrentUser } from '@project/sdk'
import { Panel, Row, Stack } from '@/components/ui/Layout'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { linkButton } from '@/components/Navigation'
import { addDays, dateLabel, today } from '@/lib/dates'
import {
  formatLocalTime,
  selectUpcomingReminders,
} from '@/lib/notifications'

export function UpcomingRemindersPanel({
  compact = false,
}: {
  compact?: boolean
}) {
  const me = useCurrentUser()
  const prefs = me.data?.data.preferences
  const timezone = prefs?.timezone ?? 'UTC'
  const notifPrefs = prefs?.notifications ?? {
    inAppReminders: true,
    dailyEmail: false,
    dailyReminderTime: '08:00',
    groupActivity: true,
    followRequests: true,
    mutedGroupIds: [],
  }
  const currentDay = today(timezone)
  const calendar = useCalendar(currentDay, addDays(currentDay, 6))
  const upcoming = selectUpcomingReminders(calendar.data ?? [], {
    timezone,
    dailyReminderTime: notifPrefs.dailyReminderTime,
    limit: compact ? 4 : 8,
  })

  return (
    <Panel aria-label="Activity reminders">
      <Stack className="gap-3">
        <Row className="justify-between">
          <div>
            <h2>Activity Reminders</h2>
            <p className="mt-1 text-xs text-muted">
              {timezone.replaceAll('_', ' ')} ·{' '}
              {notifPrefs.inAppReminders
                ? 'In-app reminders on'
                : 'In-app reminders paused'}{' '}
              ·{' '}
              {notifPrefs.dailyEmail
                ? `Daily email at ${formatLocalTime(notifPrefs.dailyReminderTime)}`
                : 'Daily email off'}
            </p>
          </div>
          <Link to="/settings#reminders" className={linkButton}>
            Preferences
          </Link>
        </Row>

        <ErrorMessage
          error={calendar.error}
          retry={() => void calendar.refetch()}
        />

        {calendar.isPending ? (
          <Loading />
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-muted">
            No upcoming scheduled Activities in the next 7 days.
          </p>
        ) : (
          <Stack className="gap-2">
            {upcoming.map((item) => (
              <div
                key={item.id}
                data-testid={`upcoming-reminder-${item.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-surface p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{item.title}</p>
                  <p className="mt-1 text-xs text-muted">
                    {item.isToday ? 'Today' : dateLabel(item.localDate)} ·{' '}
                    {item.localTime
                      ? `Scheduled ${formatLocalTime(item.localTime)}`
                      : `Daily reminder ${formatLocalTime(item.effectiveReminderTime)}`}
                    {item.programTitle ? ` · ${item.programTitle}` : ''}
                  </p>
                </div>
                <Link
                  to={item.href}
                  aria-label={`Open ${item.title}`}
                  className={linkButton}
                >
                  Open
                </Link>
              </div>
            ))}
          </Stack>
        )}
      </Stack>
    </Panel>
  )
}
