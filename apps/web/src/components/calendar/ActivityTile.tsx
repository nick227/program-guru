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
  draggable?: boolean
  isDragging?: boolean
  onDragStart?: (event: React.DragEvent<HTMLElement>, item: ActivityTileItem) => void
  onDragEnd?: (event: React.DragEvent<HTMLElement>) => void
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
  isDragging = false,
  onDragStart,
  onDragEnd,
  completing = false,
}: ActivityTileProps) {
  const [failedImage, setFailedImage] = useState<string | null>(null)
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
    !isDone &&
    !item.notParticipating &&
    item.status !== 'NOT_PARTICIPATING' &&
    !item.locked &&
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
        {draggable && canAdjustTime && (
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

  if (density === 'day') {
    const dayBadgeContent = (
      <>
        <span className="calendar-badge__icon" aria-hidden>
          <CategoryIcon category={category} size={15} />
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
        draggable={draggable && canAdjustTime}
        onDragStart={
          draggable && canAdjustTime
            ? (event) => onDragStart?.(event, item)
            : undefined
        }
        onDragEnd={draggable && canAdjustTime ? onDragEnd : undefined}
        className={cn(
          'calendar-tile calendar-tile--day calendar-badge',
          isDone && 'calendar-tile--complete',
          selected && 'calendar-badge--selected',
          isDragging && 'calendar-tile--dragging',
          className,
        )}
      >
        {onSelect ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onSelect()
            }}
            aria-pressed={selected}
            aria-label={`${item.title}, ${statusLabel}`}
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
      draggable={draggable && canAdjustTime}
      onDragStart={
        draggable && canAdjustTime
          ? (event) => onDragStart?.(event, item)
          : undefined
      }
      onDragEnd={draggable && canAdjustTime ? onDragEnd : undefined}
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
        item.conflict && 'calendar-tile--conflict',
        isDragging && 'calendar-tile--dragging',
        className,
      )}
    >
      {item.href ? (
        <Link
          to={item.href}
          onClick={onSelect}
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
