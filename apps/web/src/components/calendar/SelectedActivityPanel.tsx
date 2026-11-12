import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  Check,
  Clock3,
  Heart,
  Image as ImageIcon,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import {
  useActivityGroups,
  useAddCompletionComment,
  useAddCompletionReaction,
  useCompletionComments,
  useCreateCheckIns,
  useCurrentUser,
  useDeleteCompletionComment,
  useDiscoverPrograms,
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
import { buildProfileUrl, buildProgramUrl } from '@/lib/urls'
import { useMediaUploads } from '@/lib/useMediaUploads'
import { useOnline } from '@/lib/useOnline'
import { cn } from '@/lib/utils'
import type { SurfaceItem } from '@/lib/calendarGrouping'

type S = components['schemas']

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
  const activityGroups = useActivityGroups(activityId, {
    enabled: Boolean(activityId && !occurrence?.collaborators),
  })
  const fallbackGroup = useMemo(() => {
    const groups = activityGroups.data?.pages.flatMap((p) => p.data) ?? []
    return groups.find((g) => g.viewerIsMember) ?? null
  }, [activityGroups.data])

  const groupId = occurrence?.collaborators?.groupId ?? fallbackGroup?.id ?? ''
  const occurrenceKey = occurrence?.collaborators?.occurrenceKey ?? undefined

  const relatedProgramsQuery = useDiscoverPrograms({
    activityId,
    limit: 3,
    enabled: Boolean(activityId && !groupId),
  })
  const relatedPrograms = useMemo(() => {
    const pages = relatedProgramsQuery.data?.pages ?? []
    return pages
      .flatMap((p) => p.data)
      .filter((row): row is typeof row & { program: NonNullable<typeof row.program> } =>
        Boolean(row.program),
      )
      .slice(0, 3)
  }, [relatedProgramsQuery.data])

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

  const thumbUrl =
    (!thumbFailed &&
      (item?.thumbnailUrl ||
        calendarItem?.thumbnailUrl ||
        sharedMediaList[0]?.thumbnailUrl ||
        myMediaList[0]?.thumbnailUrl)) ||
    null

  const instructions = occurrence?.instructions ?? []
  const communityStats = occurrence?.communityStats ?? null
  const participationParts = [
    communityStats?.participants != null
      ? `${communityStats.participants} active`
      : null,
    communityStats?.completions != null
      ? `${communityStats.completions} recent check-ins`
      : null,
  ].filter(Boolean)

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
        {/* 1. Header: Modest Media, Title & Inline Time Adjustment */}
        <div className="calendar-panel__header">
          {thumbUrl ? (
            <img
              src={thumbUrl}
              alt=""
              onError={() => setThumbFailed(true)}
              className="calendar-panel__thumb"
            />
          ) : (
            <span className="calendar-panel__cat-badge" aria-hidden>
              <CategoryIcon category={category} size={20} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h2 className="calendar-panel__title">{title}</h2>
              <Link
                to={`/occurrences/${itemId}`}
                className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-muted hover:text-accent"
                title="Open full Activity page"
              >
                <span>Open</span>
                <ArrowUpRight size={13} aria-hidden />
              </Link>
            </div>
            <div ref={timeWrapRef} className="mt-1 flex flex-wrap items-center gap-2">
              {!isLocked && status !== 'CANCELLED' && editingTime ? (
                <div className="flex items-center gap-1.5">
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
                    className="rounded-md border border-border bg-background px-2 py-0.5 text-xs text-foreground"
                  />
                  {localTime && (
                    <button
                      type="button"
                      onClick={() => {
                        void onChangeTime(itemId, null)
                        setEditingTime(false)
                      }}
                      className="rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted hover:text-foreground"
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
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isLocked || status === 'CANCELLED'}
                  onClick={() => setEditingTime(true)}
                  className="-ml-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:pointer-events-none"
                >
                  <Clock3 size={12} aria-hidden />
                  <span>{timeDisplay ?? 'Any time'}</span>
                </button>
              )}
              {durationMinutes ? (
                <span className="text-xs text-muted">· {durationMinutes} min</span>
              ) : null}
              {programTitle ? (
                <span className="truncate text-xs text-muted">· {programTitle}</span>
              ) : null}
            </div>
          </div>
        </div>

        {/* 2. Completion Action */}
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

        {/* 3. Concise Numbered Instructions */}
        {instructions.length > 0 && !isLocked && (
          <section className="calendar-panel__section" aria-label="Instructions">
            <h3 className="calendar-panel__section-title">Instructions</h3>
            <ol className="calendar-panel__steps">
              {instructions.map((step, index) => (
                <li key={step.id} className="calendar-panel__step">
                  <span className="calendar-panel__step-num" aria-hidden>
                    {index + 1}.
                  </span>
                  <div className="min-w-0">
                    {step.title && (
                      <p className="font-medium text-foreground">{step.title}</p>
                    )}
                    {step.body && (
                      <p className="text-foreground/85">{step.body}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        <ErrorMessage
          error={
            addReaction.error ||
            removeReaction.error ||
            addComment.error ||
            createCheckIn.error
          }
        />

        {/* 4. Activity Participation & Programs (or Shared Check-ins when active) */}
        <section
          className="calendar-panel__section"
          aria-label="Participation and Programs"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="calendar-panel__section-title">
              {groupId ? 'Together' : 'Community'}
            </h3>
            {groupId && (
              <button
                type="button"
                onClick={() => setCheckInOpen(true)}
                disabled={!online}
                className="text-xs font-semibold text-accent hover:underline"
              >
                + Check in
              </button>
            )}
          </div>

          {participationParts.length > 0 && (
            <p className="text-xs text-muted">{participationParts.join(' · ')}</p>
          )}

          {groupId ? (
            <div className="space-y-3">
              {/* Participants */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  {groupPeople.length > 0 ? (
                    <AvatarStack people={groupPeople} max={4} />
                  ) : (
                    <Users size={16} className="text-muted" aria-hidden />
                  )}
                  <span className="truncate text-xs font-medium text-muted">
                    {groupCount > 0 ? `${groupCount} in this group` : 'Sharing'}
                  </span>
                </div>
                <GroupStatus
                  variant="inline"
                  activityId={activityId || undefined}
                  activityTitle={title}
                  occurrenceId={itemId}
                  canCheckIn={false}
                  items={
                    fallbackGroup
                      ? [fromPublicGroupSummary(fallbackGroup)]
                      : undefined
                  }
                  disabled={!online}
                />
              </div>

              {/* Shared Media */}
              {allViewerMedia.length > 0 && (
                <div className="grid grid-cols-4 gap-1.5">
                  {allViewerMedia.slice(0, 8).map((m, index) => (
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
                          <ImageIcon size={16} />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Recent Check-ins & Reactions */}
              {completionsQuery.isPending ? (
                <Loading />
              ) : checkInRows.length === 0 ? (
                <p className="text-xs text-muted">
                  No check-ins yet. Complete or post a note below.
                </p>
              ) : (
                <ul className="space-y-3">
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
                                  {share.media ? 'added a photo' : 'completed this'}
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
                                    className="h-20 w-28 object-cover"
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
                              size={14}
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

              {/* Comments */}
              {commentRows.length > 0 && (
                <ul className="space-y-2 border-t border-border/60 pt-2.5">
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
            </div>
          ) : relatedProgramsQuery.isPending ? (
            <Loading />
          ) : relatedPrograms.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted">Featured in public Programs</p>
              <ul className="space-y-1.5">
                {relatedPrograms.map(({ program: prog, participantCount }) => (
                  <li
                    key={prog.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-surface-raised/50 px-2.5 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <Link
                        to={buildProgramUrl(prog)}
                        className="block truncate font-semibold text-foreground hover:text-accent hover:underline"
                      >
                        {prog.title}
                      </Link>
                      {prog.creator && (
                        <span className="block truncate text-[11px] text-muted">
                          by{' '}
                          {prog.creator.handle ? (
                            <Link
                              to={buildProfileUrl(prog.creator.handle)}
                              className="hover:text-foreground hover:underline"
                            >
                              {prog.creator.displayName}
                            </Link>
                          ) : (
                            prog.creator.displayName
                          )}
                        </span>
                      )}
                    </div>
                    {participantCount != null && (
                      <span className="shrink-0 text-[11px] font-medium text-muted">
                        {participantCount} active
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : participationParts.length === 0 ? (
            <p className="text-xs text-muted">
              No public Programs include this activity yet.
            </p>
          ) : null}
        </section>
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
