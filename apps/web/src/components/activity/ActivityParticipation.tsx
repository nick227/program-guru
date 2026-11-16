import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarCheck, CalendarClock, CalendarPlus, CircleDot, ExternalLink, Play, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useActivityParticipation, useCurrentUser, useJoinGathering, type components } from '@project/sdk'
import { joinedMessage } from '@/components/activity/ActivityGatherings'
import { AddToScheduleButton, ScheduleDialog, type ScheduleTarget } from '@/components/schedule/AddToSchedule'
import { StartActivityButton } from '@/components/schedule/StartActivityButton'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { resolveParticipation, type ParticipationView } from '@/lib/activityParticipation'
import { today } from '@/lib/dates'
import { cn } from '@/lib/utils'

type Gathering = components['schemas']['Gathering']

/**
 * The one Activity participation component (03-UX §2b): your status, people (a count always, including
 * zero, with authorized avatars), shared activity, and the actions, from one shared resolver and one
 * batched request. `full` adds the action row; `compact` (cards, rows) has one icon action; `summary`
 * shows only the lines.
 */
export function ActivityParticipation({
  activity,
  variant = 'full',
  returnTo,
  onStart,
  onResume,
  onJoin,
  onOpenPage,
  className,
}: {
  activity: { id: string; title: string }
  /** `people`: only who takes part (and shared activity), where status and schedule show elsewhere. */
  variant?: 'full' | 'compact' | 'summary' | 'people'
  returnTo: string
  /** Overrides (Home starts inline); default navigates to the occurrence. */
  onStart?: () => void
  onResume?: (itemId: string) => void
  onJoin?: (gathering: Gathering) => void
  /** Shows the secondary Open Activity Page action. */
  onOpenPage?: () => void
  className?: string
}) {
  const me = useCurrentUser()
  const signedIn = Boolean(me.data)
  const query = useActivityParticipation(activity.id)
  const [todayIso] = useState(() => today(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'))
  const view = resolveParticipation(query.data, { signedIn, todayIso })
  const [rescheduling, setRescheduling] = useState(false)

  const rescheduleTarget: ScheduleTarget | null = view.next
    ? {
        kind: 'item',
        id: view.next.id,
        title: activity.title,
        localDate: view.next.localDate,
        localTime: view.next.localTime,
        recurrenceId: view.next.recurrenceId,
        gatheringId: view.next.gatheringId,
        updatedAt: view.next.updatedAt,
      }
    : null
  const dialog = rescheduling && rescheduleTarget && (
    <ScheduleDialog target={rescheduleTarget} onClose={() => setRescheduling(false)} />
  )

  const lines = <ParticipationLines view={view} compact={variant !== 'full'} peopleOnly={variant === 'people'} />

  if (variant === 'summary' || variant === 'people') return <div className={className}>{lines}</div>

  if (variant === 'compact') {
    return (
      <div className={cn('flex items-start justify-between gap-2', className)}>
        <div className="min-w-0 flex-1">{lines}</div>
        {view.next ? (
          <button
            type="button"
            onClick={() => setRescheduling(true)}
            aria-label={`Reschedule ${activity.title}`}
            title="Reschedule"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-raised text-muted transition hover:bg-surface-muted hover:text-foreground"
          >
            <CalendarClock size={16} aria-hidden />
          </button>
        ) : (
          <AddToScheduleButton iconOnly target={{ kind: 'activity', ...activity }} signedIn={signedIn} returnTo={returnTo} className="h-9 w-9" />
        )}
        {dialog}
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {lines}
      <div className="flex flex-wrap items-center gap-2">
        {view.actions.includes('resume') && view.inProgressItemId && (
          <ResumeButton itemId={view.inProgressItemId} returnTo={returnTo} onResume={onResume} />
        )}
        {view.actions.includes('start') &&
          (onStart ? (
            <Button onClick={onStart}>
              <Play size={15} className="fill-current" aria-hidden />
              Start now
            </Button>
          ) : (
            <StartActivityButton activityId={activity.id} signedIn={signedIn} returnTo={returnTo} />
          ))}
        {view.gathering && (view.actions.includes('join') || view.actions.includes('open_gathering')) && (
          <JoinButton gathering={view.gathering} signedIn={signedIn} returnTo={returnTo} onJoin={onJoin} />
        )}
        <AddToScheduleButton target={{ kind: 'activity', ...activity }} signedIn={signedIn} returnTo={returnTo} />
        {view.actions.includes('reschedule') && (
          <button
            type="button"
            onClick={() => setRescheduling(true)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-surface-raised px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
          >
            <CalendarClock size={14} aria-hidden />
            Reschedule
          </button>
        )}
        {onOpenPage && (
          <button
            type="button"
            onClick={onOpenPage}
            className="inline-flex min-h-10 items-center gap-1.5 px-2 text-xs font-medium text-muted transition hover:text-inherit"
          >
            Open Activity Page
            <ExternalLink size={13} aria-hidden />
          </button>
        )}
      </div>
      {dialog}
    </div>
  )
}

/** Status, people and shared lines; always shows the people line, including zero. */
function ParticipationLines({ view, compact, peopleOnly = false }: { view: ParticipationView; compact: boolean; peopleOnly?: boolean }) {
  const StatusIcon =
    view.status === 'IN_PROGRESS' ? CircleDot : view.status === 'SCHEDULED' ? CalendarCheck : view.status === 'COMPLETED' ? CalendarCheck : CalendarPlus
  return (
    <div className={cn('flex min-w-0 flex-col', compact ? 'gap-1 text-xs' : 'gap-1.5 text-sm')} data-participation-status={view.status}>
      {!peopleOnly && view.statusLabel && (
        <p className={cn('flex min-w-0 items-center gap-1.5', view.status === 'SCHEDULED' || view.status === 'IN_PROGRESS' ? 'font-semibold text-accent' : 'text-muted')}>
          <StatusIcon size={compact ? 13 : 15} aria-hidden className="shrink-0" />
          <span className="truncate">{view.statusLabel}</span>
        </p>
      )}
      {!peopleOnly && view.detail && <p className={cn('truncate text-muted', compact ? 'pl-[19px]' : 'pl-[21px]')}>{view.detail}</p>}
      <p className="flex min-w-0 items-center gap-1.5 text-muted" aria-label={view.peopleLabel}>
        {view.avatars.length > 0 ? (
          <span className="flex shrink-0 -space-x-1.5" aria-hidden>
            {view.avatars.slice(0, compact ? 3 : 5).map((u) => (
              <Avatar key={u.id} src={u.avatarUrl} name={u.displayName} size="sm" className={cn('ring-2 ring-surface', compact && 'h-5 w-5 text-[9px]')} />
            ))}
          </span>
        ) : (
          <Users size={compact ? 13 : 15} aria-hidden className="shrink-0" />
        )}
        <span className="truncate" aria-hidden>
          {view.peopleLabel}
        </span>
      </p>
      {view.sharedLabel && <p className={cn('truncate font-medium', compact ? 'pl-[19px]' : 'pl-[21px]')}>{view.sharedLabel}</p>}
    </div>
  )
}

function ResumeButton({ itemId, returnTo, onResume }: { itemId: string; returnTo: string; onResume?: (itemId: string) => void }) {
  if (onResume) {
    return (
      <Button onClick={() => onResume(itemId)}>
        <Play size={15} className="fill-current" aria-hidden />
        Resume
      </Button>
    )
  }
  return (
    <Link to={`/occurrences/${itemId}?returnTo=${encodeURIComponent(returnTo)}`} className="btn btn--primary btn--md">
      <Play size={15} className="fill-current" aria-hidden />
      Resume
    </Link>
  )
}

/** Join (repeat-safe, reusing the viewer's compatible item) or Open, for the next visible gathering. */
function JoinButton({
  gathering,
  signedIn,
  returnTo,
  onJoin,
}: {
  gathering: Gathering
  signedIn: boolean
  returnTo: string
  onJoin?: (gathering: Gathering) => void
}) {
  const navigate = useNavigate()
  const join = useJoinGathering()
  const [key] = useState(() => crypto.randomUUID())
  const isMember = gathering.viewerIsMember && gathering.viewerCalendarItemId
  const label = isMember ? 'Open' : 'Join'
  const go = async () => {
    if (!signedIn) return navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`)
    if (isMember) return navigate(`/occurrences/${gathering.viewerCalendarItemId}?returnTo=${encodeURIComponent(returnTo)}`)
    if (onJoin) return onJoin(gathering)
    try {
      const result = await join.mutateAsync({ gatheringId: gathering.id, idempotencyKey: key })
      toast.success(joinedMessage(result))
      navigate(`/occurrences/${result.calendarItemId}?returnTo=${encodeURIComponent(returnTo)}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not join')
    }
  }
  return (
    <Button variant="outline" loading={join.isPending} disabled={join.isPending} onClick={() => void go()}>
      <Users size={15} aria-hidden />
      {label}
    </Button>
  )
}
