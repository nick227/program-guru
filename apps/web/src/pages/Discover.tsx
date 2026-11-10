import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useProgramLibrary } from '@project/sdk'
import { Search, Plus, BookOpen, Calendar } from 'lucide-react'
import { ProgramLibraryActions as Actions } from '@/components/ProgramLibraryActions'
import { ProgramPeople } from '@/components/ProgramPeople'
import { Page } from '@/components/ui/Layout'
import { StatusText, libraryStatusTone } from '@/components/ui/StatusText'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { EmptyState, ErrorMessage, Loading } from '@/components/ui/Feedback'
import { EntityHero, useCategorySlugOf } from '@/components/EntityHero'
import { programHero } from '@/lib/hero'
import { useDocumentTitle } from '@/lib/title'
import { libraryProgramUrl } from '@/lib/programNavigation'
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
  const navigate = useNavigate()
  const selectedId = params.get('program')
  if (selectedId) {
    return <Navigate to={libraryProgramUrl(selectedId, params.toString())} replace />
  }

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

  // Personal archiving is omitted for now: archived entries (also what
  // "Remove from Programs" produces) simply don't appear in the library.
  const rows = (library.data ?? []).filter((r) => r.status !== 'Archived')
  const filtered = selectPrograms(rows, query, status, owned, sort)
  return (
    <Page className="page--wide">
      <header className="sub-header">
        <div className="sub-header__title">
          <h1 className="sub-header__heading">My Programs</h1>
        </div>
        <div className="sub-header__actions">
          <Link to="/" className="sub-header__btn">
            <Calendar size={16} aria-hidden />
            <span>Calendar</span>
          </Link>
          <Link to="/browse" className="sub-header__btn">
            <Search size={16} aria-hidden />
            <span>Browse Programs</span>
          </Link>
          <Link
            to={`/programs/new?returnTo=${encodeURIComponent(`/library?${params}`)}`}
            className="sub-header__btn sub-header__btn--primary min-w-[180px]"
          >
            <Plus size={16} aria-hidden />
            <span>Add Program</span>
          </Link>
        </div>
      </header>
      <ErrorMessage
        error={library.error}
        retry={() => void library.refetch()}
      />
      {library.isPending ? (
        <Loading />
      ) : !library.data ? null : (
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
          <div className="filter-tabs library-tabs" role="group" aria-label="Filter by status">
            {statuses.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={s === status}
                onClick={() => setStatus(s)}
              >
                {s}
                <span className="filter-tabs__count">
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
                      'Type',
                      'Status',
                      'Progress',
                      'People',
                      'Next Activity',
                      'Source',
                      'Privacy',
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
            <EmptyState
              icon={<BookOpen size={32} strokeWidth={1.5} />}
              title={
                rows.length
                  ? 'No Programs match this view'
                  : 'A little structure. A lot of possibility.'
              }
              description={
                rows.length
                  ? 'Try another status or search, or show all creators.'
                  : 'Build your first Program around something you want to practice.'
              }
              action={
                rows.length ? (
                  <Button variant="outline" onClick={() => setParams({})}>
                    Clear filters
                  </Button>
                ) : (
                  <Button onClick={() => navigate('/browse')}>Browse Programs</Button>
                )
              }
            />
          )}
        </>
      )}
    </Page>
  )
}
function Status({ status }: { status: string }) {
  return <StatusText status={libraryStatusTone(status)}>{status}</StatusText>
}
function Progress({ entry }: { entry: PersonalProgram }) {
  const r = entry.current
  return r?.planned ? (
    <div className="library-progress">
      <progress
        aria-label={`${entry.program.title} completed occurrences`}
        value={r.completed}
        max={r.planned}
      />
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
            size="card"
            className="library-art aspect-preview w-20 rounded-[var(--radius-media)]"
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
          </div>
        </Link>
      </td>
      <td data-label="Type">
        <span className="library-type">{p.type.label}</span>
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
        </div>
      </td>
      <td data-label="Privacy">
        <div className="library-privacy">
          <span>
            {entry.owned ? p.visibility.toLowerCase() : 'community'}
          </span>
        </div>
      </td>
      <td data-label="Actions">
        <Actions entry={entry} />
      </td>
    </tr>
  )
}
