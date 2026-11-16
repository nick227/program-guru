import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  GripVertical,
  Users,
  X,
} from 'lucide-react'
import { AvatarStack } from '@/components/social/AvatarStack'
import { CategoryIcon } from '@/components/shared/CategoryIcon'
import { UnreadDot } from '@/components/shared/UnreadDot'
import { resolveActivityCategory, type ActivityCategory } from '@/lib/activityCategory'
import { formatTargetTime, parseTargetTime, targetTimeInput } from '@/lib/targetTime'
import { cn } from '@/lib/utils'
import { completionOpen } from '@/lib/completionWindow'
import { useCalendarDraggable } from '@/components/calendar/CalendarDnd'
import { useCalendarSelection } from '@/components/calendar/CalendarSelection'

export type ActivityTileDensity = 'pill' | 'card' | 'timeblock' | 'month' | 'day'

export type ActivityTileItem = {
  id: string
  day: string
  title: string
  detail?: string
  localTime?: string | null
  durationMinutes?: number | null
  durationLabel?: string
  groupName?: string | null
  sharedCompletionCount?: number | null
  sessionStatus?: string | null
  programTitle?: string | null
  category?: ActivityCategory | string | null
  done?: boolean
  notParticipating?: boolean
  status?: 'PLANNED' | 'SKIPPED' | 'CANCELLED' | 'DONE' | 'NOT_PARTICIPATING'
  href?: string
  locked?: boolean
  conflict?: boolean
  thumbnailUrl?: string | null
  avatarUrls?: string[]
  unreadCount?: number
  recurrenceId?: string | null
  updatedAt?: string
  /** When completion opens (09 §3); the quiet Complete button stays hidden until then. */
  completionOpensAt?: string | null
}

export type ActivityTileProps = {
  item: ActivityTileItem
  density?: ActivityTileDensity
  className?: string
  isNext?: boolean
  selected?: boolean
  showTimeInMonth?: boolean
  onSelect?: () => void
  onComplete?: (itemId: string) => void
  onChangeTime?: (itemId: string, localTime: string | null) => void
  /** Inside a CalendarDndProvider: an open entry drags (mouse) or long-press drags (touch). */
  draggable?: boolean
  completing?: boolean
}

