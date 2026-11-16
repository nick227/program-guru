import { Link } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { useCalendar, useCurrentUser } from '@project/sdk'
import { Panel, Row, Stack } from '@/components/ui/Layout'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
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
    <Panel
      aria-label="Activity reminders"
      className="rounded-2xl border border-border/60 bg-surface/80 dark:bg-surface/50 p-4 sm:p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] backdrop-blur-xl"
    >
      <Stack className="gap-3.5">
        <Row className="justify-between items-start">
          <div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight">Reminders</h2>
            <p className="mt-0.5 text-xs text-muted">
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
        </Row>

        <ErrorMessage
          error={calendar.error}
          retry={() => void calendar.refetch()}
        />

        {calendar.isPending ? (
          <Loading />
        ) : upcoming.length === 0 ? (
          <p className="text-xs text-muted">
            No upcoming scheduled Activities in the next 7 days.
          </p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((item) => (
              <div
                key={item.id}
                data-testid={`upcoming-reminder-${item.id}`}
                className="group flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-surface/90 dark:bg-surface/70 p-3 sm:p-3.5 shadow-sm transition-all hover:border-border hover:shadow-md"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-amber-500/30 bg-gradient-to-br from-amber-500/20 to-orange-500/20 text-amber-500 shadow-[0_2px_8px_rgba(245,158,11,0.15)]">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-text truncate text-sm sm:text-[15px] tracking-tight">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {item.isToday ? 'Today' : dateLabel(item.localDate)} ·{' '}
                      {item.localTime
                        ? `Scheduled ${formatLocalTime(item.localTime)}`
                        : `Daily reminder ${formatLocalTime(item.effectiveReminderTime)}`}
                      {item.programTitle ? ` · ${item.programTitle}` : ''}
                    </p>
                  </div>
                </div>
                <Link
                  to={item.href}
                  aria-label={`Open ${item.title}`}
                  className="shrink-0 rounded-full border border-border bg-surface-muted/60 px-3.5 py-1.5 text-xs font-semibold text-text hover:bg-surface-muted hover:text-accent transition-colors"
                >
                  Open
                </Link>
              </div>
            ))}
          </div>
        )}
      </Stack>
    </Panel>
  )
}
