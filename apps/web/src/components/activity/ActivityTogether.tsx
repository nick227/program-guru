// Row 3 of the locked Activity page (03-UX §6, 10-COLLABORATION §5): the people doing this
// Activity with you. It shows permitted states only — finished (with when), started, not yet,
// private — and never claims anyone is online. Reactions sit on each shared completion; shared
// photos and their comments stay in Related Media (one media section), linked from here.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useAddCompletionReaction,
  useGroupCompletions,
  useRemoveCompletionReaction,
  type components,
} from '@project/sdk'
import { Check, CheckCircle2, Timer, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Row, Stack } from '@/components/ui/Layout'
import { Avatar } from '@/components/ui/Avatar'
import { ErrorMessage } from '@/components/ui/Feedback'
import { linkButton } from '@/components/shared/Navigation'
import { UnreadDot } from '@/components/shared/UnreadDot'
import { GroupInviteLink } from '@/components/social/GroupInviteLink'
import { GroupCheckInFeed } from '@/components/group-stage/GroupCheckInFeed'
import { GroupCheckInModal } from '@/components/group-stage/GroupCheckInModal'
import { buildGroupUrl } from '@/lib/urls'
import { orderMembers, stateLabel } from '@/lib/together'
import { cn } from '@/lib/utils'

type S = components['schemas']

export const QUICK_REACTIONS = ['👏', '🔥', '💪'] as const

