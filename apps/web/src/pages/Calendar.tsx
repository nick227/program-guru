import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
} from 'lucide-react'
import {
  useCalendar,
  useCurrentUser,
  useQuickCompleteCalendarItem,
  useUndoCompletion,
  useUpdateCalendarItem,
  useUpdatePreferences,
} from '@project/sdk'
import { toast } from 'sonner'
import { Page, Stack, Row, Panel } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { CalendarSurface } from '@/components/calendar/CalendarSurface'
import type { SurfaceItem } from '@/components/calendar/CalendarSurface'
import { DatePickerPopover } from '@/components/calendar/DatePickerPopover'
import { SelectedActivityPanel } from '@/components/calendar/SelectedActivityPanel'
import { resolveActivityCategory } from '@/lib/activityCategory'
import {
  addDays,
  addMonths,
  dateLabel,
  isLocalDate,
  monthBounds,
  monthGrid,
  today,
} from '@/lib/dates'
import { markDailyEmailPromptSeen } from '@/lib/notifications'
import { isValidTargetTime } from '@/lib/targetTime'
import { useOnline } from '@/lib/useOnline'
import { cn } from '@/lib/utils'
import { useDocumentTitle } from '@/lib/title'

type View = 'day' | 'month'

function currentHHMM(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date())
    const h = parts.find((p) => p.type === 'hour')?.value ?? '00'
    const m = parts.find((p) => p.type === 'minute')?.value ?? '00'
    return `${h === '24' ? '00' : h}:${m}`
  } catch {
    return '00:00'
  }
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
  const [showAllHours, setShowAllHours] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const datePickerRef = useRef<HTMLDivElement>(null)
  const current = today(timezone)
  const requestedDay = params.get('day') ?? params.get('week')
  const selected = isLocalDate(requestedDay) ? requestedDay : current
  const view: View = params.get('view') === 'month' ? 'month' : 'day'
  const monthRange = monthBounds(selected)
  const range =
    view === 'day' ? { start: selected, end: selected } : monthRange
  const calendar = useCalendar(range.start, range.end, true)
  const undo = useUndoCompletion()
  const quickComplete = useQuickCompleteCalendarItem()
  const updateItem = useUpdateCalendarItem()
  const [pendingTimes, setPendingTimes] = useState<Record<string, string | null>>({})
  const completionKeys = useRef(new Map<string, string>())
  const origin = `/?${new URLSearchParams({
    view,
    day: selected,
  }).toString()}`

  useEffect(() => {
    if (!datePickerOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (
        datePickerRef.current &&
        !datePickerRef.current.contains(event.target as Node)
      ) {
        setDatePickerOpen(false)
      }
    }
    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [datePickerOpen])

  const updateCalendarParams = (nextView: View, nextDay = selected) => {
    const next = new URLSearchParams(params)
    next.set('view', nextView)
    next.set('day', nextDay)
    next.delete('week')
    setParams(next)
  }

  const step = (direction: -1 | 1) => {
    const nextDay =
      view === 'month'
        ? addMonths(selected, direction)
        : addDays(selected, direction)
    updateCalendarParams(view, nextDay)
  }

  const clearReminderPrompt = () => {
    markDailyEmailPromptSeen(userId)
    const next = new URLSearchParams(params)
    next.delete('promptReminder')
    setParams(next, { replace: true })
  }

  const rawItems = calendar.data ?? []
  const effectiveTimes = new Map<string, number>()
  const hasPendingTimes = Object.keys(pendingTimes).length > 0
  if (hasPendingTimes) {
    for (const item of rawItems) {
      if (item.status === 'CANCELLED') continue
      const t = item.id in pendingTimes ? pendingTimes[item.id] : item.localTime
      if (!t) continue
      const key = `${item.localDate} ${t}`
      effectiveTimes.set(key, (effectiveTimes.get(key) ?? 0) + 1)
    }
  }

  const items: SurfaceItem[] = rawItems.map((item) => {
    const localTime =
      item.id in pendingTimes ? pendingTimes[item.id] : item.localTime
    const conflict = hasPendingTimes
      ? Boolean(localTime) &&
        (effectiveTimes.get(`${item.localDate} ${localTime}`) ?? 0) > 1
      : item.conflict
    return {
      id: item.id,
      day: item.localDate,
      title: item.title,
      localTime,
      programTitle: item.programTitle,
      enrollmentId: item.enrollmentId,
      programDayIndex: item.programDayIndex,
      sessionPresentation: item.sessionPresentation ?? 'SEPARATE',
      durationMinutes: item.durationMinutes ?? null,
      category: resolveActivityCategory(item.title, item.programTitle ?? ''),
      detail: [localTime, item.programTitle].filter(Boolean).join(' · '),
      done: item.status === 'DONE',
      notParticipating: item.status === 'NOT_PARTICIPATING',
      status: item.status,
      locked: item.locked,
      conflict,
      thumbnailUrl: item.thumbnailUrl,
      groupName: item.groupName,
      sharedCompletionCount: item.sharedCompletionCount,
      sessionStatus: item.sessionStatus,
      durationLabel: item.activeSeconds
        ? `${Math.floor(item.activeSeconds / 60)}m ${item.activeSeconds % 60}s recorded`
        : undefined,
      avatarUrls: item.participantAvatars,
      unreadCount: item.unreadCount,
      recurrenceId: item.recurrenceId,
      updatedAt: item.updatedAt,
      href: `/occurrences/${item.id}?returnTo=${encodeURIComponent(origin)}`,
    }
  })

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

  const undoCompleteItem = async (itemId: string) => {
    try {
      await undo.mutateAsync(itemId)
      toast.success('Completion undone')
    } catch {
      // Mutation error remains visible.
    }
  }

  const changeItemTime = async (itemId: string, localTime: string | null) => {
    const item = rawItems.find((row) => row.id === itemId)
    if (!item) return
    if ((item.localTime ?? null) === localTime) return
    setPendingTimes((prev) => ({ ...prev, [itemId]: localTime }))
    try {
      await updateItem.mutateAsync({
        itemId,
        localTime,
        expectedUpdatedAt: item.updatedAt ?? new Date().toISOString(),
      })
      toast.success(localTime ? 'Activity time updated' : 'Moved to Any time')
    } catch {
      // ErrorMessage displays the failure; pending time reverts below.
    } finally {
      setPendingTimes((prev) => {
        const next = { ...prev }
        delete next[itemId]
        return next
      })
    }
  }

  const filteredItems = useMemo(() => {
    if (categoryFilter === 'all') return items
    if (categoryFilter === 'group') {
      return items.filter(
        (it) => it.groupName || (it.avatarUrls && it.avatarUrls.length > 0),
      )
    }
    return items.filter((it) => it.category === categoryFilter)
  }, [items, categoryFilter])

  const dayContext = useMemo(() => {
    if (view !== 'day') return null
    const activeDayItems = filteredItems.filter(
      (it) => it.day === selected && it.status !== 'CANCELLED',
    )
    const total = activeDayItems.length
    if (total === 0) return null
    const completed = activeDayItems.filter(
      (it) => it.done || it.status === 'DONE',
    ).length
    const totalMinutes = activeDayItems.reduce(
      (sum, it) =>
        sum + (typeof it.durationMinutes === 'number' && it.durationMinutes > 0 ? it.durationMinutes : 0),
      0,
    )
    const remaining = activeDayItems.filter(
      (it) =>
        !it.done &&
        it.status !== 'DONE' &&
        !it.notParticipating &&
        it.status !== 'NOT_PARTICIPATING' &&
        it.status !== 'SKIPPED',
    )
    const nowTime = selected === current ? currentHHMM(timezone) : '00:00'
    const timedRemaining = remaining
      .filter((it) => isValidTargetTime(it.localTime))
      .sort((a, b) => a.localTime!.localeCompare(b.localTime!))
    const upcomingTimed =
      timedRemaining.find((it) => it.localTime! >= nowTime) ?? timedRemaining[0]
    const nextItem = upcomingTimed ?? remaining[0] ?? null
    return { total, completed, totalMinutes, nextItem }
  }, [view, filteredItems, selected, current, timezone])

  const dayItems = useMemo(
    () =>
      filteredItems.filter(
        (it) => it.day === selected && it.status !== 'CANCELLED',
      ),
    [filteredItems, selected],
  )

  const selectedCalendarItem = useMemo(
    () => dayItems.find((it) => it.id === selectedItemId) ?? null,
    [dayItems, selectedItemId],
  )

  useEffect(() => {
    if (view !== 'day') {
      setSelectedItemId(null)
      return
    }
    const isDesktop =
      typeof window !== 'undefined' &&
      window.matchMedia('(min-width: 1024px)').matches
    if (selectedItemId && dayItems.some((it) => it.id === selectedItemId)) {
      return
    }
    if (isDesktop && dayItems.length > 0) {
      setSelectedItemId(dayContext?.nextItem?.id ?? dayItems[0]!.id)
    } else if (selectedItemId && !dayItems.some((it) => it.id === selectedItemId)) {
      setSelectedItemId(null)
    }
  }, [view, selected, dayItems, selectedItemId, dayContext?.nextItem?.id])

  const days =
    view === 'month'
      ? monthGrid(selected).map((id) => ({
          id,
          label: dateLabel(id, { weekday: 'short' }),
          number: String(Number(id.slice(-2))),
          today: id === current,
          inCurrentMonth: id.slice(0, 7) === selected.slice(0, 7),
        }))
      : [
          {
            id: selected,
            label: dateLabel(selected, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            }),
            number: selected.slice(-2),
            today: selected === current,
          },
        ]

  const title =
    view === 'month'
      ? dateLabel(selected, { month: 'long', year: 'numeric' })
      : dateLabel(selected, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })

  return (
    <Page className="page--wide">
      <div className="calendar-toolbar" aria-label="Calendar controls">
        <div className="calendar-toolbar__row">
          <div className="calendar-toolbar__nav">
            <Button
              variant="outline"
              size="icon"
              aria-label={view === 'month' ? 'Previous month' : 'Previous day'}
              onClick={() => step(-1)}
            >
              <ChevronLeft size={18} />
            </Button>

            <div className="calendar-toolbar__heading-wrap" ref={datePickerRef}>
              <button
                type="button"
                className="calendar-toolbar__date-btn"
                aria-expanded={datePickerOpen}
                aria-haspopup="dialog"
                aria-label={`Change date, ${title}`}
                onClick={() => setDatePickerOpen((v) => !v)}
              >
                <h1 className="calendar-toolbar__title">{title}</h1>
                <ChevronDown
                  size={18}
                  aria-hidden
                  className={cn(
                    'calendar-toolbar__chevron',
                    datePickerOpen && 'rotate-180',
                  )}
                />
              </button>
              {datePickerOpen && (
                <DatePickerPopover
                  selected={selected}
                  todayDate={current}
                  onSelect={(day) => {
                    setDatePickerOpen(false)
                    updateCalendarParams(view, day)
                  }}
                  onClose={() => setDatePickerOpen(false)}
                />
              )}
            </div>

            <Button
              variant="outline"
              size="icon"
              aria-label={view === 'month' ? 'Next month' : 'Next day'}
              onClick={() => step(1)}
            >
              <ChevronRight size={18} />
            </Button>

            <Button
              variant="ghost"
              className={cn(
                'calendar-toolbar__today',
                selected === current && 'calendar-toolbar__today--current',
              )}
              onClick={() => updateCalendarParams(view, current)}
            >
              Today
            </Button>
          </div>

          <div className="calendar-toolbar__controls">
            <button
              type="button"
              aria-pressed={!showAllHours}
              onClick={() => setShowAllHours(false)}
              className={cn(
                'calendar-toolbar__toggle',
                !showAllHours && 'calendar-toolbar__toggle--active',
              )}
              title="Show only Any time and hours with scheduled activities"
            >
              <Clock3 size={15} aria-hidden />
              <span>Focused Hours</span>
            </button>

            <button
              type="button"
              aria-pressed={showAllHours}
              onClick={() => setShowAllHours(true)}
              className={cn(
                'calendar-toolbar__toggle calendar-toolbar__toggle--secondary',
                showAllHours && 'calendar-toolbar__toggle--active',
              )}
              title="Show all 24 hours"
            >
              <Clock3 size={15} aria-hidden />
              <span>All 24h</span>
            </button>

            <button
              type="button"
              aria-pressed={view === 'month'}
              onClick={() =>
                updateCalendarParams(view === 'month' ? 'day' : 'month')
              }
              className={cn(
                'calendar-toolbar__toggle calendar-toolbar__toggle--secondary',
                view === 'month' && 'calendar-toolbar__toggle--active',
              )}
            >
              <CalendarDays size={15} aria-hidden />
              <span>Month</span>
            </button>

            <details className="calendar-filter">
              <summary className="calendar-filter__trigger">
                <Filter size={15} aria-hidden />
                <span>Filters</span>
                {categoryFilter !== 'all' && (
                  <span className="calendar-filter__active" aria-hidden />
                )}
              </summary>
              <div
                className="calendar-filter__menu"
                aria-label="Filter activities"
              >
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
      </div>

      <Stack className="gap-5 mt-4">
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
          error={calendar.error || quickComplete.error || updateItem.error}
          retry={calendar.error ? () => void calendar.refetch() : undefined}
        />

        {calendar.isPending ? (
          <Loading />
        ) : view === 'day' ? (
          <div className="calendar-day-layout">
            <div className="calendar-day-layout__timeline">
              <CalendarSurface
                days={days}
                selected={selected}
                onSelect={(day) => updateCalendarParams('day', day)}
                items={filteredItems}
                view={view}
                timezone={timezone}
                showAllHours={showAllHours}
                onToggleAllHours={() => setShowAllHours((v) => !v)}
                nextItemId={dayContext?.nextItem?.id ?? null}
                selectedItemId={selectedItemId}
                onSelectItem={(itemId) => setSelectedItemId(itemId)}
                onItemScheduled={(itemId) => setSelectedItemId(itemId)}
                onComplete={(itemId) => void completeItem(itemId)}
                onChangeTime={(itemId, localTime) =>
                  void changeItemTime(itemId, localTime)
                }
                completing={quickComplete.isPending || !online}
              />
              {filteredItems.length === 0 && categoryFilter !== 'all' && (
                <Panel className="mt-4 text-center">
                  <Stack className="items-center py-4">
                    <p className="text-sm text-muted">
                      No activities match the active filter.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setCategoryFilter('all')}
                    >
                      Clear filter
                    </Button>
                  </Stack>
                </Panel>
              )}
            </div>

            <SelectedActivityPanel
              itemId={selectedItemId}
              calendarItem={selectedCalendarItem}
              onClose={() => setSelectedItemId(null)}
              onComplete={completeItem}
              onUndoComplete={undoCompleteItem}
              onChangeTime={changeItemTime}
              completing={quickComplete.isPending}
              undoing={undo.isPending}
            />
          </div>
        ) : (
          <>
            <CalendarSurface
              days={days}
              selected={selected}
              onSelect={(day) => updateCalendarParams('day', day)}
              items={filteredItems}
              view={view}
              timezone={timezone}
              showAllHours={showAllHours}
              onToggleAllHours={() => setShowAllHours((v) => !v)}
              nextItemId={dayContext?.nextItem?.id ?? null}
              onComplete={(itemId) => void completeItem(itemId)}
              onChangeTime={(itemId, localTime) =>
                void changeItemTime(itemId, localTime)
              }
              completing={quickComplete.isPending || !online}
            />
            {calendar.data?.length === 0 && (
              <Panel className="text-center">
                <Stack className="items-center py-6">
                  <h2>Nothing scheduled here</h2>
                  <Link
                    to={`/programs/new?returnTo=${encodeURIComponent(origin)}`}
                    className="btn btn--primary"
                  >
                    + Program
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
