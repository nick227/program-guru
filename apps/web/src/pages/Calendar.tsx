import { useState, useMemo, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, Filter, List, BookOpen } from 'lucide-react'
import {
  useCalendar,
  useCalendarYear,
  useCurrentUser,
  useQuickCompleteCalendarItem,
  useCancelCalendarItem,
  useUndoCompletion,
  useUpdatePreferences,
} from '@project/sdk'
import { toast } from 'sonner'
import { Page, Stack, Row, Panel } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { CalendarSurface } from '@/components/calendar/CalendarSurface'
import type { SurfaceItem } from '@/components/calendar/CalendarSurface'
import { resolveActivityCategory } from '@/lib/activityCategory'
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
  current,
  onExpandMonth,
}: {
  onExpandMonth: (date: string) => void
  current: string
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
                    aria-current={date === current ? 'date' : undefined}
                    onClick={() => onChooseMonth(date)}
                    className={cn(
                      'year-month__date',
                      !belongsToMonth && 'year-month__date--outside',
                      dayCount > 0 && 'year-month__date--active',
                      date === current && 'year-month__date--today',
                    )}
                  >
                    {date.slice(-2)}
                    {dayCount > 0 && <span aria-hidden />}
                  </button>
                )
              })}
            </div>
            <div className="year-month__activities">
              {items.filter((item) => item.localDate >= start && item.localDate <= end).slice(0, 3).map((item) => (
                <Link key={item.id} className="year-month__activity" to={`/occurrences/${item.id}?returnTo=${encodeURIComponent(`/?view=year&day=${start}`)}`}>
                  <time dateTime={item.localDate}>{Number(item.localDate.slice(-2))}</time>
                  <span>{item.title}</span>
                  {item.status !== 'PLANNED' && <small>{item.status === 'DONE' ? 'Completed' : item.status === 'NOT_PARTICIPATING' ? 'Not participating' : item.status === 'SKIPPED' ? 'Skipped' : 'Removed'}</small>}
                </Link>
              ))}
              {count > 3 && <button className="calendar-month-more" onClick={() => onExpandMonth(start)}>View {count} Activities</button>}
            </div>
          </section>
        )
      })}
    </div>
  )
}

