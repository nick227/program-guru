import { useState } from 'react'
import { ArrowLeft, CalendarDays, ExternalLink, MapPin, Play, UserPlus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useFirstScheduledDayUrl } from '@/lib/useFirstScheduledDay'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  useGathering,
  useJoinProgram,
  useProgramLibrary,
  useProgramPreview,
  useUserByHandle,
} from '@project/sdk'
import { GroupStageExperience } from '@/pages/Group'
import { EntityHero, useCategorySlugOf } from '@/components/shared/EntityHero'
import { Avatar } from '@/components/ui/Avatar'
import { gatheringWhen } from '@/lib/gatheringLabels'
import { programHero } from '@/lib/hero'
import { useActivityPreview } from '@/lib/activityPreview'
import { dateLabel } from '@/lib/dates'
import { formatTargetTime } from '@/lib/targetTime'
import { buildOccurrenceUrl } from '@/lib/urls'
import { peopleLine } from '@/lib/participation'
import { AddToScheduleButton } from '@/components/schedule/AddToSchedule'
import { ActivityParticipation } from '@/components/activity/ActivityParticipation'
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
        <h1 className="font-display text-2xl font-semibold tracking-tight">
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
  const categorySlugOf = useCategorySlugOf()

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

  // The viewer's own run, from the personal library (never invented; signed out there is none).
  const run = libraryEntry?.current ?? null
  const status = libraryEntry?.status ?? null
  const isOwner = prog.viewerAccess === 'OWNER'
  const completed = status === 'Completed'
  const enrolled = Boolean(run) && !completed && status !== 'Archived'
  const next = enrolled && status !== 'Paused' ? (run?.upcoming[0] ?? null) : null
  const participantCount = libraryEntry?.participation?.participantCount ?? prog.enrollmentCount
  const friends = libraryEntry?.participation?.friends ?? []
  const outline = prog.safeActivityOutline ?? []
  const commitment = [
    prog.durationDays ? `${prog.durationDays} ${prog.durationDays === 1 ? 'day' : 'days'}` : null,
    prog.frequencyLabel,
    prog.sessionMinutes ? `about ${prog.sessionMinutes} min a session` : null,
  ].filter(Boolean)
  const meta = [prog.type?.label, prog.level.replace('_', ' ')].filter(Boolean).join(' · ')
  const returnTo = '/'
  const primary =
    'inline-flex min-h-10 items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition hover:brightness-105 disabled:opacity-50'
  const secondary =
    'inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-surface-raised px-4 py-2 text-sm font-medium transition hover:bg-surface-muted'
  const hasPrimary = canJoinInline || Boolean(next) || (joined && Boolean(firstDayUrl))

  return (
    <TransitionSurface ready>
      <section
        aria-label={`${prog.title} overview`}
        className="mx-auto flex w-full max-w-[620px] flex-col gap-5 px-4 py-6 text-left animate-in fade-in duration-200 sm:px-6"
      >
        <EntityHero hero={programHero(prog, categorySlugOf)} size="banner" interactive={false} className="aspect-[16/9] w-full" />

        <header className="space-y-1.5">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{prog.title}</h1>
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
            {prog.creator ? (
              <button
                type="button"
                onClick={() => onExecute({ type: 'open_creator', handle: prog.creator!.handle })}
                className="inline-flex items-center gap-1.5 font-medium text-foreground hover:underline"
              >
                <Avatar src={prog.creator.avatarUrl} name={prog.creator.displayName} size="sm" className="h-5 w-5 text-[9px]" />
                {prog.creator.displayName}
              </button>
            ) : (
              <span className="font-medium text-foreground">Program.Guru</span>
            )}
            {meta && <span aria-hidden>·</span>}
            {meta && <span className="capitalize">{meta.toLowerCase()}</span>}
          </p>
        </header>

        {prog.description && (
          <p className="line-clamp-3 text-sm leading-relaxed text-muted">{prog.description}</p>
        )}

        {/* Commitment and people: what joining means, and who else does it (12 §10). */}
        <dl className="grid grid-cols-1 gap-3 rounded-xl bg-surface-raised/50 p-4 text-sm sm:grid-cols-2">
          <div className="space-y-0.5">
            <dt className="text-xs font-medium text-muted">Commitment</dt>
            <dd className="font-medium">{commitment.length ? commitment.join(' · ') : 'At your own pace'}</dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-xs font-medium text-muted">People</dt>
            <dd className="flex items-center gap-2 font-medium">
              {friends.length > 0 && (
                <span className="flex -space-x-1.5" aria-hidden>
                  {friends.slice(0, 4).map((f) => (
                    <Avatar key={f.id} src={f.avatarUrl} name={f.displayName} size="sm" className="h-5 w-5 text-[9px] ring-2 ring-surface" />
                  ))}
                </span>
              )}
              <span>
                {/* The server withholds counts under the minimum sample of 5 (12 §10, §10a). */}
                {participantCount != null
                  ? `${participantCount} ${participantCount === 1 ? 'participant' : 'participants'}`
                  : 'Fewer than 5 participants'}
                {run && (enrolled || completed) ? ' · including you' : ''}
                {friends.length > 0 ? ` · ${friends.length} you follow` : ''}
              </span>
            </dd>
          </div>
        </dl>

        {/* Your run: real progress, the next Activity and what follows (enrolled or completed only). */}
        {run && (enrolled || completed) && (
          <section aria-label="Your progress" className="space-y-3 rounded-xl border border-border/70 p-4">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-semibold">{completed ? 'Completed' : status === 'Paused' ? 'Paused' : `Week ${run.week}`}</span>
              <span className="text-xs text-muted tabular-nums">
                {run.planned ? `${run.completed} of ${run.planned} done` : 'Nothing scheduled yet'}
              </span>
            </div>
            {run.planned > 0 && (
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-surface-muted"
                role="progressbar"
                aria-label="Program progress"
                aria-valuemin={0}
                aria-valuemax={run.planned}
                aria-valuenow={run.completed}
              >
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((run.completed / run.planned) * 100)}%` }} />
              </div>
            )}
            {enrolled && run.upcoming.length > 0 && (
              <ol className="space-y-1.5" aria-label="Coming up">
                {run.upcoming.slice(0, 3).map((a, i) => (
                  <li key={a.id}>
                    <Link
                      to={buildOccurrenceUrl(a.id, { returnTo })}
                      className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm transition hover:bg-surface-raised"
                    >
                      <span className="min-w-0 truncate">
                        {i === 0 && <span className="mr-1.5 text-xs font-semibold text-accent">Next</span>}
                        {a.title}
                      </span>
                      <span className="shrink-0 text-xs text-muted">
                        {dateLabel(a.date, { weekday: 'short', month: 'short', day: 'numeric' })}
                        {a.time ? ` · ${formatTargetTime(a.time)}` : ''}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        {/* The plan, as the creator outlined it (safe for paid Programs). */}
        {outline.length > 0 && (
          <section aria-label="Activity plan" className="space-y-2">
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted">Activity plan</h2>
            <ol className="space-y-1">
              {outline.slice(0, 5).map((step, idx) => (
                <li key={`${step.title}-${idx}`} className="flex items-center justify-between gap-3 rounded-lg bg-surface-raised/40 px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2.5">
                    {/* The first day an Activity appears; shown once per day so a shared day reads as a group. */}
                    <span className="w-11 shrink-0 text-xs font-semibold tabular-nums text-accent">
                      {step.dayIndex == null
                        ? String(idx + 1).padStart(2, '0')
                        : idx === 0 || outline[idx - 1]?.dayIndex !== step.dayIndex
                          ? `Day ${step.dayIndex + 1}`
                          : ''}
                    </span>
                    <span className="truncate">{step.title}</span>
                  </span>
                  {step.durationMinutes && <span className="shrink-0 text-xs text-muted">{step.durationMinutes} min</span>}
                </li>
              ))}
            </ol>
            {outline.length > 5 && <p className="text-xs text-muted">+{outline.length - 5} more in the full plan</p>}
          </section>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          {next && (
            <Link to={buildOccurrenceUrl(next.id, { returnTo })} className={primary}>
              <Play size={14} className="fill-current" aria-hidden />
              Continue
            </Link>
          )}
          {canJoinInline && (
            <button type="button" disabled={join.isPending} onClick={() => void handleJoin()} className={primary}>
              <Play size={14} className="fill-current" aria-hidden />
              <span>{join.isPending ? 'Starting…' : 'Start Program'}</span>
            </button>
          )}
          {(canJoinInline || !isSignedIn) && prog.latestVersionId && (
            <AddToScheduleButton
              target={{ kind: 'program', id: prog.id, title: prog.title, programVersionId: prog.latestVersionId }}
              signedIn={isSignedIn}
              returnTo={returnTo}
              onScheduled={() => {
                setJoined(true)
                void queryClient.invalidateQueries()
              }}
            />
          )}
          {joined && firstDayUrl && (
            // Right after starting: go to the Program's first scheduled Activity.
            <Link to={firstDayUrl} className={primary}>
              <CalendarDays size={15} aria-hidden />
              View Calendar
            </Link>
          )}
          {!next && !joined && (isOwner || completed) && (
            <span className="inline-flex min-h-10 items-center rounded-full border border-accent/40 bg-accent/15 px-4 py-2 text-xs font-semibold text-accent">
              {isOwner ? 'Created by you' : 'Completed'}
            </span>
          )}
          <button
            type="button"
            onClick={() => onExecute({ type: 'open_program', programId })}
            className={hasPrimary ? secondary : primary}
          >
            <span>Open Program Page</span>
            <ExternalLink size={14} aria-hidden />
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 self-center px-2 py-1 text-xs font-medium text-muted transition hover:text-inherit"
        >
          <ArrowLeft size={13} aria-hidden />
          <span>Back</span>
        </button>
      </section>
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
  // Data, image, summary and Manage come from the shared preview controller (lib/activityPreview).
  const preview = useActivityPreview(activityId, { returnTo: '/' })
  const query = preview.query
  const gathering = useGathering(gatheringId).data ?? null

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
  const people = peopleLine(together)
  // The surfer always passes `gatheringId` (null without one) and gets the media-led preview.
  const media = gatheringId !== undefined ? (
    <div className="flex w-full flex-col gap-3">
      {preview.hero && <EntityHero hero={preview.hero} size="banner" interactive={false} className="aspect-[16/9] w-full" />}
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

  return (
    <PreviewShell
      title={act.title}
      subtitle={meta}
      body={preview.summary}
      media={media}
      onClose={onClose}
    >
      {/* Status, people and actions: the shared participation component (03-UX §2b), with Home's own
          inline Start, Resume and Join. */}
      <ActivityParticipation
        activity={{ id: act.id, title: act.title }}
        returnTo="/"
        className="w-full max-w-md items-center"
        onStart={() => onExecute({ type: 'open_activity', activityId })}
        onResume={(itemId) => onExecute({ type: 'open_occurrence', itemId })}
        onJoin={(g) => onExecute({ type: 'join_gathering', gatheringId: g.id, calendarItemId: calendarItemId ?? null })}
        onOpenPage={() => onExecute({ type: 'navigate_activity', activityId })}
        manageHref={preview.manageHref}
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
