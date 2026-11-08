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
  type components,
} from '@project/sdk'
import { ChevronLeft, RotateCcw, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ErrorMessage } from '@/components/ui/Feedback'
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
      programTypeId: string
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
const PARAM = { q: 'bq', sort: 'bsort', creator: 'bcreator', facet: 'bfacet' }

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
  const programTypeId = context.kind === 'programs' ? context.programTypeId : ''
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
    enabled: context.kind === 'programs' && !!programTypeId,
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
          .map((program) => ({ card: programCard(program, categorySlugOf), pick: () => { context.onPick(program); onClose() } }))
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
  const filtered = !!search || !!params.get(PARAM.facet) || sort !== 'POPULAR' || creator !== 'ALL'
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

  const toggle = (
    label: string,
    options: { value: string; label: string }[],
    value: string,
    onChange: (value: string) => void,
  ) => (
    <div
      role="group"
      aria-label={label}
      className="flex items-center gap-1 rounded-lg border border-border bg-surface-muted/40 p-1"
    >
      {options.map((option) => (
        <Button
          key={option.value}
          size="sm"
          variant={value === option.value ? 'default' : 'ghost'}
          aria-pressed={value === option.value}
          className="h-8 px-2.5 text-xs font-medium"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  )

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-x-0 bottom-0 top-16 z-30 flex flex-col overflow-hidden border-t border-border bg-background shadow-2xl"
    >
      <header className="border-b border-border bg-surface px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" size="sm" onClick={onClose} className="gap-1.5">
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Back
            </Button>
            <h2 className="text-lg font-semibold">{title}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="relative min-w-[200px] flex-1 sm:max-w-md">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
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
            {toggle(
              'Sort by',
              [
                { value: 'POPULAR', label: 'Popular' },
                { value: 'NEW', label: 'Newest' },
                { value: 'RELEVANT', label: 'Featured' },
              ],
              sort,
              (value) => setParam(PARAM.sort, value, 'POPULAR'),
            )}
            {toggle(
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
        <div className="mx-auto w-full max-w-7xl">
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="aspect-[4/3] w-full rounded-lg" />
              ))}
            </div>
          ) : cards.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {cards.map(({ card, pick }) => (
                <li key={card.id}>
                  <DiscoveryCard item={card} actionLabel={context.actionLabel} onPick={pick} />
                </li>
              ))}
            </ul>
          ) : (
            !results.error && (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-10 text-center">
                <p className="font-semibold">No {noun === 'Program' ? 'Programs' : 'Activities'} match these filters</p>
                {filtered && (
                  <Button variant="outline" size="sm" onClick={reset}>
                    Reset filters
                  </Button>
                )}
              </div>
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
