import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import {
  useCalendar,
  useCalendarYear,
  useCurrentUser,
  useUndoCompletion,
  useUpdatePreferences,
} from '@project/sdk'
import { toast } from 'sonner'
import { Page, Stack, Row, Panel } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { CalendarSurface } from '@/components/CalendarSurface'
import type { SurfaceItem } from '@/components/CalendarSurface'
import { UpcomingRemindersPanel } from '@/components/UpcomingRemindersPanel'
import { linkButton } from '@/components/Navigation'
import {
  addDays,
  addMonths,
  dateLabel,
  isLocalDate,
  monthBounds,
  monthGrid,
  today,
  weekOf,
} from '@/lib/dates'
import { markDailyEmailPromptSeen } from '@/lib/notifications'
import { useOnline } from '@/lib/useOnline'
import { cn } from '@/lib/utils'
import { useDocumentTitle } from '@/lib/title'
import type { components } from '@project/sdk'

type View = 'day' | 'week' | 'month' | 'year'
type S = components['schemas']

function YearOverview({
  year,
  items,
  onChooseMonth,
}: {
  year: number
  items: S['CalendarItem'][]
  onChooseMonth: (date: string) => void
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 12 }, (_, index) => {
        const month = String(index + 1).padStart(2, '0')
        const start = `${year}-${month}-01`
        const { end } = monthBounds(start)
        const firstWeek = weekOf(start)
        const count = items.filter(
          (item) => item.localDate >= start && item.localDate <= end,
        ).length
        return (
          <section key={month} className="year-month">
            <Row className="justify-between">
              <h2 className="font-display text-base">
                {dateLabel(start, { month: 'long' })}
              </h2>
              <span className="text-xs text-muted">
                {count} {count === 1 ? 'Activity' : 'Activities'}
              </span>
            </Row>
            <div className="year-month__grid" aria-label={`${dateLabel(start, { month: 'long' })} ${year}`}>
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, i) => (
                <span key={`${label}-${i}`} className="year-month__weekday">
                  {label}
                </span>
              ))}
              {Array.from({ length: 42 }, (_, dayIndex) => {
                const date = addDays(firstWeek, dayIndex)
                const belongsToMonth = date.slice(0, 7) === start.slice(0, 7)
                const dayCount = items.filter(
                  (item) => item.localDate === date,
                ).length
                return (
                  <button
                    key={date}
                    type="button"
                    disabled={!belongsToMonth}
                    aria-label={`${dateLabel(date, { month: 'long', day: 'numeric', year: 'numeric' })}${dayCount ? `, ${dayCount} Activities` : ''}`}
                    onClick={() => onChooseMonth(date)}
                    className={cn(
                      'year-month__date',
                      !belongsToMonth && 'year-month__date--outside',
                      dayCount > 0 && 'year-month__date--active',
                    )}
                  >
                    {date.slice(-2)}
                    {dayCount > 0 && <span aria-hidden />}
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

export function CalendarPage() {
  useDocumentTitle('Your week')
  const me = useCurrentUser()
  const [params, setParams] = useSearchParams()
  const online = useOnline()
  const updatePrefs = useUpdatePreferences()
  const userId = me.data!.data.id
  const timezone = me.data!.data.preferences.timezone
  const defaultReminderTime =
    me.data!.data.preferences.notifications?.dailyReminderTime ?? '08:00'
  const [reminderTime, setReminderTime] = useState(defaultReminderTime)
  const current = today(timezone)
  const requestedDay = params.get('day') ?? params.get('week')
  const selected = isLocalDate(requestedDay) ? requestedDay : current
  const view = (['day', 'week', 'month', 'year'].includes(
    params.get('view') ?? '',
  )
    ? params.get('view')
    : 'month') as View
  const weekStart = weekOf(selected)
  const monthRange = monthBounds(selected)
  const range =
    view === 'day'
      ? { start: selected, end: selected }
      : view === 'week'
        ? { start: weekStart, end: addDays(weekStart, 6) }
        : monthRange
  const calendar = useCalendar(range.start, range.end, view !== 'year')
  const yearCalendar = useCalendarYear(Number(selected.slice(0, 4)), view === 'year')
  const active = view === 'year' ? yearCalendar : calendar
  const undo = useUndoCompletion()
  const origin = `/?${new URLSearchParams({
    view,
    day: selected,
  }).toString()}`
  const updateCalendarParams = (nextView: View, nextDay = selected) => {
    const next = new URLSearchParams(params)
    next.set('view', nextView)
    next.set('day', nextDay)
    next.delete('week')
    setParams(next)
  }
  const step = (direction: -1 | 1) => {
    const nextDay =
      view === 'year'
        ? `${Number(selected.slice(0, 4)) + direction}-01-01`
        : view === 'month'
          ? addMonths(selected, direction)
          : addDays(selected, direction * (view === 'week' ? 7 : 1))
    updateCalendarParams(view, nextDay)
  }
  const clearReminderPrompt = () => {
    markDailyEmailPromptSeen(userId)
    const next = new URLSearchParams(params)
    next.delete('promptReminder')
    setParams(next, { replace: true })
  }
  const items: SurfaceItem[] = (active.data ?? []).map((item) => ({
    id: item.id,
    day: item.localDate,
    title: item.title,
    detail: [item.localTime, item.programTitle].filter(Boolean).join(' · '),
    done: item.status === 'DONE',
    notParticipating: item.status === 'NOT_PARTICIPATING',
    status: item.status,
    locked: item.locked,
    conflict: item.conflict,
    thumbnailUrl: item.thumbnailUrl,
    avatarUrls: item.participantAvatars,
    unreadCount: item.unreadCount,
    href: `/occurrences/${item.id}?returnTo=${encodeURIComponent(origin)}`,
  }))
  const days =
    view === 'month'
      ? monthGrid(selected).map((id) => ({
          id,
          label: dateLabel(id, { weekday: 'short' }),
          number: String(Number(id.slice(-2))),
          today: id === current,
          inCurrentMonth: id.slice(0, 7) === selected.slice(0, 7),
        }))
      : view === 'week'
        ? Array.from({ length: 7 }, (_, index) => {
            const id = addDays(weekStart, index)
            return {
              id,
              label: dateLabel(id, { weekday: 'short' }),
              number: String(Number(id.slice(-2))),
              today: id === current,
            }
          })
        : [{ id: selected, label: dateLabel(selected, { weekday: 'long', month: 'long', day: 'numeric' }), number: selected.slice(-2), today: selected === current }]

  const title =
    view === 'year'
      ? selected.slice(0, 4)
      : view === 'month'
        ? dateLabel(selected, { month: 'long', year: 'numeric' })
        : view === 'week'
          ? `${dateLabel(weekStart)} – ${dateLabel(addDays(weekStart, 6), { month: 'short', day: 'numeric', year: 'numeric' })}`
          : dateLabel(selected, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <Page className="page--wide">
      <Stack className="gap-6">
        <Row className="justify-between">
          <div>
            <p className="page-kicker">Your plan</p>
            <h1 className="page-title">Calendar</h1>
          </div>
          <Row>
            <Link
              to={`/programs/new?returnTo=${encodeURIComponent(origin)}`}
              className={linkButton}
            >
              <Plus size={16} />
              Add Program
            </Link>
            <Link
              to={`/add-activity?day=${selected}&returnTo=${encodeURIComponent(origin)}`}
              className={linkButton}
            >
              <Plus size={16} />
              Activity
            </Link>
          </Row>
        </Row>

        <section className="calendar-toolbar" aria-label="Calendar controls">
          <Row className="justify-between gap-4">
            <Row>
              <Button
                variant="outline"
                size="icon"
                aria-label={`Previous ${view}`}
                onClick={() => step(-1)}
              >
                <ChevronLeft size={18} />
              </Button>
              <h2 className="min-w-40 text-center font-display text-lg">
                {title}
              </h2>
              <Button
                variant="outline"
                size="icon"
                aria-label={`Next ${view}`}
                onClick={() => step(1)}
              >
                <ChevronRight size={18} />
              </Button>
              <Button
                variant="ghost"
                onClick={() => updateCalendarParams(view, current)}
              >
                Today
              </Button>
            </Row>
            <div className="calendar-view-switch" role="group" aria-label="Calendar view">
              {(['day', 'week', 'month', 'year'] as const).map((option) => (
                <Button
                  key={option}
                  variant={view === option ? 'default' : 'ghost'}
                  aria-pressed={view === option}
                  onClick={() => updateCalendarParams(option)}
                >
                  {option[0]!.toUpperCase() + option.slice(1)}
                </Button>
              ))}
            </div>
          </Row>
          <p className="mt-3 text-xs text-muted">
            {timezone.replaceAll('_', ' ')}
            {active.isFetching && !active.isPending ? ' · Refreshing…' : ''}
          </p>
        </section>

        {params.get('promptReminder') === '1' && (
          <Panel aria-label="Daily reminder prompt" className="panel--accent">
            <Stack className="gap-3">
              <div>
                <h2>
                  Want a daily email reminder on days you have Activities?
                </h2>
                <p className="mt-1 text-xs text-muted">
                  Optional · sent at most once per day in{' '}
                  {timezone.replaceAll('_', ' ')}.
                </p>
              </div>
              <Row className="items-end gap-2">
                <label className="field text-xs">
                  <span className="label">Reminder time</span>
                  <Input
                    type="time"
                    aria-label="Prompt reminder time"
                    value={reminderTime}
                    onChange={(e) => setReminderTime(e.target.value)}
                  />
                </label>
                <Button
                  disabled={!online}
                  loading={updatePrefs.isPending}
                  onClick={async () => {
                    try {
                      await updatePrefs.mutateAsync({
                        notifications: {
                          dailyEmail: true,
                          dailyReminderTime: reminderTime.slice(0, 5),
                        },
                      })
                      toast.success('Daily email reminders enabled')
                      clearReminderPrompt()
                    } catch {
                      /* shown below */
                    }
                  }}
                >
                  Enable daily email
                </Button>
                <Button variant="ghost" onClick={clearReminderPrompt}>
                  Not now
                </Button>
              </Row>
              <ErrorMessage error={updatePrefs.error} />
            </Stack>
          </Panel>
        )}

        {params.get('completed') && (
          <Panel>
            <Row className="justify-between">
              <p role="status">Activity finished</p>
              <Button
                variant="outline"
                disabled={!online}
                loading={undo.isPending}
                onClick={async () => {
                  try {
                    await undo.mutateAsync(params.get('completed')!)
                    const next = new URLSearchParams(params)
                    next.delete('completed')
                    setParams(next, { replace: true })
                    toast.success('Completion undone')
                  } catch {
                    /* error below */
                  }
                }}
              >
                Undo
              </Button>
            </Row>
            <ErrorMessage error={undo.error} />
          </Panel>
        )}

        <ErrorMessage error={active.error} retry={() => void active.refetch()} />
        {active.isPending ? (
          <Loading />
        ) : view === 'year' ? (
          <YearOverview
            year={Number(selected.slice(0, 4))}
            items={active.data ?? []}
            onChooseMonth={(date) => updateCalendarParams('month', date)}
          />
        ) : (
          <>
            <CalendarSurface
              days={days}
              selected={selected}
              onSelect={(day) => updateCalendarParams(view, day)}
              items={items}
              view={view}
            />
            {active.data && active.data.length > 0 && (
              <UpcomingRemindersPanel compact />
            )}
            {active.data?.length === 0 && (
              <Panel className="text-center">
                <Stack className="items-center py-6">
                  <h2>Nothing scheduled here</h2>
                  <Link
                    to={`/programs/new?returnTo=${encodeURIComponent(origin)}`}
                    className="btn btn--primary"
                  >
                    Add a Program
                  </Link>
                  <Link
                    to={`/add-activity?day=${selected}`}
                    className="btn btn--link"
                  >
                    Add Activity
                  </Link>
                </Stack>
              </Panel>
            )}
          </>
        )}
      </Stack>
    </Page>
  )
}
