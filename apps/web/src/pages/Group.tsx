import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  useAcceptGroupInvitation,
  useAcceptMyGroupInvitation,
  useAddCompletionReaction,
  useCreateGroupInvitation,
  useCurrentUser,
  useDeclineGroupInvitation,
  useDeclineMyGroupInvitation,
  useEnrollment,
  useGroup,
  useGroupCompletions,
  useGroupInvitation,
  useGroupInvitations,
  useMyGroupInvitations,
  useRemoveCompletionReaction,
  useRemoveGroupMember,
  useRevokeGroupInvitation,
  useUpdateMyGroupMembership,
  useUpdatePreferences,
  type components,
} from '@project/sdk'
import { toast } from 'sonner'
import { Page, Stage, Stack, Panel, Row } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Avatar } from '@/components/ui/Avatar'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Back, linkButton } from '@/components/Navigation'
import { calendarUrl, dateLabel, isLocalDate, today } from '@/lib/dates'
import {
  getAvailableTimezones,
  isValidTimezone,
} from '@/lib/notifications'
import { useOnline } from '@/lib/useOnline'

type S = components['schemas']
const REACTION_EMOJIS = ['👏', '🔥', '💪'] as const

interface InvitationViewProps {
  preview: S['InvitationPreview']
  returnToPath: string
  canDecline: boolean
  accepting: boolean
  declining: boolean
  error: unknown
  onAccept: (
    enrollment?: S['AcceptGroupInvitationInput']['enrollment'],
  ) => Promise<S['GroupDetail']>
  onDecline?: () => Promise<unknown>
}

