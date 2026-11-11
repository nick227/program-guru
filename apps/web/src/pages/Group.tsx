import { GroupInviteLink } from '@/components/social/GroupInviteLink'
import { GroupStage } from '@/components/group-stage/GroupStage'
import { useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  useAcceptGroupInvitation,
  useAcceptMyGroupInvitation,
  useCreateGroupInvitation,
  useCurrentUser,
  useDeclineGroupInvitation,
  useDeclineMyGroupInvitation,
  useEnrollment,
  useGroup,
  useGroupCompletions,
  useGroupInvitation,
  useGroupInvitations,
  useGroupMedia,
  useJoinPublicGroup,
  useMyGroupInvitations,
  usePublicGroupPreview,
  useRemoveGroupMember,
  useRevokeGroupInvitation,
  useUpdateMyGroupMembership,
  useUpdateGroup,
  useUpdatePreferences,
  type components,
} from '@project/sdk'
import { toast } from 'sonner'
import { Page, Stage, Stack, Panel, Row } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Avatar } from '@/components/ui/Avatar'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { linkButton } from '@/components/shared/Navigation'
import { buildGroupBreadcrumbs } from '@/lib/breadcrumbs'
import { calendarUrl, dateLabel, isLocalDate, safeReturn, today } from '@/lib/dates'
import {
  getAvailableTimezones,
  isValidTimezone,
} from '@/lib/notifications'
import { useOnline } from '@/lib/useOnline'
import { useDocumentTitle } from '@/lib/title'
import { buildProfileUrl, buildProgramUrl, buildGroupUrl } from '@/lib/urls'

type S = components['schemas']

interface JoinDecisionPreview {
  groupName: string | null
  inviter?: S['UserSummary'] | null
  memberCount?: number | null
  joinPolicy?: S['GroupJoinPolicy']
  program: S['ProgramPreview']
  mode: S['GroupMode']
  startLocalDate: string | null
  canAccept: boolean
  requiresAccess: boolean
  join: S['GroupJoinState']
}

interface InvitationViewProps {
  preview: JoinDecisionPreview
  returnToPath: string
  canDecline: boolean
  accepting: boolean
  declining: boolean
  acceptLabel?: string
  signInLabel?: string
  successMessage?: string
  unavailableMessage?: string
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
  acceptLabel = 'Accept invitation',
  signInLabel = 'Sign in to accept invitation',
  successMessage = 'Group invitation accepted',
  unavailableMessage = 'This invitation is no longer available. The group may be closed or the Program is no longer open for new participants.',
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
        {preview.inviter && (
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
        )}

