import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Lock, Users } from 'lucide-react'
import { toast } from 'sonner'
import {
  useActivityGroups,
  useActivityMyAttempts,
  useCurrentUser,
  useJoinPublicGroupById,
  useMyGroups,
  useProgramGroups,
  type components,
} from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { UnreadDot } from '@/components/shared/UnreadDot'
import { AvatarStack } from '@/components/social/AvatarStack'
import {
  GroupCheckInModal,
  type CheckInActivityOption,
} from '@/components/group-stage/GroupCheckInModal'
import { dateLabel, formatRelativeTime } from '@/lib/dates'
import { useOnline } from '@/lib/useOnline'
import { buildGroupUrl } from '@/lib/urls'
import { cn } from '@/lib/utils'

type S = components['schemas']

export interface GroupStatusItem {
  id: string
  name: string | null
  visibility: 'PRIVATE' | 'PUBLIC'
  joinPolicy: 'OPEN' | 'INVITE_ONLY'
  mode: 'SYNC' | 'ASYNC'
  memberCount: number
  startLocalDate: string | null
  viewerIsMember: boolean
  memberAvatars: S['UserSummary'][]
  recentCheckInCount: number
  latestCheckIn: S['GroupRecentCheckIn'] | null
  isPendingInvite?: boolean
  invitedByName?: string | null
}

export function fromPublicGroupSummary(g: S['PublicGroupSummary']): GroupStatusItem {
  return {
    id: g.id,
    name: g.name,
    visibility: g.visibility,
    joinPolicy: g.joinPolicy,
    mode: g.mode,
    memberCount: g.memberCount,
    startLocalDate: g.startLocalDate,
    viewerIsMember: g.viewerIsMember,
    memberAvatars: g.viewerIsMember ? (g.memberAvatars ?? []) : [],
    recentCheckInCount: g.recentCheckInCount ?? 0,
    latestCheckIn: g.viewerIsMember ? (g.latestCheckIn ?? null) : null,
  }
}

export function fromMyGroupSummary(g: S['GroupSummary']): GroupStatusItem {
  return {
    id: g.id,
    name: g.name,
    visibility: g.visibility,
    joinPolicy: g.joinPolicy,
    mode: g.mode,
    memberCount: g.memberCount,
    startLocalDate: g.startLocalDate ?? null,
    viewerIsMember: true,
    memberAvatars: g.memberAvatars ?? [],
    recentCheckInCount: g.recentCheckInCount ?? 0,
    latestCheckIn: g.latestCheckIn ?? null,
  }
}

function mergeGroupItems(
  mine: GroupStatusItem[],
  discoverable: GroupStatusItem[],
): GroupStatusItem[] {
  const byId = new Map<string, GroupStatusItem>()
  for (const item of [...mine, ...discoverable]) {
    if (!byId.has(item.id)) byId.set(item.id, item)
  }
  return Array.from(byId.values())
}

function formatGroupTitle(item: GroupStatusItem): string {
  if (item.name?.trim()) return item.name
  if (item.isPendingInvite) return 'Group invitation'
  return item.viewerIsMember ? 'Your group' : 'Community group'
}

export interface GroupStatusProps {
  /** Program context when listing/interacting with a Program's groups. */
  programId?: string
  /** Activity context when showing groups participating in an Activity. */
  activityId?: string
  /** Activity title passed to the shared GroupCheckInModal. */
  activityTitle?: string
  /** Optional selectable Activities when checking in from a Program context. */
  activityOptions?: CheckInActivityOption[]
  /** Optional Occurrence id / CalendarItem id when triggered from Occurrence. */
  occurrenceId?: string
  /** Whether the Program itself is publicly discoverable (controls public group query). */
  isPublicProgram?: boolean
  /** Override whether the Check In button can be shown. */
  canCheckIn?: boolean
  /** Pre-fetched items (e.g. passed by ProgramGroups or ActivityTogether to avoid extra queries). */
  items?: GroupStatusItem[]
  /** Occurrence-specific progress text (e.g. "2 of 3 finished"). */
  progressSummary?: string
  /** Unread indicator for inline Occurrence presentation. */
  unreadCount?: number
  /** Disable interactive buttons (e.g. offline/pending Occurrence state). */
  disabled?: boolean
  /** Return URL preserved when navigating into GroupStage (`/groups/:id`). */
  returnTo?: string
  /** Compact inline layout (for ActivityTogether) vs self-contained card. */
  variant?: 'card' | 'inline'
  /** Custom label for the Check In trigger button. */
  checkInLabel?: string
  className?: string
}

