import { useState } from 'react'
import { ArrowLeft, CalendarPlus, ExternalLink, Play, UserPlus } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getApiClient,
  useActivity,
  useJoinProgram,
  useProgramPreview,
  useUserByHandle,
} from '@project/sdk'
import { GroupStageExperience } from '@/pages/Group'
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
  onClose,
  children,
}: {
  title: string
  subtitle?: string | null
  body?: string | null
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto flex w-full max-w-[620px] flex-col items-center gap-5 px-6 py-8 text-center animate-in fade-in duration-200">
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
  const [joined, setJoined] = useState(false)

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

  const canJoinInline =
    isSignedIn &&
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
      {joined && (
        <span className="inline-flex min-h-10 items-center rounded-full border border-accent/40 bg-accent/15 px-4 py-2 text-xs font-semibold text-accent">
          Joined
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
  isSignedIn,
  todayIso,
  onClose,
  onExecute,
}: {
  activityId: string
  isSignedIn: boolean
  todayIso: string
  onClose: () => void
  onExecute: (action: CardAction) => void
}) {
  const queryClient = useQueryClient()
  const query = useActivity(activityId)
  const [scheduling, setScheduling] = useState(false)
  const [scheduled, setScheduled] = useState(false)

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

  const handleAddToday = async () => {
    setScheduling(true)
    try {
      const res = await getApiClient().POST('/calendar/items', {
        body: {
          activityId: act.id,
          localDate: todayIso,
          idempotencyKey: crypto.randomUUID(),
        },
      })
      if (res.error) throw res.error
      setScheduled(true)
      await queryClient.invalidateQueries({ queryKey: ['calendar'] })
      toast.success(`Added ${act.title} to today`)
    } catch {
      toast.error('Could not add to today right now')
    } finally {
      setScheduling(false)
    }
  }

  const meta = [
    act.durationMinutes ? `${act.durationMinutes} minutes` : null,
    act.creator ? `by @${act.creator.handle}` : null,
    act.instructionCount ? `${act.instructionCount} steps` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <PreviewShell
      title={act.title}
      subtitle={meta}
      body={act.summary}
      onClose={onClose}
    >
      <button
        type="button"
        onClick={() => onExecute({ type: 'open_activity', activityId })}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition hover:brightness-105"
      >
        <Play size={14} className="fill-current" aria-hidden />
        <span>Start Activity</span>
      </button>
      <button
        type="button"
        onClick={() => onExecute({ type: 'navigate_activity', activityId })}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-surface-raised px-4 py-2 text-xs font-medium text-muted transition hover:text-inherit"
      >
        <span>Open Activity Page</span>
        <ExternalLink size={13} aria-hidden />
      </button>
      {isSignedIn && !scheduled && (
        <button
          type="button"
          disabled={scheduling}
          onClick={() => void handleAddToday()}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-surface-raised px-4 py-2 text-sm font-medium transition hover:bg-surface-muted disabled:opacity-50"
        >
          <CalendarPlus size={14} aria-hidden />
          <span>{scheduling ? 'Adding…' : 'Add to Today'}</span>
        </button>
      )}
      {scheduled && (
        <span className="inline-flex min-h-10 items-center rounded-full border border-accent/40 bg-accent/15 px-4 py-2 text-xs font-semibold text-accent">
          Added to today
        </span>
      )}
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
