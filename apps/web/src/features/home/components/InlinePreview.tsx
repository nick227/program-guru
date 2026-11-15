import { useState } from 'react'
import { ArrowLeft, CalendarDays, CalendarPlus, ExternalLink, MapPin, Play, UserPlus, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useFirstScheduledDayUrl } from '@/lib/useFirstScheduledDay'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getApiClient,
  useActivity,
  useGathering,
  useJoinProgram,
  useProgramLibrary,
  useProgramPreview,
  useUserByHandle,
} from '@project/sdk'
import { GroupStageExperience } from '@/pages/Group'
import { EntityHero, useCategorySlugOf } from '@/components/shared/EntityHero'
import { Avatar } from '@/components/ui/Avatar'
import { gatheringWhen } from '@/components/activity/ActivityGatherings'
import { activityHero } from '@/lib/hero'
import { groupAction } from '@/lib/joinEligibility'
import { peopleLine } from '../engine/surferDeck'
import { AddToScheduleButton } from '@/components/schedule/AddToSchedule'
import type { CardAction, PreviewTarget } from '../engine/types'
import { TransitionSurface } from './TransitionSurface'

interface InlinePreviewProps {
  target: PreviewTarget
  isSignedIn: boolean
  todayIso: string
  onClose: () => void
  onExecute: (action: CardAction) => void
}

function PreviewShell({
  title,
  subtitle,
  body,
  media,
  onClose,
  children,
}: {
  title: string
  subtitle?: string | null
  body?: string | null
  media?: React.ReactNode
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto flex w-full max-w-[620px] flex-col items-center gap-5 px-6 py-8 text-center animate-in fade-in duration-200">
      {media}
      <div className="space-y-2.5">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mx-auto max-w-md text-sm text-muted sm:text-base">
            {subtitle}
          </p>
        )}
      </div>

      {body && (
        <p className="mx-auto max-w-md line-clamp-4 text-sm leading-relaxed text-muted">
          {body}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
        {children}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-muted transition hover:text-inherit"
      >
        <ArrowLeft size={13} aria-hidden />
        <span>Back</span>
      </button>
    </div>
  )
}

function ProgramPreviewBody({
  programId,
  isSignedIn,
  todayIso,
  onClose,
  onExecute,
}: {
  programId: string
  isSignedIn: boolean
  todayIso: string
  onClose: () => void
  onExecute: (action: CardAction) => void
}) {
  const queryClient = useQueryClient()
  const query = useProgramPreview(programId)
  const join = useJoinProgram(programId)
  const library = useProgramLibrary(isSignedIn)
  const [joined, setJoined] = useState(false)
  const firstDayUrl = useFirstScheduledDayUrl(programId, joined)

  const prog = query.data
  if (query.isPending) {
    return <TransitionSurface ready={false}>{null}</TransitionSurface>
  }
  if (!prog) {
    return (
      <TransitionSurface ready>
        <PreviewShell title="Program unavailable" onClose={onClose}>
          <button
          type="button"
          onClick={() => onExecute({ type: 'open_program', programId })}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground"
        >
          <span>Open Program Page</span>
          <ExternalLink size={14} aria-hidden />
        </button>
      </PreviewShell>
      </TransitionSurface>
    )
  }

  const libraryEntry = library.data?.find((entry) => entry.program.id === programId)
  const alreadyKnown = prog.viewerAccess === 'OWNER' || Boolean(prog.myEnrollmentId) || Boolean(libraryEntry)
  const canJoinInline =
    isSignedIn &&
    library.isSuccess &&
    !alreadyKnown &&
    Boolean(prog.latestVersionId) &&
    prog.canJoin &&
    !prog.canPurchase &&
    !joined

  const handleJoin = async () => {
    if (!prog.latestVersionId) return
    try {
      await join.mutateAsync({
        programVersionId: prog.latestVersionId,
        startLocalDate: todayIso,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        idempotencyKey: crypto.randomUUID(),
      })
      setJoined(true)
      await queryClient.invalidateQueries()
      toast.success(`Joined ${prog.title}`)
    } catch {
      toast.error('Could not join Program right now')
    }
  }

  const meta = [
    prog.durationDays ? `${prog.durationDays} days` : prog.frequencyLabel,
    prog.type?.label,
    prog.level.replace('_', ' '),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <TransitionSurface ready>
      <PreviewShell
        title={prog.title}
        subtitle={meta}
        body={prog.description}
        onClose={onClose}
      >
      {canJoinInline && (
        <button
          type="button"
          disabled={join.isPending}
          onClick={() => void handleJoin()}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition hover:brightness-105 disabled:opacity-50"
        >
          <span>{join.isPending ? 'Joining…' : 'Join Program'}</span>
        </button>
      )}
      {canJoinInline && prog.latestVersionId && (
        <AddToScheduleButton
          target={{ kind: 'program', id: prog.id, title: prog.title, programVersionId: prog.latestVersionId }}
          signedIn={isSignedIn}
          returnTo="/"
          onScheduled={() => {
            setJoined(true)
            void queryClient.invalidateQueries()
          }}
        />
      )}
      {joined && firstDayUrl ? (
        // Right after starting: go to the Program's first scheduled Activity (item 7).
        <Link
          to={firstDayUrl}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition hover:brightness-105"
        >
          <CalendarDays size={15} aria-hidden />
          View Calendar
        </Link>
      ) : (joined || alreadyKnown) && (
        <span className="inline-flex min-h-10 items-center rounded-full border border-accent/40 bg-accent/15 px-4 py-2 text-xs font-semibold text-accent">
          {prog.viewerAccess === 'OWNER' ? 'Created by you' : 'In your Programs'}
        </span>
      )}
      <button
        type="button"
        onClick={() => onExecute({ type: 'open_program', programId })}
        className={
          canJoinInline
            ? 'inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-surface-raised px-4 py-2 text-sm font-medium transition hover:bg-surface-muted'
            : 'inline-flex min-h-10 items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition hover:brightness-105'
        }
      >
        <span>Open Program Page</span>
        <ExternalLink size={14} aria-hidden />
      </button>
    </PreviewShell>
    </TransitionSurface>
  )
}

