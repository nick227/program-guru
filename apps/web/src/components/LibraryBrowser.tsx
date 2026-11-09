import { useEffect, useState } from 'react'
import {
  useLocation,
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom'
import {
  useCategories,
  useDiscoverActivities,
  useDiscoverPrograms,
  useFocuses,
  useProgramTypes,
  useProgramPrefetch,
  type components,
} from '@project/sdk'
import { ChevronLeft, RotateCcw, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { EmptyState, ErrorMessage } from '@/components/ui/Feedback'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Skeleton } from '@/components/ui/Skeleton'
import { DiscoveryCard } from '@/components/SuggestionRail'
import { useCategorySlugOf } from '@/components/EntityHero'
import { activityCard, programCard } from '@/lib/discoveryCards'

type S = components['schemas']
type Sort = S['DiscoverSort']
type Creator = 'ALL' | 'PLATFORM' | 'COMMUNITY'

/**
 * What the page under the browser provides through `<Outlet context>`.
 * The page owns its draft and decides what a pick does; the browser only
 * discovers, selects, and then closes itself.
 */
export type LibraryBrowserContext =
  | {
      kind: 'programs'
      programTypeId?: string
      closeOnPick?: boolean
      actionLabel: string
      onPick: (program: S['ProgramSummary']) => void
    }
  | {
      kind: 'activities'
      categoryId?: string
      actionLabel: string
      exclude?: string[]
      onPick: (activity: S['ActivitySummary']) => void
    }

const BROWSE = '/browse'
/** Browser filters live in the URL beside the page's own parameters. */
const PARAM = { q: 'bq', sort: 'bsort', creator: 'bcreator', facet: 'bfacet', type: 'btype' }

/** Open/close the nested browser route without unmounting the page. */
export function useLibraryBrowser() {
  const navigate = useNavigate()
  const location = useLocation()
  return {
    open: () =>
      navigate(
        { pathname: `${location.pathname.replace(/\/$/, '')}${BROWSE}`, search: location.search },
        { state: { browserFromApp: true } },
      ),
  }
}

function useCloseBrowser() {
  const navigate = useNavigate()
  const location = useLocation()
  return () => {
    if ((location.state as { browserFromApp?: boolean } | null)?.browserFromApp) {
      navigate(-1)
      return
    }
    const search = new URLSearchParams(location.search)
    Object.values(PARAM).forEach((key) => search.delete(key))
    const query = search.toString()
    navigate(
      {
        pathname: location.pathname.slice(0, -BROWSE.length) || '/',
        search: query ? `?${query}` : '',
      },
      { replace: true },
    )
  }
}

export function LibraryBrowserRoute() {
  const context = useOutletContext<LibraryBrowserContext | undefined>()
  const close = useCloseBrowser()
  if (!context) return null
  return <LibraryBrowser context={context} onClose={close} />
}

function LibraryBrowser({
  context,
  onClose,
}: {
  context: LibraryBrowserContext
  onClose: () => void
}) {
  const [params, setParams] = useSearchParams()
  const categorySlugOf = useCategorySlugOf()
  const types = useProgramTypes()
  const categories = useCategories()
  const prefetch = useProgramPrefetch()
  const programTypeId = context.kind === 'programs' ? (context.programTypeId ?? params.get(PARAM.type) ?? '') : ''
  const focuses = useFocuses(programTypeId)
  const typeLabel = types.data?.find((t) => t.id === programTypeId)?.label

  const [query, setQuery] = useState(params.get(PARAM.q) ?? '')
  const search = params.get(PARAM.q) ?? ''
  const sort = (params.get(PARAM.sort) as Sort | null) ?? 'POPULAR'
  const creator = (params.get(PARAM.creator) as Creator | null) ?? 'ALL'
  const facet =
    params.get(PARAM.facet) ??
    (context.kind === 'activities' ? (context.categoryId ?? '') : '')

  const setParam = (key: string, value: string, fallback = '') =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (value === fallback) next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true, state: window.history.state?.usr },
    )

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (query.trim() !== search) setParam(PARAM.q, query.trim())
    }, 250)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  const programs = useDiscoverPrograms({
    q: search,
    programTypeId,
    focusId: facet || undefined,
    sort,
    enabled: context.kind === 'programs',
  })
  const activities = useDiscoverActivities({
    q: search,
    categoryId: facet || undefined,
    sort,
    enabled: context.kind === 'activities',
  })
  const results = context.kind === 'programs' ? programs : activities
  const excluded = new Set(context.kind === 'activities' ? (context.exclude ?? []) : [])
  const keep = (item: { isPlatform: boolean; id: string }) =>
    !excluded.has(item.id) &&
    (creator === 'ALL' || (creator === 'PLATFORM') === item.isPlatform)
  const cards =
    context.kind === 'programs'
      ? (programs.data?.pages ?? [])
          .flatMap((page) => page.data.flatMap((d) => (d.program ? [d.program] : [])))
          .filter(keep)
          .map((program) => ({ card: programCard(program, categorySlugOf), pick: () => { context.onPick(program); if (context.closeOnPick !== false) onClose() } }))
      : (activities.data?.pages ?? [])
          .flatMap((page) => page.data.flatMap((d) => (d.activity ? [d.activity] : [])))
          .filter(keep)
          .map((activity) => ({ card: activityCard(activity, categorySlugOf), pick: () => { context.onPick(activity); onClose() } }))

  const facets =
    context.kind === 'programs'
      ? (focuses.data ?? []).map((f) => ({ id: f.id, label: f.label }))
      : (categories.data ?? []).map((c) => ({ id: c.id, label: c.label }))
  const noun = context.kind === 'programs' ? 'Program' : 'Activity'
  const title =
    context.kind === 'programs'
      ? `${typeLabel ?? 'Program'} Library`
      : 'Activity Library'
  const filtered = !!params.get(PARAM.type) || !!search || !!params.get(PARAM.facet) || sort !== 'POPULAR' || creator !== 'ALL'
  const reset = () => {
    setQuery('')
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        Object.values(PARAM).forEach((key) => next.delete(key))
        return next
      },
      { replace: true, state: window.history.state?.usr },
    )
  }

  // Same single-choice control as the Calendar's Day/Week switch.
  const toggle = <T extends string>(
    label: string,
    options: { value: T; label: string }[],
    value: T,
    onChange: (value: T) => void,
  ) => <SegmentedControl ariaLabel={label} options={options} value={value} onChange={onChange} />

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-x-0 bottom-0 top-16 z-30 flex flex-col overflow-hidden border-t border-border bg-background shadow-2xl"
    >
      <header className="border-b border-border bg-surface px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-content flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" size="sm" onClick={onClose} className="gap-1.5">
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Back
            </Button>
            <h2 className="sheet-title">{title}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="relative min-w-[200px] flex-1 sm:max-w-md">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                autoFocus
                aria-label={`Search ${noun === 'Program' ? 'Programs' : 'Activities'}`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${noun === 'Program' ? (typeLabel ?? 'Program') : 'Activity'} library`}
                className="pl-9 pr-8"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-text"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {toggle<Sort>(
              'Sort by',
              [
                { value: 'POPULAR', label: 'Popular' },
                { value: 'NEW', label: 'Newest' },
                { value: 'RELEVANT', label: 'Featured' },
              ],
              sort,
              (value) => setParam(PARAM.sort, value, 'POPULAR'),
            )}
            {toggle<Creator>(
              'Filter by creator',
              [
                { value: 'ALL', label: 'All creators' },
                { value: 'PLATFORM', label: 'Platform' },
                { value: 'COMMUNITY', label: 'Community' },
              ],
              creator,
              (value) => setParam(PARAM.creator, value, 'ALL'),
            )}
          </div>
          {context.kind === 'programs' && !context.programTypeId && <label className="flex items-center gap-3 text-sm text-muted">Program type<Select aria-label="Program type" value={programTypeId} className="max-w-xs" onChange={event => { setParams(previous => { const next = new URLSearchParams(previous); next.delete(PARAM.facet); if(event.target.value) next.set(PARAM.type, event.target.value); else next.delete(PARAM.type); return next }, { replace: true, state: window.history.state?.usr }) }}><option value="">All Program types</option>{types.data?.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}</Select></label>}
          {facets.length > 0 && (
            <div
              role="group"
              aria-label={context.kind === 'programs' ? 'Filter by focus' : 'Filter by category'}
              className="flex flex-wrap items-center gap-1.5"
            >
              {[{ id: '', label: context.kind === 'programs' ? 'All focuses' : 'All categories' }, ...facets].map((option) => (
                <button
                  key={option.id || 'all'}
                  type="button"
                  aria-pressed={facet === option.id}
                  onClick={() => setParam(PARAM.facet, option.id)}
                  className={`min-h-8 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    facet === option.id
                      ? 'bg-accent text-accent-foreground'
                      : 'border border-border bg-surface text-muted hover:border-accent hover:text-text'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-content">
          <div className="mb-4 flex items-center justify-between gap-2">
            <p role="status" className="text-sm font-medium text-muted">
              {results.isPending
                ? `Loading ${noun === 'Program' ? 'Programs' : 'Activities'}…`
                : `${cards.length} ${cards.length === 1 ? noun : noun === 'Program' ? 'Programs' : 'Activities'}`}
            </p>
            {filtered && (
              <Button variant="ghost" size="sm" onClick={reset} className="h-8 gap-1 text-xs">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Reset filters
              </Button>
            )}
          </div>
          <ErrorMessage error={results.error} retry={() => void results.refetch()} />
          {results.isPending ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label={`Loading ${noun === 'Program' ? 'Programs' : 'Activities'}`}>
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="aspect-hero w-full rounded-[var(--radius-panel)]" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : cards.length ? (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map(({ card, pick }) => (
                <li key={card.id} onPointerEnter={() => { if(context.kind === 'programs' && context.closeOnPick === false) prefetch(card.id) }} onFocus={() => { if(context.kind === 'programs' && context.closeOnPick === false) prefetch(card.id) }}>
                  <DiscoveryCard item={card} actionLabel={context.actionLabel} onPick={pick} />
                </li>
              ))}
            </ul>
          ) : (
            !results.error && (
              <EmptyState
                level={3}
                title={`No ${noun === 'Program' ? 'Programs' : 'Activities'} match these filters`}
                description={filtered ? 'Try another search, sort or creator.' : undefined}
                action={
                  filtered && (
                    <Button variant="outline" size="sm" onClick={reset}>
                      Reset filters
                    </Button>
                  )
                }
              />
            )
          )}
          {results.hasNextPage && (
            <div className="mt-8 flex justify-center pb-4">
              <Button
                variant="outline"
                loading={results.isFetchingNextPage}
                onClick={() => void results.fetchNextPage()}
              >
                Load more
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
