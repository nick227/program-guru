import { Link } from 'react-router-dom'
import { ChevronRight, Users } from 'lucide-react'
import { buildGroupUrl } from '@/lib/urls'
import { cn } from '@/lib/utils'

export interface ProgramParticipationStripProps {
  /** Server-side aggregate, already suppressed below the public sample size (12 §10). */
  participantCount?: number | null
  completionRate?: number | null
  completionMetricLabel?: string
  /** The viewer's own group for this Program, when they have one. */
  groupId?: string | null
  className?: string
}

/** Genuine participation signals only (13 §4): aggregates and the viewer's own group. */
export function ProgramParticipationStrip({
  participantCount,
  completionRate,
  completionMetricLabel = 'completed all scheduled activities',
  groupId,
  className,
}: ProgramParticipationStripProps) {
  const hasParticipants = (participantCount ?? 0) > 0
  const hasCompletion = completionRate != null
  const hasGroup = !!groupId
  if (!hasParticipants && !hasCompletion && !hasGroup) return null

  return (
    <div
      aria-label="Program participation"
      className={cn(
        'flex w-full flex-col items-stretch justify-between gap-4 divide-y divide-border rounded-[var(--radius-panel)] border border-border bg-surface px-5 py-4',
        'md:flex-row md:items-center md:gap-8 md:divide-x md:divide-y-0 sm:px-8 sm:py-5',
        className,
      )}
    >
      {hasParticipants && (
        <div className="shrink-0">
          <div className="font-display text-lg font-bold text-foreground">
            {participantCount!.toLocaleString()}
          </div>
          <div className="text-sm text-muted">participants</div>
        </div>
      )}

      {hasCompletion && (
        <div className="shrink-0 pt-3 md:pl-8 md:pt-0 first:md:pl-0 first:pt-0">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-lg font-bold text-foreground">
              {Math.round(completionRate! * 100)}%
            </span>
            <span className="text-sm text-muted">completion rate</span>
          </div>
          <div className="text-xs text-muted">{completionMetricLabel}</div>
        </div>
      )}

      {hasGroup && (
        <div className="min-w-0 flex-1 pt-3 md:pl-8 md:pt-0 first:md:pl-0 first:pt-0">
          <Link
            to={buildGroupUrl(groupId!)}
            className="group flex items-center justify-between gap-3"
          >
            <GroupLabel title="Open your group" detail="See who is following this Program with you" />
            <ChevronRight size={18} aria-hidden className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      )}
    </div>
  )
}

function GroupLabel({ title, detail }: { title: string; detail: string }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Users size={18} aria-hidden className="shrink-0 text-muted" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-foreground group-hover:text-accent">{title}</span>
        <span className="block truncate text-xs text-muted">{detail}</span>
      </span>
    </span>
  )
}
