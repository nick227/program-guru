import { useState } from 'react'
import { MessageSquare, Image as ImageIcon, Trash2 } from 'lucide-react'
import {
  useAddCompletionComment,
  useAddCompletionReaction,
  useCompletionComments,
  useDeleteCompletionComment,
  useRemoveCompletionReaction,
  type components,
} from '@project/sdk'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { MediaViewer, type ViewerItem } from '@/components/media/MediaViewer'
import { formatRelativeTime } from '@/lib/dates'
import { cn } from '@/lib/utils'

type S = components['schemas']
const REACTION_EMOJIS = ['👏', '🔥', '💪'] as const

function CheckInComments({
  shareId,
  disabled,
}: {
  shareId: string
  disabled: boolean
}) {
  const comments = useCompletionComments(shareId, true)
  const add = useAddCompletionComment(shareId)
  const remove = useDeleteCompletionComment(shareId)
  const [body, setBody] = useState('')
  const items = comments.data?.pages.flatMap((page) => page.data) ?? []

  return (
    <div className="mt-3 space-y-2.5 border-t border-border/60 pt-3">
      <ErrorMessage error={comments.error || add.error || remove.error} />
      {comments.isPending ? (
        <Loading />
      ) : items.length === 0 ? (
        <p className="text-xs text-muted">No comments yet. Start the conversation.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((c) => (
            <li
              key={c.id}
              className="flex items-start justify-between gap-2 rounded-lg bg-surface-muted/60 px-2.5 py-2 text-xs"
            >
              <div className="flex min-w-0 items-start gap-2">
                <Avatar src={c.author.avatarUrl} name={c.author.displayName} size="sm" />
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {c.author.displayName}{' '}
                    <span className="font-normal text-muted">
                      · {formatRelativeTime(c.createdAt)}
                    </span>
                  </p>
                  <p className="mt-0.5 break-words text-foreground/90">{c.body}</p>
                </div>
              </div>
              {c.canDelete && (
                <button
                  type="button"
                  aria-label="Delete comment"
                  disabled={disabled || remove.isPending}
                  onClick={() => remove.mutate(c.id)}
                  className="shrink-0 p-1 text-muted transition-colors hover:text-danger"
                >
                  <Trash2 size={13} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          const text = body.trim()
          if (!text || disabled || add.isPending) return
          try {
            await add.mutateAsync({ body: text, idempotencyKey: crypto.randomUUID() })
            setBody('')
          } catch {
            /* surfaced above */
          }
        }}
        className="flex items-center gap-2"
      >
        <Input
          value={body}
          maxLength={1000}
          placeholder="Add a comment…"
          disabled={disabled || add.isPending}
          onChange={(e) => setBody(e.target.value)}
          className="h-9 text-xs"
        />
        <Button
          type="submit"
          size="sm"
          disabled={disabled || !body.trim() || add.isPending}
          loading={add.isPending}
        >
          Send
        </Button>
      </form>
    </div>
  )
}

export function GroupCheckInCard({
  share,
  viewerId,
  disabled = false,
  compact = false,
  onReacted,
  onOpenMedia,
}: {
  share: S['CompletionShare']
  viewerId?: string
  disabled?: boolean
  compact?: boolean
  onReacted?: (userId: string, emoji: string) => void
  onOpenMedia?: (item: ViewerItem) => void
}) {
  const addReaction = useAddCompletionReaction()
  const removeReaction = useRemoveCompletionReaction()
  const [commentsOpen, setCommentsOpen] = useState(false)
  const own = share.user.id === viewerId
  const media = share.media ?? null
  const commentCount = share.commentCount ?? 0

  return (
    <article
      data-testid={`completion-share-${share.id}`}
      className={cn(
        'rounded-xl border border-border/70 bg-surface/90 p-3.5 transition-colors',
        compact && 'p-3',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Avatar src={share.user.avatarUrl} name={share.user.displayName} size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-medium leading-snug text-foreground">
              <span className="font-semibold">
                {own ? 'You' : share.user.displayName}
              </span>{' '}
              completed <span className="font-semibold">{share.activityTitle}</span>
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {share.programDayIndex !== null
                ? `Program Day ${share.programDayIndex + 1} · `
                : ''}
              {formatRelativeTime(share.completedAt)}
            </p>
            {share.note && (
              <p className="mt-1.5 text-sm text-foreground/90">{share.note}</p>
            )}
          </div>
        </div>
      </div>

      <ErrorMessage error={addReaction.error || removeReaction.error} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {REACTION_EMOJIS.map((emoji) => {
            const existing = share.reactions.find((r) => r.emoji === emoji)
            const active = existing?.reactedByMe ?? false
            const count = existing?.count ?? 0
            return (
              <button
                key={emoji}
                type="button"
                disabled={disabled || addReaction.isPending || removeReaction.isPending}
                aria-pressed={active}
                aria-label={`React ${emoji} to ${share.user.displayName}`}
                onClick={() => {
                  if (active) {
                    removeReaction.mutate({ shareId: share.id, emoji })
                  } else {
                    addReaction.mutate({
                      shareId: share.id,
                      emoji,
                      idempotencyKey: crypto.randomUUID(),
                    })
                    onReacted?.(share.user.id, emoji)
                  }
                }}
                className={cn(
                  'inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  active
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-border/80 bg-surface text-muted hover:bg-surface-muted hover:text-foreground',
                )}
              >
                <span>{emoji}</span>
                {count > 0 && <span className="tabular-nums">{count}</span>}
              </button>
            )
          })}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {media && onOpenMedia && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                onOpenMedia({
                  id: media.id,
                  publicationId: media.publicationId,
                  thumbnailUrl: media.thumbnailUrl,
                  type: media.type,
                  alt: media.alt,
                  credit: share.user.displayName,
                })
              }
              className="h-8 gap-1 px-2.5 text-xs text-muted hover:text-foreground"
            >
              <ImageIcon size={13} aria-hidden />
              <span>View media</span>
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={commentsOpen}
            onClick={() => setCommentsOpen((open) => !open)}
            className="h-8 gap-1 px-2.5 text-xs text-muted hover:text-foreground"
          >
            <MessageSquare size={13} aria-hidden />
            <span>
              Comment{commentCount > 0 ? ` (${commentCount})` : ''}
            </span>
          </Button>
        </div>
      </div>

      {commentsOpen && <CheckInComments shareId={share.id} disabled={disabled} />}
    </article>
  )
}

export function GroupCheckInFeed({
  shares,
  viewerId,
  disabled = false,
  emptyLabel = 'No check-ins yet. Complete an Activity and check in to begin.',
  onReacted,
}: {
  shares: S['CompletionShare'][]
  viewerId?: string
  disabled?: boolean
  emptyLabel?: string
  onReacted?: (userId: string, emoji: string) => void
}) {
  const [viewerItem, setViewerItem] = useState<ViewerItem | null>(null)

  if (shares.length === 0) {
    return <p className="text-sm text-muted">{emptyLabel}</p>
  }

  return (
    <>
      <div className="space-y-3">
        {shares.map((share) => (
          <GroupCheckInCard
            key={share.id}
            share={share}
            viewerId={viewerId}
            disabled={disabled}
            onReacted={onReacted}
            onOpenMedia={setViewerItem}
          />
        ))}
      </div>
      {viewerItem && (
        <MediaViewer
          items={[viewerItem]}
          index={0}
          onIndex={() => {}}
          onClose={() => setViewerItem(null)}
        />
      )}
    </>
  )
}

