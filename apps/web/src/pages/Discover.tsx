import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  useProgramLibrary,
  useManagePersonalProgram,
  usePersonalEnrollmentAction,
  useCopyProgram,
} from '@project/sdk'
import {
  Search,
  Plus,
  ArrowUpRight,
  MoreHorizontal,
  BookOpen,
  ArrowLeft,
} from 'lucide-react'
import { toast } from 'sonner'
import { Page } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { linkButton } from '@/components/Navigation'
import { EntityHero, useCategorySlugOf } from '@/components/EntityHero'
import { programHero } from '@/lib/hero'
import { useDocumentTitle } from '@/lib/title'
import { buildWorkspaceUrl } from '@/lib/urls'
import {
  selectPrograms,
  statuses,
  type PersonalProgram,
} from '@/lib/programLibrary'
import '@/styles/components/program-library.css'

export function LibraryPage() {
  useDocumentTitle('My Programs')
  const library = useProgramLibrary()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('All')
  const [owned, setOwned] = useState(false)
  const [sort, setSort] = useState('recent')
  const rows = library.data ?? []
  const selected = rows.find((r) => r.program.id === params.get('program'))
  const filtered = selectPrograms(rows, query, status, owned, sort)
  return (
    <Page className="program-library">
      <header className="library-heading">
        <div>
          <p className="library-eyebrow">YOUR PERSONAL LIBRARY</p>
          <h1>
            My Programs
            <span className="library-count">
              {library.data ? rows.length : '—'}
            </span>
          </h1>
          <p className="text-muted">
            Make room for what you want to keep doing.
          </p>
        </div>
        <Link to="/programs/new?returnTo=%2Flibrary" className={linkButton}>
          <Plus size={16} /> Add a Program
        </Link>
      </header>
      <ErrorMessage
        error={library.error}
        retry={() => void library.refetch()}
      />
      {library.isPending ? (
        <Loading />
      ) : library.error ? null : selected ? (
        <ProgramDetails entry={selected} back={() => setParams({})} />
      ) : (
        <>
          <div className="library-toolbar">
            <label className="library-search">
              <Search size={17} />
              <Input
                aria-label="Search Programs"
                placeholder="Search your Programs…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label className="library-owned">
              <input
                type="checkbox"
                checked={owned}
                onChange={(e) => setOwned(e.target.checked)}
              />{' '}
              Created by me
            </label>
            <Select
              aria-label="Sort Programs"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="recent">Recent activity</option>
              <option value="name">Name A–Z</option>
              <option value="progress">Most progress</option>
            </Select>
          </div>
          <div className="library-tabs" aria-label="Filter by status">
            {statuses.map((s) => (
              <button
                key={s}
                aria-pressed={s === status}
                onClick={() => setStatus(s)}
              >
                {s}
                <span>
                  {s === 'All'
                    ? rows.length
                    : rows.filter((r) => r.status === s).length}
                </span>
              </button>
            ))}
          </div>
          {filtered.length ? (
            <div className="library-table-wrap">
              <table className="library-table">
                <thead>
                  <tr>
                    {[
                      'Program',
                      'Status',
                      'Progress',
                      'Next Activity',
                      'Source',
                      'Updates',
                      'Actions',
                    ].map((h) => (
                      <th key={h} scope="col">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry) => (
                    <ProgramRow key={entry.program.id} entry={entry} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="library-empty">
              <BookOpen size={36} strokeWidth={1} />
              <h2>
                {rows.length
                  ? 'No Programs match this view'
                  : 'A little structure. A lot of possibility.'}
              </h2>
              <p className="text-muted">
                {rows.length
                  ? 'Try another status or search, or show all creators.'
                  : 'Build your first Program around something you want to practice.'}
              </p>
              {rows.length ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery('')
                    setStatus('All')
                    setOwned(false)
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Link to="/programs/new" className={linkButton}>
                  Create a Program
                </Link>
              )}
            </div>
          )}
          <p className="library-footnote">
            {filtered.length} {filtered.length === 1 ? 'Program' : 'Programs'} ·
            Progress reflects eligible Calendar occurrences. Ongoing schedules
            grow over time.
          </p>
        </>
      )}
    </Page>
  )
}
function Status({ status }: { status: string }) {
  return (
    <span className="library-status" data-status={status}>
      <i />
      {status}
    </span>
  )
}
function Progress({ entry }: { entry: PersonalProgram }) {
  const r = entry.current
  return r?.planned ? (
    <div className="library-progress">
      <span>
        <strong>{r.completed}</strong> / {r.planned}
        <small> occurrences</small>
      </span>
      <progress
        aria-label={`${entry.program.title} completed occurrences`}
        value={r.completed}
        max={r.planned}
      />
      <small>
        {r.durationDays === null
          ? 'Generated schedule'
          : 'Scheduled occurrences'}
      </small>
    </div>
  ) : (
    <span className="text-muted">
      {r ? 'No eligible occurrences' : 'Not scheduled'}
    </span>
  )
}
function ProgramRow({ entry }: { entry: PersonalProgram }) {
  const category = useCategorySlugOf()
  const p = entry.program
  const r = entry.current
  const next =
    entry.status === 'Active' || entry.status === 'Not Started'
      ? r?.upcoming[0]
      : null
  return (
    <tr>
      <td data-label="Program">
        <Link className="library-identity" to={`?program=${p.id}`}>
          <EntityHero
            hero={programHero(p, category)}
            size="thumb"
            className="library-art !h-16 !w-16"
          />
          <div>
            <strong>{p.title}</strong>
            <span>
              {p.type.label} ·{' '}
              {p.durationDays ? `${p.durationDays} days` : 'Ongoing'}
            </span>
            <small>
              {p.frequencyLabel ?? 'Schedule not set'}
              {r?.status === 'ACTIVE' ? ` · Week ${r.week}` : ''}
            </small>
          </div>
        </Link>
      </td>
      <td data-label="Status">
        <Status status={entry.status} />
      </td>
      <td data-label="Progress">
        <Progress entry={entry} />
      </td>
      <td data-label="Next Activity">
        {next ? (
          <Link to={`/occurrences/${next.id}`} className="library-next">
            <strong>{next.title}</strong>
            <span>
              {next.date}
              {next.time ? ` · ${next.time}` : ''}
            </span>
          </Link>
        ) : (
          <span className="text-muted">
            {entry.status === 'Paused'
              ? 'Schedule paused'
              : 'Nothing scheduled'}
          </span>
        )}
      </td>
      <td data-label="Source">
        <div className="library-source">
          <strong>
            {entry.owned
              ? entry.sourceVersionId
                ? 'Customized by you'
                : 'Created by you'
              : (p.creator?.displayName ?? 'Programs')}
          </strong>
          <span>
            {entry.owned ? p.visibility.toLowerCase() : 'Joined Program'}
          </span>
        </div>
      </td>
      <td data-label="Updates">
        {r?.pendingVersionId ? (
          <Link className="library-update" to={`?program=${p.id}`}>
            Review update
          </Link>
        ) : (
          <span className="text-muted" aria-label="No pending update">
            —
          </span>
        )}
      </td>
      <td data-label="Actions">
        <Actions entry={entry} />
      </td>
    </tr>
  )
}
function Actions({ entry }: { entry: PersonalProgram }) {
  const manage = useManagePersonalProgram()
  const enrollment = usePersonalEnrollmentAction()
  const copy = useCopyProgram()
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState<'RESTART' | 'REMOVE' | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (confirm) dialog.current?.showModal()
  }, [confirm])
  const p = entry.program
  const r = entry.current
  const busy = manage.isPending || enrollment.isPending || copy.isPending
  async function run(
    action: 'ARCHIVE' | 'RESTORE' | 'RESTART' | 'REMOVE' | 'ACTIVE' | 'PAUSED',
  ) {
    try {
      if (['ACTIVE', 'PAUSED', 'REMOVE'].includes(action) && r)
        await enrollment.mutateAsync({
          id: r.id,
          action: action as 'ACTIVE' | 'PAUSED' | 'REMOVE',
        })
      else
        await manage.mutateAsync({
          programId: p.id,
          expectedRunId: r?.id,
          action: action as 'ARCHIVE' | 'RESTORE' | 'RESTART',
        })
      setConfirm(null)
      toast.success(
        action === 'RESTART' ? 'New run started' : 'Program updated',
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update Program')
    }
  }
  return (
    <div className="library-actions">
      {entry.status === 'Archived' ? (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void run('RESTORE')}
        >
          Restore
        </Button>
      ) : entry.status === 'Paused' ? (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void run('ACTIVE')}
        >
          Resume
        </Button>
      ) : (
        <Link
          className="library-open"
          to={
            entry.status === 'Active' && r?.upcoming[0]
              ? `/occurrences/${r.upcoming[0].id}`
              : `?program=${p.id}`
          }
        >
          {entry.status === 'Active' ? 'Continue' : 'Open'}
          <ArrowUpRight size={14} />
        </Link>
      )}
      <details className="library-menu">
        <summary aria-label={`Manage ${p.title}`}>
          <MoreHorizontal size={19} />
        </summary>
        <div>
          <Link to={`?program=${p.id}`}>Details & insights</Link>
          {entry.owned ? (
            <Link to={buildWorkspaceUrl(p.id)}>Edit Program</Link>
          ) : (
            <button
              disabled={busy}
              onClick={() =>
                void copy
                  .mutateAsync(p.id)
                  .then((c) => navigate(buildWorkspaceUrl(c.id)))
                  .catch((e) => toast.error(e.message))
              }
            >
              Customize a copy
            </button>
          )}
          {r?.status === 'ACTIVE' && (
            <button disabled={busy} onClick={() => void run('PAUSED')}>
              Pause schedule
            </button>
          )}
          {r && ['ACTIVE', 'PAUSED'].includes(r.status) && (
            <button disabled={busy} onClick={() => setConfirm('REMOVE')}>
              Remove from Calendar
            </button>
          )}
          {r && entry.publicationStatus === 'PUBLISHED' && (
            <button disabled={busy} onClick={() => setConfirm('RESTART')}>
              Restart as a new run
            </button>
          )}
          <button
            disabled={busy}
            onClick={() =>
              void run(entry.status === 'Archived' ? 'RESTORE' : 'ARCHIVE')
            }
          >
            {entry.status === 'Archived'
              ? 'Restore to library'
              : 'Archive personally'}
          </button>
        </div>
      </details>
      {confirm && (
        <dialog
          ref={dialog}
          onCancel={() => setConfirm(null)}
          className="library-confirm"
          aria-label={
            confirm === 'RESTART' ? 'Restart Program' : 'Remove from Calendar'
          }
        >
          <div>
            <h2>
              {confirm === 'RESTART'
                ? 'Start a fresh run today?'
                : 'Remove future Activities?'}
            </h2>
            <p>
              {confirm === 'RESTART'
                ? 'A new independent run will use the same published version. Personal schedule changes will remain with your earlier run.'
                : 'Future unstarted Activities will leave your Calendar. Your Program stays in your library.'}{' '}
              Completed results and earlier history are preserved.
            </p>
            <Button disabled={busy} onClick={() => void run(confirm)}>
              {confirm === 'RESTART'
                ? 'Start new run'
                : 'Remove future Activities'}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </Button>
          </div>
        </dialog>
      )}
    </div>
  )
}
function ProgramDetails({
  entry,
  back,
}: {
  entry: PersonalProgram
  back: () => void
}) {
  const category = useCategorySlugOf()
  const [runId, setRunId] = useState('')
  const r = entry.runs.find((run) => run.id === runId) ?? entry.current
  const p = entry.program
  return (
    <section className="library-detail">
      <button className="library-back" onClick={back}>
        <ArrowLeft size={16} /> All Programs
      </button>
      <div className="library-detail-heading">
        <EntityHero hero={programHero(p, category)} size="header" />
        <div>
          <p className="library-eyebrow">{p.type.label}</p>
          <h2>{p.title}</h2>
          <Status status={entry.status} />
        </div>
        <Actions entry={entry} />
      </div>
      {entry.runs.length > 1 && (
        <label className="library-run-selector">
          <span>Viewing run</span>
          <Select
            aria-label="Choose Program run"
            value={r?.id ?? ''}
            onChange={(event) => setRunId(event.target.value)}
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
      <div className="library-metrics">
        <div>
          <span>Completion</span>
          <Progress entry={{ ...entry, current: r }} />
        </div>
        <div>
          <span>Consistency through yesterday</span>
          <strong>
            {r?.due ? `${r.dueCompleted} / ${r.due}` : 'Unavailable'}
          </strong>
          <small>
            {r?.due
              ? 'Due occurrences completed'
              : 'No eligible past occurrences'}
          </small>
        </div>
        <div>
          <span>Recorded activity time</span>
          <strong>
            {r?.activeSeconds != null
              ? `${Math.floor(r.activeSeconds / 60)} min`
              : 'Unavailable'}
          </strong>
          <small>Recorded timer time; excludes manual completions</small>
        </div>
        <div>
          <span>Last participation</span>
          <strong>
            {r?.lastParticipation
              ? new Date(r.lastParticipation).toLocaleDateString()
              : 'No recorded participation'}
          </strong>
        </div>
      </div>
      <div className="library-detail-grid">
        <section>
          <h3>Upcoming Activities</h3>
          {r?.upcoming.length &&
          entry.status !== 'Paused' &&
          entry.status !== 'Archived' ? (
            r.upcoming.map((a) => (
              <Link
                className="library-activity"
                key={a.id}
                to={`/occurrences/${a.id}`}
              >
                <span>
                  <strong>{a.title}</strong>
                  <small>
                    {a.date}
                    {a.time ? ` · ${a.time}` : ''}
                    {a.adjusted ? ' · Rescheduled by you' : ''}
                  </small>
                </span>
                <ArrowUpRight size={16} />
              </Link>
            ))
          ) : (
            <p className="text-muted">
              {entry.status === 'Paused' || entry.status === 'Archived'
                ? 'Your schedule is paused. Resume to restore future Activities.'
                : 'No upcoming Activities.'}
            </p>
          )}
          {!r && (
            <Link
              className={linkButton}
              to={
                entry.owned
                  ? `${buildWorkspaceUrl(p.id)}?step=publish`
                  : `/programs/${p.id}`
              }
            >
              Set up your schedule
            </Link>
          )}
        </section>
        <section>
          <h3>Source & personal changes</h3>
          <p>
            {entry.owned
              ? entry.sourceVersionId
                ? 'Your customized copy'
                : 'Created by you'
              : `Created by ${p.creator?.displayName ?? 'Programs'}`}
          </p>
          <p className="text-muted">
            {p.visibility.toLowerCase()} ·{' '}
            {entry.publicationStatus.toLowerCase()}
          </p>
          {r && (
            <>
              <p className="text-muted">
                {r.customizedCount} personally adjusted Calendar placements
              </p>
              <p className="text-muted">Following version {r.versionNumber}</p>
            </>
          )}
          {entry.sourceLabel && (
            <p className="text-muted">Customized from {entry.sourceLabel}</p>
          )}
          {r?.pendingVersionId && (
            <div className="library-update-note">
              <strong>A creator update is available</strong>
              <p>
                Your current run remains on its pinned version. Review the
                Program before choosing an update.
              </p>
              <Link to={`/programs/${p.id}`} className="library-open">
                Review Program <ArrowUpRight size={14} />
              </Link>
            </div>
          )}
        </section>
        <section>
          <h3>Activity history</h3>
          {r?.history.length ? (
            r.history.map((a) => (
              <Link
                className="library-activity"
                key={a.id}
                to={`/occurrences/${a.id}`}
              >
                <span>
                  <strong>{a.title}</strong>
                  <small>{a.date}</small>
                </span>
                <span>{a.status.toLowerCase().replaceAll('_', ' ')}</span>
              </Link>
            ))
          ) : (
            <p className="text-muted">No Activity history for this run yet.</p>
          )}
          <small className="text-muted">Up to 30 recent occurrences.</small>
        </section>
        <section>
          <h3>
            Runs & restart history{' '}
            <span className="text-muted">{entry.runs.length}</span>
          </h3>
          {entry.runs.length ? (
            entry.runs.map((run) => (
              <div className="library-run" key={run.id}>
                <div>
                  <strong>Started {run.startDate}</strong>
                  <span>
                    {run.status === 'LEFT' ? 'Ended' : run.status.toLowerCase()}{' '}
                    · {run.completed} completed occurrences
                  </span>
                </div>
                <small>
                  {run.lastParticipation
                    ? `Last participation ${new Date(run.lastParticipation).toLocaleDateString()}`
                    : 'No recorded participation'}
                </small>
              </div>
            ))
          ) : (
            <p className="text-muted">
              Your first run begins when you add this Program to your Calendar.
            </p>
          )}
        </section>
      </div>
    </section>
  )
}