function ActivityPreviewBody({
  activityId,
  gatheringId,
  calendarItemId,
  isSignedIn,
  todayIso,
  onClose,
  onExecute,
}: {
  activityId: string
  gatheringId?: string | null
  calendarItemId?: string | null
  isSignedIn: boolean
  todayIso: string
  onClose: () => void
  onExecute: (action: CardAction) => void
}) {
  const query = useActivity(activityId)
  const gathering = useGathering(gatheringId).data ?? null
  const categorySlugOf = useCategorySlugOf()

  if (query.isPending) {
    return <TransitionSurface ready={false}>{null}</TransitionSurface>
  }

  const act = query.data
  if (!act) {
    return (
      <PreviewShell title="Activity unavailable" onClose={onClose}>
        <button
          type="button"
          onClick={() => onExecute({ type: 'open_activity', activityId })}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground"
        >
          <span>Open Activity</span>
          <ExternalLink size={14} aria-hidden />
        </button>
      </PreviewShell>
    )
  }

  const meta = [
    act.durationMinutes ? `${act.durationMinutes} minutes` : null,
    act.creator ? `by @${act.creator.handle}` : null,
    act.instructionCount ? `${act.instructionCount} steps` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  // A gathering is a way to do this Activity with others: its real people, then Join (12 §5a).
  const together = gathering && !gathering.isPast ? gathering : null
  const action = together ? groupAction(together) : null
  const people = peopleLine(together)
  // The surfer always passes `gatheringId` (null without one) and gets the media-led preview.
  const media = gatheringId !== undefined ? (
    <div className="flex w-full flex-col gap-3">
      <EntityHero hero={activityHero(act, categorySlugOf)} size="banner" interactive={false} className="aspect-[16/9] w-full" />
      {together && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-sm">
          {together.members.length > 0 && (
            <span className="flex -space-x-2" aria-hidden>
              {together.members.slice(0, 8).map((m) => (
                <Avatar key={m.id} src={m.avatarUrl} name={m.displayName} size="sm" className="ring-2 ring-surface" />
              ))}
            </span>
          )}
          {people && <span className="font-semibold">{people}</span>}
          <span className="text-muted">{gatheringWhen(together)}</span>
          {together.place && (
            <span className="inline-flex items-center gap-1 text-muted">
              <MapPin size={13} aria-hidden />
              {together.place.name}, {together.place.locality}
            </span>
          )}
        </div>
      )}
      {together?.lookingFor && <p className="text-sm text-muted">{together.lookingFor}</p>}
    </div>
  ) : undefined

  const joinButtonClass =
    'inline-flex min-h-10 items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition hover:brightness-105'

  return (
    <PreviewShell
      title={act.title}
      subtitle={meta}
      body={act.summary}
      media={media}
      onClose={onClose}
    >
      {together && !isSignedIn && (
        <Link to={`/login?returnTo=${encodeURIComponent('/')}`} className={joinButtonClass}>
          <Users size={14} aria-hidden />
          <span>Sign in to join</span>
        </Link>
      )}
      {together && isSignedIn && action === 'open' && together.viewerCalendarItemId && (
        <button
          type="button"
          onClick={() => onExecute({ type: 'navigate_occurrence', itemId: together.viewerCalendarItemId! })}
          className={joinButtonClass}
        >
          <Users size={14} aria-hidden />
          <span>Open</span>
        </button>
      )}
      {together && isSignedIn && action === 'join' && !together.isFull && (
        <button
          type="button"
          onClick={() =>
            onExecute({ type: 'join_gathering', gatheringId: together.id, calendarItemId: calendarItemId ?? null })
          }
          className={joinButtonClass}
        >
          <Users size={14} aria-hidden />
          <span>Join</span>
        </button>
      )}
      {together?.isFull && action === 'join' && (
        <span className="inline-flex min-h-10 items-center px-2 text-sm text-muted">Full</span>
      )}
      <button
        type="button"
        onClick={() => onExecute({ type: 'open_activity', activityId })}
        className={
          together && action !== 'view'
            ? 'inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-surface-raised px-5 py-2 text-sm font-medium transition hover:bg-surface-muted'
            : 'inline-flex min-h-10 items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition hover:brightness-105'
        }
      >
        <Play size={14} className="fill-current" aria-hidden />
        <span>{together ? 'Start on my own' : 'Start Activity'}</span>
      </button>
      <button
        type="button"
        onClick={() => onExecute({ type: 'navigate_activity', activityId })}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-surface-raised px-4 py-2 text-xs font-medium text-muted transition hover:text-inherit"
      >
        <span>Open Activity Page</span>
        <ExternalLink size={13} aria-hidden />
      </button>
      <AddToScheduleButton
        target={{ kind: 'activity', id: act.id, title: act.title }}
        signedIn={isSignedIn}
        returnTo="/"
      />
    </PreviewShell>
  )
}

