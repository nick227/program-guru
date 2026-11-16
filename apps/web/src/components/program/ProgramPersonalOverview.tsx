import { Link } from 'react-router-dom'
import { ArrowUpRight, Calendar, CheckCircle2, Clock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { StatusText, libraryStatusTone, type ParticipationStatus } from '@/components/ui/StatusText'
import { dateLabel } from '@/lib/dates'
import { buildOccurrenceUrl } from '@/lib/urls'
import type { PersonalProgram } from '@/lib/programLibrary'
import { runProgress } from '@/lib/useEnrollmentProgress'

type Run = PersonalProgram['runs'][number]

export function ProgramPersonalOverview({
  entry,
  selectedRun,
  onSelectRunId,
  isEnrolled,
  enrolledStatus,
  participationStartDate,
  groupId,
  pendingUpdate,
  canAcceptUpdate,
  online,
  acceptingUpdate,
  dismissingUpdate,
  onAcceptUpdate,
  onDismissUpdate,
  onResume,
  resuming = false,
  currentUrl,
  onRemoved,
  onDeleted,
}: {
  entry: PersonalProgram | null
  selectedRun: Run | null
  onSelectRunId: (id: string) => void
  isEnrolled: boolean
  enrolledStatus: { status: ParticipationStatus; label: string }
  participationStartDate?: string | null
  groupId?: string | null
  pendingUpdate: boolean
  canAcceptUpdate: boolean
  online: boolean
  acceptingUpdate: boolean
  dismissingUpdate: boolean
  onAcceptUpdate: () => Promise<void>
  onDismissUpdate: () => Promise<void>
  onResume?: () => Promise<void>
  resuming?: boolean
  currentUrl: string
  onRemoved: () => void
  onDeleted: () => void
}) {
  if (!entry && !isEnrolled) return null

  const r = selectedRun
  const statusTone = entry ? libraryStatusTone(entry.status) : enrolledStatus.status
  const statusLabel = entry ? entry.status : enrolledStatus.label
  const completionPercent = runProgress(r)?.percent ?? 0

  const nextUpcoming = r?.upcoming?.[0]

  return (
    <section aria-label="Your progress and participation" className="space-y-4">
      {/* Title outside the container */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl sm:text-2xl font-bold font-display tracking-tight text-foreground">
            Overview
          </h2>
          <StatusText status={statusTone}>{statusLabel}</StatusText>
        </div>
        {r ? (
          <span className="text-xs text-muted">
            Started {dateLabel(r.startDate)} · Week {r.week}
          </span>
        ) : participationStartDate ? (
          <span className="text-xs text-muted">
            Joined {dateLabel(participationStartDate)}
          </span>
        ) : null}
      </div>

      {/* Surface container */}
      <div className="rounded-2xl border border-border/70 bg-surface p-5 sm:p-6 space-y-6">
        {/* 01 — Visual Progress Bar */}
        {r?.planned ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-foreground">
                <strong className="tabular-nums font-bold">{r.completed}</strong> of{' '}
                <strong className="tabular-nums font-bold">{r.planned}</strong> sessions completed
              </span>
              <span className="font-bold tabular-nums text-foreground">
                {completionPercent}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full bg-accent transition-all duration-300 rounded-full"
                style={{ width: `${completionPercent}%` }}
              />
            </div>
          </div>
        ) : null}

        {/* 02 — Organized, Clean Metrics Row (No "Unavailable" labels) */}
        {entry && (
          <div className="grid grid-cols-2 gap-4 border-t border-border/50 pt-4 sm:grid-cols-3">
            <div className="space-y-0.5">
              <span className="text-xs text-muted">This Week</span>
              <p className="text-base font-semibold tabular-nums text-foreground">
                {r?.due
                  ? `${r.dueCompleted} of ${r.due} completed`
                  : 'On track'}
              </p>
            </div>

            <div className="space-y-0.5">
              <span className="text-xs text-muted">Last Active</span>
              <p className="text-base font-semibold text-foreground">
                {r?.lastParticipation
                  ? dateLabel(r.lastParticipation)
                  : 'None recorded yet'}
              </p>
            </div>

            {r?.activeSeconds != null && r.activeSeconds > 0 ? (
              <div className="space-y-0.5">
                <span className="text-xs text-muted">Total Active Time</span>
                <p className="text-base font-semibold tabular-nums text-foreground">
                  {Math.floor(r.activeSeconds / 60)} min
                </p>
              </div>
            ) : (
              <div className="space-y-0.5">
                <span className="text-xs text-muted">Current Pace</span>
                <p className="text-base font-semibold text-foreground">
                  Week {r?.week ?? 1}
                </p>
              </div>
            )}
          </div>
        )}

        {/* 03 — Seamless Up Next Focus Card */}
        {nextUpcoming && entry?.status !== 'Paused' && (
          <div className="border-t border-border/50 pt-4 space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              Up Next
            </span>
            <Link
              to={buildOccurrenceUrl(nextUpcoming.id, { returnTo: currentUrl })}
              className="group flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-surface-muted/30 p-3.5 transition-colors hover:border-accent hover:bg-surface-muted/60"
            >
              <div className="min-w-0">
                <p className="font-semibold text-foreground group-hover:text-accent transition-colors truncate">
                  {nextUpcoming.title}
                </p>
                <p className="text-xs text-muted mt-0.5">
                  {dateLabel(nextUpcoming.date)}
                  {nextUpcoming.time ? ` at ${nextUpcoming.time}` : ''}
                  {nextUpcoming.adjusted ? ' · Rescheduled by you' : ''}
                </p>
              </div>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface border border-border/60 text-muted transition-colors group-hover:border-accent group-hover:text-accent">
                <ArrowUpRight size={16} />
              </div>
            </Link>
          </div>
        )}

        {/* 04 — Creator Update Notice */}
        {pendingUpdate && (
          <div className="space-y-2 rounded-xl border border-accent/30 bg-accent/5 p-4">
            <h3 className="text-sm font-semibold text-foreground">
              A creator update is available
            </h3>
            <p className="text-xs text-muted">
              Your current run remains on its pinned version. Accept to adopt the new
              version while preserving your past logs.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                size="sm"
                disabled={!online || !canAcceptUpdate}
                loading={acceptingUpdate}
                onClick={() => void onAcceptUpdate()}
              >
                Accept update
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!online || !canAcceptUpdate}
                loading={dismissingUpdate}
                onClick={() => void onDismissUpdate()}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * Kept for backwards compatibility; now integrated cleanly into ProgramPersonalOverview.
 */
export function ProgramPersonalDetailsGrid({
  entry,
  selectedRun,
  currentUrl,
  onSetupSchedule,
}: {
  entry: PersonalProgram
  selectedRun: Run | null
  currentUrl: string
  onSetupSchedule?: () => void
}) {
  return null
}
