import React, { useId, useState } from 'react'
import { ChevronDown, ChevronUp, Dumbbell, X } from 'lucide-react'
import { ActivityTile, type ActivityTileDensity } from '@/components/calendar/ActivityTile'
import { resolveActivityCategory } from '@/lib/activityCategory'
import type { CalendarRenderEntry, SurfaceItem } from '@/lib/calendarGrouping'
import { formatTargetTime } from '@/lib/targetTime'
import { cn } from '@/lib/utils'

type GroupEntry = Extract<CalendarRenderEntry, { kind: 'group' }>

export function WorkoutGroupTile({
  group,
  density = 'card',
  nextItemId,
  selectedItemId = null,
  onSelectItem,
  onComplete,
  onChangeTime,
  draggable = false,
  completing = false,
}: {
  group: GroupEntry
  density?: ActivityTileDensity
  nextItemId?: string | null
  selectedItemId?: string | null
  onSelectItem?: (itemId: string) => void
  onComplete?: (itemId: string) => void
  onChangeTime?: (itemId: string, localTime: string | null) => void
  draggable?: boolean
  completing?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const panelId = useId()
  const total = group.items.length
  const allDone = total > 0 && group.doneCount === total
  const allNotParticipating =
    total > 0 &&
    group.items.every(
      (it) => it.notParticipating || it.status === 'NOT_PARTICIPATING',
    )
  const startLabel = formatTargetTime(group.localTime)
  const containsNext = Boolean(
    nextItemId && group.items.some((it) => it.id === nextItemId),
  )
  const category = resolveActivityCategory(
    group.programTitle,
    group.items[0]?.title ?? '',
    group.items[0]?.category,
  )
  const progressPct = total > 0 ? Math.round((group.doneCount / total) * 100) : 0

  const summaryParts = [
    containsNext && !allDone ? 'Up next' : null,
    startLabel,
    `${total} ${total === 1 ? 'exercise' : 'exercises'}`,
    group.totalMinutes ? `${group.totalMinutes} min` : null,
    `${group.doneCount}/${total} done`,
  ].filter(Boolean)

  if (density === 'month') {
    // Month (03-UX §5): one 44px card like any other; the workout opens over its cell, so the cell's
    // fixed height never grows. Escape or a click outside closes it.
    return (
      <div
        data-workout-group={group.enrollmentId}
        data-category={category}
        className={cn('calendar-tile calendar-chip calendar-chip--group', allDone && 'calendar-chip--done', allNotParticipating && 'opacity-70')}
      >
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={`${group.programTitle}, ${summaryParts.filter((p) => p !== 'Up next').join(', ')}`}
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((v) => !v)
          }}
          className="calendar-chip__trigger"
        >
          <span className="calendar-chip__text">
            <span className="calendar-chip__time">
              {startLabel ? `${startLabel} · ` : ''}
              {group.doneCount}/{total} done
            </span>
            <span className={cn('calendar-chip__title', allDone && 'calendar-chip__title--done')}>
              {group.programTitle}
            </span>
          </span>
          <ChevronDown size={14} className="calendar-chip__chevron" aria-hidden />
        </button>
        {expanded && (
          <GroupOverlay id={panelId} title={group.programTitle} count={total} onClose={() => setExpanded(false)}>
            {group.items.map((item) => (
              <ActivityTile
                key={item.id}
                item={item}
                density="month"
                selected={selectedItemId === item.id}
                onSelect={onSelectItem ? () => onSelectItem(item.id) : undefined}
                onComplete={onComplete}
                completing={completing}
                draggable={draggable}
              />
            ))}
          </GroupOverlay>
        )}
      </div>
    )
  }

  if (density === 'day') {
    return (
      <div
        data-workout-group={group.enrollmentId}
        data-category={category}
        className="flex flex-col gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            'calendar-tile calendar-tile--day calendar-badge calendar-badge--group',
            allDone && 'calendar-tile--complete',
          )}
        >
          <span className="calendar-badge__trigger">
            <span className="calendar-badge__icon" aria-hidden>
              <Dumbbell size={15} />
            </span>
            <span className={cn('calendar-badge__title', allDone && 'calendar-badge__title--done')}>
              {group.programTitle}
            </span>
            <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-muted">
              <span>{group.doneCount}/{total}</span>
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </span>
          </span>
        </button>

        {expanded && (
          <div id={panelId} className="flex flex-wrap gap-2 pl-2">
            {group.items.map((item) => (
              <ActivityTile
                key={item.id}
                item={item}
                density="day"
                isNext={nextItemId === item.id}
                selected={selectedItemId === item.id}
                onSelect={onSelectItem ? () => onSelectItem(item.id) : undefined}
                onComplete={onComplete}
                onChangeTime={onChangeTime}
                draggable={draggable}
                completing={completing}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <article
      data-workout-group={group.enrollmentId}
      data-category={category}
      className={cn(
        'calendar-workout-group',
        allDone && 'calendar-workout-group--complete',
        containsNext && !allDone && 'calendar-workout-group--next',
        allNotParticipating && 'opacity-75',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className="calendar-tile__thumbnail calendar-tile__fallback"
            aria-hidden
          >
            <Dumbbell size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-base font-semibold text-text">
                {group.programTitle}
              </span>
              {group.programDayIndex != null && (
                <span className="font-mono text-xs text-muted">
                  Day {group.programDayIndex}
                </span>
              )}
            </div>
            {summaryParts.length > 0 && (
              <p className="mt-0.5 text-xs text-muted">
                {summaryParts.join(' · ')}
              </p>
            )}
            {total > 0 && (
              <div
                className="mt-2 h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-surface-muted"
                aria-hidden
              >
                <div
                  className="h-full rounded-full bg-success transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:border-accent/45 hover:bg-surface-muted"
        >
          <span>{expanded ? 'Hide workout' : 'Show workout'}</span>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {expanded && (
        <div
          id={panelId}
          className="mt-3 space-y-2.5 border-t border-border/80 pt-3"
        >
          {group.items.map((item) => (
            <ActivityTile
              key={item.id}
              item={item}
              density={density}
              isNext={nextItemId === item.id}
              onComplete={onComplete}
              onChangeTime={onChangeTime}
              draggable={draggable}
              completing={completing}
            />
          ))}
        </div>
      )}
    </article>
  )
}

/** The expanded workout in Month: over its cell (the cell keeps its height), like +N more. */
function GroupOverlay({
  id,
  title,
  count,
  onClose,
  children,
}: {
  id: string
  title: string
  count: number
  onClose: () => void
  children: React.ReactNode
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [onClose])
  return (
    <div
      ref={ref}
      id={id}
      role="dialog"
      aria-label={`${title}, ${count} exercises`}
      className="calendar-month-overflow"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <div className="calendar-month-overflow__head">
        <span className="truncate">
          {title} · {count}
        </span>
        <button type="button" autoFocus aria-label="Close" className="calendar-month-overflow__close" onClick={onClose}>
          <X size={14} aria-hidden />
        </button>
      </div>
      <div className="calendar-month-overflow__list">{children}</div>
    </div>
  )
}

