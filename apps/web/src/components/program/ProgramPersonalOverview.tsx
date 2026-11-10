import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { StatusText, libraryStatusTone, type ParticipationStatus } from '@/components/ui/StatusText'
import { ProgramLibraryActions } from '@/components/program/ProgramLibraryActions'
import { dateLabel } from '@/lib/dates'
import { buildGroupUrl, buildOccurrenceUrl } from '@/lib/urls'
import type { PersonalProgram } from '@/lib/programLibrary'

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

  return (
    <section
      aria-label="Your progress and participation"
      className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-sm space-y-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <StatusText status={statusTone}>{statusLabel}</StatusText>
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
          <p className="text-sm text-foreground">
            {entry?.status === 'Paused'
              ? 'Your schedule is paused. Resume to restore future sessions on your Calendar.'
              : entry?.status === 'Completed'
                ? 'You completed this run. Your results are saved in your history.'
                : isEnrolled
                  ? 'Your program is active. Sessions appear on your schedule.'
                  : 'Track your runs and personal schedule for this program.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {entry && entry.runs.length > 1 && (
            <label className="flex items-center gap-2 text-xs text-muted">
              <span>Viewing run</span>
              <Select
                aria-label="Choose Program run"
                value={r?.id ?? ''}
                onChange={(event) => onSelectRunId(event.target.value)}
                className="h-9 text-xs"
              >
                {entry.runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.startDate} ·{' '}
                    {run.id === entry.current?.id ? 'Current run' : 'Previous run'}
                  </option>
                ))}
              </Select>
            </label>
          )}
          {entry?.status === 'Paused' && entry.current?.status === 'PAUSED' && onResume && (
            <Button
              size="sm"
              disabled={!online || resuming}
              loading={resuming}
              onClick={() => void onResume()}
            >
              Resume
            </Button>
          )}
          {entry?.status === 'Active' && entry.current?.upcoming[0] && (
            <Link
              className="btn btn--primary btn--sm"
              to={buildOccurrenceUrl(entry.current.upcoming[0].id, {
                returnTo: currentUrl,
              })}
            >
              Continue
            </Link>
          )}
          {groupId && (
            <Link
              className="btn btn--outline btn--sm"
              to={buildGroupUrl(groupId, { returnTo: currentUrl })}
            >
              Open Group
            </Link>
          )}
          {entry && (
            <ProgramLibraryActions
              entry={entry}
              variant="page"
              onRemoved={onRemoved}
              onDeleted={onDeleted}
            />
          )}
        </div>
      </div>

      {entry && (
        <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 lg:grid-cols-4">
          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-muted">Completion</span>
            {r?.planned ? (
              <div className="library-progress space-y-1">
                <progress
                  aria-label={`${entry.program.title} completed occurrences`}
                  value={r.completed}
                  max={r.planned}
                />
                <span className="text-xs font-semibold tabular-nums text-foreground">
                  {r.completed} / {r.planned} sessions
                </span>
              </div>
            ) : (
              <span className="block text-sm font-medium text-muted">
                {r ? 'No eligible occurrences' : 'Not scheduled'}
              </span>
            )}
          </div>

          <div className="space-y-1">
            <span className="block text-xs font-medium text-muted">Due so far</span>
            <strong className="block text-base font-semibold tabular-nums text-foreground">
              {r?.due ? `${r.dueCompleted} / ${r.due}` : 'Unavailable'}
            </strong>
          </div>

          <div className="space-y-1">
            <span className="block text-xs font-medium text-muted">Active time</span>
            <strong className="block text-base font-semibold tabular-nums text-foreground">
              {r?.activeSeconds != null
                ? `${Math.floor(r.activeSeconds / 60)} min`
                : 'Unavailable'}
            </strong>
          </div>

          <div className="space-y-1">
            <span className="block text-xs font-medium text-muted">
              Last participation
            </span>
            <strong className="block text-base font-semibold text-foreground">
              {r?.lastParticipation
                ? new Date(r.lastParticipation).toLocaleDateString()
                : 'No recorded participation'}
            </strong>
          </div>
        </div>
      )}

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
    </section>
  )
}

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
  const r = selectedRun
  const p = entry.program

  if (!r && entry.runs.length === 0 && !entry.sourceLabel) {
    return null
  }

  return (
    <section
      aria-label="Personal schedule and history"
      className="grid grid-cols-1 gap-6 md:grid-cols-2"
    >
      {/* Upcoming Activity */}
      <div className="rounded-xl border border-border bg-surface p-5 sm:p-6 space-y-4">
        <h3 className="text-base font-semibold text-foreground">Upcoming Activity</h3>
        {r?.upcoming.length && entry.status !== 'Paused' ? (
          <div className="divide-y divide-border/60">
            {r.upcoming.slice(0, 5).map((a) => (
              <Link
                key={a.id}
                to={buildOccurrenceUrl(a.id, { returnTo: currentUrl })}
                className="flex items-center justify-between gap-3 py-3 text-sm transition-colors hover:text-accent"
              >
                <span className="min-w-0">
                  <strong className="block truncate font-medium text-foreground">
                    {a.title}
                  </strong>
                  <small className="block text-xs text-muted">
                    {a.date}
                    {a.time ? ` · ${a.time}` : ''}
                    {a.adjusted ? ' · Rescheduled by you' : ''}
                  </small>
                </span>
                <ArrowUpRight size={16} className="shrink-0 text-muted" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              {entry.status === 'Paused'
                ? 'Your schedule is paused. Resume to restore future Activities.'
                : 'No upcoming Activities.'}
            </p>
            {!r && onSetupSchedule && entry.publicationStatus === 'PUBLISHED' && (
              <Button variant="outline" size="sm" onClick={onSetupSchedule}>
                Set up your schedule
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Activity History */}
      <div className="rounded-xl border border-border bg-surface p-5 sm:p-6 space-y-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground">Activity history</h3>
          <span className="text-xs text-muted">Up to 30 recent</span>
        </div>
        {r?.history.length ? (
          <div className="max-h-72 divide-y divide-border/60 overflow-y-auto pr-1">
            {r.history.map((a) => (
              <Link
                key={a.id}
                to={buildOccurrenceUrl(a.id, { returnTo: currentUrl })}
                className="flex items-center justify-between gap-3 py-3 text-sm transition-colors hover:text-accent"
              >
                <span className="min-w-0">
                  <strong className="block truncate font-medium text-foreground">
                    {a.title}
                  </strong>
                  <small className="block text-xs text-muted">{a.date}</small>
                </span>
                <span className="shrink-0 text-xs capitalize text-muted">
                  {a.status.toLowerCase().replaceAll('_', ' ')}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No Activity history for this run yet.</p>
        )}
      </div>

      {/* Source & Personal Changes */}
      <div className="rounded-xl border border-border bg-surface p-5 sm:p-6 space-y-2">
        <h3 className="text-base font-semibold text-foreground">
          Source & personal changes
        </h3>
        <p className="text-sm font-medium text-foreground">
          {entry.owned
            ? entry.sourceVersionId
              ? 'Your customized copy'
              : 'Created by you'
            : `Created by ${p.creator?.displayName ?? 'Programs'}`}
        </p>
        <p className="text-xs capitalize text-muted">
          {p.visibility.toLowerCase()} · {entry.publicationStatus.toLowerCase()}
        </p>
        {r && (
          <div className="space-y-1 pt-1 text-xs text-muted">
            <p>{r.customizedCount} personally adjusted Calendar placements</p>
            <p>Following version {r.versionNumber}</p>
          </div>
        )}
        {entry.sourceLabel && (
          <p className="pt-1 text-xs text-muted">
            Customized from {entry.sourceLabel}
          </p>
        )}
      </div>

      {/* Runs & Restart History */}
      <div className="rounded-xl border border-border bg-surface p-5 sm:p-6 space-y-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground">
            Runs & restart history
          </h3>
          <span className="text-xs font-medium text-muted">{entry.runs.length}</span>
        </div>
        {entry.runs.length ? (
          <div className="divide-y divide-border/60">
            {entry.runs.map((run) => (
              <div key={run.id} className="py-3 text-sm space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="font-medium text-foreground">
                    Started {run.startDate}
                  </strong>
                  <span className="text-xs capitalize text-muted">
                    {run.status === 'LEFT' ? 'Ended' : run.status.toLowerCase()} ·{' '}
                    {run.completed} completed
                  </span>
                </div>
                <p className="text-xs text-muted">
                  {run.lastParticipation
                    ? `Last participation ${new Date(run.lastParticipation).toLocaleDateString()}`
                    : 'No recorded participation'}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">
            Your first run begins when you add this Program to your Calendar.
          </p>
        )}
      </div>
    </section>
  )
}
