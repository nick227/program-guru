import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Calendar,
  ChevronRight,
  Clock,
  Flame,
  MapPin,
  Repeat,
} from 'lucide-react'
import {
  useActivityParticipation,
  type components,
} from '@project/sdk'
import { Avatar } from '@/components/ui/Avatar'
import { EntityHero } from '@/components/shared/EntityHero'
import { dateLabel } from '@/lib/dates'
import { buildProfileUrl } from '@/lib/urls'
import type { Hero } from '@/lib/hero'
import { cn } from '@/lib/utils'

export interface ActivityOfferingCardProps {
  activity: components['schemas']['ActivitySummary']
  hero: Hero
  href?: string
  actions?: ReactNode
  className?: string
}

/**
 * Bold, pronounced Activity Offering Card for the unified profile feed and discovery surfaces.
 * Features a prominent graphical artwork frame, strong typography, location callouts,
 * schedule/occurrence details, and live social participation evidence.
 */
export function ActivityOfferingCard({
  activity,
  hero,
  href,
  actions,
  className,
}: ActivityOfferingCardProps) {
  const participationQuery = useActivityParticipation(activity.id)
  const participation = participationQuery.data

  const nextGathering = participation?.shared?.nextGathering
  const nextDateFormatted = nextGathering?.localDate
    ? dateLabel(nextGathering.localDate)
    : null

  const attendeesCount =
    participation?.shared?.going ||
    (participation?.participants.count != null
      ? participation.participants.count
      : null)

  const activeNow = participation?.shared?.activeNow ?? 0
  const attendeeAvatars = participation?.avatars ?? []

  return (
    <article
      className={cn(
        'group relative w-full overflow-hidden rounded-2xl border border-border/70 bg-surface transition-all duration-200 hover:border-border hover:shadow-xs',
        className,
      )}
    >
      <div className="grid grid-cols-1 md:grid-cols-[18rem_minmax(0,1fr)] lg:grid-cols-[22rem_minmax(0,1fr)]">
        {/* 01 — Bold Graphical Artwork / Media */}
        <div className="relative aspect-[16/10] md:aspect-auto md:h-full w-full overflow-hidden bg-surface-muted">
          {href ? (
            <Link to={href} className="block h-full w-full">
              <EntityHero
                hero={hero}
                size="card"
                interactive={false}
                className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
              />
            </Link>
          ) : (
            <EntityHero
              hero={hero}
              size="card"
              interactive={false}
              className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
            />
          )}

          {/* Badges pinned on media */}
          <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5 z-10 pointer-events-none">
            {activity.frequency && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-surface/90 px-2.5 py-1 text-xs font-semibold text-foreground backdrop-blur-md shadow-xs">
                <Repeat size={11} className="text-accent" aria-hidden />
                <span>Recurring</span>
              </span>
            )}
            {activeNow > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-950/85 px-2.5 py-1 text-xs font-semibold text-emerald-300 backdrop-blur-md shadow-xs">
                <Flame size={12} aria-hidden />
                <span>{activeNow} active now</span>
              </span>
            )}
          </div>
        </div>

        {/* 02 — Confident Content, Schedule & Evidence */}
        <div className="flex flex-col justify-between p-5 sm:p-6 min-w-0 space-y-4">
          <div className="space-y-2.5">
            {/* Location & Duration header line */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium">
              {activity.place && (
                <span className="inline-flex items-center gap-1 text-accent font-semibold">
                  <MapPin size={13} className="shrink-0" aria-hidden />
                  <span>
                    {activity.place.name}
                    {activity.place.locality ? ` · ${activity.place.locality}` : ''}
                  </span>
                </span>
              )}
              {activity.durationMinutes != null && (
                <span className="inline-flex items-center gap-1 text-muted">
                  <Clock size={12} className="shrink-0" aria-hidden />
                  <span>{activity.durationMinutes}m</span>
                </span>
              )}
              {activity.instructionCount > 0 && (
                <span className="text-muted">
                  · {activity.instructionCount} {activity.instructionCount === 1 ? 'step' : 'steps'}
                </span>
              )}
            </div>

            {/* Confident, Pronounced Title */}
            <h3 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-foreground leading-snug">
              {href ? (
                <Link to={href} className="hover:text-accent transition-colors">
                  {activity.title}
                </Link>
              ) : (
                activity.title
              )}
            </h3>

            {/* Summary */}
            {activity.summary && (
              <p className="text-sm leading-relaxed text-muted line-clamp-2 max-w-2xl">
                {activity.summary}
              </p>
            )}
          </div>

          {/* Schedule & Participants section */}
          <div className="pt-3.5 border-t border-border/50 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            {/* Next Scheduled Occurrence */}
            <div className="min-w-0">
              {nextDateFormatted ? (
                <div className="flex items-start gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-surface-muted/60 text-accent">
                    <Calendar size={18} aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">
                      Next: {nextDateFormatted}
                    </p>
                    {nextGathering?.localTime && (
                      <p className="text-[11px] text-muted">
                        at {nextGathering.localTime}
                        {nextGathering?.lookingFor ? ` · ${nextGathering.lookingFor}` : ''}
                      </p>
                    )}
                  </div>
                </div>
              ) : activity.targetTime ? (
                <div className="flex items-center gap-2 text-xs text-muted">
                  <Clock size={14} className="text-muted/80" aria-hidden />
                  <span>Scheduled target: {activity.targetTime}</span>
                </div>
              ) : (
                <p className="text-xs text-muted">Available anytime · Flexible</p>
              )}
            </div>

            {/* Participants & Action Link */}
            <div className="flex items-center justify-between sm:justify-end gap-3 min-w-0">
              {attendeesCount != null && attendeesCount > 0 ? (
                <div className="flex items-center gap-2.5 min-w-0">
                  {attendeeAvatars.length > 0 && (
                    <div className="flex items-center -space-x-1.5 shrink-0" aria-label="Recent attendees">
                      {attendeeAvatars.slice(0, 4).map((user) => (
                        <Link
                          key={user.id}
                          to={buildProfileUrl(user.handle)}
                          aria-label={user.displayName || user.handle}
                          title={user.displayName || user.handle}
                          className="transition-transform hover:scale-110 hover:z-10"
                        >
                          <Avatar
                            src={user.avatarUrl}
                            name={user.displayName || user.handle}
                            size="sm"
                            className="h-7 w-7 ring-2 ring-surface text-xs"
                          />
                        </Link>
                      ))}
                      {attendeeAvatars.length > 4 && (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-muted text-[10px] font-semibold text-muted ring-2 ring-surface">
                          +{attendeeAvatars.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                  <span className="text-xs font-semibold tabular-nums text-foreground truncate">
                    {attendeesCount} {attendeesCount === 1 ? 'participant' : 'participants'}
                  </span>
                </div>
              ) : (
                <span className="text-xs text-muted">Be the first to join</span>
              )}

              {href && (
                <Link
                  to={href}
                  className="hidden sm:inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 text-muted transition-colors hover:border-accent hover:text-accent"
                  aria-label={`Open ${activity.title}`}
                >
                  <ChevronRight size={16} aria-hidden />
                </Link>
              )}
            </div>
          </div>

          {actions && <div className="pt-2">{actions}</div>}
        </div>
      </div>
    </article>
  )
}
