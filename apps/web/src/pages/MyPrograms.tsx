import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useProgramLibrary, useProgramPrefetch } from '@project/sdk'
import { BookOpen, Search, X } from 'lucide-react'
import { ProgramLibraryActions as Actions } from '@/components/program/ProgramLibraryActions'
import { Page } from '@/components/ui/Layout'
import { StatusText, libraryStatusTone } from '@/components/ui/StatusText'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { EmptyState, ErrorMessage, Loading } from '@/components/ui/Feedback'
import { EntityHero, useCategorySlugOf } from '@/components/shared/EntityHero'
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
    <Page className="page--content">
      <h1 className="library-title">My Programs</h1>
      <ErrorMessage
        error={library.error}
        retry={() => void library.refetch()}
      />
      {library.isPending ? (
        <Loading />
      ) : !library.data ? null : (
        <>
          {rows.length > 0 && (
            <>
              <div className="library-toolbar">
                <div className="library-search">
                  <Search size={17} aria-hidden />
                  <Input
                    aria-label="Search Programs"
                    placeholder="Search your Programs…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <button
                      type="button"
                      className="library-search-clear"
                      aria-label="Clear search"
                      onClick={() => setQuery('')}
                    >
                      <X size={15} aria-hidden />
                    </button>
                  )}
                </div>
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
              <div
                className="filter-tabs library-tabs"
                role="group"
                aria-label="Filter by status"
              >
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
            </>
          )}
          {filtered.length ? (
            <div className="library-table-wrap">
              <table className="library-table">
                <thead>
                  <tr>
                    <th scope="col" data-label="Program">
                      Program
                    </th>
                    <th scope="col" data-label="Status">
                      Status
                    </th>
                    <th scope="col" data-label="Progress">
                      Progress
                    </th>
                    <th scope="col" data-label="Actions">
                      <span className="sr-only">Actions</span>
                    </th>
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
                  <Button onClick={() => navigate('/browse')}>Community</Button>
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
      <span className="library-progress__count">
        {r.completed}/{r.planned}
      </span>
    </div>
  ) : (
    <span className="text-muted">—</span>
  )
}

function ProgramRow({ entry }: { entry: PersonalProgram }) {
  const category = useCategorySlugOf()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const prefetch = useProgramPrefetch()
  const p = entry.program
  const r = entry.current
  const detailUrl = libraryProgramUrl(p.id, params.toString())

  return (
    <tr
      onClick={(event) => {
        if (
          (event.target as HTMLElement).closest(
            'a, button, details, summary, dialog',
          )
        ) {
          return
        }
        navigate(detailUrl)
      }}
    >
      <td data-label="Program">
        <Link
          className="library-identity"
          to={detailUrl}
          onPointerEnter={() => prefetch(p.id)}
          onFocus={() => prefetch(p.id)}
        >
          <EntityHero
            hero={programHero(p, category)}
            size="thumb"
            interactive={false}
            showVideoBadge={false}
            className="library-art"
          />
          <div className="library-identity__text">
            <strong className="library-name">
              <span className="library-name__text">{p.title}</span>
              {r?.pendingVersionId && (
                <span
                  className="library-update-dot"
                  role="img"
                  aria-label="Update available"
                  title="Update available"
                />
              )}
            </strong>
            <span className="library-mobile-meta">
              <Status status={entry.status} />
              {r?.planned ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="tabular-nums">
                    {r.completed}/{r.planned}
                  </span>
                </>
              ) : null}
            </span>
          </div>
        </Link>
      </td>
      <td data-label="Status">
        <Status status={entry.status} />
      </td>
      <td data-label="Progress">
        <Progress entry={entry} />
      </td>
      <td data-label="Actions">
        <Actions entry={entry} />
      </td>
    </tr>
  )
}
