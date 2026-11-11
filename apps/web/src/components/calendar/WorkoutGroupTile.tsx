import React, { useId, useState } from 'react'
import { ChevronDown, ChevronUp, Dumbbell } from 'lucide-react'
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
  onComplete,
  onChangeTime,
  draggable = false,
  draggingId = null,
  onDragStart,
  onDragEnd,
  completing = false,
}: {
  group: GroupEntry
  density?: ActivityTileDensity
  nextItemId?: string | null
  onComplete?: (itemId: string) => void
  onChangeTime?: (itemId: string, localTime: string | null) => void
  draggable?: boolean
  draggingId?: string | null
  onDragStart?: (event: React.DragEvent<HTMLElement>, item: SurfaceItem) => void
  onDragEnd?: () => void
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
    return (
      <div
        data-workout-group={group.enrollmentId}
        data-category={category}
        className={cn(
          'rounded-md border border-accent/35 bg-accent/10 px-2 py-1 text-xs',
          allDone && 'border-success/40 bg-success/10',
          allNotParticipating && 'opacity-70',
        )}
      >
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((v) => !v)
          }}
          className="flex w-full items-center justify-between gap-1 text-left font-medium text-text hover:underline"
        >
          <span className="truncate">
            {startLabel ? `${startLabel} ` : ''}
            {group.programTitle} ({group.doneCount}/{total})
          </span>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          )}
        </button>
        {expanded && (
          <div
            id={panelId}
            className="mt-1.5 space-y-1 border-t border-border/50 pt-1.5"
          >
            {group.items.map((item) => (
              <ActivityTile
                key={item.id}
                item={item}
                density="month"
                onComplete={onComplete}
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
              isDragging={draggingId === item.id}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              completing={completing}
            />
          ))}
        </div>
      )}
    </article>
  )
}
