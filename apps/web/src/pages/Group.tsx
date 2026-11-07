import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  useAcceptGroupInvitation,
  useAddCompletionReaction,
  useCreateGroupInvitation,
  useCurrentUser,
  useGroup,
  useGroupCompletions,
  useGroupInvitation,
  useGroupInvitations,
  useRemoveCompletionReaction,
  useRevokeGroupInvitation,
  useUpdateMyGroupMembership,
  useUpdatePreferences,
} from '@project/sdk'
import { toast } from 'sonner'
import { Page, Stage, Stack, Panel, Row } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Avatar } from '@/components/ui/Avatar'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Back, linkButton } from '@/components/Navigation'
import { dateLabel } from '@/lib/dates'
import { useOnline } from '@/lib/useOnline'

const REACTION_EMOJIS = ['👏', '🔥', '💪'] as const

export function GroupInvitationJoinPage() {
  const { token = '' } = useParams()
  const me = useCurrentUser()
  const invite = useGroupInvitation(token)
  const accept = useAcceptGroupInvitation()
  const navigate = useNavigate()
  const online = useOnline()

  const preview = invite.data

  return (
    <Page>
      <Stage>
        <Back to="/">Calendar</Back>
        <h1>Group Invitation</h1>
        <ErrorMessage
          error={invite.error || accept.error}
          retry={() => void invite.refetch()}
        />

        {invite.isPending ? (
          <Loading />
        ) : !preview ? (
          <Panel>
            <p className="text-muted">
              This invitation link is no longer valid or has expired.
            </p>
          </Panel>
        ) : (
          <Stack className="gap-4">
            <Panel>
              <Stack className="gap-3">
                <Row className="gap-3">
                  <Avatar
                    src={preview.inviter.avatarUrl}
                    name={preview.inviter.displayName}
                    size="md"
                  />
                  <div>
                    <p className="text-xs text-muted">Invited by</p>
                    <p className="font-semibold">
                      {preview.inviter.displayName} (@{preview.inviter.handle})
                    </p>
                  </div>
                </Row>

                <div>
                  <h2>{preview.groupName || preview.program.title}</h2>
                  <p className="mt-1 text-sm text-muted">
                    Program: <strong>{preview.program.title}</strong> ·{' '}
                    {preview.mode === 'SYNC'
                      ? `Shared schedule${preview.startLocalDate ? ` starting ${dateLabel(preview.startLocalDate)}` : ''}`
                      : 'Flexible pace'}
                  </p>
                </div>

                <div className="rounded-lg border bg-surface-muted p-3 text-xs text-muted">
                  <strong>Privacy notice:</strong> Group members can see your
                  name, avatar, and when you complete an Activity. Your recorded
                  metric numbers, notes, and personal media stay private unless
                  you choose to share them.
                </div>

                {!me.data ? (
                  <Link
                    to={`/login?returnTo=${encodeURIComponent(`/join/${token}`)}`}
                    className={linkButton}
                  >
                    Sign in to accept invitation
                  </Link>
                ) : preview.requiresAccess ? (
                  <Stack className="gap-2">
                    <p className="text-sm text-attention">
                      This Program requires access before you can join the
                      group.
                    </p>
                    <Link
                      to={`/programs/${preview.program.id}`}
                      className={linkButton}
                    >
                      View Program Access
                    </Link>
                  </Stack>
                ) : (
                  <Row>
                    <Button
                      disabled={!online || !preview.canAccept}
                      loading={accept.isPending}
                      onClick={async () => {
                        try {
                          const group = await accept.mutateAsync(token)
                          toast.success('Group invitation accepted')
                          if (preview.program.myEnrollmentId) {
                            navigate(`/groups/${group.id}`)
                          } else {
                            navigate(
                              `/programs/${preview.program.id}?groupId=${encodeURIComponent(group.id)}`,
                            )
                          }
                        } catch {
                          /* shown via ErrorMessage */
                        }
                      }}
                    >
                      Accept invitation
                    </Button>
                    <Link
                      to={`/programs/${preview.program.id}`}
                      className={linkButton}
                    >
                      Preview Program
                    </Link>
                  </Row>
                )}
              </Stack>
            </Panel>
          </Stack>
        )}
      </Stage>
    </Page>
  )
}

