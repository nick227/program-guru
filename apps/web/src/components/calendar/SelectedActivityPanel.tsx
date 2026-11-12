import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Check,
  ChevronRight,
  Clock3,
  Heart,
  Image as ImageIcon,
  MoreHorizontal,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import {
  useActivityGroups,
  useAddCompletionComment,
  useAddCompletionReaction,
  useCancelCalendarItem,
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
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { AvatarStack } from '@/components/social/AvatarStack'
import { GroupStatus, fromPublicGroupSummary } from '@/components/social/GroupStatus'
import { GroupCheckInModal } from '@/components/group-stage/GroupCheckInModal'
import { MediaViewer, type ViewerItem } from '@/components/media/MediaViewer'
import { CategoryIcon } from '@/components/shared/CategoryIcon'
import { resolveActivityCategory } from '@/lib/activityCategory'
import { formatRelativeTime } from '@/lib/dates'
import { formatTargetTime, parseTargetTime, targetTimeInput } from '@/lib/targetTime'
import { useMediaUploads } from '@/lib/useMediaUploads'
import { useOnline } from '@/lib/useOnline'
import { cn } from '@/lib/utils'
import type { SurfaceItem } from '@/lib/calendarGrouping'

type S = components['schemas']
type PanelTab = 'activity' | 'comments' | 'media'

export interface SelectedActivityPanelProps {
  itemId: string | null
  calendarItem?: SurfaceItem | null
  onClose?: () => void
  onComplete: (itemId: string) => Promise<void>
  onUndoComplete: (itemId: string) => Promise<void>
  onChangeTime: (itemId: string, localTime: string | null) => Promise<void>
  completing?: boolean
  undoing?: boolean
}

function PanelBody({
  itemId,
  calendarItem,
  onClose,
  onComplete,
  onUndoComplete,
  onChangeTime,
  completing = false,
  undoing = false,
  isMobileSheet = false,
}: SelectedActivityPanelProps & { isMobileSheet?: boolean }) {
  const online = useOnline()
  const me = useCurrentUser()
  const viewerId = me.data?.data.id
  const occurrenceQuery = useOccurrence(itemId ?? '')
  const occurrence = occurrenceQuery.data
  const item = occurrence?.item

  const [activeTab, setActiveTab] = useState<PanelTab>('activity')
  const [menuOpen, setMenuOpen] = useState(false)
  const [groupOpen, setGroupOpen] = useState(false)
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [heroFailed, setHeroFailed] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const addReaction = useAddCompletionReaction()
  const removeReaction = useRemoveCompletionReaction()
  const createCheckIn = useCreateCheckIns()
  const cancelItem = useCancelCalendarItem()
  const publishMedia = useMediaPublication()

  useEffect(() => {
    setActiveTab('activity')
    setMenuOpen(false)
    setGroupOpen(false)
    setViewerIndex(null)
    setHeroFailed(false)
  }, [itemId])

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [menuOpen])

  const activityId = item?.locked ? '' : (item?.activityId ?? '')
  const activityGroups = useActivityGroups(activityId, {
    enabled: Boolean(activityId && !occurrence?.collaborators),
  })
  const fallbackGroup = useMemo(() => {
    const groups = activityGroups.data?.pages.flatMap((p) => p.data) ?? []
    return groups.find((g) => g.viewerIsMember) ?? groups[0] ?? null
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
        // Error surfaced by mutation state if needed.
      }
    },
  })
  const uploading = uploads.some(
    (u) => u.stage === 'uploading' || u.stage === 'processing',
  )

  const sharedMediaList: ViewerItem[] = useMemo(() => {
    const fromGroup = groupMediaQuery.data?.pages.flatMap((p) => p.data) ?? []
    const fromOccurrence = occurrence?.sharedMedia ?? []
    const seen = new Set<string>()
    const merged: ViewerItem[] = []
    for (const m of [...fromOccurrence, ...fromGroup]) {
      if (seen.has(m.id)) continue
      seen.add(m.id)
      merged.push({
        id: m.id,
        publicationId: m.publicationId,
        thumbnailUrl: m.thumbnailUrl,
        type: m.type,
        alt: item?.title ?? 'Shared media',
      })
    }
    return merged
  }, [groupMediaQuery.data, occurrence?.sharedMedia, item?.title])

  const myMediaList: ViewerItem[] = useMemo(
    () =>
      (occurrence?.myMedia ?? []).map((m) => ({
        id: m.id,
        thumbnailUrl: m.thumbnailUrl,
        type: m.type,
        alt: item?.title ?? 'Personal media',
      })),
    [occurrence?.myMedia, item?.title],
  )

  const allViewerMedia = useMemo(
    () => [...sharedMediaList, ...myMediaList],
    [sharedMediaList, myMediaList],
  )

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
  const metaParts = [
    timeDisplay ?? 'Any time',
    durationMinutes ? `${durationMinutes} min` : null,
  ].filter(Boolean)

  const heroImageUrl =
    (!heroFailed &&
      (sharedMediaList[0]?.thumbnailUrl ||
        myMediaList[0]?.thumbnailUrl ||
        item?.thumbnailUrl ||
        calendarItem?.thumbnailUrl)) ||
    null

  const groupPeople =
    occurrence?.collaborators?.members.map((m) => ({
      id: m.user.id,
      name: m.user.displayName,
      avatarUrl: m.user.avatarUrl,
    })) ??
    (calendarItem?.avatarUrls ?? []).map((url, idx) => ({
      id: `member-${idx}`,
      name: 'Group member',
      avatarUrl: url,
    }))
  const groupCount =
    occurrence?.collaborators?.totalCount ??
    fallbackGroup?.memberCount ??
    groupPeople.length

  const canComplete =
    !isDone &&
    !isLocked &&
    status !== 'NOT_PARTICIPATING' &&
    status !== 'CANCELLED'

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
        if (activeTab !== 'comments') setActiveTab('comments')
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

      {/* 1. Activity Hero Media */}
      <div className="calendar-panel__hero">
        {heroImageUrl ? (
          <img
            src={heroImageUrl}
            alt={title}
            onError={() => setHeroFailed(true)}
            className="calendar-panel__hero-img"
          />
        ) : (
          <div className="calendar-panel__hero-fallback" aria-hidden>
            <CategoryIcon category={category} size={36} />
          </div>
        )}
      </div>

      <div className="calendar-panel__content">
        {/* 2. Title + Meta + Overflow Actions */}
        <div className="calendar-panel__header">
          <span className="calendar-panel__cat-badge" aria-hidden>
            <CategoryIcon category={category} size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="calendar-panel__title">{title}</h2>
            <p className="calendar-panel__subtitle">{metaParts.join(' · ')}</p>
          </div>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label="Activity actions"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="calendar-panel__more-btn"
            >
              <MoreHorizontal size={18} />
            </button>
            {menuOpen && (
              <div className="calendar-panel__menu" role="menu">
                {!isLocked && status !== 'CANCELLED' && (
                  <div className="border-b border-border/70 p-2.5">
                    <label className="block text-[11px] font-medium text-muted">
                      Reschedule time
                    </label>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <input
                        type="time"
                        value={targetTimeInput(localTime)}
                        onChange={(e) => {
                          const next = parseTargetTime(e.target.value)
                          if (next !== localTime) {
                            void onChangeTime(itemId, next)
                          }
                        }}
                        className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                      />
                      {localTime && (
                        <button
                          type="button"
                          onClick={() => {
                            void onChangeTime(itemId, null)
                            setMenuOpen(false)
                          }}
                          className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] text-muted hover:text-foreground"
                        >
                          Any time
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <Link
                  to={`/occurrences/${itemId}`}
                  className="calendar-panel__menu-item"
                  role="menuitem"
                >
                  <Clock3 size={14} aria-hidden />
                  <span>Open full activity</span>
                </Link>
                {!isLocked && (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!online || cancelItem.isPending}
                    onClick={async () => {
                      try {
                        await cancelItem.mutateAsync({
                          itemId,
                          scope: 'THIS_ONE',
                        })
                        toast.success('Removed from calendar')
                        setMenuOpen(false)
                        onClose?.()
                      } catch {
                        /* shown below */
                      }
                    }}
                    className="calendar-panel__menu-item text-danger"
                  >
                    <Trash2 size={14} aria-hidden />
                    <span>Remove from day</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 3. Completion Action */}
        <div className="calendar-panel__complete-wrap">
          {isLocked ? (
            <Link
              to={`/occurrences/${itemId}`}
              className="btn btn--outline w-full justify-center"
            >
              Access needed · Open Activity
            </Link>
          ) : isDone ? (
            <div className="flex items-center gap-2">
              <div className="calendar-panel__done-pill">
                <Check size={16} aria-hidden />
                <span>Completed</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={!online || undoing}
                loading={undoing}
                onClick={() => void onUndoComplete(itemId)}
              >
                Undo
              </Button>
            </div>
          ) : (
            <button
              type="button"
              disabled={!online || !canComplete || completing}
              onClick={() => void onComplete(itemId)}
              className="calendar-panel__complete-btn"
            >
              <Check size={16} aria-hidden />
              <span>{completing ? 'Saving...' : 'Mark as Complete'}</span>
            </button>
          )}
        </div>

        {/* 4. Group Members Row */}
        {(groupPeople.length > 0 || groupId) && (
          <div className="calendar-panel__group-section">
            <button
              type="button"
              aria-expanded={groupOpen}
              onClick={() => setGroupOpen((v) => !v)}
              className="calendar-panel__group-row"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                {groupPeople.length > 0 ? (
                  <AvatarStack people={groupPeople} max={3} />
                ) : (
                  <Users size={16} className="text-muted" aria-hidden />
                )}
                <span className="truncate text-xs font-medium text-muted">
                  {groupCount > 0
                    ? `${groupCount} in this group`
                    : 'View group'}
                </span>
              </div>
              <ChevronRight
                size={16}
                className={cn(
                  'shrink-0 text-muted transition-transform',
                  groupOpen && 'rotate-90',
                )}
                aria-hidden
              />
            </button>

            {groupOpen && (
              <div className="mt-2 rounded-xl border border-border/70 bg-background/50 p-3">
                <GroupStatus
                  variant="inline"
                  activityId={activityId || undefined}
                  activityTitle={title}
                  occurrenceId={itemId}
                  canCheckIn={Boolean(groupId && activityId)}
                  items={
                    fallbackGroup
                      ? [fromPublicGroupSummary(fallbackGroup)]
                      : undefined
                  }
                  disabled={!online}
                />
                {groupId && (
                  <div className="mt-2 flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCheckInOpen(true)}
                      disabled={!online}
                    >
                      Share Check-in
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 5. Community Tabs: Activity | Comments | Media */}
        <div className="calendar-panel__tabs" role="tablist" aria-label="Activity community">
          {(
            [
              { id: 'activity', label: 'Activity' },
              {
                id: 'comments',
                label:
                  commentRows.length > 0
                    ? `Comments (${commentRows.length})`
                    : 'Comments',
              },
              {
                id: 'media',
                label:
                  allViewerMedia.length > 0
                    ? `Media (${allViewerMedia.length})`
                    : 'Media',
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'calendar-panel__tab',
                activeTab === tab.id && 'calendar-panel__tab--active',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <ErrorMessage
          error={
            addReaction.error ||
            removeReaction.error ||
            addComment.error ||
            createCheckIn.error ||
            cancelItem.error
          }
        />

        {/* Tab Body */}
        <div className="calendar-panel__feed">
          {activeTab === 'activity' && (
            <>
              {!groupId ? (
                <p className="py-4 text-center text-xs text-muted">
                  No group linked to this activity yet.
                </p>
              ) : completionsQuery.isPending ? (
                <Loading />
              ) : checkInRows.length === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-xs text-muted">
                    No check-ins yet for this session.
                  </p>
                  {isDone && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => setCheckInOpen(true)}
                      disabled={!online}
                    >
                      Share Check-in
                    </Button>
                  )}
                </div>
              ) : (
                <ul className="space-y-3.5">
                  {checkInRows.map((share) => {
                    const isMe = share.user.id === viewerId
                    const liked = share.reactions.some(
                      (r) => r.emoji === '❤️' && r.reactedByMe,
                    )
                    const likeCount =
                      share.reactions.find((r) => r.emoji === '❤️')?.count ?? 0
                    return (
                      <li key={share.id} className="calendar-panel__feed-item">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-start gap-2.5">
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
                                  {share.media
                                    ? 'added a photo'
                                    : 'completed this'}
                                </span>
                              </p>
                              <p className="mt-0.5 text-[11px] text-muted">
                                {formatRelativeTime(share.completedAt)}
                              </p>
                              {share.note && (
                                <p className="mt-1 text-xs text-foreground/90">
                                  {share.note}
                                </p>
                              )}
                              {share.media?.thumbnailUrl && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const idx = allViewerMedia.findIndex(
                                      (m) => m.id === share.media!.id,
                                    )
                                    setViewerIndex(idx >= 0 ? idx : 0)
                                  }}
                                  className="mt-2 overflow-hidden rounded-lg border border-border/70"
                                >
                                  <img
                                    src={share.media.thumbnailUrl}
                                    alt="Shared check-in photo"
                                    className="h-24 w-36 object-cover"
                                  />
                                </button>
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
                            <Heart
                              size={15}
                              fill={liked ? 'currentColor' : 'none'}
                            />
                            {likeCount > 0 && <span>{likeCount}</span>}
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}

          {activeTab === 'comments' && (
            <>
              {!primaryShare ? (
                <p className="py-4 text-center text-xs text-muted">
                  Post a check-in or message below to start commenting.
                </p>
              ) : commentsQuery.isPending ? (
                <Loading />
              ) : commentRows.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted">
                  No comments yet. Say something to the group.
                </p>
              ) : (
                <ul className="space-y-2.5">
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
            </>
          )}

          {activeTab === 'media' && (
            <>
              {allViewerMedia.length === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-xs text-muted">No media shared yet.</p>
                  {groupId && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      disabled={!online || uploading}
                      onClick={() => fileRef.current?.click()}
                    >
                      Upload photo
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {allViewerMedia.map((m, index) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setViewerIndex(index)}
                      className="aspect-square overflow-hidden rounded-lg border border-border/70 bg-surface-raised"
                    >
                      {m.thumbnailUrl ? (
                        <img
                          src={m.thumbnailUrl}
                          alt={m.alt ?? 'Activity media'}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted">
                          <ImageIcon size={18} />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 6. Bottom Composer */}
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
          disabled={!online || uploading || !groupId}
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
          disabled={!online || !groupId}
          className="calendar-panel__composer-input"
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={
            !online ||
            !message.trim() ||
            !groupId ||
            addComment.isPending ||
            createCheckIn.isPending
          }
          className="calendar-panel__composer-send"
        >
          <Send size={15} />
        </button>
      </form>

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

      {viewerIndex !== null && allViewerMedia.length > 0 && (
        <MediaViewer
          items={allViewerMedia}
          index={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onIndex={setViewerIndex}
        />
      )}
    </div>
  )
}

export function SelectedActivityPanel(props: SelectedActivityPanelProps) {
  const { itemId, onClose } = props

  return (
    <>
      {/* Desktop right-side panel */}
      <aside
        className="calendar-panel hidden lg:flex"
        aria-label="Selected activity details"
      >
        {itemId ? (
          <PanelBody {...props} />
        ) : (
          <div className="calendar-panel__empty">
            <p className="text-sm font-medium text-foreground">
              Select an activity
            </p>
            <p className="mt-1 text-xs text-muted">
              Click any activity on the timeline to complete it, reschedule, or
              participate with your group.
            </p>
          </div>
        )}
      </aside>

      {/* Mobile bottom sheet */}
      {itemId && (
        <div
          className="calendar-sheet-backdrop lg:hidden"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Selected activity details"
        >
          <div
            className="calendar-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <PanelBody {...props} isMobileSheet />
          </div>
        </div>
      )}
    </>
  )
}
