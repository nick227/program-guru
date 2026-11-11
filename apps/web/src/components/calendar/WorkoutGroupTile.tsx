import React, { useId, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { ActivityTile, type ActivityTileDensity } from '@/components/calendar/ActivityTile'
import type { CalendarRenderEntry, SurfaceItem } from '@/lib/calendarGrouping'
import { formatTargetTime } from '@/lib/targetTime'
import { cn } from '@/lib/utils'

type GroupEntry = Extract<CalendarRenderEntry, { kind: 'group' }>

export function WorkoutGroupTile({
  group,
  density = 'card',
  onComplete,
  onRemove,
  onChangeTime,
  draggable = false,
  draggingId = null,
  onDragStart,
  onDragEnd,
  completing = false,
  removing = false,
}: {
  group: GroupEntry
  density?: ActivityTileDensity
  onComplete?: (itemId: string) => void
  onRemove?: (itemId: string, scope: 'THIS_ONE' | 'THIS_AND_FUTURE') => void
  onChangeTime?: (itemId: string, localTime: string | null) => void
  draggable?: boolean
  draggingId?: string | null
  onDragStart?: (event: React.DragEvent<HTMLElement>, item: SurfaceItem) => void
  onDragEnd?: () => void
  completing?: boolean
  removing?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const panelId = useId()
  const total = group.items.length
  const allDone = total > 0 && group.doneCount === total
  const allNotParticipating = total > 0 && group.items.every((it) => it.notParticipating || it.status === 'NOT_PARTICIPATING')
  const startLabel = formatTargetTime(group.localTime)

  const summaryParts = [
    startLabel,
    `${total} ${total === 1 ? 'exercise' : 'exercises'}`,
    group.totalMinutes ? `${group.totalMinutes} min` : null,
    `${group.doneCount}/${total} done`,
  ].filter(Boolean)

  if (density === 'month') {
    return (
      <div
        data-workout-group={group.enrollmentId}
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
          {expanded ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
        </button>
        {expanded && (
          <div id={panelId} className="mt-1.5 space-y-1 border-t border-border/50 pt-1.5">
            {group.items.map((item) => (
              <ActivityTile
                key={item.id}
                item={item}
                density="month"
                onComplete={onComplete}
                onRemove={onRemove}
                completing={completing}
                removing={removing}
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
      className={cn(
        'rounded-lg border border-border bg-surface p-3 shadow-xs transition-colors',
        allDone && 'border-success/40 bg-success/5',
        allNotParticipating && 'opacity-75',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-semibold text-text">{group.programTitle}</span>
            {group.programDayIndex != null && (
              <span className="font-mono text-[11px] text-muted">Day {group.programDayIndex}</span>
            )}
          </div>
          {summaryParts.length > 0 && (
            <p className="mt-0.5 text-xs text-muted">{summaryParts.join(' · ')}</p>
          )}
        </div>

        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-text hover:bg-surface-muted"
        >
          <span>{expanded ? 'Hide workout' : 'Show workout'}</span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {expanded && (
        <div id={panelId} className="mt-3 space-y-2 border-t border-border pt-3">
          {group.items.map((item) => (
            <ActivityTile
              key={item.id}
              item={item}
              density={density}
              onComplete={onComplete}
              onRemove={onRemove}
              onChangeTime={onChangeTime}
              draggable={draggable}
              isDragging={draggingId === item.id}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              completing={completing}
              removing={removing}
            />
          ))}
        </div>
      )}
    </article>
  )
}