export function ActivityTogether({
  collaborators: c,
  viewerId,
  activityId,
  activityTitle,
  calendarItemId,
  canCheckIn = false,
  sharedMediaCount,
  sharedCommentCount,
  disabled,
}: {
  collaborators: S['CollaboratorSummary']
  viewerId?: string
  activityId?: string
  activityTitle?: string
  calendarItemId?: string
  canCheckIn?: boolean
  sharedMediaCount: number
  sharedCommentCount: number
  disabled: boolean
}) {
  const addReaction = useAddCompletionReaction()
  const removeReaction = useRemoveCompletionReaction()
  const completions = useGroupCompletions(c.groupId, c.occurrenceKey ?? undefined)
  const [checkInOpen, setCheckInOpen] = useState(false)
  const checkInRows = completions.data?.pages.flatMap((page) => page.data) ?? []
  const members = orderMembers(c.members, viewerId)
  const others = members.filter((m) => m.user.id !== viewerId)
  const me = members.find((m) => m.user.id === viewerId)
  const finishedOthers = others.filter((m) => m.status === 'DONE')
  const startedOthers = others.filter((m) => m.status === 'IN_PROGRESS')
  // Only members who share and haven't finished; non-sharers are never listed as "not yet".
  const waiting = others.filter((m) => m.status === 'PENDING')
  const feedMembers = [
    ...(me?.status === 'DONE' ? [me] : []),
    ...finishedOthers,
    ...startedOthers,
  ]
  // Shown only before anyone else has moved; afterwards the list below says who did what.
  const pulse =
    finishedOthers.length || startedOthers.length
      ? null
      : others.length
        ? waiting.length === others.length
          ? 'Nobody else has started yet. You could be first.'
          : null
        : 'Invite someone to do this with you.'
  const extraCount = Math.max(0, members.length - 3)

  return (
    <section
      id="together"
      aria-labelledby="together-heading"
      className="activity-card activity-together"
    >
      <div className="activity-card__header">
        <div className="activity-card__title">
          <Users size={18} className="shrink-0 text-accent" aria-hidden />
          <h2 id="together-heading" className="inline-flex items-center gap-2">
            Together
            <UnreadDot count={c.unreadCount} inline />
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {members.length > 0 && (
            <div className="flex items-center -space-x-2" aria-hidden>
              {members.slice(0, 3).map((m) => (
                <Avatar
                  key={m.user.id}
                  src={m.user.avatarUrl}
                  name={m.user.displayName}
                  size="sm"
                  className="ring-2 ring-surface"
                />
              ))}
              {extraCount > 0 && (
                <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-surface-muted px-1.5 text-[11px] font-semibold text-text ring-2 ring-surface">
                  +{extraCount}
                </span>
              )}
            </div>
          )}
          <span aria-label="Group progress" className="text-xs font-medium text-muted">
            {c.finishedCount} of {c.totalCount} finished
          </span>
          {canCheckIn && activityId && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => setCheckInOpen(true)}
              className="gap-1.5 text-xs"
            >
              <CheckCircle2 size={14} aria-hidden />
              <span>Share Check-in</span>
            </Button>
          )}
          <Link to={buildGroupUrl(c.groupId)} className={cn(linkButton, 'text-xs')}>
            Open Group
          </Link>
        </div>
      </div>

      {c.totalCount > 0 && (
        <progress
          className="activity-group-progress"
          aria-label="Shared group completions"
          value={c.finishedCount}
          max={c.totalCount}
        />
      )}

      <div className="activity-together__split">
        <div className="activity-together__feed">
          <ErrorMessage error={addReaction.error || removeReaction.error} />

          {feedMembers.length > 0 ? (
            <ul className="flex flex-col gap-2" aria-label="Recent group activity">
              {feedMembers.map((m) => (
                <li
                  key={m.user.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border border-border/70 bg-background/55 px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2.5 text-sm">
                    <Avatar src={m.user.avatarUrl} name={m.user.displayName} size="sm" />
                    <span className="min-w-0">
                      <strong className="font-medium">
                        {m.user.id === viewerId ? 'You' : m.user.displayName}
                      </strong>{' '}
                      <span className="inline-flex items-center gap-1 text-xs text-muted">
                        {m.status === 'DONE' && (
                          <Check size={12} className="text-status-completed" aria-hidden />
                        )}
                        {m.status === 'IN_PROGRESS' && (
                          <Timer size={12} className="text-status-active" aria-hidden />
                        )}
                        {stateLabel(m).toLowerCase()}
                      </span>
                    </span>
                  </span>
                  {m.completionShareId && (
                    <Row className="gap-1">
                      {QUICK_REACTIONS.map((emoji) => {
                        const existing = m.reactions.find((r) => r.emoji === emoji)
                        const active = existing?.reactedByMe ?? false
                        const count = existing?.count ?? 0
                        const own = m.user.id === viewerId
                        if (own && !count) return null
                        return (
                          <button
                            key={emoji}
                            type="button"
                            disabled={
                              disabled || own || addReaction.isPending || removeReaction.isPending
                            }
                            aria-pressed={active}
                            aria-label={
                              own
                                ? `${count} ${emoji} on your completion`
                                : `React ${emoji} to ${m.user.displayName}`
                            }
                            onClick={() =>
                              active
                                ? removeReaction.mutate({ shareId: m.completionShareId!, emoji })
                                : addReaction.mutate({
                                    shareId: m.completionShareId!,
                                    emoji,
                                    idempotencyKey: crypto.randomUUID(),
                                  })
                            }
                            className={cn(
                              'inline-flex min-h-8 min-w-8 items-center justify-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                              active
                                ? 'border-accent bg-accent/15 text-accent'
                                : 'border-border/80 bg-surface text-muted hover:bg-surface-muted hover:text-text',
                              own && 'cursor-default',
                            )}
                          >
                            <span>{emoji}</span>
                            {count > 0 && <span className="tabular-nums">{count}</span>}
                          </button>
                        )
                      })}
                    </Row>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Stack className="gap-3">
              {/* Faces first when nobody has finished or started yet. */}
              <ul className="flex flex-wrap gap-3" aria-label="Group members on this Activity">
                {members.map((m) => (
                  <li key={m.user.id} className="flex w-12 flex-col items-center gap-1 text-center">
                    <Avatar
                      src={m.user.avatarUrl}
                      name={m.user.displayName}
                      size="md"
                      className="opacity-80 ring-1 ring-border"
                    />
                    <span className="w-full truncate text-xs font-medium">
                      {m.user.id === viewerId ? 'You' : m.user.displayName.split(' ')[0]}
                    </span>
                    <span className="sr-only">{stateLabel(m)}</span>
                  </li>
                ))}
              </ul>
              {pulse && <p className="text-sm text-muted">{pulse}</p>}
            </Stack>
          )}

          {waiting.length > 0 && (
            <p className="text-xs text-muted">
              Not yet: {waiting.map((m) => m.user.displayName.split(' ')[0]).join(', ')}
            </p>
          )}

          {checkInRows.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Check-in discussion &amp; media
              </p>
              <GroupCheckInFeed
                shares={checkInRows}
                viewerId={viewerId}
                disabled={disabled}
              />
            </div>
          )}

          {sharedMediaCount > 0 && (
            <a
              href="#related-media"
              className="text-xs font-medium text-accent underline-offset-2 hover:underline"
            >
              {sharedMediaCount} shared with the group
              {sharedCommentCount > 0
                ? ` · ${sharedCommentCount} comment${sharedCommentCount === 1 ? '' : 's'}`
                : ''}{' '}
              · View in Related Media
            </a>
          )}
        </div>

        <aside className="activity-together__invite">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Users size={18} aria-hidden />
          </span>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Do it together</h3>
            <p className="text-xs text-muted">
              Stay consistent with your group and keep each other motivated.
            </p>
          </div>
          <GroupInviteLink groupId={c.groupId} variant="default" size="sm" />
        </aside>
      </div>

      <p className="text-xs text-muted">
        {!me || me.status === 'UNKNOWN'
          ? 'You are not sharing completions with this group.'
          : me?.status === 'DONE'
            ? 'The group can see that you finished — never your results.'
            : 'When you finish, the group sees that you did — never your results.'}
      </p>

      {activityId && (
        <GroupCheckInModal
          open={checkInOpen}
          onClose={() => setCheckInOpen(false)}
          defaultGroupId={c.groupId}
          activityId={activityId}
          activityTitle={activityTitle}
          calendarItemId={calendarItemId}
        />
      )}
    </section>
  )
}
