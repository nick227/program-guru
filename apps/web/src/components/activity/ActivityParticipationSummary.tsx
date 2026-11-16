import { CalendarCheck, CalendarPlus, CircleDot, Users } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import { useParticipationView } from '@/lib/useParticipationView'
import type { ParticipationView } from '@/lib/activityParticipation'

/** Read-only participation display for cards, previews and execution surfaces. */
export function ActivityParticipationSummary({ activityId, peopleOnly = false }: { activityId: string; peopleOnly?: boolean }) {
  const { view } = useParticipationView(activityId)
  return <ParticipationLines view={view} compact peopleOnly={peopleOnly} />
}

/** Status, people and shared lines; always shows the people line, including zero. */
export function ParticipationLines({ view, compact, peopleOnly = false }: { view: ParticipationView; compact: boolean; peopleOnly?: boolean }) {
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
              <span key={u.id} title={u.displayName}><Avatar src={u.avatarUrl} name={u.displayName} size="sm" className={cn('ring-2 ring-surface', compact && 'h-5 w-5 text-[9px]')} /></span>
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