        <div>
          <h2>{preview.groupName || preview.program.title}</h2>
          <p className="mt-1 text-sm text-muted">
            Program: <strong>{preview.program.title}</strong>
            {preview.memberCount != null
              ? ` · ${preview.memberCount} ${preview.memberCount === 1 ? 'member' : 'members'}`
              : ''}
            {' · '}
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
            {signInLabel}
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
                to={buildProgramUrl(preview.program)}
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
        ) : joinStatus === 'LEAVE_OTHER_GROUP' ? (
          <Stack className="gap-2">
            <p className="text-sm text-attention">
              You are already following this Program with another active group.
              Leave that group first if you want to join this one.
            </p>
            <Row>
              <Link
                to={buildProgramUrl(preview.program)}
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
              {unavailableMessage}
            </p>
            <Link to={buildProgramUrl(preview.program)} className={linkButton}>
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
                    className="min-h-11 w-full rounded-md border bg-surface px-3 py-2 text-base text-text focus:border-accent sm:text-sm"
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
                    className="min-h-11 w-full rounded-md border bg-surface px-3 py-2 text-base text-text focus:border-accent sm:text-sm"
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
                    toast.success(successMessage)
                    navigate(buildGroupUrl(group.id), { replace: true })
                  } catch {
                    /* shown via ErrorMessage */
                  }
                }}
              >
                {acceptLabel}
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
                to={buildProgramUrl(preview.program)}
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
  useDocumentTitle('Join Group')
  const { token = '' } = useParams()
  const invite = useGroupInvitation(token)
  const accept = useAcceptGroupInvitation()
  const decline = useDeclineGroupInvitation()

  const preview = invite.data

  return (
    <Page className="page--wide">
      <Stage className="mx-auto mt-6 w-full max-w-3xl">
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
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const online = useOnline()
  const rawReturnTo = params.get('returnTo')
  const explicitReturnTo = rawReturnTo ? safeReturn(rawReturnTo, '/notifications') : null

  const me = useCurrentUser()
  const signedIn = !!me.data
  const group = useGroup(signedIn ? id : '')
  const myEnrollment = useEnrollment(
    group.data?.myEnrollment?.enrollmentId ?? '',
  )
  const receivedInvites = useMyGroupInvitations(signedIn && !group.data && !group.isPending)
  const invitations = useGroupInvitations(id, signedIn && !!group.data)
  const completions = useGroupCompletions(signedIn && !!group.data ? id : '')
  const media = useGroupMedia(id, signedIn && !!group.data)
  const updateMembership = useUpdateMyGroupMembership(id)
  const updateGroup = useUpdateGroup(id)
  const joinPublic = useJoinPublicGroup(id)
  const removeMember = useRemoveGroupMember(id)
  const updatePrefs = useUpdatePreferences()
  const createInvite = useCreateGroupInvitation(id)
  const revokeInvite = useRevokeGroupInvitation(id)
  const acceptMyInvite = useAcceptMyGroupInvitation()
  const declineMyInvite = useDeclineMyGroupInvitation()

  const [inviteHandle, setInviteHandle] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [groupName, setGroupName] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)

  const mutedGroupIds =
    me.data?.data.preferences.notifications.mutedGroupIds ?? []
  const isMuted = mutedGroupIds.includes(id)
  const g = group.data
  const completionRows =
    completions.data?.pages.flatMap((page) => page.data) ?? []
  const mediaRows = media.data?.pages.flatMap((page) => page.data) ?? []
  const myPendingInvites =
    receivedInvites.data?.pages.flatMap((page) => page.data) ?? []
  const matchedInvitation =
    (invitationId
      ? myPendingInvites.find((inv) => inv.id === invitationId)
      : undefined) ?? myPendingInvites.find((inv) => inv.groupId === id)

  const shouldLoadPublicPreview =
    !me.isPending &&
    !g &&
    !matchedInvitation &&
    (!signedIn || (!group.isPending && !receivedInvites.isPending))
  const publicPreview = usePublicGroupPreview(id, shouldLoadPublicPreview)

  useDocumentTitle(
    g?.name ?? publicPreview.data?.groupName ?? 'Group',
  )

  const groupNav = buildGroupBreadcrumbs({
    groupName: g?.name || g?.programTitle || publicPreview.data?.groupName || publicPreview.data?.program.title,
    programTitle: g?.programTitle || publicPreview.data?.program.title,
    returnTo: explicitReturnTo,
  })

  const waitingForInitialData =
    me.isPending ||
    (signedIn && (group.isPending || (!g && receivedInvites.isPending))) ||
    (!g && !matchedInvitation && (shouldLoadPublicPreview && publicPreview.isPending))

  if (!waitingForInitialData && g) {
    const detailsContent = (
      <Stack className="gap-4">
        {g.myEnrollment && (
          <Panel>
            <Stack className="gap-2">
              <Row className="justify-between">
                <div>
                  <h3 className="text-sm font-semibold">
                    Your Personal Schedule
                  </h3>
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
            <h3>Participation &amp; Notification Settings</h3>
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
            <h3>Members ({g.members.length})</h3>
            <ErrorMessage error={removeMember.error} />
            <Stack className="gap-2">
              {g.members.map((m) => (
                <Row key={m.user.id} className="justify-between">
                  <Link
                    to={buildProfileUrl(m.user.handle)}
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
            <h3>Invite Collaborators</h3>
            <div className="space-y-2">
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
                      await createInvite.mutateAsync({
                        kind: 'USER',
                        handle: inviteHandle.trim().replace(/^@/, ''),
                      })
                      setInviteHandle('')
                      toast.success('Invitation sent')
                    } catch {
                      /* shown below */
                    }
                  }}
                >
                  Invite user
                </Button>
              </Row>
              <Row className="items-end gap-2">
                <label className="min-w-0 flex-1 space-y-1 text-sm">
                  <span>Invite by email</span>
                  <Input
                    type="email"
                    aria-label="Invite by email"
                    value={inviteEmail}
                    disabled={!online || createInvite.isPending}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </label>
                <Button
                  variant="outline"
                  disabled={!online || !inviteEmail.trim()}
                  loading={createInvite.isPending}
                  onClick={async () => {
                    try {
                      await createInvite.mutateAsync({
                        kind: 'EMAIL',
                        email: inviteEmail.trim(),
                      })
                      setInviteEmail('')
                      toast.success('Invitation email queued')
                    } catch {
                      /* shown below */
                    }
                  }}
                >
                  Send email invite
                </Button>
              </Row>
            </div>
            <GroupInviteLink groupId={g.id} />

            <ErrorMessage
              error={createInvite.error || revokeInvite.error}
            />

            {!!invitations.data?.length && (
              <Stack className="gap-2 pt-2">
                <h4 className="text-xs font-semibold text-muted">
                  Active &amp; Recent Invitations
                </h4>
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

        {g.myRole === 'OWNER' && (
          <Panel>
            <Stack className="gap-3">
              <h3>Manage group</h3>
              <label className="space-y-1 text-sm">
                <span>Group name</span>
                <Input
                  aria-label="Group name"
                  value={groupName ?? g.name ?? ''}
                  maxLength={100}
                  disabled={!online || updateGroup.isPending}
                  onChange={(e) => setGroupName(e.target.value)}
                />
              </label>
              <Row className="gap-3">
                <label className="min-w-0 flex-1 space-y-1 text-sm">
                  <span>Visibility</span>
                  <Select
                    aria-label="Visibility"
                    value={g.visibility}
                    disabled={!online || updateGroup.isPending}
                    onChange={async (e) => {
                      const nextVisibility = e.target.value as 'PRIVATE' | 'PUBLIC'
                      try {
                        await updateGroup.mutateAsync({
                          visibility: nextVisibility,
                          joinPolicy: nextVisibility === 'PRIVATE' ? 'INVITE_ONLY' : g.joinPolicy,
                        })
                        toast.success('Group visibility updated')
                      } catch {
                        /* shown below */
                      }
                    }}
                  >
                    <option value="PRIVATE">Private (invite only)</option>
                    <option value="PUBLIC">Public (discoverable)</option>
                  </Select>
                </label>
                {g.visibility === 'PUBLIC' && (
                  <label className="min-w-0 flex-1 space-y-1 text-sm">
                    <span>Join policy</span>
                    <Select
                      aria-label="Join policy"
                      value={g.joinPolicy}
                      disabled={!online || updateGroup.isPending}
                      onChange={async (e) => {
                        try {
                          await updateGroup.mutateAsync({
                            joinPolicy: e.target.value as 'OPEN' | 'INVITE_ONLY',
                          })
                          toast.success('Join policy updated')
                        } catch {
                          /* shown below */
                        }
                      }}
                    >
                      <option value="OPEN">Open (anyone can join)</option>
                      <option value="INVITE_ONLY">Invite only</option>
                    </Select>
                  </label>
                )}
              </Row>
              <Row>
                <Button
                  variant="outline"
                  disabled={!online || updateGroup.isPending}
                  loading={updateGroup.isPending}
                  onClick={async () => {
                    try {
                      await updateGroup.mutateAsync({
                        name: groupName === null ? g.name : groupName.trim() || null,
                      })
                      setGroupName(null)
                      toast.success('Group updated')
                    } catch {
                      /* shown below */
                    }
                  }}
                >
                  Save group name
                </Button>
                <Button
                  variant="destructive"
                  disabled={!online || closing || updateGroup.isPending}
                  loading={closing}
                  onClick={async () => {
                    setClosing(true)
                    try {
                      await updateGroup.mutateAsync({ closed: true })
                      toast.success('Group closed')
                      navigate(explicitReturnTo ?? '/library')
                    } catch {
                      setClosing(false)
                    }
                  }}
                >
                  Close group
                </Button>
              </Row>
              <ErrorMessage error={updateGroup.error} />
            </Stack>
          </Panel>
        )}

        {mediaRows.length > 0 && (
          <Panel>
            <Stack className="gap-3">
              <h3>Shared media</h3>
              <div className="grid grid-cols-3 gap-2">
                {mediaRows.map((item) => (
                  <figure key={item.publicationId} className="space-y-1">
                    {item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt={
                          item.alt ||
                          `${item.type.toLowerCase()} shared by ${item.owner.displayName}`
                        }
                        className="aspect-square w-full rounded-md object-cover"
                      />
                    ) : (
                      <div className="flex aspect-square items-center justify-center rounded-md bg-surface-muted text-xs">
                        {item.type}
                      </div>
                    )}
                    <figcaption className="truncate text-[11px] text-muted">
                      {item.owner.displayName}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </Stack>
          </Panel>
        )}
      </Stack>
    )

    return (
      <GroupStage
        group={g}
        checkIns={completionRows}
        hasMoreCheckIns={completions.hasNextPage}
        onLoadMoreCheckIns={() => void completions.fetchNextPage()}
        loadingMoreCheckIns={completions.isFetchingNextPage}
        viewerId={me.data?.data.id}
        online={online}
        returnTo={explicitReturnTo}
        detailsContent={detailsContent}
      />
    )
  }

  return (
    <Page className="page--wide">
      <Stage className="mx-auto mt-6 w-full max-w-4xl">

        {waitingForInitialData ? (
          <Loading />
        ) : !g && matchedInvitation ? (
          <Stack className="gap-4">
            <h1>Group Invitation</h1>
            <InvitationDecisionPanel
              preview={matchedInvitation.preview}
              returnToPath={
                invitationId
                  ? `${buildGroupUrl(id)}/invitations/${invitationId}`
                  : buildGroupUrl(id)
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
        ) : !g && publicPreview.data ? (
          <Stack className="gap-4">
            <h1>{publicPreview.data.groupName || publicPreview.data.program.title}</h1>
            <InvitationDecisionPanel
              preview={{ ...publicPreview.data, canAccept: publicPreview.data.canJoin }}
              returnToPath={buildGroupUrl(
                id,
                explicitReturnTo ? { returnTo: explicitReturnTo } : undefined,
              )}
              canDecline={false}
              accepting={joinPublic.isPending}
              declining={false}
              acceptLabel="Join group"
              signInLabel="Sign in to join group"
              successMessage="Joined group"
              unavailableMessage={
                publicPreview.data.joinPolicy === 'INVITE_ONLY'
                  ? 'This public group is invite-only. Ask a member for an invitation to join.'
                  : 'This group is unavailable or no longer open for new participants.'
              }
              error={joinPublic.error}
              onAccept={async (enrollment) => {
                const joined = await joinPublic.mutateAsync(enrollment)
                await group.refetch()
                return joined
              }}
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
              <ErrorMessage error={group.error || receivedInvites.error || publicPreview.error} />
              <Row>
                <Link to="/browse" className={linkButton}>
                  Browse Community
                </Link>
                {signedIn ? (
                  <Link to="/notifications" className={linkButton}>
                    Open Inbox
                  </Link>
                ) : (
                  <Link
                    to={`/login?returnTo=${encodeURIComponent(buildGroupUrl(id))}`}
                    className={linkButton}
                  >
                    Sign in
                  </Link>
                )}
              </Row>
            </Stack>
          </Panel>
        ) : null}
      </Stage>
    </Page>
  )
}
