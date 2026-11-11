import React, { useEffect, useRef, useState } from 'react'
import { ActivityTile, type ActivityTileDensity } from '@/components/calendar/ActivityTile'
import { WorkoutGroupTile } from '@/components/calendar/WorkoutGroupTile'
import { groupCalendarEntries, type CalendarRenderEntry, type SurfaceItem } from '@/lib/calendarGrouping'
import { formatHourLabel, formatTargetTime, isValidTargetTime } from '@/lib/targetTime'
import { cn } from '@/lib/utils'

export type { SurfaceItem }

export type CalendarDay = {
  id: string
  label: string
  number: string
  today?: boolean
  inCurrentMonth?: boolean
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

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
  onComplete?: (itemId: string) => void
  onChangeTime?: (itemId: string, localTime: string | null) => void
  completing?: boolean
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropSlot, setDropSlot] = useState<string | null>(null)
  const [now, setNow] = useState(() => getCurrentTimeInZone(timezone))
  const draggingIdRef = useRef<string | null>(null)

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

  const visibleHours = (() => {
    if (showAllHours) return HOURS
    if (dayEntries.length === 0) return []
    const activeSet = new Set<number>()
    for (const hourKey of byHour.keys()) {
      activeSet.add(Number(hourKey))
    }
    if (isViewingToday) {
      activeSet.add(now.hour)
    }
    return [...activeSet].sort((a, b) => a - b)
  })()

  if (!showAllHours && dayEntries.length === 0) {
    return null
  }

  const showAnyTimeRow =
    showAllHours || untimedEntries.length > 0 || draggingId !== null

  const handleDragStart = (event: React.DragEvent<HTMLElement>, item: SurfaceItem) => {
    draggingIdRef.current = item.id
    event.dataTransfer.clearData()
    event.dataTransfer.setData('text/plain', item.id)
    event.dataTransfer.effectAllowed = 'move'
    window.requestAnimationFrame(() => {
      if (draggingIdRef.current === item.id) setDraggingId(item.id)
    })
  }

  const handleDragEnd = () => {
    draggingIdRef.current = null
    setDraggingId(null)
    setDropSlot(null)
  }

  const handleDragOver = (event: React.DragEvent<HTMLTableRowElement>, slotKey: string) => {
    if (!onChangeTime) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (dropSlot !== slotKey) setDropSlot(slotKey)
  }

  const handleDragLeave = (event: React.DragEvent<HTMLTableRowElement>, slotKey: string) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDropSlot((prev) => (prev === slotKey ? null : prev))
    }
  }

  const handleDrop = (
    event: React.DragEvent<HTMLTableRowElement>,
    slotKey: string,
    targetTime: string | null,
  ) => {
    event.preventDefault()
    const id = event.dataTransfer.getData('text/plain') || draggingIdRef.current || draggingId
    draggingIdRef.current = null
    setDraggingId(null)
    setDropSlot(null)
    if (!id || !onChangeTime) return
    const dragged = dayItems.find((it) => it.id === id)
    if (!dragged || dragged.locked || dragged.status === 'CANCELLED') return
    if (slotKey === 'anytime') {
      if (dragged.localTime) onChangeTime(id, null)
      return
    }
    const currentHour = isValidTargetTime(dragged.localTime) ? dragged.localTime.slice(0, 2) : null
    if (currentHour !== slotKey && targetTime) {
      onChangeTime(id, targetTime)
    }
  }

  const renderDayEntry = (entry: CalendarRenderEntry) =>
    entry.kind === 'group' ? (
      <WorkoutGroupTile
        key={entry.key}
        group={entry}
        density="day"
        nextItemId={nextItemId}
        onComplete={onComplete}
        onChangeTime={onChangeTime}
        draggable={Boolean(onChangeTime)}
        draggingId={draggingId}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        completing={completing}
      />
    ) : (
      <ActivityTile
        key={entry.key}
        item={entry.item}
        density="day"
        isNext={nextItemId === entry.item.id}
        onComplete={onComplete}
        onChangeTime={onChangeTime}
        draggable={Boolean(onChangeTime)}
        isDragging={draggingId === entry.item.id}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        completing={completing}
      />
    )

  return (
    <div className="calendar-day-schedule">
      <table className="calendar-day-table" aria-label="Day schedule">
        <tbody>
          {showAnyTimeRow && (
            <tr
              data-slot="anytime"
              onDragEnter={(event) => handleDragOver(event, 'anytime')}
              onDragOver={(event) => handleDragOver(event, 'anytime')}
              onDragLeave={(event) => handleDragLeave(event, 'anytime')}
              onDrop={(event) => handleDrop(event, 'anytime', null)}
              className={cn(
                'calendar-day-table__row calendar-day-table__row--anytime',
                untimedEntries.length > 0 && 'calendar-day-table__row--populated',
                dropSlot === 'anytime' && 'calendar-day-table__row--drop',
              )}
            >
              <th scope="row" className="calendar-day-table__time">
                Any time
              </th>
              <td className="calendar-day-table__items">
                {untimedEntries.length > 0 ? (
                  <div className="calendar-day-table__list">
                    {untimedEntries.map(renderDayEntry)}
                  </div>
                ) : (
                  <span className="calendar-day-table__empty-hint">
                    {draggingId ? 'Drop here for any time' : 'No untimed activities'}
                  </span>
                )}
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
                <tr
                  data-slot={hourKey}
                  data-hour={hour}
                  onDragEnter={(event) => handleDragOver(event, hourKey)}
                  onDragOver={(event) => handleDragOver(event, hourKey)}
                  onDragLeave={(event) => handleDragLeave(event, hourKey)}
                  onDrop={(event) => handleDrop(event, hourKey, slotTime)}
                  className={cn(
                    'calendar-day-table__row',
                    hourEntries.length > 0 && 'calendar-day-table__row--populated',
                    isNowHour && 'calendar-day-table__row--now',
                    dropSlot === hourKey && 'calendar-day-table__row--drop',
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
                    {hourEntries.length > 0 && (
                      <div className="calendar-day-table__list">
                        {hourEntries.map(renderDayEntry)}
                      </div>
                    )}
                  </td>
                </tr>
              </React.Fragment>
            )
          })}

          {!showAllHours && visibleHours.length === 0 && onToggleAllHours && (
            <tr className="calendar-day-table__row calendar-day-table__row--gap">
              <th scope="row" className="calendar-day-table__time" aria-hidden>
                Hours
              </th>
              <td className="calendar-day-table__gap-cell">
                <button
                  type="button"
                  onClick={onToggleAllHours}
                  className="calendar-day-table__gap-btn"
                >
                  Show all 24 hours to drag &amp; schedule by time
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

function DayItems({
  day,
  items,
  density = 'card',
  showTimeInMonth = false,
  onComplete,
  completing,
  showEmpty = true,
  onExpand,
}: {
  day: CalendarDay
  items: SurfaceItem[]
  density?: ActivityTileDensity
  showTimeInMonth?: boolean
  onComplete?: (itemId: string) => void
  completing?: boolean
  showEmpty?: boolean
  onExpand?: () => void
}) {
  const rows = items.filter((item) => item.day === day.id)

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
        onComplete={onComplete}
        completing={completing}
      />
    ) : (
      <ActivityTile
        key={entry.key}
        item={entry.item}
        density={density}
        showTimeInMonth={showTimeInMonth}
        onComplete={onComplete}
        completing={completing}
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

  return (
    <div className="calendar-day-items">
      {(density === 'month' ? entries.slice(0, 4) : entries).map(renderEntry)}
      {density === 'month' && entries.length > 4 && (
        <button
          type="button"
          className="calendar-month-more"
          onClick={onExpand}
        >
          +{entries.length - 4} more
        </button>
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
  onComplete,
  onChangeTime,
  completing = false,
}: {
  days: CalendarDay[]
  selected: string
  onSelect: (day: string) => void
  items: SurfaceItem[]
  view?: 'day' | 'month'
  timezone?: string
  showAllHours?: boolean
  onToggleAllHours?: () => void
  nextItemId?: string | null
  onComplete?: (itemId: string) => void
  onChangeTime?: (itemId: string, localTime: string | null) => void
  completing?: boolean
}) {
  const selectedDay = days.find((day) => day.id === selected) ?? days[0]
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

        <div className="calendar-month-picker xl:hidden" aria-label="Select a day">
          {days.map((day) => {
            const dayItems = items.filter((item) => item.day === day.id)
            const count = dayItems.length
            const isCompleted =
              count > 0 && dayItems.every((it) => it.done || it.status === 'DONE')

            return (
              <button
                key={day.id}
                type="button"
                aria-label={`${day.label} ${day.number}${count ? `, ${count} Activities` : ''}`}
                aria-pressed={selected === day.id}
                aria-current={day.today ? 'date' : undefined}
                disabled={!day.inCurrentMonth}
                onClick={() => onSelect(day.id)}
                className={cn(
                  'calendar-month-date',
                  selected === day.id && 'calendar-month-date--selected',
                  day.today && 'calendar-month-date--today',
                  count > 0 && 'calendar-month-date--active',
                )}
              >
                <span>{day.number}</span>
                {count > 0 && (
                  <span
                    className={cn(
                      'calendar-month-count',
                      isCompleted && 'text-success font-bold',
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="calendar-month-grid hidden xl:grid" aria-label="Monthly calendar">
          {days.map((day) => {
            const dayItems = items.filter((item) => item.day === day.id)
            const count = dayItems.length
            const isSelected = selected === day.id

            return (
              <section
                key={day.id}
                className={cn(
                  'calendar-month-cell border border-border px-2',
                  !day.inCurrentMonth && 'calendar-month-cell--outside opacity-40',
                  isSelected && 'calendar-month-cell--selected',
                  day.today && 'calendar-month-cell--today',
                )}
              >
                <div className="flex items-center justify-end mb-1.5">
                  <button
                    type="button"
                    disabled={!day.inCurrentMonth}
                    aria-label={`${day.label} ${day.number}${count ? `, ${count} Activities` : ''}`}
                    aria-pressed={isSelected}
                    aria-current={day.today ? 'date' : undefined}
                    onClick={() => onSelect(day.id)}
                    className={cn(
                      'inline-flex min-h-8 min-w-10 items-center gap-1.5 flex justify-center font-mono text-lg font-semibold transition-colors',
                      day.today && 'font-bold',
                      !day.today &&
                        isSelected &&
                        'bg-surface-raised font-bold text-foreground',
                      !day.today &&
                        !isSelected &&
                        'text-muted group-hover:text-foreground',
                    )}
                  >
                    <span>{day.number}</span>
                  </button>
                </div>

                <DayItems
                  day={day}
                  items={items}
                  density="month"
                  showTimeInMonth={showAllHours}
                  onExpand={() => onSelect(day.id)}
                  onComplete={onComplete}
                  completing={completing}
                  showEmpty={false}
                />
              </section>
            )
          })}
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
        onComplete={onComplete}
        onChangeTime={onChangeTime}
        completing={completing}
      />
    </section>
  )
}
