import { LocationLink } from '@/components/location/LocationLink'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarClock, ExternalLink, Play, Settings2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useJoinGathering, type components } from '@project/sdk'
import { joinedMessage } from '@/lib/gatheringLabels'
import { AddToScheduleButton, ScheduleDialog, type ScheduleTarget } from '@/components/schedule/AddToSchedule'
import { StartActivityButton } from '@/components/schedule/StartActivityButton'
import { LocationButton, type LocationSelection } from '@/components/location/LocationPicker'
import { Button } from '@/components/ui/Button'
import { useParticipationView } from '@/lib/useParticipationView'
import { ParticipationLines } from './ActivityParticipationSummary'
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
  manageHref,
  className,
  contextual = false,
  contextActions,
}: {
  activity: { id: string; title: string; place?: components['schemas']['Place'] | null }
  /** `people`: only who takes part (and shared activity), where status and schedule show elsewhere. */
  variant?: 'full' | 'compact' | 'summary' | 'people'
  returnTo: string
  /** Overrides (Home starts inline); default navigates to the occurrence. */
  onStart?: () => void
  onResume?: (itemId: string) => void
  onJoin?: (gathering: Gathering) => void
  /** Shows the secondary Open Activity Page action. */
  onOpenPage?: () => void
  /** The owner's Manage (the Activity page's editor), from useActivityPreview; omitted for others. */
  manageHref?: string | null
  className?: string
  /** Exact gathering/session is already on the page; do not offer a different occurrence. */
  contextual?: boolean
  contextActions?: ReactNode
}) {
  const [location, setLocation] = useState<LocationSelection>(undefined)
  const effectiveLocation = location === undefined ? activity.place : location
  const { view, signedIn } = useParticipationView(activity.id)
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
          <AddToScheduleButton iconOnly target={{ kind: 'activity', ...activity, place: effectiveLocation, placeId: location === undefined ? undefined : location?.id ?? null }} signedIn={signedIn} returnTo={returnTo} className="h-9 w-9" />
        )}
        {dialog}
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {lines}
      {effectiveLocation && <p className="text-sm"><LocationLink place={effectiveLocation} />{effectiveLocation.locality ? ` · ${effectiveLocation.locality}` : ''}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {contextActions}
        {!contextual && view.actions.includes('resume') && view.inProgressItemId && (
          <ResumeButton itemId={view.inProgressItemId} returnTo={returnTo} onResume={onResume} />
        )}
        {!contextual && view.actions.includes('start') &&
          (onStart ? (
            <Button onClick={onStart}>
              <Play size={15} className="fill-current" aria-hidden />
              Start now
            </Button>
          ) : (
            <StartActivityButton placeId={location === undefined ? undefined : location?.id ?? null} activityId={activity.id} signedIn={signedIn} returnTo={returnTo} />
          ))}
        {!contextual && view.gathering && (view.actions.includes('join') || view.actions.includes('open_gathering')) && (
          <JoinButton gathering={view.gathering} signedIn={signedIn} returnTo={returnTo} onJoin={onJoin} />
        )}
        <AddToScheduleButton target={{ kind: 'activity', ...activity, place: effectiveLocation, placeId: location === undefined ? undefined : location?.id ?? null }} signedIn={signedIn} returnTo={returnTo} />
        {!onStart && <LocationButton value={effectiveLocation} onChange={setLocation} />}
        {!contextual && view.actions.includes('reschedule') && (
          <button
            type="button"
            onClick={() => setRescheduling(true)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-surface-raised px-4 py-2 text-sm font-medium transition hover:bg-surface-muted"
          >
            <CalendarClock size={14} aria-hidden />
            Reschedule
          </button>
        )}
        {manageHref && (
          <Link
            to={manageHref}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold transition hover:bg-surface-muted"
          >
            <Settings2 size={13} aria-hidden />
            Manage
          </Link>
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
      {location !== undefined && <p className="text-xs text-muted">{location ? `${location.name} · ` : 'No location · '}For your next Start or Add to Schedule.</p>}
      {dialog}
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