export function GroupPage() {
  const { id = '', invitationId } = useParams()
  const [params] = useSearchParams()
  const tokenParam = params.get('token')?.trim() ?? ''
  const navigate = useNavigate()
  const online = useOnline()

  const me = useCurrentUser()
  const group = useGroup(id)
  const invitations = useGroupInvitations(id, !!group.data)
  const completions = useGroupCompletions(id)
  const updateMembership = useUpdateMyGroupMembership(id)
  const updatePrefs = useUpdatePreferences()
  const createInvite = useCreateGroupInvitation(id)
  const revokeInvite = useRevokeGroupInvitation(id)
  const acceptToken = useAcceptGroupInvitation()
  const addReaction = useAddCompletionReaction()
  const removeReaction = useRemoveCompletionReaction()

  const [inviteHandle, setInviteHandle] = useState('')
  const [latestJoinUrl, setLatestJoinUrl] = useState<string | null>(null)
  const [manualToken, setManualToken] = useState(tokenParam)

  const mutedGroupIds =
    me.data?.data.preferences.notifications.mutedGroupIds ?? []
  const isMuted = mutedGroupIds.includes(id)
  const g = group.data
  const completionRows =
    completions.data?.pages.flatMap((page) => page.data) ?? []

  const extractToken = (value: string) => {
    const trimmed = value.trim()
    const match = trimmed.match(/\/join\/([^/?#]+)/)
    return match ? match[1]! : trimmed
  }

  return (
    <Page>
      <Stage>
        <Row className="justify-between">
          <Back to="/notifications">Notifications</Back>
          <Link to="/" className={linkButton}>
            Calendar
          </Link>
        </Row>

        {group.isPending ? (
          <Loading />
        ) : !g ? (
          <Panel>
            <Stack className="gap-3">
              <h1>Group Invitation</h1>
              {invitationId && (
                <p className="text-sm text-muted">
                  Invitation reference: <code>{invitationId}</code>. To protect
                  member privacy, accepting a group invitation requires the
                  invitation token or share link from the inviter.
                </p>
              )}
              <ErrorMessage error={acceptToken.error || group.error} />
              <label className="block space-y-2 text-sm">
                <span className="font-medium">
                  Paste invitation link or token
                </span>
                <Input
                  value={manualToken}
                  placeholder="/join/... or invitation token"
                  onChange={(e) => setManualToken(e.target.value)}
                />
              </label>
              <Row>
                <Button
                  disabled={!online || !extractToken(manualToken)}
                  loading={acceptToken.isPending}
                  onClick={async () => {
                    const tok = extractToken(manualToken)
                    if (!tok) return
                    try {
                      const accepted = await acceptToken.mutateAsync(tok)
                      toast.success('Joined group')
                      navigate(`/groups/${accepted.id}`, { replace: true })
                      void group.refetch()
                    } catch {
                      /* shown above */
                    }
                  }}
                >
                  Accept invitation
                </Button>
                {extractToken(manualToken) && (
                  <Link
                    to={`/join/${encodeURIComponent(extractToken(manualToken))}`}
                    className={linkButton}
                  >
                    Preview invitation
                  </Link>
                )}
              </Row>
            </Stack>
          </Panel>
        ) : (
          <Stack className="gap-4">
            <Stack className="gap-1">
              <p className="text-xs text-muted">
                {g.programTitle} ·{' '}
                {g.mode === 'SYNC' ? 'Shared schedule' : 'Flexible pace'}
              </p>
              <h1>{g.name || g.programTitle}</h1>
              <p className="text-xs text-muted">
                {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}
                {g.startLocalDate
                  ? ` · Starts ${dateLabel(g.startLocalDate)}`
                  : ''}
                {g.timezone ? ` · ${g.timezone.replaceAll('_', ' ')}` : ''}
              </p>
            </Stack>

            <Panel>
              <Stack className="gap-3">
                <h2>Participation &amp; Notification Settings</h2>
                <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border p-3">
                  <div>
                    <span className="block font-medium">
                      Share my Activity completions
                    </span>
                    <span className="block text-xs text-muted">
                      Let group members see when you finish an Activity. Metric
                      values stay private.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    aria-label="Share my Activity completions"
                    checked={g.mySharedCompletion}
                    disabled={!online || updateMembership.isPending}
                    onChange={(e) =>
                      updateMembership.mutate({
                        sharedCompletion: e.target.checked,
                      })
                    }
                    className="h-5 w-5 accent-accent"
                  />
                </label>

                <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border p-3">
                  <div>
                    <span className="block font-medium">
                      Mute notifications from this group
                    </span>
                    <span className="block text-xs text-muted">
                      Silence completion and comment alerts from this group.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    aria-label="Mute notifications from this group"
                    checked={isMuted}
                    disabled={!online || updatePrefs.isPending}
                    onChange={(e) => {
                      const nextMuted = e.target.checked
                        ? [...mutedGroupIds, id]
                        : mutedGroupIds.filter((gid) => gid !== id)
                      updatePrefs.mutate({
                        notifications: { mutedGroupIds: nextMuted },
                      })
                    }}
                    className="h-5 w-5 accent-accent"
                  />
                </label>
                <ErrorMessage
                  error={updateMembership.error || updatePrefs.error}
                />
              </Stack>
            </Panel>

            <Panel>
              <Stack className="gap-3">
                <h2>Members ({g.members.length})</h2>
                <Stack className="gap-2">
                  {g.members.map((m) => (
                    <Row key={m.user.id} className="justify-between">
                      <Link
                        to={`/u/${m.user.handle}`}
                        className="flex items-center gap-2 hover:underline"
                      >
                        <Avatar
                          src={m.user.avatarUrl}
                          name={m.user.displayName}
                          size="sm"
                        />
                        <span>{m.user.displayName}</span>
                        <span className="text-xs text-muted">
                          @{m.user.handle}
                        </span>
                      </Link>
                      <span className="text-xs text-muted">
                        {m.role === 'OWNER' ? 'Owner' : 'Member'} ·{' '}
                        {m.sharedCompletion ? 'Sharing status' : 'Private'}
                      </span>
                    </Row>
                  ))}
                </Stack>
              </Stack>
            </Panel>

            <Panel>
              <Stack className="gap-3">
                <h2>Invite Collaborators</h2>
                <Row className="items-end gap-2">
                  <label className="min-w-0 flex-1 space-y-1 text-sm">
                    <span>Invite by handle</span>
                    <Input
                      aria-label="Invite by handle"
                      placeholder="handle"
                      value={inviteHandle}
                      disabled={!online || createInvite.isPending}
                      onChange={(e) => setInviteHandle(e.target.value)}
                    />
                  </label>
                  <Button
                    disabled={!online || !inviteHandle.trim()}
                    loading={createInvite.isPending}
                    onClick={async () => {
                      try {
                        const created = await createInvite.mutateAsync({
                          kind: 'USER',
                          handle: inviteHandle.trim().replace(/^@/, ''),
                        })
                        setInviteHandle('')
                        if (created.joinUrl) setLatestJoinUrl(created.joinUrl)
                        toast.success('Invitation sent')
                      } catch {
                        /* shown below */
                      }
                    }}
                  >
                    Invite user
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!online}
                    loading={createInvite.isPending}
                    onClick={async () => {
                      try {
                        const created = await createInvite.mutateAsync({
                          kind: 'LINK',
                        })
                        if (created.joinUrl) setLatestJoinUrl(created.joinUrl)
                        toast.success('Join link created')
                      } catch {
                        /* shown below */
                      }
                    }}
                  >
                    Create join link
                  </Button>
                </Row>

                {latestJoinUrl && (
                  <div className="rounded-lg border bg-surface-muted p-3 text-xs">
                    <p className="font-medium">Shareable join link:</p>
                    <code className="mt-1 block break-all">
                      {latestJoinUrl}
                    </code>
                  </div>
                )}

                <ErrorMessage
                  error={createInvite.error || revokeInvite.error}
                />

                {!!invitations.data?.length && (
                  <Stack className="gap-2 pt-2">
                    <h3 className="text-xs font-semibold text-muted">
                      Active &amp; Recent Invitations
                    </h3>
                    {invitations.data.map((inv) => (
                      <Row
                        key={inv.id}
                        className="justify-between rounded border p-2 text-xs"
                      >
                        <span>
                          {inv.kind} · {inv.status}
                          {inv.invitedUser
                            ? ` · @${inv.invitedUser.handle}`
                            : ''}
                        </span>
                        {inv.status === 'PENDING' && (
                          <Button
                            variant="ghost"
                            className="min-h-11 px-2 py-1 text-xs"
                            disabled={!online || revokeInvite.isPending}
                            onClick={() => revokeInvite.mutate(inv.id)}
                          >
                            Revoke
                          </Button>
                        )}
                      </Row>
                    ))}
                  </Stack>
                )}
              </Stack>
            </Panel>

            <Panel>
              <Stack className="gap-3">
                <h2>Group Completions</h2>
                <ErrorMessage
                  error={
                    completions.error ||
                    addReaction.error ||
                    removeReaction.error
                  }
                />
                {completions.isPending ? (
                  <Loading />
                ) : completionRows.length === 0 ? (
                  <p className="text-sm text-muted">
                    No shared Activity completions yet.
                  </p>
                ) : (
                  <Stack className="gap-2">
                    {completionRows.map((share) => (
                      <div
                        key={share.id}
                        data-testid={`completion-share-${share.id}`}
                        className="rounded-lg border p-3"
                      >
                        <Row className="justify-between">
                          <Row className="gap-2">
                            <Avatar
                              src={share.user.avatarUrl}
                              name={share.user.displayName}
                              size="sm"
                            />
                            <div>
                              <p className="text-sm font-semibold">
                                {share.user.displayName} completed{' '}
                                {share.activityTitle}
                              </p>
                              <p className="text-xs text-muted">
                                {dateLabel(share.completedAt.slice(0, 10))}
                              </p>
                            </div>
                          </Row>
                        </Row>
                        <Row className="mt-2 gap-2">
                          {REACTION_EMOJIS.map((emoji) => {
                            const existing = share.reactions.find(
                              (r) => r.emoji === emoji,
                            )
                            const active = existing?.reactedByMe ?? false
                            const count = existing?.count ?? 0
                            return (
                              <button
                                key={emoji}
                                type="button"
                                disabled={!online}
                                aria-pressed={active}
                                aria-label={`React ${emoji} to ${share.user.displayName}`}
                                onClick={() =>
                                  active
                                    ? removeReaction.mutate({
                                        shareId: share.id,
                                        emoji,
                                      })
                                    : addReaction.mutate({
                                        shareId: share.id,
                                        emoji,
                                        idempotencyKey: crypto.randomUUID(),
                                      })
                                }
                                className={`min-h-11 rounded-full border px-3 py-1 text-xs ${
                                  active
                                    ? 'border-accent bg-accent/15 text-accent'
                                    : 'bg-surface text-muted hover:bg-surface-muted'
                                }`}
                              >
                                {emoji} {count > 0 ? count : ''}
                              </button>
                            )
                          })}
                        </Row>
                      </div>
                    ))}
                  </Stack>
                )}
              </Stack>
            </Panel>
          </Stack>
        )}
      </Stage>
    </Page>
  )
}
