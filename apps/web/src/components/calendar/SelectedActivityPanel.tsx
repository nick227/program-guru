import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  Check,
  Clock3,
  Heart,
  Image as ImageIcon,
  Play,
  Repeat,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import {
  useActivity,
  useActivityGroups,
  useAddCompletionComment,
  useAddCompletionReaction,
  useCompletionComments,
  useCreateCheckIns,
  useCurrentUser,
  useDeleteCompletionComment,
  useGroupCompletions,
  useGroupMedia,
  useMediaPublication,
  useOccurrence,
  useRemoveCompletionReaction,
  type components,
} from '@project/sdk'
import { toast } from 'sonner'
import { Avatar } from '@/components/ui/Avatar'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { GroupCheckInModal } from '@/components/group-stage/GroupCheckInModal'
import { MediaViewer, type ViewerItem } from '@/components/media/MediaViewer'
import { CategoryIcon } from '@/components/shared/CategoryIcon'
import { ActivityParticipation } from '@/components/activity/ActivityParticipation'
import { GatheringSuggestion } from '@/components/activity/GatheringSuggestion'
import { resolveActivityCategory } from '@/lib/activityCategory'
import { dateLabel, formatRelativeTime, isLocalDate } from '@/lib/dates'
import { formatTargetTime, parseTargetTime, targetTimeInput } from '@/lib/targetTime'
import { buildActivityUrl, buildGroupUrl } from '@/lib/urls'
import { useMediaUploads } from '@/lib/useMediaUploads'
import { completionOpen, completionOpensLabel } from '@/lib/completionWindow'
import { useOnline } from '@/lib/useOnline'
import { cn } from '@/lib/utils'
import { canMoveCalendarEntry, type SurfaceItem } from '@/lib/calendarGrouping'
import { ruleLabel, untilLabel } from '@/components/schedule/recurrencePlan'

type S = components['schemas']

export interface SelectedActivityPanelProps {
  itemId: string | null
  /** Desktop panel content when nothing is selected (default: a short hint). */
  emptyContent?: ReactNode
  calendarItem?: SurfaceItem | null
  onClose?: () => void
  onComplete: (itemId: string) => Promise<void>
  onUndoComplete: (itemId: string) => Promise<void>
  onChangeTime: (itemId: string, localTime: string | null) => Promise<void>
  /** Opens the Remove from Calendar confirmation; never completes or deletes the Activity. */
  onRemove?: (itemId: string) => void
  /** Opens the shared Reschedule dialog (Move to date; the tap path for moving on phones). */
  onReschedule?: (itemId: string) => void
  /** The entry's personal series, when it repeats (09 §4.8). */
  recurrence?: S['CalendarRecurrence'] | null
  onEditSeries?: () => void
  onEndSeries?: () => void
  /** The entry overlaps another timed one: the server's one-tap Move to next open slot. */
  onMoveToOpenSlot?: (itemId: string) => void
  movingToSlot?: boolean
  /** Start or Resume in place (the inline Activity experience); without it, Start opens the page. */
  onStart?: (itemId: string, resume: boolean) => void
  /** While doing the Activity: shown instead of the preview (wider panel, full-height sheet). */
  execution?: ReactNode
  completing?: boolean
  undoing?: boolean
  removing?: boolean
}

