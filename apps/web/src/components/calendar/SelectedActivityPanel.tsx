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
  useCreateGroup,
  useCurrentUser,
  useDeleteCompletionComment,
  useEnrollment,
  useGroupCompletions,
  useGroupMedia,
  useMediaPublication,
  useOccurrence,
  useRemoveCompletionReaction,
  type components,
} from '@project/sdk'
import { toast } from 'sonner'
import { ActivityInstructions } from '@/components/activity/ActivityInstructions'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { AvatarStack } from '@/components/social/AvatarStack'
import { GroupStatus, fromPublicGroupSummary } from '@/components/social/GroupStatus'
import { GroupCheckInModal } from '@/components/group-stage/GroupCheckInModal'
import { MediaViewer, type ViewerItem } from '@/components/media/MediaViewer'
import { CategoryIcon } from '@/components/shared/CategoryIcon'
import { resolveActivityCategory } from '@/lib/activityCategory'
import { buildBrowseUrl } from '@/lib/browse'
import { formatRelativeTime } from '@/lib/dates'
import { formatTargetTime, parseTargetTime, targetTimeInput } from '@/lib/targetTime'
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
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupVisibility, setGroupVisibility] = useState<'PRIVATE' | 'PUBLIC'>('PRIVATE')
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [thumbFailed, setThumbFailed] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)
  const timeWrapRef = useRef<HTMLDivElement>(null)

  const addReaction = useAddCompletionReaction()
  const removeReaction = useRemoveCompletionReaction()
  const createCheckIn = useCreateCheckIns()
  const createGroup = useCreateGroup()
  const publishMedia = useMediaPublication()

  useEffect(() => {
    setEditingTime(false)
    setCreatingGroup(false)
    setGroupName('')
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
  const enrollment = useEnrollment(item?.enrollmentId ?? '')
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
  const programVersionId = enrollment.data?.programVersionId ?? null
  const programId = enrollment.data?.program.id ?? null

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

  const handleCreateGroup = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!programVersionId || !online || createGroup.isPending) return
    try {
      await createGroup.mutateAsync({
        programVersionId,
        name: groupName.trim() || null,
        mode: 'ASYNC',
        visibility: groupVisibility,
        joinPolicy: groupVisibility === 'PUBLIC' ? 'OPEN' : 'INVITE_ONLY',
      })
      toast.success('Group created')
      setCreatingGroup(false)
      setGroupName('')
      void occurrenceQuery.refetch()
    } catch {
      // Error surfaced below.
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
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 -ml-1.5 text-xs text-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:pointer-events-none"
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

        {/* 3. Concise Instructions */}
        {instructions.length > 0 && (
          <section className="calendar-panel__section" aria-label="Instructions">
            <h3 className="calendar-panel__section-title">Instructions</h3>
            <div className="calendar-panel__instructions">
              <ActivityInstructions instructions={instructions} locked={isLocked} />
            </div>
          </section>
        )}

        <ErrorMessage
          error={
            addReaction.error ||
            removeReaction.error ||
            addComment.error ||
            createCheckIn.error ||
            createGroup.error
          }
        />

        {/* 4. Together (always included, even when there are no Groups) */}
        <section className="calendar-panel__section" aria-label="Together">
          <div className="flex items-center justify-between gap-2">
            <h3 className="calendar-panel__section-title">Together</h3>
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

          {!groupId ? (
            <div className="rounded-xl border border-dashed border-border/80 bg-background/40 p-3.5">
              <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                <Users size={15} className="text-muted" aria-hidden />
                <span>No Group yet</span>
              </div>
              <p className="mt-1 text-xs text-muted">
                Join or start a group to share check-ins, encouragement, and media.
              </p>

              {creatingGroup && programVersionId ? (
                <form
                  onSubmit={(e) => void handleCreateGroup(e)}
                  className="mt-3 space-y-2 border-t border-border/60 pt-3"
                >
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Group name (optional)"
                    className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted"
                  />
                  <select
                    value={groupVisibility}
                    onChange={(e) =>
                      setGroupVisibility(e.target.value as 'PRIVATE' | 'PUBLIC')
                    }
                    aria-label="Group visibility"
                    className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground"
                  >
                    <option value="PRIVATE">Private (invite only)</option>
                    <option value="PUBLIC">Public (open to join)</option>
                  </select>
                  <div className="flex items-center gap-2">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!online || createGroup.isPending}
                      loading={createGroup.isPending}
                    >
                      Create
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setCreatingGroup(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link
                    to={
                      programId
                        ? `/programs/${programId}#groups`
                        : buildBrowseUrl({ kind: 'programs' })
                    }
                    className="btn btn--outline btn--sm text-xs"
                  >
                    Find Group
                  </Link>
                  {programVersionId ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setCreatingGroup(true)}
                      disabled={!online}
                    >
                      Create Group
                    </Button>
                  ) : (
                    <Link
                      to="/programs/new"
                      className="btn btn--outline btn--sm text-xs"
                    >
                      Create Group
                    </Link>
                  )}
                </div>
              )}
            </div>
          ) : (
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
                    {groupCount > 0 ? `${groupCount} in this group` : 'Group'}
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
          )}
        </section>
      </div>

      {/* Bottom Composer (when Group exists) */}
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
              or participate with your group.
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