function CreatorPreviewBody({
  handle,
  onClose,
  onExecute,
}: {
  handle: string
  onClose: () => void
  onExecute: (action: CardAction) => void
}) {
  const query = useUserByHandle(handle)
  const [followed, setFollowed] = useState(false)

  if (query.isPending) {
    return <TransitionSurface ready={false}>{null}</TransitionSurface>
  }

  const profile = query.data
  if (!profile) {
    return (
      <PreviewShell title={`@${handle}`} onClose={onClose}>
        <button
          type="button"
          onClick={() => onExecute({ type: 'open_creator', handle })}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground"
        >
          <span>Full Profile</span>
          <ExternalLink size={14} aria-hidden />
        </button>
      </PreviewShell>
    )
  }

  return (
    <PreviewShell
      title={profile.displayName}
      subtitle={`@${profile.handle}`}
      body={profile.bio}
      onClose={onClose}
    >
      {!followed && profile.relationship !== 'FOLLOWING' ? (
        <button
          type="button"
          onClick={() => {
            onExecute({
              type: 'follow_creator',
              userId: profile.id,
              handle: profile.handle,
            })
            setFollowed(true)
          }}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition hover:brightness-105"
        >
          <UserPlus size={14} aria-hidden />
          <span>Follow</span>
        </button>
      ) : (
        <span className="inline-flex min-h-10 items-center rounded-full border border-accent/40 bg-accent/15 px-4 py-2 text-xs font-semibold text-accent">
          Following
        </span>
      )}
      <button
        type="button"
        onClick={() => onExecute({ type: 'open_creator', handle: profile.handle })}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-surface-raised px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
      >
        <span>Full Profile</span>
        <ExternalLink size={14} aria-hidden />
      </button>
    </PreviewShell>
  )
}

/**
 * Self-contained inline preview rendered inside Home without navigating away.
 */
export function InlinePreview({
  target,
  isSignedIn,
  todayIso,
  onClose,
  onExecute,
}: InlinePreviewProps) {
  switch (target.kind) {
    case 'program':
      return (
        <ProgramPreviewBody
          programId={target.id}
          isSignedIn={isSignedIn}
          todayIso={todayIso}
          onClose={onClose}
          onExecute={onExecute}
        />
      )
    case 'activity':
      return (
        <ActivityPreviewBody
          activityId={target.id}
          gatheringId={target.gatheringId}
          calendarItemId={target.calendarItemId}
          isSignedIn={isSignedIn}
          todayIso={todayIso}
          onClose={onClose}
          onExecute={onExecute}
        />
      )
    case 'creator':
      return (
        <CreatorPreviewBody
          handle={target.handle}
          onClose={onClose}
          onExecute={onExecute}
        />
      )
    case 'group':
    case 'session':
      return (
        <GroupStageExperience
          groupId={target.id}
          embedded
          onBack={onClose}
        />
      )
    case 'scheduled':
      return (
        <PreviewShell
          title={target.title}
          subtitle={target.subtitle}
          onClose={onClose}
        >
          <button
            type="button"
            onClick={() =>
              onExecute({ type: 'open_occurrence', itemId: target.id })
            }
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition hover:brightness-105"
          >
            <Play size={14} className="fill-current" aria-hidden />
            <span>Start now</span>
          </button>
          <button
            type="button"
            onClick={() =>
              onExecute({ type: 'navigate_occurrence', itemId: target.id })
            }
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-surface-raised px-4 py-2 text-xs font-medium text-muted transition hover:text-inherit"
          >
            <span>Open Activity Page</span>
            <ExternalLink size={13} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onExecute({ type: 'open_calendar' })}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-surface-raised px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
          >
            <span>Open Calendar</span>
            <ExternalLink size={14} aria-hidden />
          </button>
        </PreviewShell>
      )
  }
}
