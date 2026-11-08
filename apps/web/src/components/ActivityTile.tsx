import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  Lock,
  MoreHorizontal,
  Users,
  X,
} from 'lucide-react'
import { AvatarStack } from '@/components/AvatarStack'
import { CategoryIcon } from '@/components/CategoryIcon'
import { UnreadDot } from '@/components/UnreadDot'
import { resolveActivityCategory, type ActivityCategory } from '@/lib/activityCategory'
import { cn } from '@/lib/utils'

export type ActivityTileDensity = 'pill' | 'card' | 'timeblock' | 'month' | 'week' | 'day' | 'year'

export type ActivityTileItem = {
  id: string
  day: string
  title: string
  detail?: string
  localTime?: string | null
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
}

export type ActivityTileProps = {
  item: ActivityTileItem
  density?: ActivityTileDensity
  className?: string
  onSelect?: () => void
  onComplete?: (itemId: string) => void
  onRemove?: (itemId: string, scope: 'THIS_ONE' | 'THIS_AND_FUTURE') => void
  completing?: boolean
  removing?: boolean
}

export function ActivityTile({
  item,
  density = 'card',
  className,
  onSelect,
  onComplete,
  onRemove,
  completing = false,
  removing = false,
}: ActivityTileProps) {
  const [failedImage, setFailedImage] = useState<string | null>(null)
  const compact = density === 'day' || density === 'month' || density === 'week' || density === 'pill' || density === 'year'
  // Day and Week tiles keep their status line and removal menu (03-UX §2, 09 §4).
  const detailed = !(density === 'month' || density === 'pill' || density === 'year')
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
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
  const canRemove =
    Boolean(onRemove) && detailed &&
    !item.locked &&
    (!item.status || item.status === 'PLANNED')
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
            : item.sessionStatus === 'ACTIVE' ? 'In progress' : item.sessionStatus === 'PAUSED' ? 'Paused' : 'Pending'

  const actions =
    canComplete || canRemove ? (
      <div className="calendar-tile__actions">
        {canComplete && (
          <button
            type="button"
            className="calendar-tile__complete"
            aria-label={`Mark ${item.title} complete`}
            disabled={completing}
            onClick={() => onComplete?.(item.id)}
          >
            <CheckCircle2 size={16} aria-hidden />
            {!compact && <span>{completing ? 'Saving…' : 'Complete'}</span>}
          </button>
        )}
        {canRemove && (
          <div className="calendar-tile__menu-anchor">
            <button
              type="button"
              className="calendar-tile__more"
              aria-label={`More actions for ${item.title}`}
              aria-expanded={menuOpen}
              onClick={() => {
                setMenuOpen((open) => !open)
                setConfirmRemove(false)
              }}
            >
              {menuOpen ? <X size={15} aria-hidden /> : <MoreHorizontal size={16} aria-hidden />}
              <span>{menuOpen ? 'Close' : 'More'}</span>
            </button>
            {menuOpen && (
              <div className="calendar-tile-menu">
                {!confirmRemove ? (
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(true)}
                    className="calendar-tile-menu__item"
                  >
                    Remove from Calendar
                  </button>
                ) : (
                  <>
                    <span className="calendar-tile-menu__label">
                      {item.recurrenceId
                        ? 'Remove which activities?'
                        : 'Remove this activity?'}
                    </span>
                    <button
                      type="button"
                      disabled={removing}
                      onClick={() => onRemove?.(item.id, 'THIS_ONE')}
                      className="calendar-tile-menu__item"
                    >
                      {item.recurrenceId ? 'This activity only' : 'Remove activity'}
                    </button>
                    {item.recurrenceId && (
                      <button
                        type="button"
                        disabled={removing}
                        onClick={() => onRemove?.(item.id, 'THIS_AND_FUTURE')}
                        className="calendar-tile-menu__item"
                      >
                        This and future activities
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    ) : null

  const content = (
    <>
      <div className="calendar-tile__main">
        {item.thumbnailUrl && failedImage !== item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt=""
            loading="lazy"
            onError={() => setFailedImage(item.thumbnailUrl ?? null)}
            className="calendar-tile__thumbnail"
          />
        ) : (
          <span className="calendar-tile__thumbnail calendar-tile__fallback" aria-hidden>
            <CategoryIcon category={category} size={20} />
          </span>
        )}
        <div className="calendar-tile__copy">
          <h3 className={cn('calendar-tile__title', isDone && 'calendar-tile__title--done')}>
            {item.title}
          </h3>
          {item.programTitle && (
            <p className="calendar-tile__program">{item.programTitle}</p>
          )}
          {item.detail && !item.programTitle && !item.localTime && (
            <p className="calendar-tile__program">{item.detail}</p>
          )}
          {detailed && statusLabel !== 'Pending' && (
            <p className="calendar-tile__status">
              {isDone ? (
                <Check size={13} aria-hidden />
              ) : item.locked ? (
                <Lock size={13} aria-hidden />
              ) : (
                <Clock3 size={13} aria-hidden />
              )}
              <span>{statusLabel}</span>
              {item.durationLabel && <span className="text-muted">· {item.durationLabel}</span>}
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
          {item.sharedCompletionCount != null && <span className="calendar-tile__progress">{item.sharedCompletionCount} shared completions</span>}
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

  return (
    <article
      data-category={category}
      className={cn(
        'calendar-tile',
        { month: 'calendar-tile--month', week: 'calendar-tile--week', day: 'calendar-tile--day', year: 'calendar-tile--year', pill: 'calendar-tile--pill', card: 'calendar-tile--card', timeblock: 'calendar-tile--timeblock' }[density],
        compact && 'calendar-tile--compact',
        isDone && 'calendar-tile--complete',
        item.conflict && 'calendar-tile--conflict',
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