/**
 * Shared minimal Group status widget for Program, Activity, and Occurrence pages.
 * Routes deeper group interaction and check-in feed history to GroupStage (`/groups/:id`).
 */
export function GroupStatus({
  programId,
  activityId,
  activityTitle,
  activityOptions,
  occurrenceId,
  isPublicProgram = false,
  canCheckIn,
  items: explicitItems,
  progressSummary,
  unreadCount = 0,
  disabled = false,
  returnTo,
  variant = 'card',
  checkInLabel = 'Check In',
  className,
}: GroupStatusProps) {
  const me = useCurrentUser()
  const signedIn = !!me.data
  const online = useOnline()
  const joinById = useJoinPublicGroupById()

  const useActivityQuery = !explicitItems && !!activityId
  const useProgramQuery = !explicitItems && !activityId && !!programId

  const activityGroups = useActivityGroups(activityId ?? '', {
    programId,
    enabled: useActivityQuery,
  })
  const myGroups = useMyGroups(useProgramQuery && signedIn)
  const publicProgramGroups = useProgramGroups(programId ?? '', {
    enabled: useProgramQuery && isPublicProgram,
  })

  const resolvedItems: GroupStatusItem[] = explicitItems
    ? explicitItems
    : useActivityQuery
      ? (activityGroups.data?.pages.flatMap((page) => page.data) ?? []).map(
          fromPublicGroupSummary,
        )
      : mergeGroupItems(
          signedIn
            ? (myGroups.data?.pages.flatMap((page) => page.data) ?? [])
                .filter((g) => g.programId === programId)
                .map(fromMyGroupSummary)
            : [],
          isPublicProgram
            ? (
                publicProgramGroups.data?.pages.flatMap((page) => page.data) ??
                []
              ).map(fromPublicGroupSummary)
            : [],
        )

  const [manualSelectedId, setManualSelectedId] = useState<string | null>(null)
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [joiningId, setJoiningId] = useState<string | null>(null)

  const selected =
    (manualSelectedId
      ? resolvedItems.find((item) => item.id === manualSelectedId)
      : undefined) ??
    resolvedItems.find((item) => item.viewerIsMember) ??
    resolvedItems[0]

  const shouldCheckAttempts = Boolean(
    canCheckIn === undefined &&
      signedIn &&
      activityId &&
      selected?.viewerIsMember &&
      !occurrenceId,
  )
  const attempts = useActivityMyAttempts(
    activityId ?? '',
    undefined,
    shouldCheckAttempts,
  )
  const hasFinishedAttempt = Boolean(
    attempts.data?.pages.some((page) =>
      page.data.some((attempt) => attempt.status === 'FINISHED'),
    ),
  )

  if (!selected) return null

  const title = formatGroupTitle(selected)
  const groupHref = buildGroupUrl(selected.id, returnTo ? { returnTo } : undefined)
  const canShareCheckIn =
    selected.viewerIsMember &&
    Boolean(activityId || (activityOptions && activityOptions.length > 0)) &&
    (canCheckIn !== undefined ? canCheckIn : hasFinishedAttempt)

  const visibleAvatars = (selected.viewerIsMember ? selected.memberAvatars : []).map(
    (person) => ({
      id: person.id,
      name: person.displayName,
      avatarUrl: person.avatarUrl,
    }),
  )
  const recentCheckInText =
    selected.recentCheckInCount > 0
      ? `${selected.recentCheckInCount} recent ${selected.recentCheckInCount === 1 ? 'check-in' : 'check-ins'}`
      : null
  const metaParts = [
    selected.isPendingInvite && selected.invitedByName
      ? `Invited by ${selected.invitedByName}`
      : `${selected.memberCount} ${selected.memberCount === 1 ? 'member' : 'members'}`,
    recentCheckInText,
    !selected.viewerIsMember && !selected.isPendingInvite
      ? selected.startLocalDate
        ? `Starts ${dateLabel(selected.startLocalDate)}`
        : selected.mode === 'ASYNC'
          ? 'Flexible pace'
          : null
      : null,
    !selected.viewerIsMember && selected.joinPolicy === 'INVITE_ONLY' && !selected.isPendingInvite
      ? 'Invite only'
      : null,
  ].filter(Boolean)

  const canQuickJoin =
    !selected.viewerIsMember &&
    !selected.isPendingInvite &&
    selected.joinPolicy === 'OPEN' &&
    signedIn

  const handleJoin = async () => {
    setJoiningId(selected.id)
    try {
      await joinById.mutateAsync({ groupId: selected.id })
      toast.success('Joined group')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not join group')
    } finally {
      setJoiningId(null)
    }
  }

  const groupSwitcher =
    resolvedItems.length > 1 ? (
      <div
        className="flex flex-wrap gap-1.5"
        role="tablist"
        aria-label="Select group"
      >
        {resolvedItems.map((item) => {
          const active = item.id === selected.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setManualSelectedId(item.id)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                active
                  ? 'border-accent bg-accent/15 text-foreground'
                  : 'border-border/70 text-muted hover:border-border hover:text-foreground',
              )}
            >
              {formatGroupTitle(item)}
            </button>
          )
        })}
      </div>
    ) : null

  const actionControls = (
    <div className="flex flex-wrap items-center gap-2">
      {canShareCheckIn && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => setCheckInOpen(true)}
          className="gap-1.5 text-xs"
        >
          <CheckCircle2 size={14} aria-hidden />
          <span>{checkInLabel}</span>
        </Button>
      )}
      {selected.viewerIsMember ? (
        <Link
          to={groupHref}
          className="btn btn--outline btn--sm shrink-0 text-xs"
          aria-label={variant === 'card' ? `Open Group ${title}` : undefined}
        >
          Open Group
        </Link>
      ) : canQuickJoin ? (
        <Button
          type="button"
          size="sm"
          loading={joiningId === selected.id}
          disabled={disabled || !online || joiningId === selected.id}
          aria-label={`Join ${title}`}
          onClick={() => void handleJoin()}
        >
          Join
        </Button>
      ) : (
        <Link
          to={groupHref}
          className="btn btn--outline btn--sm shrink-0 text-xs"
          aria-label={`${selected.joinPolicy === 'OPEN' || selected.isPendingInvite ? 'Join' : 'View'} ${title}`}
        >
          {selected.joinPolicy === 'OPEN' || selected.isPendingInvite
            ? 'Join'
            : 'View'}
        </Link>
      )}
    </div>
  )

  const checkInModal = (activityId || (activityOptions && activityOptions.length > 0)) && (
    <GroupCheckInModal
      open={checkInOpen}
      onClose={() => setCheckInOpen(false)}
      defaultGroupId={selected.viewerIsMember ? selected.id : undefined}
      activityId={activityId}
      activityTitle={activityTitle}
      activityOptions={activityOptions}
      calendarItemId={occurrenceId}
    />
  )

  if (variant === 'inline') {
    return (
      <>
        <div className={cn('flex flex-wrap items-center gap-3', className)}>
          {groupSwitcher}
          {selected.name && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
              {selected.name}
              <UnreadDot count={unreadCount} inline />
            </span>
          )}
          <AvatarStack people={visibleAvatars} max={4} />
          {progressSummary ? (
            <span
              aria-label="Group progress"
              className="text-xs font-medium text-muted"
            >
              {progressSummary}
            </span>
          ) : (
            <span className="text-xs text-muted">{metaParts.join(' · ')}</span>
          )}
          {progressSummary && recentCheckInText && (
            <span className="text-xs text-muted">· {recentCheckInText}</span>
          )}
          {actionControls}
        </div>
        {checkInModal}
      </>
    )
  }

  return (
    <>
      <div
        className={cn(
          'space-y-3 rounded-xl border border-border/70 bg-background/60 p-3.5 sm:p-4',
          className,
        )}
        aria-label={`Group status: ${title}`}
      >
        {groupSwitcher}

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {visibleAvatars.length > 0 ? (
              <AvatarStack people={visibleAvatars} max={4} className="shrink-0" />
            ) : (
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent"
                aria-hidden
              >
                <Users size={16} />
              </span>
            )}
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="truncate text-sm font-semibold text-foreground">
                  {title}
                </p>
                {selected.visibility === 'PRIVATE' && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border/70 px-1.5 py-0.5 text-[11px] font-medium text-muted">
                    <Lock size={10} aria-hidden />
                    Private
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-muted">{metaParts.join(' · ')}</p>
            </div>
          </div>
          {actionControls}
        </div>

        {selected.viewerIsMember && selected.latestCheckIn && (
          <div className="flex items-center gap-2 border-t border-border/50 pt-2.5 text-xs text-muted">
            <Avatar
              src={selected.latestCheckIn.user.avatarUrl}
              name={selected.latestCheckIn.user.displayName}
              size="sm"
              className="h-5 w-5 shrink-0"
            />
            <p className="min-w-0 truncate">
              <span className="font-medium text-foreground">
                {selected.latestCheckIn.user.displayName}
              </span>{' '}
              completed {selected.latestCheckIn.activityTitle} ·{' '}
              {formatRelativeTime(selected.latestCheckIn.completedAt)}
            </p>
          </div>
        )}
      </div>
      {checkInModal}
    </>
  )
}
