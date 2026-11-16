import { useState, useRef, useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flame,
  Layers,
  Repeat,
  Users,
} from 'lucide-react'
import {
  useProgramPreview,
  useProgramVersion,
  type components,
} from '@project/sdk'
import { Avatar } from '@/components/ui/Avatar'
import { StatusText, type ParticipationStatus } from '@/components/ui/StatusText'
import { EntityHero } from '@/components/shared/EntityHero'
import { formatProgramDuration } from '@/components/program-authoring/programFields'
import { formatProgramLevel } from '@/lib/browse'
import { buildProfileUrl } from '@/lib/urls'
import type { Hero } from '@/lib/hero'
import { cn } from '@/lib/utils'

function libraryStatusTone(
  status?: components['schemas']['PersonalProgram']['status'],
): ParticipationStatus {
  if (status === 'Active') return 'active'
  if (status === 'Paused') return 'paused'
  if (status === 'Completed') return 'completed'
  return 'planned'
}

export interface ProgramCardProps {
  title: string
  hero: Hero
  description?: string | null
  meta?: string | null
  href?: string
  actions?: ReactNode
  programId: string
  program?: components['schemas']['ProgramSummary']
  profileUserId?: string
  creatorHandle?: string | null
  libraryEntry?: {
    status?: components['schemas']['PersonalProgram']['status']
  } | null
  participation?: {
    participantCount?: number | null
    activeMemberCount?: number | null
    friends?: components['schemas']['ProgramParticipation']['friends']
    friendCount?: number
  } | null
  className?: string
  deferLoading?: boolean
}

/**
 * Dedicated, spacious Program Card component for profile and catalog views.
 * Shares the exact same commanding media-led 2-column architecture as ActivityOfferingCard
 * for consistent visual rhythm, clear social evidence, and structured usage specs.
 */