export function ActivityTile({
  item,
  density = 'card',
  className,
  isNext = false,
  selected = false,
  showTimeInMonth = false,
  onSelect,
  onComplete,
  onChangeTime,
  draggable = false,
  completing = false,
}: ActivityTileProps) {
  const [failedImage, setFailedImage] = useState<string | null>(null)
  // Selection mode (bulk management): a click toggles, Shift-click selects a range (or starts
  // selecting); nothing drags or completes meanwhile.
  const selection = useCalendarSelection()
  const picking = selection.active
  const isSelected = picking ? selection.has(item.id) : selected
  const handleSelect = (event: React.MouseEvent) => {
    event.stopPropagation()
    if (picking) return selection.toggle(item.id, event.shiftKey)
    if (event.shiftKey) return selection.start(item.id)
    onSelect?.()
  }
  const drag = useCalendarDraggable(item, draggable && !picking)
  const isDragging = drag.isDragging
  const [editingTime, setEditingTime] = useState(false)
  const timeControlRef = useRef<HTMLDivElement>(null)
  const compact = density === 'day' || density === 'month' || density === 'pill'
  const isDone = item.done || item.status === 'DONE'
  const isGroup = Boolean(item.groupName || item.avatarUrls?.length)
  const category = resolveActivityCategory(
    item.title,
    item.programTitle ?? '',
    item.category,
  )
  const canComplete =
    Boolean(onComplete) &&
    !picking &&
    !isDone &&
    !item.notParticipating &&
    item.status !== 'NOT_PARTICIPATING' &&
    !item.locked &&
    completionOpen(item) &&
    (!item.status || item.status === 'PLANNED')
  const canAdjustTime =
    Boolean(onChangeTime) &&
    density === 'day' &&
    !item.locked &&
    item.status !== 'CANCELLED'
  const timeDisplay = formatTargetTime(item.localTime)
  const statusLabel = item.locked
    ? 'Access needed'
    : isDone
      ? 'Completed'
      : item.status === 'NOT_PARTICIPATING' || item.notParticipating
        ? 'Not participating'
        : item.status === 'SKIPPED'
          ? 'Skipped'
          : item.status === 'CANCELLED'
            ? 'Removed'
            : item.sessionStatus === 'ACTIVE'
              ? 'In progress'
              : item.sessionStatus === 'PAUSED'
                ? 'Paused'
                : 'Pending'

  useEffect(() => {
    if (!editingTime) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEditingTime(false)
    }
    const onPointerDown = (event: MouseEvent) => {
      if (
        timeControlRef.current &&
        !timeControlRef.current.contains(event.target as Node)
      ) {
        setEditingTime(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousedown', onPointerDown)
    }
  }, [editingTime])

  const dayMetaParts =
    density === 'day'
      ? [
          isNext ? 'Up next' : null,
          timeDisplay,
          item.durationMinutes ? `${item.durationMinutes} min` : null,
        ].filter(Boolean)
      : density === 'month' && showTimeInMonth && timeDisplay
        ? [timeDisplay]
        : []

  const actions =
    canComplete || canAdjustTime ? (
      <div className="calendar-tile__actions">
        {canAdjustTime && (
          <div ref={timeControlRef} className="calendar-tile__time-controls">
            {editingTime ? (
              <div className="calendar-tile__time-editor">
                <input
                  type="time"
                  autoFocus
                  className="calendar-tile__time-input"
                  aria-label={`Time of day for ${item.title}`}
                  value={targetTimeInput(item.localTime)}
                  onChange={(event) => {
                    const next = parseTargetTime(event.target.value)
                    if (next !== (item.localTime ?? null)) {
                      onChangeTime?.(item.id, next)
                    }
                  }}
                />
                {item.localTime && (
                  <button
                    type="button"
                    className="calendar-tile__clear-time"
                    aria-label={`Clear time for ${item.title}`}
                    title="Move to Any time"
                    onClick={() => {
                      onChangeTime?.(item.id, null)
                      setEditingTime(false)
                    }}
                  >
                    <X size={14} aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  className="calendar-tile__clear-time"
                  aria-label={`Done adjusting time for ${item.title}`}
                  onClick={() => setEditingTime(false)}
                >
                  <Check size={14} aria-hidden />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="calendar-tile__time-btn"
                aria-label={`Adjust time for ${item.title}`}
                aria-expanded={editingTime}
                onClick={() => setEditingTime(true)}
              >
                <Clock3 size={14} aria-hidden />
                <span>{timeDisplay ?? 'Set time'}</span>
              </button>
            )}
          </div>
        )}
        {canComplete && (
          <button
            type="button"
            className="calendar-tile__complete"
            aria-label={`Mark ${item.title} complete`}
            disabled={completing}
            onClick={() => onComplete?.(item.id)}
          >
            <CheckCircle2 size={18} aria-hidden />
            {!compact && <span>{completing ? 'Saving…' : 'Complete'}</span>}
          </button>
        )}
      </div>
    ) : null

  const content = (
    <>
      <div className="calendar-tile__main">
        {drag.movable && density === 'day' && (
          <span
            className="calendar-tile__drag-handle"
            aria-hidden
            title="Drag to change time"
          >
            <GripVertical size={16} />
          </span>
        )}
        {item.thumbnailUrl && failedImage !== item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt=""
            loading="lazy"
            onError={() => setFailedImage(item.thumbnailUrl ?? null)}
            className="calendar-tile__thumbnail"
          />
        ) : (
          <span
            className="calendar-tile__thumbnail calendar-tile__fallback"
            aria-hidden
          >
            <CategoryIcon category={category} size={density === 'day' ? 22 : 18} />
          </span>
        )}
        <div className="calendar-tile__copy">
          <h3
            className={cn(
              'calendar-tile__title',
              isDone && 'calendar-tile__title--done',
            )}
          >
            {item.title}
          </h3>
          {item.programTitle && (
            <p className="calendar-tile__program">{item.programTitle}</p>
          )}
          {item.detail && !item.programTitle && !item.localTime && (
            <p className="calendar-tile__program">{item.detail}</p>
          )}
          {dayMetaParts.length > 0 && (
            <p className={cn('calendar-tile__time', isNext && 'calendar-tile__time--next')}>
              <Clock3 size={12} aria-hidden />
              {item.localTime ? (
                <time dateTime={`${item.day}T${item.localTime}`}>
                  {dayMetaParts.join(' · ')}
                </time>
              ) : (
                <span>{dayMetaParts.join(' · ')}</span>
              )}
            </p>
          )}
        </div>
      </div>

      {(isGroup || (item.unreadCount ?? 0) > 0) && (
        <div className="calendar-tile__community">
          {isGroup && (
            <>
              <span className="calendar-tile__group-label">
                <Users size={13} aria-hidden />
                {item.groupName ?? 'Group Activity'}
              </span>
              <AvatarStack
                people={(item.avatarUrls ?? []).map((url, index) => ({
                  id: `${item.id}-${index}`,
                  name: 'Group participant',
                  avatarUrl: url,
                }))}
                max={3}
                className="calendar-tile__avatars"
              />
            </>
          )}
          {item.sharedCompletionCount != null && (
            <span className="calendar-tile__progress">
              {item.sharedCompletionCount} shared completions
            </span>
          )}
          {(item.unreadCount ?? 0) > 0 && (
            <UnreadDot count={item.unreadCount ?? 0} />
          )}
        </div>
      )}

      {item.conflict && (
        <div className="calendar-tile__conflict">
          <AlertTriangle size={13} aria-hidden />
          <span>Overlaps another activity</span>
        </div>
      )}
    </>
  )

  if (density === 'month') {
    // Month (03-UX §5): one readable row per entry. A quiet category edge, the time, the title on up to
    // two lines; completed entries keep their title with a check. Open entries drag to another date.
    const movable = drag.movable
    const monthContent = (
      <>
        {isDone ? (
          <Check size={12} className="calendar-chip__done" aria-hidden />
        ) : null}
        {/* Two rows in 44px: the time (with any overlap mark), then the title; untimed titles get both lines. */}
        <span className={cn('calendar-chip__text', !timeDisplay && 'calendar-chip__text--untimed')}>
          {(timeDisplay || (item.conflict && !isDone)) && (
            <span className="calendar-chip__time">
              {item.conflict && !isDone && (
                <AlertTriangle size={11} className="calendar-chip__conflict" aria-hidden />
              )}
              {timeDisplay}
            </span>
          )}
          <span className={cn('calendar-chip__title', isDone && 'calendar-chip__title--done')}>{item.title}</span>
        </span>
        {(item.unreadCount ?? 0) > 0 && <UnreadDot count={item.unreadCount ?? 0} />}
      </>
    )
    return (
      <article
        data-category={category}
        data-item-id={item.id}
        ref={drag.setNodeRef}
        {...drag.listeners}
        title={draggable && !movable ? `${item.title} · ${statusLabel}, can't be moved` : undefined}
        className={cn(
          'calendar-tile calendar-chip',
          item.conflict && !isDone && 'calendar-chip--conflict',
          canComplete && 'calendar-chip--completable',
          isDone && 'calendar-chip--done',
          movable && 'calendar-chip--movable',
          isSelected && 'calendar-chip--selected',
          picking && 'calendar-chip--picking',
          isDragging && 'calendar-chip--dragging',
          className,
        )}
      >
        {onSelect ? (
          <button
            type="button"
            onClick={handleSelect}
            aria-pressed={isSelected}
            aria-label={`${item.title}, ${timeDisplay ?? 'Any time'}, ${statusLabel}${item.conflict && !isDone ? ', overlaps another Activity' : ''}`}
            title={item.title}
            className="calendar-chip__trigger"
          >
            {monthContent}
          </button>
        ) : item.href ? (
          <Link to={item.href} aria-label={`${item.title}, ${statusLabel} — open activity`} className="calendar-chip__trigger">
            {monthContent}
          </Link>
        ) : (
          <div className="calendar-chip__trigger">{monthContent}</div>
        )}
        {canComplete && (
          <button
            type="button"
            className="calendar-chip__complete"
            aria-label={`Mark ${item.title} complete`}
            disabled={completing}
            onClick={(event) => {
              event.stopPropagation()
              onComplete?.(item.id)
            }}
          >
            <CheckCircle2 size={15} aria-hidden />
          </button>
        )}
      </article>
    )
  }

  if (density === 'day') {
    const dayBadgeContent = (
      <>
        <span className="calendar-badge__dot" aria-hidden>
          {isDone && <Check size={12} className="text-success" />}
          {!isDone && item.conflict && <AlertTriangle size={12} className="calendar-chip__conflict" />}
        </span>
        <span
          className={cn(
            'calendar-badge__title',
            isDone && 'calendar-badge__title--done',
          )}
        >
          {item.title}
        </span>
        {isGroup && (item.avatarUrls?.length ?? 0) > 0 && (
          <AvatarStack
            people={(item.avatarUrls ?? []).map((url, index) => ({
              id: `${item.id}-${index}`,
              name: 'Group participant',
              avatarUrl: url,
            }))}
            max={3}
            className="calendar-badge__avatars"
          />
        )}
        {(item.unreadCount ?? 0) > 0 && (
          <UnreadDot count={item.unreadCount ?? 0} />
        )}
      </>
    )

    return (
      <article
        data-category={category}
        data-item-id={item.id}
        ref={drag.setNodeRef}
        {...drag.listeners}
        className={cn(
          'calendar-tile calendar-tile--day calendar-badge',
          drag.movable && 'calendar-badge--movable',
          isDone && 'calendar-tile--complete',
          isSelected && 'calendar-badge--selected',
          picking && 'calendar-badge--picking',
          isDragging && 'calendar-tile--dragging',
          className,
        )}
      >
        {onSelect ? (
          <button
            type="button"
            onClick={handleSelect}
            aria-pressed={isSelected}
            aria-label={`${item.title}, ${statusLabel}${item.conflict && !isDone ? ', overlaps another Activity' : ''}`}
            className="calendar-badge__trigger"
          >
            {dayBadgeContent}
          </button>
        ) : item.href ? (
          <Link
            to={item.href}
            aria-label={`${item.title}, ${statusLabel} — open activity`}
            className="calendar-badge__trigger"
          >
            {dayBadgeContent}
          </Link>
        ) : (
          <div className="calendar-badge__trigger">{dayBadgeContent}</div>
        )}
      </article>
    )
  }

  return (
    <article
      data-category={category}
      data-item-id={item.id}
      ref={drag.setNodeRef}
      {...drag.listeners}
      className={cn(
        'calendar-tile',
        {
          month: 'calendar-tile--month',
          day: 'calendar-tile--day',
          pill: 'calendar-tile--pill',
          card: 'calendar-tile--card',
          timeblock: 'calendar-tile--timeblock',
        }[density],
        compact && 'calendar-tile--compact',
        isDone && 'calendar-tile--complete',
        isNext && !isDone && 'calendar-tile--next',
        isSelected && 'calendar-tile--selected',
        item.conflict && 'calendar-tile--conflict',
        isDragging && 'calendar-tile--dragging',
        className,
      )}
    >
      {onSelect ? (
        // A selectable tile (Month) opens the Selected Activity panel instead of navigating.
        <button
          type="button"
          onClick={handleSelect}
          aria-pressed={isSelected}
          aria-label={`${item.title}, ${statusLabel}`}
          className="calendar-tile__link calendar-tile__link--button"
        >
          {content}
        </button>
      ) : item.href ? (
        <Link
          to={item.href}
          className="calendar-tile__link"
          aria-label={`${item.title}, ${item.programTitle ?? 'Activity'}, ${statusLabel} — open activity`}
        >
          {content}
        </Link>
      ) : (
        <div className="calendar-tile__link" onClick={onSelect}>
          {content}
        </div>
      )}
      {actions}
    </article>
  )
}
