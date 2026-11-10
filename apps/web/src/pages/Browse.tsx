import { useEffect, useState } from 'react'
import {
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import {
  useCategories,
  useDiscoverActivities,
  useDiscoverPrograms,
  useFocuses,
  useProgramPrefetch,
  useProgramTypes,
  useProgramWorkspace,
  type components,
} from '@project/sdk'
import { RotateCcw, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Page } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { EmptyState, ErrorMessage } from '@/components/ui/Feedback'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Skeleton } from '@/components/ui/Skeleton'
import { DiscoveryCard } from '@/components/shared/SuggestionRail'
import { SubHeader } from '@/components/shared/SubHeader'
import { useCategorySlugOf } from '@/components/shared/EntityHero'
import { activityCard, programCard } from '@/lib/discoveryCards'
import { safeReturn } from '@/lib/dates'
import {
  BROWSE_PARAM,
  buildBrowseUrl,
  resolveBrowseFilters,
  type BrowseCreator,
  type BrowseKind,
} from '@/lib/browse'
import { useDocumentTitle } from '@/lib/title'
import { useAddExistingActivity } from '@/components/program-authoring/useAddExistingActivity'
import type { Workspace } from '@/components/program-authoring/types'

type S = components['schemas']
type Sort = S['DiscoverSort']

interface BrowserMode {
  kind: BrowseKind
  isPicker?: boolean
  actionLabel: string
  lockedProgramTypeId?: string
  exclude?: string[]
  returnTo?: string
  prefetchOnHover?: boolean
  onPickProgram?: (program: S['ProgramSummary']) => void
  onPickActivity?: (activity: S['ActivitySummary']) => void
}

/** Dedicated `/browse` page supporting standalone discovery and picker flows. */
export function LibraryBrowserPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const currentUrl = `${location.pathname}${location.search}`

  const programId = params.get('programId') ?? ''
  const rawReturnTo = params.get('returnTo')
  const returnTo = rawReturnTo ? safeReturn(rawReturnTo) : undefined

  if (programId) {
    return (
      <WorkspaceLibraryBrowser
        programId={programId}
        returnTo={safeReturn(
          rawReturnTo,
          `/programs/${programId}/workspace?step=activities`,
        )}
      />
    )
  }

  const pick = params.get('pick')
  const kind: BrowseKind =
    params.get('kind') === 'activities' || pick === 'activity'
      ? 'activities'
      : 'programs'

  if (pick === 'program' && returnTo) {
    return (
      <LibraryBrowser
        mode={{
          kind: 'programs',
          isPicker: true,
          lockedProgramTypeId: params.get('type') || undefined,
          actionLabel: 'Use as starting point',
          returnTo,
          onPickProgram: (program) =>
            navigate(returnTo, {
              state: { fromBrowse: true, pickedProgram: program },
            }),
        }}
      />
    )
  }

  if (pick === 'activity' && returnTo) {
    return (
      <LibraryBrowser
        mode={{
          kind: 'activities',
          isPicker: true,
          actionLabel: 'Use as starting point',
          returnTo,
          onPickActivity: (activity) =>
            navigate(returnTo, {
              state: { fromBrowse: true, pickedActivity: activity },
            }),
        }}
      />
    )
  }

  return (
    <LibraryBrowser
      mode={{
        kind,
        isPicker: false,
        actionLabel: kind === 'programs' ? 'View Program' : 'View Activity',
        prefetchOnHover: kind === 'programs',
        returnTo,
        onPickProgram: (program) =>
          navigate(
            `/programs/${program.id}?returnTo=${encodeURIComponent(currentUrl)}`,
          ),
        onPickActivity: (activity) =>
          navigate(
            `/activities/${activity.id}?returnTo=${encodeURIComponent(currentUrl)}`,
          ),
      }}
    />
  )
}

function WorkspaceLibraryBrowser({
  programId,
  returnTo,
}: {
  programId: string
  returnTo: string
}) {
  const workspace = useProgramWorkspace(programId)
  if (!workspace.data) {
    return (
      <LibraryBrowser
        mode={{
          kind: 'activities',
          isPicker: true,
          actionLabel: 'Add to Program',
          returnTo,
          onPickActivity: () => {},
        }}
      />
    )
  }
  return <LoadedWorkspaceLibraryBrowser ws={workspace.data} returnTo={returnTo} />
}

