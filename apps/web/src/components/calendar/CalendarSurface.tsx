import React, { useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { ActivityTile, type ActivityTileDensity } from '@/components/calendar/ActivityTile'
import { InlineActivityPicker } from '@/components/calendar/InlineActivityPicker'
import { WorkoutGroupTile } from '@/components/calendar/WorkoutGroupTile'
import { groupCalendarEntries, type CalendarRenderEntry, type SurfaceItem } from '@/lib/calendarGrouping'
import { formatHourLabel, formatTargetTime, isValidTargetTime } from '@/lib/targetTime'
import { cn } from '@/lib/utils'
import { useCalendarDrop } from '@/components/calendar/CalendarDnd'
import type { CalendarDropTarget } from '@/lib/calendarMove'
import { monthCellStyle, monthVisibleCount } from '@/lib/calendarGeometry'

export type { SurfaceItem }

export type CalendarDay = {
  id: string
  label: string
  number: string
  today?: boolean
  inCurrentMonth?: boolean
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
/** All 24h opens here unless an Activity or the current hour is earlier. */
const DAY_START_HOUR = 6

function getCurrentTimeInZone(timezone?: string) {
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  try {
    const now = new Date()
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now)
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
    const rawHour = Number(part('hour'))
    const hour = rawHour === 24 ? 0 : rawHour
    const minute = Number(part('minute'))
    const date = `${part('year')}-${part('month')}-${part('day')}`
    const suffix = hour >= 12 ? 'PM' : 'AM'
    const hour12 = hour % 12 === 0 ? 12 : hour % 12
    const label = `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`
    return { date, hour, minute, label }
  } catch {
    return { date: '', hour: 0, minute: 0, label: '' }
  }
}

function DayHourlyTable({
  day,
  items,
  timezone,
  showAllHours = false,
  onToggleAllHours,
  nextItemId,
  selectedItemId,
  onSelectItem,
  onItemScheduled,
  onComplete,
  onChangeTime,
  completing,
}: {
  day: CalendarDay
  items: SurfaceItem[]
  timezone?: string
  showAllHours?: boolean
  onToggleAllHours?: () => void
  nextItemId?: string | null
  selectedItemId?: string | null
  onSelectItem?: (itemId: string) => void
  onItemScheduled?: (itemId: string) => void
  onComplete?: (itemId: string) => void
  onChangeTime?: (itemId: string, localTime: string | null) => void
  completing?: boolean
}) {
  const [addingSlot, setAddingSlot] = useState<string | null>(null)
  const [showEarlyHours, setShowEarlyHours] = useState(false)
  const [now, setNow] = useState(() => getCurrentTimeInZone(timezone))

  useEffect(() => {
    setAddingSlot(null)
    setShowEarlyHours(false)
  }, [day.id])

  useEffect(() => {
    setNow(getCurrentTimeInZone(timezone))
    const timer = window.setInterval(() => {
      setNow(getCurrentTimeInZone(timezone))
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [timezone])

  const dayItems = items.filter((item) => item.day === day.id)
  const dayEntries = groupCalendarEntries(dayItems)
  const untimedEntries = dayEntries.filter((entry) => !isValidTargetTime(entry.localTime))
  const byHour = new Map<string, CalendarRenderEntry[]>()
  for (const entry of dayEntries) {
    if (!isValidTargetTime(entry.localTime)) continue
    const hourKey = entry.localTime!.slice(0, 2)
    const list = byHour.get(hourKey) ?? []
    list.push(entry)
    byHour.set(hourKey, list)
  }
  for (const list of byHour.values()) {
    list.sort((a, b) => (a.localTime ?? '').localeCompare(b.localTime ?? ''))
  }

  const isViewingToday = day.today || day.id === now.date
  const populatedHours = [...byHour.keys()].map(Number).sort((a, b) => a - b)

  // Focused: only the hours with Activities.
  // All 24h: the day opens at the earliest of 6 AM, the first Activity, and the current hour;
  // the quiet hours before it fold into one row instead of greeting people with empty midnight.
  const earlyStart = Math.min(
    DAY_START_HOUR,
    populatedHours[0] ?? DAY_START_HOUR,
    isViewingToday ? now.hour : DAY_START_HOUR,
  )
  const foldEarly = showAllHours && !showEarlyHours && earlyStart > 0

  const visibleHours = showAllHours
    ? foldEarly
      ? HOURS.slice(earlyStart)
      : HOURS
    : populatedHours

  const showAnyTimeRow = true

  const renderDayEntry = (entry: CalendarRenderEntry) =>
    entry.kind === 'group' ? (
      <WorkoutGroupTile
        key={entry.key}
        group={entry}
        density="day"
        nextItemId={nextItemId}
        selectedItemId={selectedItemId}
        onSelectItem={onSelectItem}
        onComplete={onComplete}
        onChangeTime={onChangeTime}
        draggable={Boolean(onChangeTime)}
        completing={completing}
      />
    ) : (
      <ActivityTile
        key={entry.key}
        item={entry.item}
        density="day"
        isNext={nextItemId === entry.item.id}
        selected={selectedItemId === entry.item.id}
        onSelect={onSelectItem ? () => onSelectItem(entry.item.id) : undefined}
        onComplete={onComplete}
        onChangeTime={onChangeTime}
        draggable={Boolean(onChangeTime)}
        completing={completing}
      />
    )

  return (
    <div className="calendar-day-schedule">
      <table className="calendar-day-table" aria-label="Day schedule">
        <tbody>
          {showAnyTimeRow && (
            <DropRow
              dropId={`slot:${day.id}:anytime`}
              target={{ date: day.id, time: null }}
              data-slot="anytime"
              onClick={() => setAddingSlot('anytime')}
              className={cn(
                'calendar-day-table__row calendar-day-table__row--anytime calendar-day-table__row--interactive',
                untimedEntries.length > 0 && 'calendar-day-table__row--populated',
                addingSlot === 'anytime' && 'calendar-day-table__row--adding',
              )}
            >
              <th scope="row" className="calendar-day-table__time">
                Any time
              </th>
              <td className="calendar-day-table__items">
                <div className="calendar-day-table__list">
                  {untimedEntries.map(renderDayEntry)}
                  {addingSlot === 'anytime' ? (
                    <InlineActivityPicker
                      day={day.id}
                      localTime={null}
                      onScheduled={(itemId) => onItemScheduled?.(itemId)}
                      onClose={() => setAddingSlot(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setAddingSlot('anytime')
                      }}
                      className="calendar-day-table__add-trigger"
                    >
                      <Plus size={14} aria-hidden />
                      <span>Add activity</span>
                    </button>
                  )}
                </div>
              </td>
            </DropRow>
          )}

          {foldEarly && (
            <tr className="calendar-day-table__row calendar-day-table__row--gap">
              <th scope="row" className="calendar-day-table__time" aria-hidden>
                ···
              </th>
              <td className="calendar-day-table__gap-cell">
                <button
                  type="button"
                  onClick={() => setShowEarlyHours(true)}
                  className="calendar-day-table__gap-btn"
                >
                  {formatHourLabel(0)} – {formatHourLabel(earlyStart - 1)} · Show earlier hours
                </button>
              </td>
            </tr>
          )}

          {visibleHours.map((hour, index) => {
            const prevHour = index > 0 ? visibleHours[index - 1]! : null
            const hasGap = !showAllHours && prevHour !== null && hour > prevHour + 1
            const gapHours = hasGap ? hour - prevHour - 1 : 0
            const hourKey = String(hour).padStart(2, '0')
            const slotTime = `${hourKey}:00`
            const hourEntries = byHour.get(hourKey) ?? []
            const isNowHour = isViewingToday && hour === now.hour
            const hasSelected =
              Boolean(selectedItemId) &&
              hourEntries.some((entry) =>
                entry.kind === 'group'
                  ? entry.items.some((it) => it.id === selectedItemId)
                  : entry.item.id === selectedItemId,
              )

            return (
              <React.Fragment key={hourKey}>
                {hasGap && onToggleAllHours && (
                  <tr className="calendar-day-table__row calendar-day-table__row--gap">
                    <th scope="row" className="calendar-day-table__time" aria-hidden>
                      ···
                    </th>
                    <td className="calendar-day-table__gap-cell">
                      <button
                        type="button"
                        onClick={onToggleAllHours}
                        className="calendar-day-table__gap-btn"
                      >
                        {gapHours} quiet {gapHours === 1 ? 'hour' : 'hours'} · Show all hours
                      </button>
                    </td>
                  </tr>
                )}
                <DropRow
                  dropId={`slot:${day.id}:${hourKey}`}
                  target={{ date: day.id, time: slotTime }}
                  data-slot={hourKey}
                  data-hour={hour}
                  onClick={() => setAddingSlot(hourKey)}
                  className={cn(
                    'calendar-day-table__row calendar-day-table__row--interactive',
                    hourEntries.length > 0 && 'calendar-day-table__row--populated',
                    isNowHour && 'calendar-day-table__row--now',
                    hasSelected && 'calendar-day-table__row--selected',
                    addingSlot === hourKey && 'calendar-day-table__row--adding',
                  )}
                >
                  <th scope="row" className="calendar-day-table__time">
                    <time dateTime={`${day.id}T${slotTime}`}>
                      {formatHourLabel(hour)}
                    </time>
                    {isNowHour && now.label && (
                      <span className="calendar-day-table__now-badge" aria-label={`Current time ${now.label}`}>
                        {now.label}
                      </span>
                    )}
                  </th>
                  <td className="calendar-day-table__items">
                    {isNowHour && (
                      <div
                        className="calendar-day-table__now-line"
                        style={{
                          top: `${Math.min(90, Math.max(10, (now.minute / 60) * 100))}%`,
                        }}
                        aria-hidden
                      />
                    )}
                    <div className="calendar-day-table__list">
                      {hourEntries.map(renderDayEntry)}
                      {addingSlot === hourKey ? (
                        <InlineActivityPicker
                          day={day.id}
                          localTime={slotTime}
                          onScheduled={(itemId) => onItemScheduled?.(itemId)}
                          onClose={() => setAddingSlot(null)}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setAddingSlot(hourKey)
                          }}
                          className="calendar-day-table__row-add"
                          aria-label={`Add activity at ${formatHourLabel(hour)}`}
                        >
                          <Plus size={13} aria-hidden />
                          <span>Add</span>
                        </button>
                      )}
                    </div>
                  </td>
                </DropRow>
              </React.Fragment>
            )
          })}

          {!showAllHours && onToggleAllHours && (
            <tr className="calendar-day-table__row calendar-day-table__row--gap">
              <th scope="row" className="calendar-day-table__time" aria-hidden>
                ···
              </th>
              <td className="calendar-day-table__gap-cell">
                <button
                  type="button"
                  onClick={onToggleAllHours}
                  className="calendar-day-table__gap-btn"
                >
                  Show all 24 hours
                </button>
              </td>
            </tr>
          )}

          {showAllHours && (
            <tr className="calendar-day-table__row calendar-day-table__row--end" aria-hidden="true">
              <th scope="row" className="calendar-day-table__time">
                12:00 AM
              </th>
              <td className="calendar-day-table__items" />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/** An hour (or Any time) row that accepts a dragged entry: drop sets that time (03-UX §5). */
function DropRow({
  dropId,
  target,
  className,
  children,
  ...rest
}: {
  dropId: string
  target: CalendarDropTarget
  className?: string
  children: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLTableRowElement>, 'className' | 'children'> & Record<`data-${string}`, unknown>) {
  const drop = useCalendarDrop(dropId, target)
  return (
    <tr
      ref={drop.setNodeRef}
      {...rest}
      className={cn(
        className,
        drop.valid && 'calendar-day-table__row--drop',
        drop.refused && 'calendar-day-table__row--no-drop',
      )}
    >
      {children}
    </tr>
  )
}

/** A Month grid date: selects, quick-adds on an empty spot, and accepts a dragged entry (keeps its time). */
function MonthCell({
  day,
  items,
  selected,
  canAdd,
  adding,
  onAdd,
  onCloseAdd,
  onSelect,
  onItemScheduled,
  children,
}: {
  day: CalendarDay
  items: SurfaceItem[]
  selected: boolean
  canAdd: boolean
  adding: boolean
  onAdd: (day: string) => void
  onCloseAdd: () => void
  onSelect: (day: string) => void
  onItemScheduled?: (itemId: string) => void
  children: React.ReactNode
}) {
  const drop = useCalendarDrop(`date:${day.id}`, { date: day.id })
  const count = items.filter((item) => item.day === day.id).length
  const label = `${day.label} ${day.number}`
  return (
    <section
      ref={drop.setNodeRef}
      aria-label={label}
      onClick={(event) => {
        // An empty spot adds an Activity on this date; entries, buttons and open layers keep their own clicks.
        if (!canAdd || adding) return
        if ((event.target as HTMLElement).closest('button, a, input, .calendar-chip, .calendar-month-overflow, .calendar-inline-picker')) return
        onAdd(day.id)
      }}
      className={cn(
        'calendar-month-cell',
        !day.inCurrentMonth && 'calendar-month-cell--outside',
        selected && 'calendar-month-cell--selected',
        day.today && 'calendar-month-cell--today',
        canAdd && 'calendar-month-cell--addable',
        drop.valid && 'calendar-month-cell--drop',
        drop.refused && 'calendar-month-cell--no-drop',
      )}
    >
      {drop.valid && drop.dragging && (
        // Where it lands: the date and its time, overlaid so the grid never reflows.
        <span className="calendar-month-cell__drop-hint" aria-hidden>
          Move here{drop.dragging.localTime ? ` · ${formatTargetTime(drop.dragging.localTime)}` : ''}
        </span>
      )}
      <div className="calendar-month-cell__head">
        {canAdd && !adding ? (
          <button
            type="button"
            onClick={() => onAdd(day.id)}
            aria-label={`Add an Activity on ${label}`}
            className="calendar-month-cell__add"
          >
            <Plus size={14} aria-hidden />
          </button>
        ) : (
          <span />
        )}
        {/* The date mark is the way into Day view: a 44px hit area around a 28px mark. */}
        <button
          type="button"
          aria-label={`Open ${label} in Day view${count ? `, ${count} Activities` : ''}`}
          aria-current={day.today ? 'date' : undefined}
          data-selected={selected || undefined}
          data-today={day.today || undefined}
          onClick={() => onSelect(day.id)}
          className="calendar-month-cell__date"
        >
          <span className="calendar-month-cell__num">{day.number}</span>
        </button>
      </div>
      {count === 0 && canAdd && !adding && (
        <span className="calendar-month-cell__empty-hint" aria-hidden>
          <Plus size={13} /> Add
        </span>
      )}
      {children}
      {adding && (
        <div className="calendar-month-add">
          <InlineActivityPicker
            day={day.id}
            localTime={null}
            onScheduled={(itemId) => {
              onCloseAdd()
              onItemScheduled?.(itemId)
            }}
            onClose={onCloseAdd}
          />
        </div>
      )}
    </section>
  )
}

/** A date in the phone/tablet strip: selects the day, and is a drop target for a long-pressed entry. */
function PickerDate({
  day,
  items,
  selected,
  onSelect,
}: {
  day: CalendarDay
  items: SurfaceItem[]
  selected: boolean
  onSelect: (day: string) => void
}) {
  const drop = useCalendarDrop(`pick:${day.id}`, { date: day.id })
  const dayItems = items.filter((item) => item.day === day.id)
  const count = dayItems.length
  const isCompleted = count > 0 && dayItems.every((it) => it.done || it.status === 'DONE')
  return (
    <button
      ref={drop.setNodeRef}
      type="button"
      aria-label={`${day.label} ${day.number}${count ? `, ${count} Activities` : ''}`}
      aria-pressed={selected}
      aria-current={day.today ? 'date' : undefined}
      onClick={() => onSelect(day.id)}
      className={cn(
        'calendar-month-date',
        !day.inCurrentMonth && 'calendar-month-date--outside',
        selected && 'calendar-month-date--selected',
        day.today && 'calendar-month-date--today',
        count > 0 && 'calendar-month-date--active',
        drop.valid && 'calendar-month-date--drop',
        drop.refused && 'calendar-month-date--no-drop',
      )}
    >
      <span>{day.number}</span>
      {count > 0 && (
        <span className={cn('calendar-month-count', isCompleted && 'text-success font-bold')}>{count}</span>
      )}
    </button>
  )
}

function DayItems({
  day,
  items,
  density = 'card',
  showTimeInMonth = false,
  onComplete,
  completing,
  showEmpty = true,
  selectedItemId = null,
  onSelectItem,
  draggable = false,
}: {
  day: CalendarDay
  items: SurfaceItem[]
  density?: ActivityTileDensity
  showTimeInMonth?: boolean
  onComplete?: (itemId: string) => void
  completing?: boolean
  showEmpty?: boolean
  selectedItemId?: string | null
  /** Month: a tile opens the Selected Activity panel instead of navigating. */
  onSelectItem?: (itemId: string) => void
  /** Month: open entries drag to another date (CalendarDnd). */
  draggable?: boolean
}) {
  const [showAll, setShowAll] = useState(false)
  const overflowRef = useRef<HTMLDivElement>(null)
  const rows = items.filter((item) => item.day === day.id)

  useEffect(() => {
    if (!showAll) return
    const onPointerDown = (event: MouseEvent) => {
      if (!overflowRef.current?.contains(event.target as Node)) setShowAll(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [showAll])

  if (!rows.length) {
    if (density !== 'month' && showEmpty) {
      return (
        <div className="calendar-empty-day">
          <p>No activities planned</p>
        </div>
      )
    }
    return null
  }

  const entries = groupCalendarEntries(rows)
  const renderEntry = (entry: CalendarRenderEntry) =>
    entry.kind === 'group' ? (
      <WorkoutGroupTile
        key={entry.key}
        group={entry}
        density={density}
        selectedItemId={selectedItemId}
        onSelectItem={onSelectItem}
        onComplete={onComplete}
        completing={completing}
      />
    ) : (
      <ActivityTile
        key={entry.key}
        item={entry.item}
        density={density}
        showTimeInMonth={showTimeInMonth}
        selected={selectedItemId === entry.item.id}
        onSelect={onSelectItem ? () => onSelectItem(entry.item.id) : undefined}
        onComplete={onComplete}
        completing={completing}
        draggable={draggable}
      />
    )

  if (density === 'day') {
    const slots = new Map<string, CalendarRenderEntry[]>()
    for (const entry of entries) {
      const time = entry.localTime?.slice(0, 5) || ''
      const slot = slots.get(time) ?? []
      slot.push(entry)
      slots.set(time, slot)
    }
    const times = [...slots.keys()].sort((a, b) => {
      if (!a && !b) return 0
      if (!a) return -1
      if (!b) return 1
      return a.localeCompare(b)
    })
    return (
      <ol className="calendar-agenda" aria-label="Activities by start time">
        {times.map((time) => (
          <li key={time || 'untimed'} className="calendar-agenda__slot">
            <h3 className="calendar-agenda__time">
              {time ? (
                <time dateTime={`${day.id}T${time}`}>
                  {formatTargetTime(time) ?? time}
                </time>
              ) : (
                'Any time'
              )}
            </h3>
            <div className="calendar-agenda__items">
              {slots.get(time)!.map(renderEntry)}
            </div>
          </li>
        ))}
      </ol>
    )
  }

  if (density !== 'month') {
    return <div className="calendar-day-items">{entries.map(renderEntry)}</div>
  }
  // As many cards as the cell's geometry holds, reserving room for +N more (lib/calendarGeometry).
  const visible = monthVisibleCount(entries.length)

  return (
    <div className="calendar-day-items">
      {entries.slice(0, visible).map(renderEntry)}
      {entries.length > visible && (
        // Every entry stays reachable: +N more opens the whole day over its cell, so rows never grow.
        <button
          type="button"
          aria-expanded={showAll}
          aria-controls={`month-overflow-${day.id}`}
          className="calendar-month-more"
          onClick={(event) => {
            event.stopPropagation()
            setShowAll(true)
          }}
        >
          +{entries.length - visible} more
        </button>
      )}
      {showAll && (
        <div
          ref={overflowRef}
          id={`month-overflow-${day.id}`}
          role="dialog"
          aria-label={`${day.label} ${day.number}, ${entries.length} Activities`}
          className="calendar-month-overflow"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setShowAll(false)
          }}
        >
          <div className="calendar-month-overflow__head">
            <span>
              {day.label} {day.number} · {entries.length}
            </span>
            <button
              type="button"
              autoFocus
              aria-label="Close"
              className="calendar-month-overflow__close"
              onClick={() => setShowAll(false)}
            >
              <X size={14} aria-hidden />
            </button>
          </div>
          <div className="calendar-month-overflow__list">{entries.map(renderEntry)}</div>
        </div>
      )}
    </div>
  )
}

export function CalendarSurface({
  days,
  selected,
  onSelect,
  items,
  view = 'day',
  timezone,
  showAllHours = false,
  onToggleAllHours,
  nextItemId,
  selectedItemId,
  onSelectItem,
  onItemScheduled,
  onComplete,
  onChangeTime,
  todayIso,
  completing = false,
}: {
  days: CalendarDay[]
  selected: string
  onSelect: (day: string) => void
  /** Quick-add opens on today or later (drops follow the same rule, lib/calendarMove). */
  todayIso?: string
  items: SurfaceItem[]
  view?: 'day' | 'month'
  timezone?: string
  showAllHours?: boolean
  onToggleAllHours?: () => void
  nextItemId?: string | null
  selectedItemId?: string | null
  onSelectItem?: (itemId: string) => void
  onItemScheduled?: (itemId: string) => void
  onComplete?: (itemId: string) => void
  onChangeTime?: (itemId: string, localTime: string | null) => void
  completing?: boolean
}) {
  const selectedDay = days.find((day) => day.id === selected) ?? days[0]
  const [addingDay, setAddingDay] = useState<string | null>(null)
  if (!selectedDay) return null

  if (view === 'month') {
    return (
      <div className="calendar">
        <div className="calendar-month-weekdays" aria-hidden>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
            <span key={day} className="py-1">
              {day}
            </span>
          ))}
        </div>

        {/* Phones and tablets: the date strip is also where a long-pressed entry is dropped on a new date. */}
        <div className="calendar-month-picker xl:hidden" aria-label="Select a day">
          {days.map((day) => (
            <PickerDate
              key={day.id}
              day={day}
              items={items}
              selected={selected === day.id}
              onSelect={onSelect}
            />
          ))}
        </div>

        <div
          className="calendar-month-grid hidden xl:grid"
          aria-label="Monthly calendar"
          style={monthCellStyle() as React.CSSProperties}
        >
          {days.map((day) => (
            <MonthCell
              key={day.id}
              day={day}
              items={items}
              selected={selected === day.id}
              canAdd={!todayIso || day.id >= todayIso}
              adding={addingDay === day.id}
              onAdd={(id) => setAddingDay(id)}
              onCloseAdd={() => setAddingDay(null)}
              onSelect={onSelect}
              onItemScheduled={onItemScheduled}
            >
              <DayItems
                day={day}
                items={items}
                density="month"
                showTimeInMonth={showAllHours}
                selectedItemId={selectedItemId}
                onSelectItem={onSelectItem}
                draggable
                onComplete={onComplete}
                completing={completing}
                showEmpty={false}
              />
            </MonthCell>
          ))}
        </div>

        <section className="calendar-selected-day calendar-selected-day--mobile-only mt-6 pt-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-bold">
              {selectedDay.today
                ? 'Today'
                : `${selectedDay.label} ${selectedDay.number}`}
            </h2>
            <span className="text-xs text-muted">
              {items.filter((item) => item.day === selectedDay.id).length}{' '}
              {items.filter((item) => item.day === selectedDay.id).length === 1
                ? 'activity'
                : 'activities'}{' '}
              scheduled
            </span>
          </div>
          {items.some((item) => item.day === selectedDay.id) || showAllHours ? (
            <DayHourlyTable
              day={selectedDay}
              items={items}
              timezone={timezone}
              showAllHours={showAllHours}
              onToggleAllHours={onToggleAllHours}
              nextItemId={nextItemId}
              selectedItemId={selectedItemId}
              onSelectItem={onSelectItem}
              onItemScheduled={onItemScheduled}
              onComplete={onComplete}
              onChangeTime={onChangeTime}
              completing={completing}
            />
          ) : (
            <div className="calendar-empty-day">
              <p>No activities planned</p>
            </div>
          )}
        </section>
      </div>
    )
  }

  return (
    <section className="calendar-selected-day w-full">
      <DayHourlyTable
        day={selectedDay}
        items={items}
        timezone={timezone}
        showAllHours={showAllHours}
        onToggleAllHours={onToggleAllHours}
        nextItemId={nextItemId}
        selectedItemId={selectedItemId}
        onSelectItem={onSelectItem}
        onItemScheduled={onItemScheduled}
        onComplete={onComplete}
        onChangeTime={onChangeTime}
        completing={completing}
      />
    </section>
  )
}