function PanelBody({
  itemId,
  calendarItem,
  onClose,
  onComplete,
  onUndoComplete,
  onChangeTime,
  onRemove,
  onReschedule,
  recurrence = null,
  onEditSeries,
  onEndSeries,
  onMoveToOpenSlot,
  movingToSlot = false,
  onStart,
  completing = false,
  undoing = false,
  removing = false,
  isMobileSheet = false,
}: SelectedActivityPanelProps & { isMobileSheet?: boolean }) {
  const online = useOnline()
  const me = useCurrentUser()
  const viewerId = me.data?.data.id
  const occurrenceQuery = useOccurrence(itemId ?? '')
  const occurrence = occurrenceQuery.data
  const item = occurrence?.item

  const [editingTime, setEditingTime] = useState(false)
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [thumbFailed, setThumbFailed] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)
  const timeWrapRef = useRef<HTMLDivElement>(null)

  const addReaction = useAddCompletionReaction()
  const removeReaction = useRemoveCompletionReaction()
  const createCheckIn = useCreateCheckIns()
  const publishMedia = useMediaPublication()

  useEffect(() => {
    setEditingTime(false)
    setViewerIndex(null)
    setThumbFailed(false)
  }, [itemId])

  useEffect(() => {
    if (!editingTime) return
    const onPointerDown = (event: MouseEvent) => {
      if (timeWrapRef.current && !timeWrapRef.current.contains(event.target as Node)) {
        setEditingTime(false)
      }
    }
    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [editingTime])

  const activityId = item?.locked ? '' : (item?.activityId ?? '')
  const activityQuery = useActivity(activityId)
  const activityGroups = useActivityGroups(activityId, {
    enabled: Boolean(activityId && !occurrence?.collaborators),
  })
  const fallbackGroup = useMemo(() => {
    const groups = activityGroups.data?.pages.flatMap((p) => p.data) ?? []
    return groups.find((g) => g.viewerIsMember) ?? null
  }, [activityGroups.data])

  const groupId = occurrence?.collaborators?.groupId ?? fallbackGroup?.id ?? ''
  const occurrenceKey = occurrence?.collaborators?.occurrenceKey ?? undefined

  const completionsQuery = useGroupCompletions(groupId, occurrenceKey)
  const groupMediaQuery = useGroupMedia(groupId, Boolean(groupId), occurrenceKey)
  const checkInRows = useMemo(
    () => completionsQuery.data?.pages.flatMap((page) => page.data) ?? [],
    [completionsQuery.data],
  )
  const primaryShare = checkInRows[0] ?? null
  const commentsQuery = useCompletionComments(
    primaryShare?.id ?? '',
    Boolean(primaryShare?.id),
  )
  const addComment = useAddCompletionComment(primaryShare?.id ?? '')
  const deleteComment = useDeleteCompletionComment(primaryShare?.id ?? '')
  const commentRows = useMemo(
    () => commentsQuery.data?.pages.flatMap((page) => page.data) ?? [],
    [commentsQuery.data],
  )

  const { uploads, send: uploadFiles } = useMediaUploads({
    onReady: async (asset) => {
      if (!groupId || !occurrenceKey || !item) return
      try {
        await publishMedia.mutateAsync({
          mediaId: asset.id,
          audience: 'GROUP',
          groupId,
          occurrenceKey,
        })
        toast.success('Photo shared with group')
      } catch {
        // Error surfaced below.
      }
    },
  })
  const uploading = uploads.some(
    (u) => u.stage === 'uploading' || u.stage === 'processing',
  )

  const mediaRailItems: ViewerItem[] = useMemo(() => {
    const fromGroup = groupMediaQuery.data?.pages.flatMap((p) => p.data) ?? []
    const fromOccurrence = occurrence?.sharedMedia ?? []
    const fromMine = occurrence?.myMedia ?? []
    const fromActivity = activityQuery.data?.media ?? []
    const fromCommunity = occurrence?.communityMedia ?? []
    const seen = new Set<string>()
    const merged: ViewerItem[] = []
    for (const m of [
      ...fromOccurrence,
      ...fromGroup,
      ...fromMine,
      ...fromActivity,
      ...fromCommunity,
    ]) {
      if (seen.has(m.id)) continue
      seen.add(m.id)
      merged.push({
        id: m.id,
        publicationId:
          'publicationId' in m && typeof m.publicationId === 'string'
            ? m.publicationId
            : undefined,
        thumbnailUrl: m.thumbnailUrl,
        type: m.type,
        alt: item?.title ?? 'Activity media',
      })
    }
    return merged
  }, [
    groupMediaQuery.data,
    occurrence?.sharedMedia,
    occurrence?.myMedia,
    occurrence?.communityMedia,
    activityQuery.data?.media,
    item?.title,
  ])

  if (!itemId) return null

  if (occurrenceQuery.isPending && !occurrence) {
    return (
      <div className="calendar-panel__loading">
        <Loading />
      </div>
    )
  }

  if (occurrenceQuery.error && !occurrence) {
    return (
      <div className="p-4">
        <ErrorMessage
          error={occurrenceQuery.error}
          retry={() => void occurrenceQuery.refetch()}
        />
      </div>
    )
  }

  const title = item?.title ?? calendarItem?.title ?? 'Activity'
  const programTitle = item?.programTitle ?? calendarItem?.programTitle ?? ''
  const category = resolveActivityCategory(title, programTitle, calendarItem?.category)
  const localTime = item?.localTime ?? calendarItem?.localTime ?? null
  const durationMinutes = item?.durationMinutes ?? calendarItem?.durationMinutes ?? null
  const status = item?.status ?? calendarItem?.status ?? 'PLANNED'
  const isDone = status === 'DONE'
  const isLocked = Boolean(item?.locked ?? calendarItem?.locked)
  const timeDisplay = formatTargetTime(localTime)

  const detailHref =
    activityId && !isLocked
      ? buildActivityUrl({
          id: activityId,
          title,
          slug: activityQuery.data?.slug,
        })
      : `/occurrences/${itemId}`

  const thumbUrl =
    (!thumbFailed &&
      (item?.thumbnailUrl ||
        calendarItem?.thumbnailUrl ||
        mediaRailItems[0]?.thumbnailUrl)) ||
    null
  // The one image opens the viewer at itself when it is part of the media set.
  const heroViewerIndex = Math.max(
    0,
    mediaRailItems.findIndex((m) => m.thumbnailUrl === thumbUrl),
  )
  const localDate = item?.localDate ?? calendarItem?.day ?? null
  const dateDisplay = isLocalDate(localDate)
    ? dateLabel(localDate, { weekday: 'short', month: 'short', day: 'numeric' })
    : null

  const description = !isLocked ? (activityQuery.data?.summary?.trim() || null) : null
  const distinctInstructions = isLocked
    ? []
    : (occurrence?.instructions ?? []).filter((step) => {
        const stepText = [step.title, step.body].filter(Boolean).join(' ').trim()
        if (!stepText) return false
        if (description && stepText.toLowerCase() === description.toLowerCase()) {
          return false
        }
        return true
      })

  const collab = occurrence?.collaborators ?? null

  // Completion opens on the item's day, or at a gathering's time (09 §3).
  const opensLabel = item ? completionOpensLabel(item) : null
  const canComplete =
    !isDone &&
    !isLocked &&
    status !== 'NOT_PARTICIPATING' &&
    status !== 'CANCELLED' &&
    (!item || completionOpen(item))
  const isOpenEntry =
    !isDone && !isLocked && status !== 'CANCELLED' && status !== 'NOT_PARTICIPATING'
  const sessionStatus = calendarItem?.sessionStatus ?? null
  const resumable = sessionStatus === 'ACTIVE' || sessionStatus === 'PAUSED'
  const occurrenceHref = calendarItem?.href ?? `/occurrences/${itemId}`
  // A completed entry keeps its record; the server asks for Undo first (09 §4.8).
  const canRemove = Boolean(onRemove) && !isDone && status !== 'CANCELLED'
  const canReschedule =
    Boolean(onReschedule) && !isLocked && canMoveCalendarEntry({ status, locked: isLocked })

  const toggleHeart = (share: S['CompletionShare']) => {
    const emoji = '❤️'
    const active = share.reactions.some((r) => r.emoji === emoji && r.reactedByMe)
    if (active) {
      removeReaction.mutate({ shareId: share.id, emoji })
    } else {
      addReaction.mutate({
        shareId: share.id,
        emoji,
        idempotencyKey: crypto.randomUUID(),
      })
    }
  }

  const handleSendMessage = async (event: React.FormEvent) => {
    event.preventDefault()
    const text = message.trim()
    if (!text || !online) return
    try {
      if (primaryShare) {
        await addComment.mutateAsync({
          body: text,
          idempotencyKey: crypto.randomUUID(),
        })
        setMessage('')
      } else if (groupId && item?.activityId) {
        await createCheckIn.mutateAsync({
          activityId: item.activityId,
          groupIds: [groupId],
          calendarItemId: item.id,
          note: text,
          idempotencyKey: crypto.randomUUID(),
        })
        setMessage('')
        toast.success('Posted to group')
      }
    } catch {
      // Mutation error displayed below.
    }
  }

  return (
    <div className="calendar-panel__inner" data-category={category}>
      {isMobileSheet && (
        <div className="calendar-panel__sheet-handle-row">
          <span className="calendar-panel__sheet-handle" aria-hidden />
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close activity details"
              className="calendar-panel__sheet-close"
            >
              <X size={18} />
            </button>
          )}
        </div>
      )}

      <div className="calendar-panel__content">
        {/* 1. Title, then when */}
        <header className="calendar-panel__header">
          <Link to={detailHref} className="calendar-panel__title-link">
            <span>{title}</span>
            <ArrowUpRight size={15} className="calendar-panel__title-arrow" aria-hidden />
          </Link>
          {programTitle && <p className="calendar-panel__subtitle">{programTitle}</p>}
          <div ref={timeWrapRef} className="calendar-panel__when">
            {dateDisplay && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays size={13} aria-hidden />
                {dateDisplay}
              </span>
            )}
            {dateDisplay && <span aria-hidden>·</span>}
            {!isLocked && status !== 'CANCELLED' && editingTime ? (
              <span className="inline-flex items-center gap-1.5">
                <input
                  type="time"
                  autoFocus
                  aria-label={`Time of day for ${title}`}
                  value={targetTimeInput(localTime)}
                  onChange={(e) => {
                    const next = parseTargetTime(e.target.value)
                    if (next !== localTime) {
                      void onChangeTime(itemId, next)
                    }
                  }}
                  className="rounded-md border border-border bg-background px-1.5 py-0.5 text-xs text-foreground"
                />
                {localTime && (
                  <button
                    type="button"
                    onClick={() => {
                      void onChangeTime(itemId, null)
                      setEditingTime(false)
                    }}
                    className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted hover:text-foreground"
                  >
                    Any time
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Done adjusting time"
                  onClick={() => setEditingTime(false)}
                  className="p-0.5 text-muted hover:text-foreground"
                >
                  <Check size={13} />
                </button>
              </span>
            ) : (
              <button
                type="button"
                disabled={isLocked || status === 'CANCELLED'}
                onClick={() => setEditingTime(true)}
                aria-label={`Adjust time, ${timeDisplay ?? 'Any time'}`}
                className="calendar-panel__time-btn"
              >
                <Clock3 size={13} aria-hidden />
                <span>{timeDisplay ?? 'Any time'}</span>
              </button>
            )}
            {durationMinutes ? (
              <>
                <span aria-hidden>·</span>
                <span>{durationMinutes} min</span>
              </>
            ) : null}
          </div>
        </header>

        {/* How it repeats, with series actions that apply from this entry on (This and future). */}
        {recurrence && recurrence.status === 'ACTIVE' && (
          <div className="calendar-panel__series">
            <p className="calendar-panel__series-rule">
              <Repeat size={13} aria-hidden />
              <span>
                {ruleLabel(recurrence.rule, recurrence.anchorDate)} · {untilLabel(recurrence.untilDate)}
              </span>
            </p>
            {!isLocked && status !== 'CANCELLED' && (onEditSeries || onEndSeries) && (
              <div className="calendar-panel__series-actions">
                {onEditSeries && (
                  <button type="button" disabled={!online} onClick={onEditSeries} className="calendar-panel__series-btn">
                    Edit series
                  </button>
                )}
                {onEndSeries && (
                  <button type="button" disabled={!online} onClick={onEndSeries} className="calendar-panel__series-btn">
                    End series
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* 2. One image: the resolved thumbnail, else the category fallback. */}
        <div className="calendar-panel__hero">
          {thumbUrl ? (
            mediaRailItems.length > 0 ? (
              <button
                type="button"
                onClick={() => setViewerIndex(heroViewerIndex)}
                aria-label={`View photos of ${title}`}
                className="calendar-panel__hero-btn"
              >
                <img
                  src={thumbUrl}
                  alt=""
                  onError={() => setThumbFailed(true)}
                  className="calendar-panel__hero-img"
                />
                {mediaRailItems.length > 1 && (
                  <span className="calendar-panel__hero-count">
                    <ImageIcon size={12} aria-hidden />
                    {mediaRailItems.length}
                  </span>
                )}
              </button>
            ) : (
              <img
                src={thumbUrl}
                alt=""
                onError={() => setThumbFailed(true)}
                className="calendar-panel__hero-img"
              />
            )
          ) : (
            <span className="calendar-panel__hero-fallback" aria-hidden>
              <CategoryIcon category={category} size={30} />
            </span>
          )}
        </div>

        {/* 3. Concise description; steps stay one tap away. */}
        {description && <p className="calendar-panel__description">{description}</p>}
        {distinctInstructions.length > 0 && (
          <details className="calendar-panel__steps-wrap">
            <summary className="calendar-panel__steps-summary">
              {distinctInstructions.length} {distinctInstructions.length === 1 ? 'step' : 'steps'}
            </summary>
            <ul className="calendar-panel__steps" aria-label="Instructions">
              {distinctInstructions.map((step, index) => (
                <li key={step.id} className="calendar-panel__step">
                  <span className="calendar-panel__step-num" aria-hidden>
                    {index + 1}.
                  </span>
                  <div className="min-w-0">
                    {step.title && (
                      <span className="font-medium text-foreground">
                        {step.title}
                        {step.body ? ': ' : ''}
                      </span>
                    )}
                    {step.body && <span className="text-foreground/85">{step.body}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* Real gatherings of this Activity that day; joining reuses this item (10 §9.11). */}
        {item && <GatheringSuggestion item={item} className="calendar-panel__gathering" />}

        {/* 4. Participation: the shared component (03-UX §2b), plus this session's own count. */}
        {(activityId || collab) && (
          <section className="calendar-panel__section" aria-label="Participation">
            <div className="flex items-center justify-between gap-2">
              <h3 className="calendar-panel__together-title">Participation</h3>
              {groupId && (
                <Link
                  to={buildGroupUrl(groupId)}
                  className="text-xs font-semibold text-accent hover:underline"
                >
                  Open session →
                </Link>
              )}
            </div>
            {collab && (
              <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
                {collab.members.length > 0 && (
                  <span className="flex shrink-0 -space-x-1.5" aria-hidden>
                    {collab.members.slice(0, 4).map((m) => (
                      <Avatar
                        key={m.user.id}
                        src={m.user.avatarUrl}
                        name={m.user.displayName}
                        size="sm"
                        className="h-5 w-5 text-[9px] ring-2 ring-surface"
                      />
                    ))}
                  </span>
                )}
                <span className="truncate">
                  {collab.finishedCount > 0
                    ? `${collab.finishedCount} of ${collab.totalCount} finished in this session`
                    : `${collab.totalCount} in this session`}
                </span>
              </div>
            )}
            {activityId && (
              <ActivityParticipation
                activity={{ id: activityId, title }}
                variant="summary"
                returnTo={occurrenceHref}
              />
            )}
          </section>
        )}

        {/* An overlap with another timed entry, and the one-tap fix (03-UX §5). */}
        {calendarItem?.conflict && !isDone && canReschedule && onMoveToOpenSlot && (
          <div className="calendar-panel__conflict" role="status">
            <AlertTriangle size={14} aria-hidden />
            <span className="min-w-0 flex-1">Overlaps another Activity at {timeDisplay ?? 'this time'}</span>
            <button
              type="button"
              disabled={!online || movingToSlot}
              onClick={() => onMoveToOpenSlot(itemId)}
              className="calendar-panel__series-btn"
            >
              {movingToSlot ? 'Moving…' : 'Move to next open slot'}
            </button>
          </div>
        )}

        {/* 5. Actions: Complete / Undo, Start or Resume, Remove from Calendar. */}
        <div className="calendar-panel__actions">
          {isLocked ? (
            <Link
              to={`/occurrences/${itemId}`}
              className="btn btn--outline w-full justify-center"
            >
              Open Activity
            </Link>
          ) : isDone ? (
            <button
              type="button"
              disabled={!online || undoing}
              onClick={() => void onUndoComplete(itemId)}
              className="calendar-panel__undo-btn"
            >
              <Check size={15} className="text-success" aria-hidden />
              <span>{undoing ? 'Undoing...' : 'Completed · Undo'}</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={!online || !canComplete || completing}
              onClick={() => void onComplete(itemId)}
              className="calendar-panel__complete-btn"
            >
              <Check size={16} aria-hidden />
              <span>{completing ? 'Saving...' : opensLabel ?? 'Mark as Complete'}</span>
            </button>
          )}
          {(isOpenEntry || canRemove || canReschedule) && (
            <div className="calendar-panel__secondary-actions">
              {isOpenEntry &&
                (onStart ? (
                  <button
                    type="button"
                    disabled={!online}
                    onClick={() => onStart(itemId, resumable)}
                    className="calendar-panel__secondary-btn"
                  >
                    <Play size={13} className="fill-current" aria-hidden />
                    {resumable ? 'Resume' : 'Start'}
                  </button>
                ) : (
                  <Link to={occurrenceHref} className="calendar-panel__secondary-btn">
                    <Play size={13} className="fill-current" aria-hidden />
                    {resumable ? 'Resume' : 'Start'}
                  </Link>
                ))}
              {canReschedule && (
                <button
                  type="button"
                  disabled={!online}
                  onClick={() => onReschedule?.(itemId)}
                  className="calendar-panel__secondary-btn"
                >
                  <CalendarDays size={13} aria-hidden />
                  Move to date
                </button>
              )}
              {canRemove && (
                <button
                  type="button"
                  disabled={!online || removing}
                  onClick={() => onRemove?.(itemId)}
                  className="calendar-panel__remove-btn"
                >
                  <Trash2 size={13} aria-hidden />
                  Remove from Calendar
                </button>
              )}
            </div>
          )}
        </div>

        <ErrorMessage
          error={
            addReaction.error ||
            removeReaction.error ||
            addComment.error ||
            createCheckIn.error
          }
        />

        {/* 6. The session's check-ins and messages (Group Activities only). */}
        {groupId && (
          <section className="calendar-panel__section" aria-label="Recent check-ins">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-muted">Recent check-ins</span>
              <button
                type="button"
                onClick={() => setCheckInOpen(true)}
                disabled={!online}
                className="text-xs font-semibold text-accent hover:underline"
              >
                + Check in
              </button>
            </div>

            {completionsQuery.isPending ? (
              <Loading />
            ) : checkInRows.length > 0 ? (
              <ul className="space-y-2.5">
                {checkInRows.slice(0, 5).map((share) => {
                  const isMe = share.user.id === viewerId
                  const liked = share.reactions.some(
                    (r) => r.emoji === '❤️' && r.reactedByMe,
                  )
                  const likeCount =
                    share.reactions.find((r) => r.emoji === '❤️')?.count ?? 0
                  return (
                    <li key={share.id} className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2">
                        <Avatar
                          src={share.user.avatarUrl}
                          name={share.user.displayName}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="text-xs leading-snug text-foreground">
                            <strong className="font-semibold">
                              {isMe ? 'You' : share.user.displayName}
                            </strong>{' '}
                            <span className="text-muted">
                              {share.media ? 'added a photo' : 'completed this'}
                            </span>
                          </p>
                          <p className="text-[11px] text-muted">
                            {formatRelativeTime(share.completedAt)}
                          </p>
                          {share.note && (
                            <p className="mt-1 text-xs text-foreground/90">
                              {share.note}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-pressed={liked}
                        aria-label={`Like ${share.user.displayName}'s check-in`}
                        disabled={!online}
                        onClick={() => toggleHeart(share)}
                        className={cn(
                          'inline-flex shrink-0 items-center gap-1 rounded-full p-1 text-xs text-muted transition-colors hover:text-foreground',
                          liked && 'text-accent',
                        )}
                      >
                        <Heart size={14} fill={liked ? 'currentColor' : 'none'} />
                        {likeCount > 0 && <span>{likeCount}</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-xs text-muted">No check-ins yet.</p>
            )}

            {commentRows.length > 0 && (
              <ul className="space-y-2 pt-1">
                {commentRows.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-start justify-between gap-2 rounded-lg bg-surface-raised/60 px-2.5 py-2 text-xs"
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      <Avatar
                        src={c.author.avatarUrl}
                        name={c.author.displayName}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">
                          {c.author.displayName}{' '}
                          <span className="font-normal text-muted">
                            · {formatRelativeTime(c.createdAt)}
                          </span>
                        </p>
                        <p className="mt-0.5 break-words text-foreground/90">
                          {c.body}
                        </p>
                      </div>
                    </div>
                    {c.canDelete && (
                      <button
                        type="button"
                        aria-label="Delete comment"
                        disabled={!online || deleteComment.isPending}
                        onClick={() => deleteComment.mutate(c.id)}
                        className="shrink-0 p-1 text-muted hover:text-danger"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {/* Bottom Composer (when sharing in a Group) */}
      {groupId && (
        <form
          onSubmit={(e) => void handleSendMessage(e)}
          className="calendar-panel__composer"
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                void uploadFiles(file)
                e.target.value = ''
              }
            }}
          />
          <button
            type="button"
            aria-label="Upload photo"
            disabled={!online || uploading}
            onClick={() => fileRef.current?.click()}
            className="calendar-panel__composer-icon"
          >
            <ImageIcon size={16} />
          </button>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write a message..."
            disabled={!online}
            className="calendar-panel__composer-input"
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={
              !online ||
              !message.trim() ||
              addComment.isPending ||
              createCheckIn.isPending
            }
            className="calendar-panel__composer-send"
          >
            <Send size={15} />
          </button>
        </form>
      )}

      {groupId && (
        <GroupCheckInModal
          open={checkInOpen}
          onClose={() => setCheckInOpen(false)}
          defaultGroupId={groupId}
          activityId={activityId || undefined}
          activityTitle={title}
          calendarItemId={itemId}
        />
      )}

      {viewerIndex !== null && mediaRailItems.length > 0 && (
        <MediaViewer
          items={mediaRailItems}
          index={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onIndex={setViewerIndex}
        />
      )}
    </div>
  )
}

export function SelectedActivityPanel(props: SelectedActivityPanelProps) {
  const { itemId, onClose, emptyContent, execution } = props
  // The execution mounts once, in whichever container is showing (aside from lg, sheet below):
  // two copies would run two sessions.
  const desktop = useMediaQuery('(min-width: 1024px)')

  return (
    <>
      <aside
        className={cn('calendar-panel hidden lg:flex', execution && 'calendar-panel--executing')}
        aria-label="Selected activity details"
      >
        {itemId && onClose && (
          // Shown only where the panel is a drawer (Month, 1280–1439px).
          <button type="button" onClick={onClose} aria-label="Close activity details" className="calendar-panel__drawer-close">
            <X size={16} aria-hidden />
          </button>
        )}
        {itemId && execution && desktop ? (
          <div className="calendar-panel__execution">{execution}</div>
        ) : itemId ? (
          <PanelBody {...props} />
        ) : emptyContent ? (
          emptyContent
        ) : (
          <div className="calendar-panel__empty">
            <p className="text-sm font-medium text-foreground">
              Select an activity
            </p>
            <p className="mt-1 text-xs text-muted">
              Click any activity on the timeline to complete it, adjust its time,
              or view its community.
            </p>
          </div>
        )}
      </aside>

      {itemId && (
        <div
          className="calendar-sheet-backdrop lg:hidden"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Selected activity details"
        >
          <div
            className={cn('calendar-sheet', execution && 'calendar-sheet--executing')}
            onClick={(e) => e.stopPropagation()}
          >
            {execution && !desktop ? (
              <div className="calendar-panel__execution">{execution}</div>
            ) : (
              <PanelBody {...props} isMobileSheet />
            )}
          </div>
        </div>
      )}
    </>
  )
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}