function LoadedWorkspaceLibraryBrowser({
  ws,
  returnTo,
}: {
  ws: Workspace
  returnTo: string
}) {
  const navigate = useNavigate()
  const addExisting = useAddExistingActivity(ws)
  return (
    <LibraryBrowser
      mode={{
        kind: 'activities',
        isPicker: true,
        exclude: ws.activities.map((a) => a.activityId),
        actionLabel: 'Add to Program',
        returnTo,
        onPickActivity: (activity) => {
          void addExisting
            .run(activity)
            .then(() => {
              toast.success('Activity added')
              navigate(returnTo)
            })
            .catch((error: unknown) =>
              toast.error(
                error instanceof Error
                  ? error.message
                  : 'Could not add the Activity',
              ),
            )
        },
      }}
    />
  )
}

function LibraryBrowser({ mode }: { mode: BrowserMode }) {
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const currentUrl = `${location.pathname}${location.search}`
  const categorySlugOf = useCategorySlugOf()
  const types = useProgramTypes()
  const categories = useCategories()
  const prefetch = useProgramPrefetch()
  const prefetchProgram = (id: string) => {
    if (mode.prefetchOnHover) prefetch(id)
  }

  const filters = resolveBrowseFilters(
    params,
    mode.kind,
    mode.lockedProgramTypeId,
  )
  const categoryId = filters.category
  const programTypeId = filters.type
  const focusId = filters.focus
  const search = filters.q
  const sort = filters.sort
  const creator = filters.creator

  const focuses = useFocuses({
    categoryId: categoryId || undefined,
    programTypeId: programTypeId || undefined,
    enabled: true,
  })
  const visibleTypes = categoryId
    ? (types.data ?? []).filter((t) => t.categoryId === categoryId)
    : (types.data ?? [])
  const typeLabel = types.data?.find((t) => t.id === programTypeId)?.label

  const [query, setQuery] = useState(search)

  const setParam = (key: string, value: string, fallback = '') =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (
          key === BROWSE_PARAM.category ||
          key === BROWSE_PARAM.type ||
          key === BROWSE_PARAM.focus
        ) {
          next.delete(BROWSE_PARAM.facet)
        }
        if (value === fallback) next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true },
    )

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (query.trim() !== search) setParam(BROWSE_PARAM.q, query.trim())
    }, 250)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const programs = useDiscoverPrograms({
    q: search,
    categoryId: categoryId || undefined,
    programTypeId: programTypeId || undefined,
    focusId: focusId || undefined,
    sort,
    enabled: mode.kind === 'programs',
  })
  const activities = useDiscoverActivities({
    q: search,
    categoryId: categoryId || undefined,
    focusId: focusId || undefined,
    sort,
    enabled: mode.kind === 'activities',
  })
  const results = mode.kind === 'programs' ? programs : activities
  const excluded = new Set(mode.kind === 'activities' ? (mode.exclude ?? []) : [])
  const keep = (item: { isPlatform: boolean; id: string }) =>
    !excluded.has(item.id) &&
    (creator === 'ALL' || (creator === 'PLATFORM') === item.isPlatform)
  const cards =
    mode.kind === 'programs'
      ? (programs.data?.pages ?? [])
          .flatMap((page) => page.data.flatMap((d) => (d.program ? [d.program] : [])))
          .filter(keep)
          .map((program) => ({
            card: programCard(program, categorySlugOf),
            pick: () => mode.onPickProgram?.(program),
          }))
      : (activities.data?.pages ?? [])
          .flatMap((page) => page.data.flatMap((d) => (d.activity ? [d.activity] : [])))
          .filter(keep)
          .map((activity) => ({
            card: activityCard(activity, categorySlugOf),
            pick: () => mode.onPickActivity?.(activity),
          }))

  const focusOptions = (focuses.data ?? []).map((f) => ({ id: f.id, label: f.label }))
  const noun = mode.kind === 'programs' ? 'Program' : 'Activity'
  const title = mode.isPicker
    ? mode.kind === 'programs'
      ? `${typeLabel ?? 'Program'} Library`
      : 'Activity Library'
    : 'Community'
  useDocumentTitle(title)

  const filtered =
    !!categoryId ||
    (!mode.lockedProgramTypeId && !!programTypeId) ||
    !!focusId ||
    !!search ||
    sort !== 'POPULAR' ||
    creator !== 'ALL'

  const reset = () => {
    setQuery('')
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.delete(BROWSE_PARAM.q)
        next.delete(BROWSE_PARAM.sort)
        next.delete(BROWSE_PARAM.creator)
        next.delete(BROWSE_PARAM.category)
        next.delete(BROWSE_PARAM.focus)
        next.delete(BROWSE_PARAM.facet)
        if (!mode.lockedProgramTypeId) next.delete(BROWSE_PARAM.type)
        return next
      },
      { replace: true },
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
    <Page className="page--wide">
      <SubHeader
        title={title}
        active="community"
        returnTo={currentUrl}
        backTo={mode.returnTo}
      />

      <div className="flex flex-col gap-3 py-5">
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="flex flex-wrap items-center gap-2 grow">
            <div className="relative min-w-[200px] flex-1 sm:max-w-md">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                aria-label={`Search ${noun === 'Program' ? 'Programs' : 'Activities'}`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${noun === 'Program' ? (typeLabel ?? 'Programs') : 'Activities'}`}
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
              (value) => setParam(BROWSE_PARAM.sort, value, 'POPULAR'),
            )}
            {toggle<BrowseCreator>(
              'Filter by creator',
              [
                { value: 'ALL', label: 'All creators' },
                { value: 'PLATFORM', label: 'Platform' },
                { value: 'COMMUNITY', label: 'Community' },
              ],
              creator,
              (value) => setParam(BROWSE_PARAM.creator, value, 'ALL'),
            )}
          </div>
          {!mode.lockedProgramTypeId && (
            <div className="flex flex-wrap items-center gap-2">
              {(categories.data?.length ?? 0) > 0 && (
                <label className="flex items-center gap-3 text-sm text-muted">
                  <Select
                    aria-label="Category"
                    value={categoryId}
                    className="w-full max-w-xs sm:min-w-48"
                    onChange={(event) => {
                      const nextCategory = event.target.value
                      setParams(
                        (previous) => {
                          const next = new URLSearchParams(previous)
                          next.delete(BROWSE_PARAM.facet)
                          if (nextCategory) next.set(BROWSE_PARAM.category, nextCategory)
                          else next.delete(BROWSE_PARAM.category)
                          if (programTypeId && nextCategory) {
                            const currentType = types.data?.find((t) => t.id === programTypeId)
                            if (currentType && currentType.categoryId !== nextCategory) {
                              next.delete(BROWSE_PARAM.type)
                            }
                          }
                          if (focusId && nextCategory) {
                            const currentFocus = focuses.data?.find((f) => f.id === focusId)
                            if (currentFocus && currentFocus.categoryId !== nextCategory) {
                              next.delete(BROWSE_PARAM.focus)
                            }
                          }
                          return next
                        },
                        { replace: true },
                      )
                    }}
                  >
                    <option value="">All categories</option>
                    {categories.data?.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.label}
                      </option>
                    ))}
                  </Select>
                </label>
              )}
              {mode.kind === 'programs' && (
                <label className="flex items-center gap-3 text-sm text-muted">
                  <Select
                    aria-label="Program type"
                    value={programTypeId}
                    className="w-full max-w-xs sm:min-w-56"
                    onChange={(event) => {
                      const nextType = event.target.value
                      setParams(
                        (previous) => {
                          const next = new URLSearchParams(previous)
                          next.delete(BROWSE_PARAM.facet)
                          next.delete(BROWSE_PARAM.focus)
                          if (nextType) next.set(BROWSE_PARAM.type, nextType)
                          else next.delete(BROWSE_PARAM.type)
                          return next
                        },
                        { replace: true },
                      )
                    }}
                  >
                    <option value="">All Program types</option>
                    {visibleTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.label}
                      </option>
                    ))}
                  </Select>
                </label>
              )}
            </div>
          )}
        </div>
        {focusOptions.length > 0 && (
          <div
            role="group"
            aria-label="Filter by focus"
            className="flex flex-wrap items-center gap-1.5"
          >
            {[
              { id: '', label: 'All focuses' },
              ...focusOptions,
            ].map((option) => (
              <button
                key={option.id || 'all'}
                type="button"
                aria-pressed={focusId === option.id}
                onClick={() => setParam(BROWSE_PARAM.focus, option.id)}
                className={`min-h-8 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  focusId === option.id
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

      <div>
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
          <div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            role="status"
            aria-label={`Loading ${noun === 'Program' ? 'Programs' : 'Activities'}`}
          >
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
              <li
                key={card.id}
                onPointerEnter={() => prefetchProgram(card.id)}
                onFocus={() => prefetchProgram(card.id)}
              >
                <DiscoveryCard item={card} actionLabel={mode.actionLabel} onPick={pick} />
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
    </Page>
  )
}