function InvitationDecisionPanel({
  preview,
  returnToPath,
  canDecline,
  accepting,
  declining,
  error,
  onAccept,
  onDecline,
}: InvitationViewProps) {
  const me = useCurrentUser()
  const online = useOnline()
  const navigate = useNavigate()

  const defaultTz =
    me.data?.data.preferences.timezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    'UTC'
  const [timezone, setTimezone] = useState(defaultTz)
  const [customDate, setCustomDate] = useState('')
  const idempotencyKey = useRef(crypto.randomUUID())

  const joinStatus: S['GroupJoinState']['status'] =
    preview.join?.status ??
    (!me.data
      ? 'SIGN_IN_REQUIRED'
      : preview.requiresAccess
        ? 'ACCESS_REQUIRED'
        : !preview.canAccept
          ? 'UNAVAILABLE'
          : preview.program.myEnrollmentId
            ? 'READY_TO_JOIN'
            : preview.mode === 'SYNC' && preview.startLocalDate
              ? 'CONFIRM_ENROLLMENT'
              : 'SELECT_SCHEDULE')

  const fixedStart =
    preview.join?.startLocalDate ?? preview.startLocalDate ?? today(timezone)
  const selectedStart =
    joinStatus === 'CONFIRM_ENROLLMENT'
      ? fixedStart
      : customDate || today(timezone)
  const needsEnrollment =
    joinStatus === 'CONFIRM_ENROLLMENT' || joinStatus === 'SELECT_SCHEDULE'
  const scheduleValid =
    !needsEnrollment ||
    (isLocalDate(selectedStart) && isValidTimezone(timezone))
  const timezones = getAvailableTimezones(timezone)

  return (
    <Panel>
      <Stack className="gap-4">
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
              ? `Shared schedule${fixedStart ? ` starting ${dateLabel(fixedStart)}` : ''}`
              : 'Flexible pace'}
          </p>
        </div>

        <div className="rounded-lg border bg-surface-muted p-3 text-xs text-muted">
          <strong>Privacy notice:</strong> Group members can see your name,
          avatar, and when you complete an Activity. Your recorded metric
          numbers, notes, and personal media stay private unless you choose to
          share them. You can turn off completion sharing at any time.
        </div>

        <ErrorMessage error={error} />

        {joinStatus === 'SIGN_IN_REQUIRED' || !me.data ? (
          <Link
            to={`/login?returnTo=${encodeURIComponent(returnToPath)}`}
            className={linkButton}
          >
            Sign in to accept invitation
          </Link>
        ) : joinStatus === 'ACCESS_REQUIRED' ||
          joinStatus === 'PAYMENT_REQUIRED' ? (
          <Stack className="gap-2">
            <p className="text-sm text-attention">
              {joinStatus === 'PAYMENT_REQUIRED'
                ? 'This Program requires purchase before you can join the group.'
                : 'This Program requires access before you can join the group.'}
            </p>
            <Row>
              <Link
                to={`/programs/${preview.program.id}`}
                className={linkButton}
              >
                View Program Access
              </Link>
              {canDecline && onDecline && (
                <Button
                  variant="outline"
                  disabled={!online || declining}
                  loading={declining}
                  onClick={() => void onDecline()}
                >
                  Decline invitation
                </Button>
              )}
            </Row>
          </Stack>
        ) : joinStatus === 'ENROLLED_OTHER_VERSION' ? (
          <Stack className="gap-2">
            <p className="text-sm text-attention">
              You are following a different version of this Program. Update or
              leave that enrollment first, then accept this invitation.
            </p>
            <Row>
              <Link
                to={`/programs/${preview.program.id}`}
                className={linkButton}
              >
                Open Program
              </Link>
              {canDecline && onDecline && (
                <Button
                  variant="outline"
                  disabled={!online || declining}
                  loading={declining}
                  onClick={() => void onDecline()}
                >
                  Decline invitation
                </Button>
              )}
            </Row>
          </Stack>
        ) : joinStatus === 'LEAVE_OTHER_GROUP' ? (
          <Stack className="gap-2">
            <p className="text-sm text-attention">
              You are already following this Program with another active group.
              Leave that group first if you want to join this one.
            </p>
            <Row>
              <Link
                to={`/programs/${preview.program.id}`}
                className={linkButton}
              >
                Open Program
              </Link>
              {canDecline && onDecline && (
                <Button
                  variant="outline"
                  disabled={!online || declining}
                  loading={declining}
                  onClick={() => void onDecline()}
                >
                  Decline invitation
                </Button>
              )}
            </Row>
          </Stack>
        ) : joinStatus === 'UNAVAILABLE' ? (
          <Stack className="gap-2">
            <p className="text-sm text-muted">
              This invitation is no longer available. The group may be closed or
              the Program is no longer open for new participants.
            </p>
            <Link to={`/programs/${preview.program.id}`} className={linkButton}>
              Preview Program
            </Link>
          </Stack>
        ) : (
          <Stack className="gap-3">
            {joinStatus === 'CONFIRM_ENROLLMENT' && (
              <div className="space-y-3 rounded-lg border p-3">
                <div>
                  <h3 className="text-sm font-semibold">
                    Confirm your schedule
                  </h3>
                  <p className="mt-1 text-xs text-muted">
                    This group shares a start date of{' '}
                    <strong>{dateLabel(fixedStart)}</strong> ({fixedStart}).
                    Accepting will enroll you and schedule the Program on your
                    personal calendar.
                  </p>
                </div>
                <label className="block space-y-1 text-xs">
                  <span className="font-medium">Timezone</span>
                  <select
                    aria-label="Timezone"
                    value={timezone}
                    disabled={!online || accepting}
                    onChange={(e) => {
                      setTimezone(e.target.value)
                      idempotencyKey.current = crypto.randomUUID()
                    }}
                    className="min-h-11 w-full rounded-md border bg-surface px-3 py-2 text-sm text-text focus:border-accent"
                  >
                    {timezones.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz.replaceAll('_', ' ')} ({tz})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {joinStatus === 'SELECT_SCHEDULE' && (
              <div className="space-y-3 rounded-lg border p-3">
                <div>
                  <h3 className="text-sm font-semibold">
                    Choose your schedule
                  </h3>
                  <p className="mt-1 text-xs text-muted">
                    Choose when to start on your personal calendar. Accepting
                    will enroll you and schedule the Program in one step.
                  </p>
                </div>
                <label className="block space-y-1 text-xs">
                  <span className="font-medium">Start date</span>
                  <Input
                    type="date"
                    aria-label="Start date"
                    value={selectedStart}
                    disabled={!online || accepting}
                    onChange={(e) => {
                      setCustomDate(e.target.value)
                      idempotencyKey.current = crypto.randomUUID()
                    }}
                  />
                </label>
                <label className="block space-y-1 text-xs">
                  <span className="font-medium">Timezone</span>
                  <select
                    aria-label="Timezone"
                    value={timezone}
                    disabled={!online || accepting}
                    onChange={(e) => {
                      setTimezone(e.target.value)
                      idempotencyKey.current = crypto.randomUUID()
                    }}
                    className="min-h-11 w-full rounded-md border bg-surface px-3 py-2 text-sm text-text focus:border-accent"
                  >
                    {timezones.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz.replaceAll('_', ' ')} ({tz})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {joinStatus === 'READY_TO_JOIN' && (
              <div className="rounded-lg border p-3 text-xs text-muted">
                <p>
                  You are already enrolled in{' '}
                  <strong>{preview.program.title}</strong>. Accepting links your
                  existing personal calendar without changing your scheduled
                  dates.
                </p>
                {preview.join?.startDateDiffers &&
                  preview.join.startLocalDate && (
                    <p className="mt-1 font-medium text-text">
                      Your personal start date (
                      {dateLabel(preview.join.startLocalDate)}) differs from the
                      group&apos;s shared start date; group progress is compared
                      by Program Day.
                    </p>
                  )}
              </div>
            )}

            {joinStatus === 'ALREADY_MEMBER' && (
              <p className="text-xs text-muted">
                You are already an active member of this group.
              </p>
            )}

            <Row>
              <Button
                disabled={!online || !preview.canAccept || !scheduleValid}
                loading={accepting}
                onClick={async () => {
                  try {
                    const group = await onAccept(
                      needsEnrollment
                        ? {
                            startLocalDate: selectedStart,
                            timezone,
                            idempotencyKey: idempotencyKey.current,
                          }
                        : undefined,
                    )
                    toast.success('Group invitation accepted')
                    navigate(`/groups/${group.id}`, { replace: true })
                  } catch {
                    /* shown via ErrorMessage */
                  }
                }}
              >
                Accept invitation
              </Button>
              {canDecline && onDecline && (
                <Button
                  variant="outline"
                  disabled={!online || accepting || declining}
                  loading={declining}
                  onClick={async () => {
                    try {
                      await onDecline()
                      toast.success('Invitation declined')
                      navigate('/notifications', { replace: true })
                    } catch {
                      /* shown via ErrorMessage */
                    }
                  }}
                >
                  Decline invitation
                </Button>
              )}
              <Link
                to={`/programs/${preview.program.id}`}
                className={linkButton}
              >
                Preview Program
              </Link>
            </Row>
          </Stack>
        )}
      </Stack>
    </Panel>
  )
}

export function GroupInvitationJoinPage() {
  const { token = '' } = useParams()
  const invite = useGroupInvitation(token)
  const accept = useAcceptGroupInvitation()
  const decline = useDeclineGroupInvitation()

  const preview = invite.data

  return (
    <Page>
      <Stage>
        <Back to="/">Calendar</Back>
        <h1>Group Invitation</h1>
        {invite.isPending ? (
          <Loading />
        ) : !preview ? (
          <Panel>
            <ErrorMessage
              error={invite.error}
              retry={() => void invite.refetch()}
            />
            <p className="text-muted">
              This invitation link is no longer valid or has expired.
            </p>
          </Panel>
        ) : (
          <InvitationDecisionPanel
            preview={preview}
            returnToPath={`/join/${token}`}
            canDecline={false}
            accepting={accept.isPending}
            declining={decline.isPending}
            error={accept.error || decline.error}
            onAccept={(enrollment) =>
              accept.mutateAsync(
                enrollment ? { token, enrollment } : token,
              )
            }
            onDecline={() => decline.mutateAsync(token)}
          />
        )}
      </Stage>
    </Page>
  )
}

export function GroupPage() {
  const { id = '', invitationId } = useParams()
  const navigate = useNavigate()
  const online = useOnline()

  const me = useCurrentUser()
  const group = useGroup(id)
  const myEnrollment = useEnrollment(
    group.data?.myEnrollment?.enrollmentId ?? '',
  )
  const receivedInvites = useMyGroupInvitations(!group.data && !group.isPending)
  const invitations = useGroupInvitations(id, !!group.data)
  const completions = useGroupCompletions(id)
  const updateMembership = useUpdateMyGroupMembership(id)
  const removeMember = useRemoveGroupMember(id)
  const updatePrefs = useUpdatePreferences()
  const createInvite = useCreateGroupInvitation(id)
  const revokeInvite = useRevokeGroupInvitation(id)
  const acceptMyInvite = useAcceptMyGroupInvitation()
  const declineMyInvite = useDeclineMyGroupInvitation()
  const addReaction = useAddCompletionReaction()
  const removeReaction = useRemoveCompletionReaction()

  const [inviteHandle, setInviteHandle] = useState('')
  const [latestJoinUrl, setLatestJoinUrl] = useState<string | null>(null)

  const mutedGroupIds =
    me.data?.data.preferences.notifications.mutedGroupIds ?? []
  const isMuted = mutedGroupIds.includes(id)
  const g = group.data
  const completionRows =
    completions.data?.pages.flatMap((page) => page.data) ?? []
  const myPendingInvites =
    receivedInvites.data?.pages.flatMap((page) => page.data) ?? []
  const matchedInvitation =
    (invitationId
      ? myPendingInvites.find((inv) => inv.id === invitationId)
      : undefined) ?? myPendingInvites.find((inv) => inv.groupId === id)

  return (
    <Page>
      <Stage>
        <Row className="justify-between">
          <Back to="/notifications">Notifications</Back>
          <Link to="/" className={linkButton}>
            Calendar
          </Link>
        </Row>

        {group.isPending || (!g && receivedInvites.isPending) ? (
          <Loading />
        ) : !g && matchedInvitation ? (
          <Stack className="gap-4">
            <h1>Group Invitation</h1>
            <InvitationDecisionPanel
              preview={matchedInvitation.preview}
              returnToPath={
                invitationId
                  ? `/groups/${id}/invitations/${invitationId}`
                  : `/groups/${id}`
              }
              canDecline={matchedInvitation.kind !== 'LINK'}
              accepting={acceptMyInvite.isPending}
              declining={declineMyInvite.isPending}
              error={acceptMyInvite.error || declineMyInvite.error}
              onAccept={async (enrollment) => {
                const accepted = await acceptMyInvite.mutateAsync(
                  enrollment
                    ? { invitationId: matchedInvitation.id, enrollment }
                    : matchedInvitation.id,
                )
                await group.refetch()
                return accepted
              }}
              onDecline={() =>
                declineMyInvite.mutateAsync(matchedInvitation.id)
              }
            />
          </Stack>
        ) : !g ? (
          <Panel>
            <Stack className="gap-3">
              <h1>Group Unavailable</h1>
              <p className="text-sm text-muted">
                This group or invitation is no longer available. You may have
                left the group, been removed, or the invitation has expired.
              </p>
              <ErrorMessage error={group.error || receivedInvites.error} />
              <Row>
                <Link to="/" className={linkButton}>
                  Open Calendar
                </Link>
                <Link to="/notifications" className={linkButton}>
                  Open Inbox
                </Link>
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

            {g.myEnrollment && (
              <Panel>
                <Stack className="gap-2">
                  <Row className="justify-between">
                    <div>
                      <h2 className="text-sm font-semibold">
                        Your Personal Schedule
                      </h2>
                      <p className="text-xs text-muted">
                        Started {dateLabel(g.myEnrollment.startLocalDate)} (
                        {g.myEnrollment.startLocalDate})
                        {myEnrollment.data?.participationStartDate
                          ? ` · Joined on ${dateLabel(myEnrollment.data.participationStartDate)} (${myEnrollment.data.participationStartDate})`
                          : ''}
                      </p>
                    </div>
                    <Link
                      to={calendarUrl(g.myEnrollment.startLocalDate)}
                      className={linkButton}
                    >
                      Open Calendar
                    </Link>
                  </Row>
                  {g.myEnrollment.startDateDiffers && (
                    <p className="text-xs text-muted">
                      Your personal start date differs from the group&apos;s
                      shared start date, so comparable progress is shown by{' '}
                      <strong>Program Day</strong>.
                    </p>
                  )}
                </Stack>
              </Panel>
            )}

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

                <Row className="justify-between border-t pt-2">
                  <span className="text-xs text-muted">
                    Leaving revokes group access while keeping your personal
                    calendar, sessions, and results.
                  </span>
                  <Button
                    variant="outline"
                    disabled={!online || updateMembership.isPending}
                    loading={updateMembership.isPending}
                    onClick={async () => {
                      try {
                        await updateMembership.mutateAsync({ leave: true })
                        toast.success(
                          'Left group. Your personal calendar and results are kept.',
                        )
                        navigate('/', { replace: true })
                      } catch {
                        /* shown below */
                      }
                    }}
                  >
                    Leave group
                  </Button>
                </Row>

                <ErrorMessage
                  error={updateMembership.error || updatePrefs.error}
                />
              </Stack>
            </Panel>

            <Panel>
              <Stack className="gap-3">
                <h2>Members ({g.members.length})</h2>
                <ErrorMessage error={removeMember.error} />
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
                      <Row className="gap-2">
                        <span className="text-xs text-muted">
                          {m.role === 'OWNER' ? 'Owner' : 'Member'} ·{' '}
                          {m.sharedCompletion ? 'Sharing status' : 'Private'}
                        </span>
                        {g.myRole === 'OWNER' &&
                          m.user.id !== me.data?.data.id && (
                            <Button
                              variant="ghost"
                              className="min-h-11 px-2 py-1 text-xs"
                              disabled={!online || removeMember.isPending}
                              aria-label={`Remove ${m.user.displayName}`}
                              onClick={async () => {
                                try {
                                  await removeMember.mutateAsync(m.user.id)
                                  toast.success(
                                    `Removed ${m.user.displayName}`,
                                  )
                                } catch {
                                  /* shown above */
                                }
                              }}
                            >
                              Remove
                            </Button>
                          )}
                      </Row>
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
                  {g.myRole === 'OWNER' && (
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
                  )}
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
                                {share.programDayIndex !== null
                                  ? `Program Day ${share.programDayIndex + 1} · `
                                  : ''}
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
