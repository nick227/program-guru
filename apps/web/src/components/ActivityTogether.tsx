// Row 3 of the locked Activity page (03-UX §6, 10-COLLABORATION §5): the people doing this
// Activity with you. It shows permitted states only — finished (with when), started, not yet,
// private — and never claims anyone is online. Reactions sit on each shared completion; shared
// photos and their comments stay in Related Media (one media section), linked from here.
import { Link } from 'react-router-dom'
import {
  useAddCompletionReaction,
  useRemoveCompletionReaction,
  type components,
} from '@project/sdk'
import { Check, Timer } from 'lucide-react'
import { Row, Stack } from '@/components/ui/Layout'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Avatar } from '@/components/ui/Avatar'
import { ErrorMessage } from '@/components/ui/Feedback'
import { linkButton } from '@/components/Navigation'
import { UnreadDot } from '@/components/UnreadDot'
import { GroupInviteLink } from '@/components/GroupInviteLink'
import { buildGroupUrl } from '@/lib/urls'
import { orderMembers, stateLabel } from '@/lib/together'
import { cn } from '@/lib/utils'

type S = components['schemas']

export const QUICK_REACTIONS = ['👏', '🔥', '💪'] as const

export function ActivityTogether({
  collaborators: c,
  viewerId,
  sharedMediaCount,
  sharedCommentCount,
  disabled,
}: {
  collaborators: S['CollaboratorSummary']
  viewerId?: string
  sharedMediaCount: number
  sharedCommentCount: number
  disabled: boolean
}) {
  const addReaction = useAddCompletionReaction()
  const removeReaction = useRemoveCompletionReaction()
  const members = orderMembers(c.members, viewerId)
  const others = members.filter((m) => m.user.id !== viewerId)
  const me = members.find((m) => m.user.id === viewerId)
  const finishedOthers = others.filter((m) => m.status === 'DONE')
  const startedOthers = others.filter((m) => m.status === 'IN_PROGRESS')
  // Only members who share and haven't finished; non-sharers are never listed as "not yet".
  const waiting = others.filter((m) => m.status === 'PENDING')
  // Shown only before anyone else has moved; afterwards the list below says who did what.
  const pulse =
    finishedOthers.length || startedOthers.length
      ? null
      : others.length
        ? 'Nobody else has started yet. You could be first.'
        : 'Invite someone to do this with you.'
  return (
    <section aria-labelledby="together-heading" className="activity-together">
      <Stack className="gap-4">
        <SectionHeader
          id="together-heading"
          title={
            <span className="inline-flex items-center gap-2">
              Doing this together
              <UnreadDot count={c.unreadCount} inline />
            </span>
          }
          description={
            <span aria-label="Group progress">
              {c.finishedCount} of {c.totalCount} finished
            </span>
          }
          action={
            <Link to={buildGroupUrl(c.groupId)} className={linkButton}>
              Open Group
            </Link>
          }
        />

        {/* Faces first: who is in this Activity with you, with their permitted state. */}
        <ul className="flex flex-wrap gap-3" aria-label="Group members on this Activity">
          {members.map((m) => (
            <li key={m.user.id} className="flex w-14 flex-col items-center gap-1 text-center">
              <span className="relative">
                <Avatar
                  src={m.user.avatarUrl}
                  name={m.user.displayName}
                  size="lg"
                  className={cn(
                    'ring-2 ring-offset-2 ring-offset-[hsl(var(--color-surface))]',
                    m.status === 'DONE'
                      ? 'ring-status-completed'
                      : m.status === 'IN_PROGRESS'
                        ? 'ring-status-active'
                        : 'ring-transparent opacity-70',
                  )}
                />
                {m.status === 'IN_PROGRESS' && (
                  <span
                    aria-hidden
                    className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-surface text-status-active ring-2 ring-surface"
                  >
                    <Timer size={12} strokeWidth={2.5} />
                  </span>
                )}
                {m.status === 'DONE' && (
                  <span
                    aria-hidden
                    className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-status-completed text-white ring-2 ring-surface"
                  >
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className="w-full truncate text-xs font-medium">
                {m.user.id === viewerId ? 'You' : m.user.displayName.split(' ')[0]}
              </span>
              <span className="sr-only">{stateLabel(m)}</span>
            </li>
          ))}
        </ul>

        {pulse && <p className="text-sm">{pulse}</p>}

        <ErrorMessage error={addReaction.error || removeReaction.error} />

        {/* Recent completions and starts, each with lightweight reactions. */}
        {(finishedOthers.length > 0 || startedOthers.length > 0 || me?.status === 'DONE') && (
          <ul className="flex flex-col gap-2" aria-label="Recent group activity">
            {[...(me?.status === 'DONE' ? [me] : []), ...finishedOthers, ...startedOthers].map((m) => (
              <li
                key={m.user.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] bg-background/60 px-3 py-2"
              >
                <span className="flex items-center gap-2 text-sm">
                  <Avatar src={m.user.avatarUrl} name={m.user.displayName} size="sm" />
                  <span>
                    <strong className="font-medium">
                      {m.user.id === viewerId ? 'You' : m.user.displayName}
                    </strong>{' '}
                    <span className="text-muted">{stateLabel(m).toLowerCase()}</span>
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
                          disabled={disabled || own}
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
                            'min-h-11 min-w-11 rounded-full border px-2.5 py-1 text-sm',
                            active
                              ? 'border-accent bg-accent/15 text-accent'
                              : 'bg-surface text-muted hover:bg-surface-muted',
                            own && 'cursor-default',
                          )}
                        >
                          {emoji}
                          {count > 0 ? ` ${count}` : ''}
                        </button>
                      )
                    })}
                  </Row>
                )}
              </li>
            ))}
          </ul>
        )}

        {waiting.length > 0 && (
          <p className="text-xs text-muted">
            Not yet: {waiting.map((m) => m.user.displayName.split(' ')[0]).join(', ')}
          </p>
        )}

        {sharedMediaCount > 0 && (
          <a href="#related-media" className="text-sm text-accent underline-offset-2 hover:underline">
            {sharedMediaCount} shared with the group
            {sharedCommentCount > 0
              ? ` · ${sharedCommentCount} comment${sharedCommentCount === 1 ? '' : 's'}`
              : ''}{' '}
            · View in Related Media
          </a>
        )}

        <Row className="justify-between gap-2">
          <p className="text-xs text-muted">
            {me?.status === 'UNKNOWN'
              ? 'You are not sharing completions with this group.'
              : me?.status === 'DONE'
                ? 'The group can see that you finished — never your results.'
                : 'When you finish, the group sees that you did — never your results.'}
          </p>
          <GroupInviteLink groupId={c.groupId} />
        </Row>
      </Stack>
    </section>
  )
}