export function ProgramCard(props: ProgramCardProps) {
  const { deferLoading = true } = props
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(!deferLoading)

  useEffect(() => {
    if (!deferLoading || inView) return
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [deferLoading, inView])

  const {
    title,
    hero,
    description,
    meta,
    href,
    actions,
    programId,
    program,
    libraryEntry,
    participation,
    className,
  } = props

  const isLoaded = inView
  const preview = useProgramPreview(isLoaded ? programId : '')
  const p = preview.data

  const versionId = p?.latestVersionId ?? ''
  const version = useProgramVersion(
    versionId,
    Boolean(isLoaded && versionId),
  )

  const outline = p?.safeActivityOutline ?? []
  const activities = version.data?.activities ?? []

  // Structured Use Data
  const durationDays = program?.durationDays ?? p?.durationDays
  const durationFormatted =
    durationDays != null ? formatProgramDuration(durationDays) : null
  const frequencyLabel = program?.frequencyLabel ?? p?.frequencyLabel
  const sessionMinutes = program?.sessionMinutes ?? p?.sessionMinutes
  const level = program?.level ?? p?.level
  const levelLabel = formatProgramLevel(level)
  const totalActivitiesCount =
    outline.length > 0
      ? outline.length
      : (program?.placements ?? activities.length ?? null)

  // Aggregate Social Data
  const participantCount = participation?.participantCount ?? p?.enrollmentCount
  const activeMemberCount = participation?.activeMemberCount
  const completionRate =
    p?.completionRate != null ? Math.round(p.completionRate * 100) : null
  const friends = participation?.friends ?? []

  const cardDescription = p?.description || program?.description || description

  return (
    <article
      ref={ref}
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

          {/* Badges on artwork */}
          <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5 z-10 pointer-events-none">
            {libraryEntry?.status && (
              <StatusText
                status={libraryStatusTone(libraryEntry.status)}
                className="rounded-full bg-surface/90 px-2.5 py-1 text-xs font-semibold backdrop-blur-md shadow-xs"
              >
                {libraryEntry.status}
              </StatusText>
            )}
            {meta && (
              <span className="rounded-full border border-border/40 bg-surface/90 px-2.5 py-1 text-xs font-semibold text-foreground backdrop-blur-md shadow-xs">
                {meta}
              </span>
            )}
          </div>
        </div>

        {/* 02 — Confident Content, Specs & Social Evidence */}
        <div className="flex flex-col justify-between p-5 sm:p-6 min-w-0 space-y-4">
          <div className="space-y-2.5">
            {/* Kicker: Program Category & Level */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-muted">
              <span className="font-semibold text-accent uppercase tracking-wider text-[11px]">
                Program{p?.type?.label ? ` · ${p.type.label}` : ''}
              </span>
              {levelLabel && level !== 'ALL_LEVELS' && (
                <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground/80">
                  {levelLabel}
                </span>
              )}
            </div>

            {/* Confident, Pronounced Title */}
            <h3 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-foreground leading-snug">
              {href ? (
                <Link to={href} className="hover:text-accent transition-colors">
                  {title}
                </Link>
              ) : (
                title
              )}
            </h3>

            {/* Structured specs: duration, cadence, activities count, session minutes */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-foreground/80">
              {durationFormatted && (
                <span className="inline-flex items-center gap-1">
                  <Calendar size={13} className="shrink-0 text-muted" aria-hidden />
                  <span>{durationFormatted}</span>
                </span>
              )}
              {frequencyLabel && (
                <span className="inline-flex items-center gap-1">
                  <Repeat size={13} className="shrink-0 text-muted" aria-hidden />
                  <span>{frequencyLabel}</span>
                </span>
              )}
              {totalActivitiesCount != null && (
                <span className="inline-flex items-center gap-1">
                  <Layers size={13} className="shrink-0 text-muted" aria-hidden />
                  <span>
                    {totalActivitiesCount}{' '}
                    {totalActivitiesCount === 1 ? 'activity' : 'activities'}
                  </span>
                </span>
              )}
              {sessionMinutes != null && (
                <span className="inline-flex items-center gap-1">
                  <Clock size={13} className="shrink-0 text-muted" aria-hidden />
                  <span>{sessionMinutes}m/session</span>
                </span>
              )}
            </div>

            {/* Description */}
            {cardDescription && (
              <p className="text-sm leading-relaxed text-muted line-clamp-2 max-w-2xl">
                {cardDescription}
              </p>
            )}
          </div>

          {/* Social Proof & Evidence Bar */}
          <div className="pt-3.5 border-t border-border/50 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {/* Member stats */}
              {participantCount != null && (
                <div className="flex items-center gap-1.5 text-xs">
                  <Users size={14} className="text-accent shrink-0" aria-hidden />
                  <span className="font-semibold text-foreground tabular-nums">
                    {participantCount.toLocaleString()}
                  </span>
                  <span className="text-muted">Enrolled</span>
                </div>
              )}
              {activeMemberCount != null && (
                <div className="flex items-center gap-1.5 text-xs">
                  <Flame size={14} className="text-amber-500 shrink-0" aria-hidden />
                  <span className="font-semibold text-foreground tabular-nums">
                    {activeMemberCount.toLocaleString()}
                  </span>
                  <span className="text-muted">Active / wk</span>
                </div>
              )}
              {completionRate != null && (
                <div className="flex items-center gap-1.5 text-xs">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" aria-hidden />
                  <span className="font-semibold text-foreground tabular-nums">
                    {completionRate}%
                  </span>
                  <span className="text-muted">Completed</span>
                </div>
              )}

              {/* Connections avatars */}
              {friends.length > 0 && (
                <div className="flex items-center -space-x-1.5 shrink-0" aria-label="Participating friends">
                  {friends.slice(0, 3).map((f) => (
                    <Link
                      key={f.id}
                      to={buildProfileUrl(f.handle)}
                      title={f.displayName || f.handle}
                      className="transition-transform hover:scale-110 hover:z-10"
                    >
                      <Avatar
                        src={f.avatarUrl}
                        name={f.displayName || f.handle}
                        size="sm"
                        className="h-6 w-6 ring-2 ring-surface text-[10px]"
                      />
                    </Link>
                  ))}
                  <span className="pl-2 text-xs text-muted">
                    {friends.map((f) => f.displayName || f.handle).join(', ')} enrolled
                  </span>
                </div>
              )}
            </div>

            {/* Direct Link */}
            {href && (
              <Link
                to={href}
                className="hidden sm:inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 text-muted transition-colors hover:border-accent hover:text-accent"
                aria-label={`Open ${title}`}
              >
                <ChevronRight size={16} aria-hidden />
              </Link>
            )}
          </div>

          {actions && <div className="pt-2">{actions}</div>}
        </div>
      </div>
    </article>
  )
}
