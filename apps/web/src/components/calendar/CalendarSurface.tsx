import React, { useRef, useState } from 'react'
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

function DayHourlyTable({
  day,
  items,
  onComplete,
  onRemove,
  onChangeTime,
  completing,
  removing,
}: {
  day: CalendarDay
  items: SurfaceItem[]
  onComplete?: (itemId: string) => void
  onRemove?: (itemId: string, scope: 'THIS_ONE' | 'THIS_AND_FUTURE') => void
  onChangeTime?: (itemId: string, localTime: string | null) => void
  completing?: boolean
  removing?: boolean
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropSlot, setDropSlot] = useState<string | null>(null)
  const draggingIdRef = useRef<string | null>(null)

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
        onComplete={onComplete}
        onRemove={onRemove}
        onChangeTime={onChangeTime}
        draggable={Boolean(onChangeTime)}
        draggingId={draggingId}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        completing={completing}
        removing={removing}
      />
    ) : (
      <ActivityTile
        key={entry.key}
        item={entry.item}
        density="day"
        onComplete={onComplete}
        onRemove={onRemove}
        onChangeTime={onChangeTime}
        draggable={Boolean(onChangeTime)}
        isDragging={draggingId === entry.item.id}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        completing={completing}
        removing={removing}
      />
    )

  return (
    <div className="calendar-day-schedule">
      <table className="calendar-day-table" aria-label="Day schedule">
        <tbody>
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

          {HOURS.map((hour) => {
            const hourKey = String(hour).padStart(2, '0')
            const slotTime = `${hourKey}:00`
            const hourEntries = byHour.get(hourKey) ?? []
            return (
              <tr
                key={hourKey}
                data-slot={hourKey}
                data-hour={hour}
                onDragEnter={(event) => handleDragOver(event, hourKey)}
                onDragOver={(event) => handleDragOver(event, hourKey)}
                onDragLeave={(event) => handleDragLeave(event, hourKey)}
                onDrop={(event) => handleDrop(event, hourKey, slotTime)}
                className={cn(
                  'calendar-day-table__row',
                  hourEntries.length > 0 && 'calendar-day-table__row--populated',
                  dropSlot === hourKey && 'calendar-day-table__row--drop',
                )}
              >
                <th scope="row" className="calendar-day-table__time">
                  <time dateTime={`${day.id}T${slotTime}`}>{formatHourLabel(hour)}</time>
                </th>
                <td className="calendar-day-table__items">
                  {hourEntries.length > 0 && (
                    <div className="calendar-day-table__list">
                      {hourEntries.map(renderDayEntry)}
                    </div>
                  )}
                </td>
              </tr>
            )
          })}

          <tr className="calendar-day-table__row calendar-day-table__row--end" aria-hidden="true">
            <th scope="row" className="calendar-day-table__time">
              12:00 AM
            </th>
            <td className="calendar-day-table__items" />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function DayItems({
  day,
  items,
  density = 'card',
  onComplete,
  onRemove,
  completing,
  removing,
  showEmpty = true,
  onExpand,
}: {
  day: CalendarDay
  items: SurfaceItem[]
  density?: ActivityTileDensity
  onComplete?: (itemId: string) => void
  onRemove?: (itemId: string, scope: 'THIS_ONE' | 'THIS_AND_FUTURE') => void
  completing?: boolean
  removing?: boolean
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
        onRemove={onRemove}
        completing={completing}
        removing={removing}
      />
    ) : (
      <ActivityTile
        key={entry.key}
        item={entry.item}
        density={density}
        onComplete={onComplete}
        onRemove={onRemove}
        completing={completing}
        removing={removing}
      />
    )

  if (density === 'day') {
    // Local wall-clock times are already in the calendar's timezone. Do not
    // convert them through the browser timezone or infer a session duration.
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
              {time ? <time dateTime={`${day.id}T${time}`}>{formatTargetTime(time) ?? time}</time> : 'Any time'}
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
      {density === 'month' && entries.length > 4 && <button type="button" className="calendar-month-more" onClick={onExpand}>+{entries.length - 4} more</button>}
    </div>
  )
}

export function CalendarSurface({
  days,
  selected,
  onSelect,
  items,
  view = 'week',
  onComplete,
  onRemove,
  onChangeTime,
  completing = false,
  removing = false,
}: {
  days: CalendarDay[]
  selected: string
  onSelect: (day: string) => void
  items: SurfaceItem[]
  view?: 'day' | 'week' | 'month'
  onComplete?: (itemId: string) => void
  onRemove?: (itemId: string, scope: 'THIS_ONE' | 'THIS_AND_FUTURE') => void
  onChangeTime?: (itemId: string, localTime: string | null) => void
  completing?: boolean
  removing?: boolean
}) {
  const selectedDay = days.find((day) => day.id === selected) ?? days[0]
  if (!selectedDay) return null

  // --- MONTH VIEW ---
  if (view === 'month') {
    return (
      <div className="calendar">
        {/* Weekday column headers */}
        <div className="calendar-month-weekdays hidden xl:grid" aria-hidden>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
            <span key={day} className="py-1">
              {day}
            </span>
          ))}
        </div>

        {/* Mobile quick day strip */}
        <div className="calendar-month-picker xl:hidden" aria-label="Select a day">
          {days.map((day) => {
            const dayItems = items.filter((item) => item.day === day.id)
            const count = dayItems.length
            const isCompleted = count > 0 && dayItems.every((it) => it.done || it.status === 'DONE')

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

        {/* Desktop/Tablet Month Grid */}
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
                      !day.today && isSelected && 'bg-surface-raised font-bold text-foreground',
                      !day.today && !isSelected && 'text-muted group-hover:text-foreground',
                    )}
                  >
                    <span>{day.number}</span>
                  </button>

                </div>

                <DayItems
                  day={day}
                  items={items}
                  density="month"
                  onExpand={() => onSelect(day.id)}
                  onComplete={onComplete}
                  onRemove={onRemove}
                  completing={completing}
                  removing={removing}
                  showEmpty={false}
                />
              </section>
            )
          })}
        </div>

        {/* Selected Day Agenda Drawer / Section beneath the month grid */}
        <section className="calendar-selected-day calendar-selected-day--mobile-only mt-6 pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-lg font-bold">
              {selectedDay.today ? 'Today' : `${selectedDay.label} ${selectedDay.number}`}
            </h3>
            <span className="text-xs text-muted">
              {items.filter((item) => item.day === selectedDay.id).length}{' '}
              {items.filter((item) => item.day === selectedDay.id).length === 1
                ? 'activity'
                : 'activities'}{' '}
              scheduled
            </span>
          </div>
          <DayItems
            day={selectedDay}
            items={items}
            density="day"
            onComplete={onComplete}
            onRemove={onRemove}
            completing={completing}
            removing={removing}
          />
        </section>
      </div>
    )
  }

  // --- DAY VIEW ---
  if (view === 'day') {
    return (
      <section className="calendar-selected-day w-full">
        <DayHourlyTable
          day={selectedDay}
          items={items}
          onComplete={onComplete}
          onRemove={onRemove}
          onChangeTime={onChangeTime}
          completing={completing}
          removing={removing}
        />
      </section>
    )
  }

  // --- WEEK VIEW ---
  return (
    <div className="calendar">
      {/* Modern Week Strip with date headers */}
      <div className="calendar-weekstrip" aria-label="Select a day">
        {days.map((day) => {
          const dayItems = items.filter((item) => item.day === day.id)
          const count = dayItems.length
          const isSelected = selected === day.id
          const completedCount = dayItems.filter((it) => it.done || it.status === 'DONE').length

          return (
            <button
              key={day.id}
              type="button"
              aria-label={`${day.label} ${day.number}${count ? `, ${count} Activities` : ''}`}
              aria-pressed={isSelected}
              aria-current={day.today ? 'date' : undefined}
              onClick={() => onSelect(day.id)}
              className={cn(
                'calendar-day p-2 transition-all duration-fast',
                isSelected && 'calendar-day--selected',
                day.today && 'calendar-day--today',
              )}
            >
              <span className="calendar-day__label text-xs uppercase" aria-hidden>
                {day.today ? 'Today' : day.label}
              </span>
              <span className="calendar-day__number font-mono text-xl font-bold my-0.5" aria-hidden>
                {day.number}
              </span>

              {count > 0 && (
                <span
                  className={cn(
                    'mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    isSelected
                      ? 'bg-surface-muted text-foreground'
                      : completedCount === count
                        ? 'bg-success/20 text-success'
                        : 'bg-surface-muted text-muted',
                  )}
                  aria-hidden
                >
                  {completedCount}/{count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* 7-Day Board Grid */}
      <div className="calendar-board mt-4">
        {days.map((day) => {
          const dayItems = items.filter((item) => item.day === day.id)
          const count = dayItems.length
          const isSelected = selected === day.id

          return (
            <section
              key={day.id}
              aria-label={day.label}
              className={cn(
                'calendar-column flex flex-col gap-3',
                !isSelected && 'calendar-column--hidden-mobile',
                day.today && 'calendar-column--today',
              )}
            >
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect(day.id)}
                className={cn(
                  'calendar-column__heading flex items-center justify-between p-2 rounded-lg transition-colors',
                  isSelected ? 'bg-surface-raised font-bold' : 'hover:bg-surface-muted',
                  day.today && 'calendar-column__heading--today',
                )}
              >
                <span className="font-display text-sm font-semibold">
                  {day.today ? `Today · ${day.label} ${day.number}` : `${day.label} ${day.number}`}
                </span>
                {count > 0 && (
                  <span className="font-mono text-xs text-muted">
                    {count}
                  </span>
                )}
              </button>

              <DayItems
                day={day}
                items={items}
                density="week"
                onComplete={onComplete}
                onRemove={onRemove}
                completing={completing}
                removing={removing}
              />
            </section>
          )
        })}
      </div>
    </div>
  )
}