export function CalendarPage() {
  useDocumentTitle('Calendar')
  const me = useCurrentUser()
  const [params, setParams] = useSearchParams()
  const online = useOnline()
  const updatePrefs = useUpdatePreferences()
  const userId = me.data!.data.id
  const timezone = me.data!.data.preferences.timezone
  const defaultReminderTime =
    me.data!.data.preferences.notifications?.dailyReminderTime ?? '08:00'
  const [reminderTime, setReminderTime] = useState(defaultReminderTime)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
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
  const quickComplete = useQuickCompleteCalendarItem()
  const cancelItem = useCancelCalendarItem()
  const completionKeys = useRef(new Map<string, string>())
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
    localTime: item.localTime,
    programTitle: item.programTitle,
    category: resolveActivityCategory(item.title, item.programTitle ?? ''),
    detail: [item.localTime, item.programTitle].filter(Boolean).join(' · '),
    done: item.status === 'DONE',
    notParticipating: item.status === 'NOT_PARTICIPATING',
    status: item.status,
    locked: item.locked,
    conflict: item.conflict,
    thumbnailUrl: item.thumbnailUrl,
    groupName: item.groupName,
    sharedCompletionCount: item.sharedCompletionCount,
    sessionStatus: item.sessionStatus,
    durationLabel: item.activeSeconds ? `${Math.floor(item.activeSeconds / 60)}m ${item.activeSeconds % 60}s recorded` : undefined,
    avatarUrls: item.participantAvatars,
    unreadCount: item.unreadCount,
    recurrenceId: item.recurrenceId,
    href: `/occurrences/${item.id}?returnTo=${encodeURIComponent(origin)}`,
  }))

  const completeItem = async (itemId: string) => {
    const idempotencyKey =
      completionKeys.current.get(itemId) ?? crypto.randomUUID()
    completionKeys.current.set(itemId, idempotencyKey)
    try {
      await quickComplete.mutateAsync({ itemId, idempotencyKey })
      completionKeys.current.delete(itemId)
      toast.success('Activity marked complete')
    } catch {
      // Mutation error remains visible; keep the idempotency key for retry.
    }
  }
  const removeItem = async (
    itemId: string,
    scope: S['RecurrenceScope'],
  ) => {
    try {
      await cancelItem.mutateAsync({ itemId, scope })
      toast.success('Activity removed from Calendar')
    } catch {
      // Mutation error remains visible; the item stays on the Calendar.
    }
  }

  const filteredItems = useMemo(() => {
    if (categoryFilter === 'all') return items
    if (categoryFilter === 'group') {
      return items.filter((it) => it.groupName || (it.avatarUrls && it.avatarUrls.length > 0))
    }
    return items.filter((it) => it.category === categoryFilter)
  }, [items, categoryFilter])

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
      <header className="sub-header">
        <div className="sub-header__title">
          <h1 className="sub-header__heading">Calendar</h1>
        </div>
        <div className="sub-header__actions">
          <Link
            aria-label="Programs"
            to={`/library?returnTo=${encodeURIComponent(origin)}`}
            className="sub-header__btn"
          >
            <BookOpen size={16} aria-hidden />
            <span className="hidden lg:block">Programs</span>
          </Link>
          <Link
            aria-label="Community" to="/browse" className="sub-header__btn">
            <List size={16} aria-hidden />
            <span className="hidden lg:block">Community</span>
          </Link>
          <Link
            aria-label="Add Program"
            to={`/programs/new?returnTo=${encodeURIComponent(origin)}`}
            className="sub-header__btn sub-header__btn--primary"
          >
            <Plus size={16} aria-hidden />
            <span className="hidden lg:block">Add Program</span>
          </Link>
        </div>
      </header>

      <div className="mt-4" aria-label="Calendar controls">
        <div className="w-full my-4">
          <div className="flex justify-start items-center">
            <Button
              variant="outline"
              size="icon"
              aria-label={`Previous ${view}`}
              onClick={() => step(-1)}
            >
              <ChevronLeft size={18} />
            </Button>
            <h2 className="px-8">
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
              className="calendar-toolbar__today ml-2"
              onClick={() => updateCalendarParams(view, current)}
            >
              Today
            </Button>
          </div>

          </div>
          <div className="flex wrap-nowrap justify-end gap-4">

          <SegmentedControl
            ariaLabel="Calendar view"
            className="calendar-toolbar__views"
            value={view}
            onChange={(nextView) => updateCalendarParams(nextView as View)}
            options={[
              { value: 'day', label: 'Day' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
              { value: 'year', label: 'Year' },
            ]}
          />
          
          <details className="calendar-filter">
            <summary className="calendar-filter__trigger sub-header__btn">
              <Filter size={15} aria-hidden />
              <span>Filters</span>
              {categoryFilter !== 'all' && (
                <span className="calendar-filter__active" aria-hidden />
              )}
            </summary>
            <div className="calendar-filter__menu" aria-label="Filter activities">
              {[
                { id: 'all', label: 'All Activities' },
                { id: 'fitness', label: 'Fitness' },
                { id: 'wellness', label: 'Wellness' },
                { id: 'education', label: 'Education' },
                { id: 'finance', label: 'Finance' },
                { id: 'relationships', label: 'Relationships' },
                { id: 'group', label: 'Group' },
              ].map((chip) => {
                const isSelected = categoryFilter === chip.id
                return (
                  <button
                    key={chip.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setCategoryFilter(chip.id)}
                    className={cn(
                      'calendar-filter__option',
                      isSelected && 'calendar-filter__option--selected',
                    )}
                  >
                    {chip.label}
                  </button>
                )
              })}
            </div>
          </details>
        </div>

      </div>

      <Stack className="gap-6 mt-6">

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

        <ErrorMessage
          error={active.error || quickComplete.error || cancelItem.error}
          retry={
            active.error
              ? () => void active.refetch()
              : undefined
          }
        />
        {active.isPending ? (
          <Loading />
        ) : view === 'year' ? (
          <YearOverview
            current={current}
            year={Number(selected.slice(0, 4))}
            items={active.data ?? []}
            onExpandMonth={(date) => updateCalendarParams('month', date)}
            onChooseMonth={(date) => updateCalendarParams('day', date)}
          />
        ) : (
          <>
            <CalendarSurface
              days={days}
              selected={selected}
              onSelect={(day) => updateCalendarParams('day', day)}
              items={filteredItems}
              view={view}
              onComplete={(itemId) => void completeItem(itemId)}
              onRemove={(itemId, scope) => void removeItem(itemId, scope)}
              completing={quickComplete.isPending || !online}
              removing={cancelItem.isPending}
            />
            {active.data?.length === 0 && (
              <Panel className="text-center">
                <Stack className="items-center py-6">
                  <h2>Nothing scheduled here</h2>
                  <Link
                    to={`/programs/new?returnTo=${encodeURIComponent(origin)}`}
                    className="btn btn--primary"
                  >
                    + Program
                  </Link>
                  <Link
                    to={`/add-activity?day=${selected}`}
                    className="btn btn--link"
                  >
                    + Activity
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
