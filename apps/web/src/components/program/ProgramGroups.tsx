import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCreateGroup, useMyGroupInvitations, useMyGroups, useProgramGroups } from '@project/sdk'
import type { components } from '@project/sdk'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ErrorMessage } from '@/components/ui/Feedback'
import {
  GroupStatus,
  fromMyGroupSummary,
  fromPublicGroupSummary,
  type GroupStatusItem,
} from '@/components/social/GroupStatus'
import { type CheckInActivityOption } from '@/components/group-stage/GroupCheckInModal'
import { isLocalDate, today } from '@/lib/dates'
import { useOnline } from '@/lib/useOnline'

type GroupSummary = components['schemas']['GroupSummary']

/**
 * Compact Community panel for the Program page: real participation, GroupStatus widget for
 * the viewer's own groups, pending invitations, and discoverable public groups, plus Create Group.
 * Private groups remain invisible to non-members (10 §2).
 */
export function ProgramGroups({
  programId,
  versionId,
  enrollmentId,
  isProgramOwner,
  isPublicProgram = false,
  timezone,
  signedIn,
  participantCount,
  completionRate,
  activityOptions,
  returnTo,
}: {
  programId: string
  versionId: string | null
  enrollmentId: string | null
  isProgramOwner: boolean
  isPublicProgram?: boolean
  timezone: string
  signedIn: boolean
  /** Real count, null below the public sample size. */
  participantCount?: number | null
  /** Real completion rate (0..1), null below the public sample size. */
  completionRate?: number | null
  /** Activities in this Program available for group check-in. */
  activityOptions?: CheckInActivityOption[]
  returnTo?: string
}) {
  const online = useOnline()
  const groups = useMyGroups(signedIn)
  const invitations = useMyGroupInvitations(signedIn)
  const publicGroups = useProgramGroups(programId, { enabled: isPublicProgram })
  const create = useCreateGroup()
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'SYNC' | 'ASYNC'>('ASYNC')
  const [visibility, setVisibility] = useState<'PRIVATE' | 'PUBLIC'>('PRIVATE')
  const [joinPolicy, setJoinPolicy] = useState<'INVITE_ONLY' | 'OPEN'>('OPEN')
  const [creating, setCreating] = useState(false)
  const [startDate, setStartDate] = useState(today(timezone))

  useEffect(() => {
    setCreating(false)
    setName('')
    setVisibility('PRIVATE')
    setJoinPolicy('OPEN')
  }, [programId])

  useEffect(() => {
    if (!creating) setStartDate(today(timezone))
  }, [creating, timezone])

  useEffect(() => {
    if (signedIn && groups.hasNextPage && !groups.isFetchingNextPage && !groups.isFetchNextPageError) {
      void groups.fetchNextPage()
    }
  }, [signedIn, groups.hasNextPage, groups.isFetchingNextPage, groups.isFetchNextPageError, groups.fetchNextPage])

  useEffect(() => {
    if (
      signedIn &&
      invitations.hasNextPage &&
      !invitations.isFetchingNextPage &&
      !invitations.isFetchNextPageError
    ) {
      void invitations.fetchNextPage()
    }
  }, [
    signedIn,
    invitations.hasNextPage,
    invitations.isFetchingNextPage,
    invitations.isFetchNextPageError,
    invitations.fetchNextPage,
  ])

  // A group belongs to the Program, not a version: members on v1 and v2 share it (10 §2).
  const mine = signedIn
    ? (groups.data?.pages.flatMap((page) => page.data) ?? []).filter(
        (group: GroupSummary) => group.programId === programId,
      )
    : []
  const invited = signedIn
    ? (invitations.data?.pages.flatMap((page) => page.data) ?? []).filter(
        (invitation) =>
          invitation.preview.program?.id === programId &&
          !mine.some((group) => group.id === invitation.groupId),
      )
    : []
  const discoverable = isPublicProgram
    ? (publicGroups.data?.pages.flatMap((page) => page.data) ?? []).filter(
        (group) =>
          !group.viewerIsMember &&
          !mine.some((m) => m.id === group.id) &&
          !invited.some((inv) => inv.groupId === group.id),
      )
    : []
  const allStatusItems: GroupStatusItem[] = [
    ...mine.map(fromMyGroupSummary),
    ...invited.map((invitation): GroupStatusItem => ({
      id: invitation.groupId,
      name: invitation.preview.groupName ?? null,
      visibility: 'PRIVATE',
      joinPolicy: 'INVITE_ONLY',
      mode: invitation.preview.mode,
      memberCount: 0,
      startLocalDate: null,
      viewerIsMember: false,
      memberAvatars: [],
      recentCheckInCount: 0,
      latestCheckIn: null,
      isPendingInvite: true,
      invitedByName: invitation.preview.inviter?.displayName ?? null,
    })),
    ...discoverable.map(fromPublicGroupSummary),
  ]
  const statusItems = allStatusItems.slice(0, 5)
  const hasMoreInvites = allStatusItems.length > statusItems.length && invited.length > 0
  // One group per person and Program (10 §2): creating is offered until they are in one.
  const canCreate =
    signedIn &&
    !groups.isPending &&
    !groups.isError &&
    (!!enrollmentId || isProgramOwner) &&
    !!versionId &&
    !mine.length &&
    !groups.hasNextPage

  const summaryBits = [
    participantCount != null
      ? `${participantCount.toLocaleString()} ${participantCount === 1 ? 'participant' : 'participants'}`
      : null,
    completionRate != null
      ? `${Math.round(completionRate * 100)}% completion`
      : null,
  ].filter(Boolean)

  async function createGroup() {
    if (!versionId || !online || create.isPending) return
    try {
      await create.mutateAsync({
        programVersionId: versionId,
        mode,
        visibility: isPublicProgram ? visibility : 'PRIVATE',
        joinPolicy: isPublicProgram && visibility === 'PUBLIC' ? joinPolicy : 'INVITE_ONLY',
        name: name.trim() || null,
        ...(mode === 'SYNC' && !enrollmentId ? { startLocalDate: startDate, timezone } : {}),
      })
      setCreating(false)
      setName('')
      setVisibility('PRIVATE')
    } catch {
      // The mutation error remains visible so the user can correct and retry.
    }
  }

  return (
    <section
      aria-labelledby="program-community"
      className="space-y-4 rounded-2xl border border-border/70 bg-surface p-5 sm:p-6"
    >
      <div className="space-y-1">
        <h2 id="program-community" className="text-xl font-semibold">
          Community
        </h2>
        {summaryBits.length > 0 && (
          <p className="text-sm text-muted">{summaryBits.join(' · ')}</p>
        )}
      </div>

      {signedIn && (
        <ErrorMessage
          error={groups.error || invitations.error}
          retry={() => {
            if (groups.error) void groups.refetch()
            if (invitations.error) void invitations.refetch()
          }}
        />
      )}

      {statusItems.length > 0 && (
        <GroupStatus
          programId={programId}
          isPublicProgram={isPublicProgram}
          items={statusItems}
          activityOptions={activityOptions}
          canCheckIn={Boolean(enrollmentId && activityOptions?.length)}
          returnTo={returnTo}
        />
      )}

      {hasMoreInvites && (
        <Link to="/notifications" className="inline-block text-xs font-medium text-accent hover:underline">
          View all invitations
        </Link>
      )}

      {canCreate &&
        (creating ? (
          <div className="space-y-3 border-t border-border/60 pt-4">
            <label className="field space-y-1">
              <span className="text-xs font-semibold text-muted">Group name (optional)</span>
              <Input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="field space-y-1">
              <span className="text-xs font-semibold text-muted">Schedule</span>
              <Select
                aria-label="Schedule"
                value={mode}
                onChange={(event) => setMode(event.target.value as 'SYNC' | 'ASYNC')}
              >
                <option value="ASYNC">Flexible start dates</option>
                <option value="SYNC">Same start date</option>
              </Select>
            </label>
            {mode === 'SYNC' &&
              (enrollmentId ? (
                <p className="text-xs text-muted">Your current start date is used for a same-start group.</p>
              ) : (
                <label className="field space-y-1">
                  <span className="text-xs font-semibold text-muted">Shared start date</span>
                  <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                </label>
              ))}
            {isPublicProgram && (
              <>
                <label className="field space-y-1">
                  <span className="text-xs font-semibold text-muted">Visibility</span>
                  <Select
                    aria-label="Visibility"
                    value={visibility}
                    onChange={(event) => setVisibility(event.target.value as 'PRIVATE' | 'PUBLIC')}
                  >
                    <option value="PRIVATE">Private (invite only)</option>
                    <option value="PUBLIC">Public (discoverable in Community)</option>
                  </Select>
                </label>
                {visibility === 'PUBLIC' && (
                  <label className="field space-y-1">
                    <span className="text-xs font-semibold text-muted">Join policy</span>
                    <Select
                      aria-label="Join policy"
                      value={joinPolicy}
                      onChange={(event) => setJoinPolicy(event.target.value as 'OPEN' | 'INVITE_ONLY')}
                    >
                      <option value="OPEN">Open (anyone can join)</option>
                      <option value="INVITE_ONLY">Invite only</option>
                    </Select>
                  </label>
                )}
              </>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                loading={create.isPending}
                disabled={!online || create.isPending || (mode === 'SYNC' && !enrollmentId && !isLocalDate(startDate))}
                onClick={() => void createGroup()}
              >
                Create
              </Button>
              <Button size="sm" variant="ghost" disabled={create.isPending} onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
            <ErrorMessage error={create.error} />
          </div>
        ) : (
          <Button variant="outline" className="w-full" onClick={() => setCreating(true)}>
            Create Group
          </Button>
        ))}

      {!signedIn && !statusItems.length && (
        <p className="text-sm text-muted">Sign in to start a private group or view your invitations.</p>
      )}
      {signedIn && !statusItems.length && !canCreate && isProgramOwner && !versionId && (
        <p className="text-sm text-muted">Publish the Program to create a group.</p>
      )}
      {signedIn && !statusItems.length && !canCreate && !enrollmentId && !isProgramOwner && (
        <p className="text-sm text-muted">Start the Program to create a group.</p>
      )}
    </section>
  )
}
