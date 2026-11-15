import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react'
import {
  useCalendar,
  useCancelCalendarItem,
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
import { MoveEntryDialog, type MoveTarget } from '@/components/calendar/MoveEntryDialog'
import { ScheduleDialog, type ScheduleTarget } from '@/components/schedule/AddToSchedule'
import { canMoveCalendarEntry } from '@/lib/calendarGrouping'
import { CalendarDiscoveryRail } from '@/components/calendar/CalendarDiscoveryRail'
import {
  RemoveFromCalendarDialog,
  type RemoveScope,
  type RemoveTarget,
} from '@/components/calendar/RemoveFromCalendarDialog'
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
import { isValidTargetTime, formatTargetTime } from '@/lib/targetTime'
import { useOnline } from '@/lib/useOnline'
import {
  CALENDAR_CATEGORY_FILTERS,
  resolveCalendarView,
  useCalendarPrefs,
  type CalendarCategoryFilter,
} from '@/lib/calendarPrefs'
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
  // View, filter and hours persist per user in this browser; a URL view (shared link) wins (03-UX §5).
  const [calendarPrefs, setCalendarPrefs] = useCalendarPrefs(userId)
  const categoryFilter = calendarPrefs.category
  const setCategoryFilter = (category: CalendarCategoryFilter) => setCalendarPrefs({ category })
  const showAllHours = calendarPrefs.allHours
  const setShowAllHours = (next: boolean | ((prev: boolean) => boolean)) =>
    setCalendarPrefs({ allHours: typeof next === 'function' ? next(showAllHours) : next })
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const datePickerRef = useRef<HTMLDivElement>(null)
  const viewMenuRef = useRef<HTMLDetailsElement>(null)
  const current = today(timezone)
  const requestedDay = params.get('day') ?? params.get('week')
  const selected = isLocalDate(requestedDay) ? requestedDay : current
  const view: View = resolveCalendarView(params.get('view'), calendarPrefs)
  const monthRange = monthBounds(selected)
  const range =
    view === 'day' ? { start: selected, end: selected } : monthRange
  const calendar = useCalendar(range.start, range.end, true)
  const undo = useUndoCompletion()
  const quickComplete = useQuickCompleteCalendarItem()
  const updateItem = useUpdateCalendarItem()
  const cancelItem = useCancelCalendarItem()
  const [pendingTimes, setPendingTimes] = useState<Record<string, string | null>>({})
  // Entries removed in this session stay hidden while the Calendar refetches (no flash back).
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(() => new Set())
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null)
  // Month moves show at their new date at once; a failed write restores them (03-UX §5).
  const [pendingDates, setPendingDates] = useState<Record<string, string>>({})
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null)
  const [rescheduleTarget, setRescheduleTarget] = useState<ScheduleTarget | null>(null)
  const completionKeys = useRef(new Map<string, string>())
  const origin = `/calendar?${new URLSearchParams({
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

  // The View menu closes on any outside press, like the date picker.
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const menu = viewMenuRef.current
      if (menu?.open && !menu.contains(event.target as Node)) menu.open = false
    }
    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [])
  const closeViewMenu = () => {
    if (viewMenuRef.current) viewMenuRef.current.open = false
  }

  const updateCalendarParams = (nextView: View, nextDay = selected) => {
    if (nextView !== calendarPrefs.view) setCalendarPrefs({ view: nextView })
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

  const rawItems = useMemo(
    () => (calendar.data ?? []).filter((item) => !removedIds.has(item.id)),
    [calendar.data, removedIds],
  )
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
      day: pendingDates[item.id] ?? item.localDate,
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
      completionOpensAt: item.completionOpensAt,
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
    // A personal change leaves the gathering (10 §9.6).
    const raw = calendar.data?.find((row) => row.id === itemId)
    if (raw?.gatheringId && !window.confirm('Changing the time leaves this gathering. Continue?')) return
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

  const whenLabel = (localDate: string, localTime: string | null | undefined) =>
    [dateLabel(localDate, { weekday: 'short', month: 'short', day: 'numeric' }), formatTargetTime(localTime ?? null) ?? 'Any time'].join(' · ')

  // Month drag (03-UX §5): the date changes, the time stays. A recurring or gathering entry confirms
  // first; a single move happens at once with Undo. Same update operation as Reschedule (09 §4.8).
  const requestMoveItem = (itemId: string, toDay: string) => {
    const item = rawItems.find((row) => row.id === itemId)
    if (!item || item.localDate === toDay) return
    if (!canMoveCalendarEntry({ status: item.status, locked: item.locked })) {
      toast.error(item.status === 'DONE' ? 'Completed entries keep their date' : "This entry can't be moved")
      return
    }
    if (item.recurrenceId || item.gatheringId) {
      setMoveTarget({
        id: item.id,
        title: item.title,
        toDay,
        toLabel: whenLabel(toDay, item.localTime),
        recurring: Boolean(item.recurrenceId),
        inGathering: Boolean(item.gatheringId),
      })
      return
    }
    void moveItem(itemId, toDay, 'THIS_ONE')
  }

  const clearPendingDate = (itemId: string) =>
    setPendingDates((prev) => {
      const next = { ...prev }
      delete next[itemId]
      return next
    })

  const moveItem = async (itemId: string, toDay: string, scope: RemoveScope) => {
    const item = rawItems.find((row) => row.id === itemId)
    if (!item) return
    const fromDay = item.localDate
    const series = scope === 'THIS_AND_FUTURE' && Boolean(item.recurrenceId)
    setPendingDates((prev) => ({ ...prev, [itemId]: toDay }))
    try {
      const updated = await updateItem.mutateAsync({
        itemId,
        localDate: toDay,
        ...(item.recurrenceId ? { scope } : {}),
        expectedUpdatedAt: item.updatedAt ?? new Date().toISOString(),
      })
      setMoveTarget(null)
      const to = dateLabel(toDay, { weekday: 'short', month: 'short', day: 'numeric' })
      if (series) {
        // A series move re-creates the later entries, so there is no single entry to put back.
        toast.success(`Moved ${item.title} and the ones after it to start ${to}`)
        return
      }
      toast.success(`Moved ${item.title} to ${to}`, {
        action: {
          label: 'Undo',
          onClick: () => {
            setPendingDates((prev) => ({ ...prev, [itemId]: fromDay }))
            updateItem
              .mutateAsync({
                itemId,
                localDate: fromDay,
                ...(item.recurrenceId ? { scope: 'THIS_ONE' as const } : {}),
                expectedUpdatedAt: updated.updatedAt,
              })
              .then(() => toast.success(`${item.title} is back on ${dateLabel(fromDay, { weekday: 'short', month: 'short', day: 'numeric' })}`))
              .catch((err: unknown) => toast.error(err instanceof Error ? err.message : 'Could not undo the move'))
              .finally(() => clearPendingDate(itemId))
          },
        },
      })
    } catch (err) {
      setMoveTarget(null)
      toast.error(
        err instanceof Error && /changed|conflict|version/i.test(err.message)
          ? `${item.title} changed elsewhere, so it stays on ${dateLabel(fromDay, { weekday: 'short', month: 'short', day: 'numeric' })}`
          : err instanceof Error
            ? `Could not move ${item.title}: ${err.message}`
            : `Could not move ${item.title}`,
      )
    } finally {
      clearPendingDate(itemId)
    }
  }

  // Move to date from the panel (phones and keyboard): the shared Reschedule dialog, unchanged.
  const requestReschedule = (itemId: string) => {
    const item = rawItems.find((row) => row.id === itemId)
    if (!item || !canMoveCalendarEntry({ status: item.status, locked: item.locked })) return
    setRescheduleTarget({
      kind: 'item',
      id: item.id,
      title: item.title,
      localDate: item.localDate,
      localTime: item.localTime ?? null,
      recurrenceId: item.recurrenceId ?? null,
      gatheringId: item.gatheringId ?? null,
      updatedAt: item.updatedAt,
    })
  }

  const requestRemoveItem = (itemId: string) => {
    const item = rawItems.find((row) => row.id === itemId)
    if (!item || item.status === 'DONE') return
    const when = [
      dateLabel(item.localDate, { weekday: 'short', month: 'short', day: 'numeric' }),
      formatTargetTime(item.localTime) ?? 'Any time',
    ].join(' · ')
    setRemoveTarget({
      id: item.id,
      title: item.title,
      whenLabel: when,
      recurring: Boolean(item.recurrenceId),
      inGathering: Boolean(item.gatheringId),
    })
  }

  // Removing cancels the Calendar entry only (09 §4.8): never a completion, never the Activity.
  // The mutation resolves after the Calendar refetch, so a This-and-future removal shows exactly the
  // entries the server cancelled; the removed id is also hidden in case that refetch fails.
  const removeItem = async (itemId: string, scope: RemoveScope) => {
    const item = rawItems.find((row) => row.id === itemId)
    if (!item) return
    const effectiveScope: RemoveScope = item.recurrenceId ? scope : 'THIS_ONE'
    try {
      await cancelItem.mutateAsync({ itemId, scope: effectiveScope })
      setRemovedIds((prev) => new Set([...prev, itemId]))
      setRemoveTarget(null)
      if (selectedItemId === itemId) setSelectedItemId(null)
      toast.success(
        effectiveScope === 'THIS_AND_FUTURE'
          ? `Removed ${item.title} and the ones after it`
          : `Removed ${item.title} from your Calendar`,
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove it right now')
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

  // Day view with nothing selected: a compact rail of Activities to schedule (12 §5a).
  const discoveryRail = (
    <CalendarDiscoveryRail
      localDate={selected}
      dateLabel={dateLabel(selected)}
      scheduledActivityIds={rawItems.filter((it) => it.localDate === selected && it.status !== 'CANCELLED').map((it) => it.activityId)}
      onScheduled={(itemId) => setSelectedItemId(itemId)}
    />
  )

  // Day and Month share one selection and one panel; it holds while the entry is in the visible range.
  const selectedCalendarItem = useMemo(
    () =>
      filteredItems.find((it) => it.id === selectedItemId && it.status !== 'CANCELLED') ?? null,
    [filteredItems, selectedItemId],
  )

  // Month: selecting an entry also moves the selected day to it, so switching to Day keeps it.
  const selectItem = (itemId: string) => {
    setSelectedItemId(itemId)
    const day = filteredItems.find((it) => it.id === itemId)?.day
    if (view === 'month' && day && day !== selected) {
      const next = new URLSearchParams(params)
      next.set('day', day)
      next.delete('week')
      setParams(next, { replace: true })
    }
  }

  const selectedPanel = (
    <SelectedActivityPanel
      itemId={selectedItemId}
      calendarItem={selectedCalendarItem}
      onClose={() => setSelectedItemId(null)}
      onComplete={completeItem}
      onUndoComplete={undoCompleteItem}
      onChangeTime={changeItemTime}
      onRemove={requestRemoveItem}
      onReschedule={requestReschedule}
      completing={quickComplete.isPending}
      undoing={undo.isPending}
      removing={cancelItem.isPending}
      emptyContent={discoveryRail}
    />
  )

  useEffect(() => {
    if (calendar.isPending) return
    if (view === 'month') {
      if (selectedItemId && !selectedCalendarItem) setSelectedItemId(null)
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
  }, [view, selected, dayItems, selectedItemId, selectedCalendarItem, calendar.isPending, dayContext?.nextItem?.id])

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

  // Mobile's one-row toolbar uses the short form ("Sun, Nov 15" / "Nov 2026").
  const shortTitle =
    view === 'month'
      ? dateLabel(selected, { month: 'short', year: 'numeric' })
      : dateLabel(selected, { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <Page className="page--wide">
      {/* One row at every width (03-UX §5): date, Today, View. Previous/Next are desktop-only. */}
      <div className="calendar-toolbar" aria-label="Calendar controls">
        <div className="calendar-toolbar__row">
          <Button
            variant="outline"
            size="icon"
            className="calendar-toolbar__step"
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
              <h1 className="calendar-toolbar__title">
                <span className="calendar-toolbar__title-long">{title}</span>
                <span className="calendar-toolbar__title-short" aria-hidden>
                  {shortTitle}
                </span>
              </h1>
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
            className="calendar-toolbar__step"
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

          <details className="calendar-filter" ref={viewMenuRef}>
            <summary className="calendar-filter__trigger" aria-label="View options">
              <SlidersHorizontal size={15} aria-hidden />
              <span>View</span>
              {categoryFilter !== 'all' && (
                <span className="calendar-filter__active" aria-hidden />
              )}
            </summary>
            <div className="calendar-filter__menu calendar-view-menu">
              <div role="group" aria-label="Show" className="calendar-view-menu__group">
                {(['day', 'month'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    onClick={() => {
                      closeViewMenu()
                      if (v !== view) updateCalendarParams(v)
                    }}
                    className={cn(
                      'calendar-filter__option',
                      view === v && 'calendar-filter__option--selected',
                    )}
                  >
                    {v === 'day' ? 'Day' : 'Month'}
                  </button>
                ))}
              </div>
              {view === 'day' && (
                <div role="group" aria-label="Hours" className="calendar-view-menu__group">
                  {[
                    { all: false, label: 'Focused Hours' },
                    { all: true, label: 'All 24h' },
                  ].map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      aria-pressed={showAllHours === option.all}
                      title={option.all ? 'Show all 24 hours' : 'Show only Any time and hours with scheduled activities'}
                      onClick={() => {
                        closeViewMenu()
                        setShowAllHours(option.all)
                      }}
                      className={cn(
                        'calendar-filter__option',
                        showAllHours === option.all && 'calendar-filter__option--selected',
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
              <div role="group" aria-label="Filter activities" className="calendar-view-menu__filters">
                {CALENDAR_CATEGORY_FILTERS.map((chip) => {
                  const isSelected = categoryFilter === chip.id
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => {
                        closeViewMenu()
                        setCategoryFilter(chip.id)
                      }}
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
            </div>
          </details>
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
                onSelectItem={selectItem}
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

            {selectedPanel}
            {/* The side panel is desktop-only; phones get the rail below the timeline. */}
            {!selectedItemId && <div className="lg:hidden">{discoveryRail}</div>}
          </div>
        ) : (
          <>
            {/* Month: the same Selected Activity panel, beside the grid once an entry is selected. */}
            <div className={cn(selectedItemId && 'calendar-day-layout calendar-day-layout--month')}>
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
                  onSelectItem={selectItem}
                  onMoveItem={online ? requestMoveItem : undefined}
                  todayIso={current}
                  onItemScheduled={(itemId) => setSelectedItemId(itemId)}
                  onComplete={(itemId) => void completeItem(itemId)}
                  onChangeTime={(itemId, localTime) =>
                    void changeItemTime(itemId, localTime)
                  }
                  completing={quickComplete.isPending || !online}
                />
              </div>
              {selectedItemId && selectedPanel}
            </div>
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
            {calendar.data?.length === 0 && (
              <CalendarDiscoveryRail
                localDate={selected}
                dateLabel={dateLabel(selected)}
                scheduledActivityIds={[]}
              />
            )}
          </>
        )}
        {moveTarget && (
          <MoveEntryDialog
            key={`${moveTarget.id}-${moveTarget.toDay}`}
            target={moveTarget}
            pending={updateItem.isPending}
            onConfirm={(scope) => void moveItem(moveTarget.id, moveTarget.toDay, scope)}
            onClose={() => {
              if (!updateItem.isPending) setMoveTarget(null)
            }}
          />
        )}
        {rescheduleTarget && (
          <ScheduleDialog target={rescheduleTarget} onClose={() => setRescheduleTarget(null)} />
        )}
        {removeTarget && (
          <RemoveFromCalendarDialog
            key={removeTarget.id}
            target={removeTarget}
            pending={cancelItem.isPending}
            onConfirm={(scope) => void removeItem(removeTarget.id, scope)}
            onClose={() => {
              if (!cancelItem.isPending) setRemoveTarget(null)
            }}
          />
        )}
      </Stack>
    </Page>
  )
}
