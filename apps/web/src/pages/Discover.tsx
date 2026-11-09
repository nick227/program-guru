import { useState } from 'react'
import { Link, Outlet, useNavigate, useSearchParams } from 'react-router-dom'
import { useProgramLibrary } from '@project/sdk'
import { Search, Plus, ArrowUpRight, BookOpen, ArrowLeft } from 'lucide-react'
import { ProgramPeople } from '@/components/ProgramPeople'
import { ProgramLibraryActions as Actions } from '@/components/ProgramLibraryActions'
import { Page } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { linkButton } from '@/components/Navigation'
import { EntityHero, useCategorySlugOf } from '@/components/EntityHero'
import { programHero } from '@/lib/hero'
import { useDocumentTitle } from '@/lib/title'
import {
  useLibraryBrowser,
  type LibraryBrowserContext,
} from '@/components/LibraryBrowser'
import { libraryProgramUrl } from '@/lib/programNavigation'
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
  const browser = useLibraryBrowser()
  const navigate = useNavigate()
  const query = params.get('q') ?? ''
  const status = params.get('status') ?? 'All'
  const owned = params.get('mine') === '1'
  const sort = params.get('sort') ?? 'recent'
  const filter = (key: string, value: string, fallback = '') =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (value === fallback) next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true },
    )
  const setQuery = (value: string) => filter('q', value)
  const setStatus = (value: string) => filter('status', value, 'All')
  const setOwned = (value: boolean) => filter('mine', value ? '1' : '')
  const setSort = (value: string) => filter('sort', value, 'recent')
  const browserContext: LibraryBrowserContext = {
    kind: 'programs',
    actionLabel: 'View Program',
    closeOnPick: false,
    onPick: (program) =>
      navigate(
        `/programs/${program.id}?returnTo=${encodeURIComponent(`/library/browse?${params}`)}`,
      ),
  }

  const rows = library.data ?? []
  const archivedCount = rows.filter((r) => r.status === 'Archived').length
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
        <div className="library-heading-actions">
          <Button onClick={browser.open}>
            <Search size={16} /> Browse Programs
          </Button>
          <Link
            to={`/programs/new?returnTo=${encodeURIComponent(`/library?${params}`)}`}
            className="library-open"
          >
            <Plus size={16} /> Create a Program
          </Link>
        </div>
      </header>
      <ErrorMessage
        error={library.error}
        retry={() => void library.refetch()}
      />
      {library.isPending ? (
        <Loading />
      ) : !library.data ? null : selected ? (
        <ProgramDetails
          key={selected.program.id}
          entry={selected}
          back={() =>
            setParams((previous) => {
              const next = new URLSearchParams(previous)
              next.delete('program')
              return next
            })
          }
        />
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
                    ? rows.length - archivedCount
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
                      'People',
                      'Next Activity',
                      'Source',
                      'Actions',
                    ].map((h) => (
                      <th key={h} scope="col" data-label={h}>
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
                    setParams({})
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button onClick={browser.open}>Browse Programs</Button>
              )}
            </div>
          )}
          {archivedCount > 0 && (
            <button
              className="library-archive-link"
              onClick={() =>
                setStatus(status === 'Archived' ? 'All' : 'Archived')
              }
            >
              {status === 'Archived'
                ? 'Back to current Programs'
                : `Archived Programs (${archivedCount})`}
            </button>
          )}
          <p className="library-footnote">
            {filtered.length} {filtered.length === 1 ? 'Program' : 'Programs'} ·
            Progress reflects eligible Calendar occurrences. Ongoing schedules
            grow over time.
          </p>
        </>
      )}
      <Outlet context={browserContext} />
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
  const [params] = useSearchParams()
  const p = entry.program
  const r = entry.current
  const next =
    entry.status === 'Active' || entry.status === 'Not Started'
      ? r?.upcoming[0]
      : null
  return (
    <tr>
      <td data-label="Program">
        <Link
          className="library-identity"
          to={libraryProgramUrl(p.id, params.toString())}
        >
          <EntityHero
            hero={programHero(p, category)}
            size="row"
            className="library-art"
          />
          <div>
            <strong>
              {p.title}
              {r?.pendingVersionId && (
                <span
                  className="library-update-dot"
                  role="img"
                  aria-label="Update available"
                  title="Update available"
                />
              )}
            </strong>
            <span>{p.type.label} · {p.durationDays ? `${p.durationDays} days` : 'Ongoing'}</span>
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
      <td data-label="People">
        <ProgramPeople participation={entry.participation} />
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
            {entry.status === 'Paused' || entry.status === 'Archived'
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
      <td data-label="Actions">
        <Actions entry={entry} />
      </td>
    </tr>
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
      {entry.status === 'Archived' && (
        <p className="library-lifecycle-note" role="status">
          This Program is archived. Restore it from the management menu to
          return it to your library.
          {entry.current?.status === 'PAUSED'
            ? ' Its schedule will stay paused until you choose Resume.'
            : ''}
        </p>
      )}
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
