import { useEffect, useState, type ReactNode } from 'react'
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
import {
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Page } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { EmptyState, ErrorMessage } from '@/components/ui/Feedback'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Skeleton } from '@/components/ui/Skeleton'
import { SubHeader } from '@/components/shared/SubHeader'
import { EntityHero, useCategorySlugOf } from '@/components/shared/EntityHero'
import { formatProgramDuration } from '@/components/program-authoring/programFields'
import { formatFrequency } from '@/components/program-authoring/ScheduleControls'
import { useAddExistingActivity } from '@/components/program-authoring/useAddExistingActivity'
import type { Workspace } from '@/components/program-authoring/types'
import {
  BROWSE_PARAM,
  matchesBrowseDuration,
  resolveBrowseDuration,
  resolveBrowseFilters,
  type BrowseCreator,
  type BrowseDuration,
  type BrowseKind,
} from '@/lib/browse'
import { safeReturn } from '@/lib/dates'
import { formatDurationMinutes } from '@/lib/durationMinutes'
import { activityHero, programHero, type Hero } from '@/lib/hero'
import { useDocumentTitle } from '@/lib/title'
import { cn } from '@/lib/utils'

type S = components['schemas']
type Sort = S['DiscoverSort']

const SCROLL_KEY_PREFIX = 'browse-scroll:'

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

interface BrowseFeedItem {
  id: string
  title: string
  description: string | null
  creatorLabel: string | null
  classification: string | null
  schedule: string | null
  hero: Hero
  onSelect: () => void
}

interface DurationOption {
  value: BrowseDuration
  label: string
}

const PROGRAM_DURATION_OPTIONS: DurationOption[] = [
  { value: '', label: 'Any duration' },
  { value: 'short', label: 'Up to 2 weeks' },
  { value: 'medium', label: '3–4 weeks' },
  { value: 'long', label: '5+ weeks' },
  { value: 'ongoing', label: 'Ongoing' },
]

const ACTIVITY_DURATION_OPTIONS: DurationOption[] = [
  { value: '', label: 'Any duration' },
  { value: 'short', label: '15 min or less' },
  { value: 'medium', label: '16–30 min' },
  { value: 'long', label: 'Over 30 min' },
]

function uniqueLabels(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of values) {
    const trimmed = raw?.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result
}

function saveBrowseScroll(url: string) {
  try {
    sessionStorage.setItem(`${SCROLL_KEY_PREFIX}${url}`, String(window.scrollY))
  } catch {
    /* ignore storage errors */
  }
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
        onPickProgram: (program) => {
          saveBrowseScroll(currentUrl)
          navigate(
            `/programs/${program.id}?returnTo=${encodeURIComponent(currentUrl)}`,
          )
        },
        onPickActivity: (activity) => {
          saveBrowseScroll(currentUrl)
          navigate(
            `/activities/${activity.id}?returnTo=${encodeURIComponent(currentUrl)}`,
          )
        },
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

function FilterGroup({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-border/60 py-3.5 first:pt-0 last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 py-1 text-left text-xs font-semibold uppercase tracking-wider text-muted transition-colors hover:text-foreground"
      >
        <span>{title}</span>
        <ChevronDown
          size={14}
          aria-hidden
          className={cn(
            'shrink-0 transition-transform duration-fast',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && <div className="mt-2.5">{children}</div>}
    </div>
  )
}

function FilterOptionList<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
  scrollable = false,
}: {
  ariaLabel: string
  options: { value: T; label: string }[]
  value: T
  onChange: (next: T) => void
  scrollable?: boolean
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'flex flex-col gap-0.5',
        scrollable && 'browse-sidebar-scroll max-h-52 overflow-y-auto pr-1',
      )}
    >
      {options.map((option) => {
        const active = value === option.value
        return (
          <button
            key={option.value || 'all'}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex w-full items-center justify-between rounded-[var(--radius-control)] px-2.5 py-1.5 text-left text-sm transition-colors duration-fast',
              active
                ? 'bg-accent/12 font-semibold text-accent'
                : 'text-muted hover:bg-surface-muted/60 hover:text-foreground',
            )}
          >
            <span className="truncate">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function BrowseFeedRow({
  item,
  actionLabel,
  isPicker,
}: {
  item: BrowseFeedItem
  actionLabel: string
  isPicker?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={`${actionLabel}: ${item.title}`}
      onClick={item.onSelect}
      className="group flex w-full flex-col items-start py-8"
    >

      <span className="flex min-w-0 flex-1 flex-col gap-1 items-start mb-4">
        {item.classification && (
          <span className="truncate text-xs font-medium text-muted">
            {item.classification}
          </span>
        )}
        <span className="line-clamp-2 font-display text-base font-semibold leading-snug tracking-[-0.01em] text-foreground transition-colors group-hover:text-accent sm:text-lg">
          {item.title}
        </span>
        {item.description && (
          <span className="line-clamp-2 text-sm leading-relaxed text-muted">
            {item.description}
          </span>
        )}
        {(item.schedule || item.creatorLabel) && (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-0.5 text-xs text-muted sm:text-sm">
            {item.schedule && <span>{item.schedule}</span>}
            {item.schedule && item.creatorLabel && <span aria-hidden>·</span>}
            {item.creatorLabel && <span>{item.creatorLabel}</span>}
          </span>
        )}
      </span>

      <div className="browse-thumb relative aspect-hero w-[30vw] shrink-0 rounded-[var(--radius-media)] border border-border/50 bg-surface-muted">
        <EntityHero
          hero={item.hero}
          size="card"
          interactive={false}
          className="h-full w-full rounded-none"
        />
      </div>
    </button>
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
  const duration = resolveBrowseDuration(params, mode.kind)
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
  const categoryLabelOf = (id?: string | null) =>
    id ? (categories.data?.find((c) => c.id === id)?.label ?? null) : null
  const focusLabelOf = (id: string) =>
    focuses.data?.find((f) => f.id === id)?.label ?? null

  const [query, setQuery] = useState(search)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  useEffect(() => {
    setQuery(search)
  }, [search])

  useEffect(() => {
    if (!mobileFiltersOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileFiltersOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mobileFiltersOpen])

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

  const switchKind = (nextKind: BrowseKind) => {
    if (nextKind === mode.kind) return
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.delete(BROWSE_PARAM.facet)
        if (nextKind === 'activities') {
          next.set('kind', 'activities')
          next.delete(BROWSE_PARAM.type)
          if (next.get(BROWSE_PARAM.duration) === 'ongoing') {
            next.delete(BROWSE_PARAM.duration)
          }
        } else {
          next.delete('kind')
        }
        return next
      },
      { replace: true },
    )
  }

  const handleCategoryChange = (nextCategory: string) => {
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
  }

  const handleTypeChange = (nextType: string) => {
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
  }

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

  useEffect(() => {
    if (results.isPending || mode.isPicker) return
    const key = `${SCROLL_KEY_PREFIX}${currentUrl}`
    let raw: string | null = null
    try {
      raw = sessionStorage.getItem(key)
    } catch {
      return
    }
    if (!raw) return
    const y = Number(raw)
    if (!Number.isFinite(y) || y <= 0) {
      try {
        sessionStorage.removeItem(key)
      } catch {
        /* ignore */
      }
      return
    }
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: y, behavior: 'auto' })
      try {
        sessionStorage.removeItem(key)
      } catch {
        /* ignore */
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [currentUrl, results.isPending, mode.isPicker])

  const excluded = new Set(mode.kind === 'activities' ? (mode.exclude ?? []) : [])
  const keep = (item: {
    isPlatform: boolean
    id: string
    durationDays?: number | null
    durationMinutes?: number | null
  }) =>
    !excluded.has(item.id) &&
    (creator === 'ALL' || (creator === 'PLATFORM') === item.isPlatform) &&
    matchesBrowseDuration(duration, mode.kind, item)

  const items: BrowseFeedItem[] =
    mode.kind === 'programs'
      ? (programs.data?.pages ?? [])
          .flatMap((page) =>
            page.data.flatMap((d) => (d.program ? [d.program] : [])),
          )
          .filter(keep)
          .map((program) => {
            const classification = uniqueLabels([
              categoryLabelOf(program.type.categoryId),
              program.type.label,
              program.focus?.label,
            ]).join(' · ')
            const schedule = [
              formatProgramDuration(program.durationDays),
              program.frequencyLabel || null,
            ]
              .filter(Boolean)
              .join(' · ')
            const creatorLabel = program.creator?.displayName
              ? `by ${program.creator.displayName}`
              : program.isPlatform
                ? 'by Program Guru'
                : null
            return {
              id: program.id,
              title: program.title,
              description: null,
              creatorLabel,
              classification: classification || null,
              schedule: schedule || null,
              hero: programHero(program, categorySlugOf),
              onSelect: () => mode.onPickProgram?.(program),
            }
          })
      : (activities.data?.pages ?? [])
          .flatMap((page) =>
            page.data.flatMap((d) => (d.activity ? [d.activity] : [])),
          )
          .filter(keep)
          .map((activity) => {
            const focusLabels = activity.focusIds
              .map(focusLabelOf)
              .filter((label): label is string => !!label)
              .slice(0, 2)
            const classification = uniqueLabels([
              categoryLabelOf(activity.categoryId),
              ...focusLabels,
            ]).join(' · ')
            const schedule = [
              formatDurationMinutes(activity.durationMinutes),
              formatFrequency(activity.frequency),
            ]
              .filter(Boolean)
              .join(' · ')
            const creatorLabel = activity.creator?.displayName
              ? `by ${activity.creator.displayName}`
              : activity.isPlatform
                ? 'by Program Guru'
                : null
            return {
              id: activity.id,
              title: activity.title,
              description: activity.summary?.trim() || null,
              creatorLabel,
              classification: classification || null,
              schedule: schedule || null,
              hero: activityHero(activity, categorySlugOf),
              onSelect: () => mode.onPickActivity?.(activity),
            }
          })

  const focusOptions = (focuses.data ?? []).map((f) => ({
    value: f.id,
    label: f.label,
  }))
  const durationOptions =
    mode.kind === 'programs'
      ? PROGRAM_DURATION_OPTIONS
      : ACTIVITY_DURATION_OPTIONS
  const noun = mode.kind === 'programs' ? 'Program' : 'Activity'
  const nounPlural = mode.kind === 'programs' ? 'Programs' : 'Activities'
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
    !!duration ||
    !!search ||
    sort !== 'POPULAR' ||
    creator !== 'ALL'

  const activeSidebarFilterCount = [
    categoryId,
    !mode.lockedProgramTypeId ? programTypeId : '',
    focusId,
    duration,
    creator !== 'ALL' ? creator : '',
  ].filter(Boolean).length

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
        next.delete(BROWSE_PARAM.duration)
        next.delete(BROWSE_PARAM.facet)
        if (!mode.lockedProgramTypeId) next.delete(BROWSE_PARAM.type)
        return next
      },
      { replace: true },
    )
  }

  const activeFilterChips: { key: string; label: string; onRemove: () => void }[] = []
  if (search) {
    activeFilterChips.push({
      key: 'q',
      label: `“${search}”`,
      onRemove: () => {
        setQuery('')
        setParam(BROWSE_PARAM.q, '')
      },
    })
  }
  if (categoryId) {
    activeFilterChips.push({
      key: 'category',
      label: categoryLabelOf(categoryId) ?? 'Category',
      onRemove: () => handleCategoryChange(''),
    })
  }
  if (programTypeId && !mode.lockedProgramTypeId) {
    activeFilterChips.push({
      key: 'type',
      label: typeLabel ?? 'Program type',
      onRemove: () => handleTypeChange(''),
    })
  }
  if (focusId) {
    activeFilterChips.push({
      key: 'focus',
      label: focusLabelOf(focusId) ?? 'Focus',
      onRemove: () => setParam(BROWSE_PARAM.focus, ''),
    })
  }
  if (duration) {
    const durationLabel =
      durationOptions.find((opt) => opt.value === duration)?.label ?? duration
    activeFilterChips.push({
      key: 'duration',
      label: durationLabel,
      onRemove: () => setParam(BROWSE_PARAM.duration, ''),
    })
  }
  if (creator !== 'ALL') {
    activeFilterChips.push({
      key: 'creator',
      label: creator === 'PLATFORM' ? 'Platform' : 'Community',
      onRemove: () => setParam(BROWSE_PARAM.creator, 'ALL', 'ALL'),
    })
  }

  const categoryOptions = [
    { value: '', label: 'All categories' },
    ...(categories.data ?? []).map((c) => ({ value: c.id, label: c.label })),
  ]

  return (
    <Page className="page--wide pb-20">
      <SubHeader
        title={title}
        active="community"
        returnTo={currentUrl}
        backTo={mode.returnTo}
      />

      <div className="mx-auto w-full pt-6 md:pt-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8 lg:gap-12">
          {/* Left: Persistent filter sidebar on desktop/tablet, compact search + collapsible drawer on mobile */}
          <aside
            aria-label="Filters"
            className="w-full shrink-0 md:sticky md:top-20 md:w-[236px] lg:w-[272px]"
          >
            {/* 1. Search Programs and Activities */}
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted"
                />
                <Input
                  aria-label={`Search ${nounPlural}`}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      setParam(BROWSE_PARAM.q, query.trim())
                    }
                  }}
                  placeholder={`Search ${noun === 'Program' ? (typeLabel ?? 'Programs') : 'Activities'}…`}
                  className="pl-9 pr-8"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('')
                      setParam(BROWSE_PARAM.q, '')
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <Button
                variant="outline"
                size="md"
                aria-expanded={mobileFiltersOpen}
                aria-controls="browse-filter-groups"
                onClick={() => setMobileFiltersOpen((open) => !open)}
                className="shrink-0 gap-1.5 px-3 md:hidden"
              >
                <SlidersHorizontal size={16} aria-hidden />
                <span>Filters</span>
                {activeSidebarFilterCount > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-fg">
                    {activeSidebarFilterCount}
                  </span>
                )}
              </Button>
            </div>

            {/* Collapsible filter groups (static in sidebar on md+, slide-over drawer on mobile) */}
            <div
              id="browse-filter-groups"
              className={cn(
                mobileFiltersOpen
                  ? 'fixed inset-0 z-40 flex md:static md:inset-auto md:z-auto md:mt-5 md:block'
                  : 'hidden md:mt-5 md:block',
              )}
            >
              <button
                type="button"
                aria-label="Close filters"
                onClick={() => setMobileFiltersOpen(false)}
                className="fixed inset-0 bg-black/40 backdrop-blur-[1px] md:hidden"
              />

              <div className="browse-sidebar-scroll relative z-10 flex h-full w-[min(21rem,88vw)] flex-col overflow-y-auto border-r border-border bg-surface p-5 shadow-md md:h-auto md:max-h-[calc(100vh-10.5rem)] md:w-auto md:border-r-0 md:bg-transparent md:p-0 md:pr-1 md:shadow-none">
                <div className="mb-4 flex items-center justify-between border-b border-border/60 pb-3 md:hidden">
                  <span className="font-display text-base font-semibold text-foreground">
                    Filters
                  </span>
                  <button
                    type="button"
                    aria-label="Close filters"
                    onClick={() => setMobileFiltersOpen(false)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] text-muted hover:bg-surface-muted hover:text-foreground"
                  >
                    <X size={18} aria-hidden />
                  </button>
                </div>

                <div className="flex-1">
                  {/* 2. Content type: Programs / Activities */}
                  {!mode.isPicker && (
                    <FilterGroup title="Content type">
                      <SegmentedControl<BrowseKind>
                        ariaLabel="Content type"
                        size="sm"
                        className="grid w-full grid-cols-2"
                        options={[
                          { value: 'programs', label: 'Programs' },
                          { value: 'activities', label: 'Activities' },
                        ]}
                        value={mode.kind}
                        onChange={switchKind}
                      />
                    </FilterGroup>
                  )}

                  {/* 3. Category */}
                  {!mode.lockedProgramTypeId &&
                    (categories.data?.length ?? 0) > 0 && (
                      <FilterGroup title="Category">
                        <FilterOptionList
                          ariaLabel="Category"
                          options={categoryOptions}
                          value={categoryId}
                          onChange={handleCategoryChange}
                        />
                      </FilterGroup>
                    )}

                  {/* 4. Program Type */}
                  {mode.kind === 'programs' && !mode.lockedProgramTypeId && (
                    <FilterGroup title="Program type">
                      <Select
                        aria-label="Program type"
                        value={programTypeId}
                        onChange={(event) => handleTypeChange(event.target.value)}
                      >
                        <option value="">All Program types</option>
                        {visibleTypes.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.label}
                          </option>
                        ))}
                      </Select>
                    </FilterGroup>
                  )}

                  {/* 5. Focus */}
                  {focusOptions.length > 0 && (
                    <FilterGroup title="Focus">
                      <FilterOptionList
                        ariaLabel="Filter by focus"
                        options={[
                          { value: '', label: 'All focuses' },
                          ...focusOptions,
                        ]}
                        value={focusId}
                        onChange={(value) => setParam(BROWSE_PARAM.focus, value)}
                        scrollable={focusOptions.length > 7}
                      />
                    </FilterGroup>
                  )}

                  {/* 6. Duration */}
                  <FilterGroup title="Duration">
                    <FilterOptionList
                      ariaLabel="Filter by duration"
                      options={durationOptions}
                      value={duration}
                      onChange={(value) =>
                        setParam(BROWSE_PARAM.duration, value)
                      }
                    />
                  </FilterGroup>

                  {/* Creator filter (collapsed unless active) */}
                  <FilterGroup
                    title="Creator"
                    defaultOpen={creator !== 'ALL'}
                  >
                    <FilterOptionList<BrowseCreator>
                      ariaLabel="Filter by creator"
                      options={[
                        { value: 'ALL', label: 'All creators' },
                        { value: 'PLATFORM', label: 'Platform' },
                        { value: 'COMMUNITY', label: 'Community' },
                      ]}
                      value={creator}
                      onChange={(value) =>
                        setParam(BROWSE_PARAM.creator, value, 'ALL')
                      }
                    />
                  </FilterGroup>
                </div>

                {/* 7. Clear Filters */}
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={reset}
                    disabled={!filtered}
                    className="h-9 gap-1.5 px-2 text-xs text-muted hover:text-foreground"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    Clear filters
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setMobileFiltersOpen(false)}
                    className="md:hidden"
                  >
                    {results.isPending
                      ? 'Show results'
                      : `Show ${items.length}`}
                  </Button>
                </div>
              </div>
            </div>
          </aside>

          {/* Right: Main single-column discovery feed */}
          <section aria-label={`${nounPlural} feed`} className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
              <p role="status" className="text-sm font-medium text-muted">
                {results.isPending
                  ? `Loading ${nounPlural}…`
                  : `${items.length} ${items.length === 1 ? noun : nounPlural}`}
              </p>
              <SegmentedControl<Sort>
                ariaLabel="Sort by"
                size="sm"
                options={[
                  { value: 'POPULAR', label: 'Popular' },
                  { value: 'NEW', label: 'Newest' },
                  { value: 'RELEVANT', label: 'Featured' },
                ]}
                value={sort}
                onChange={(value) =>
                  setParam(BROWSE_PARAM.sort, value, 'POPULAR')
                }
              />
            </div>

            {activeFilterChips.length > 0 && (
              <div
                aria-label="Active filters"
                className="flex flex-wrap items-center gap-2 border-b border-border/60 py-3"
              >
                {activeFilterChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={chip.onRemove}
                    aria-label={`Remove ${chip.label} filter`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-surface px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
                  >
                    <span>{chip.label}</span>
                    <X size={12} aria-hidden className="text-muted" />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={reset}
                  className="px-2 py-1 text-xs font-medium text-muted transition-colors hover:text-foreground"
                >
                  Clear all
                </button>
              </div>
            )}

            <div className="mt-2">
              <ErrorMessage
                error={results.error}
                retry={() => void results.refetch()}
              />

              {results.isPending ? (
                <div
                  className="divide-y divide-border/60"
                  role="status"
                  aria-label={`Loading ${nounPlural}`}
                >
                  {Array.from({ length: 6 }, (_, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-4 px-2 py-5 sm:items-center sm:gap-6 sm:px-4 sm:py-6"
                    >
                      <Skeleton className="aspect-hero w-28 shrink-0 rounded-[var(--radius-media)] sm:w-44 lg:w-52" />
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <Skeleton className="h-3 w-28" />
                        <Skeleton className="h-5 w-2/3" />
                        <Skeleton className="h-3.5 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : items.length > 0 ? (
                <ul className="divide-y divide-border/60 grid grid-template-cols-3">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      onPointerEnter={() => prefetchProgram(item.id)}
                      onFocus={() => prefetchProgram(item.id)}
                    >
                      <BrowseFeedRow
                        item={item}
                        actionLabel={mode.actionLabel}
                        isPicker={mode.isPicker}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                !results.error && (
                  <div className="pt-6">
                    <EmptyState
                      level={3}
                      title={`No ${nounPlural} match these filters`}
                      description={
                        filtered
                          ? 'Try adjusting your search or clearing a filter.'
                          : undefined
                      }
                      action={
                        <div className="flex flex-wrap items-center justify-center gap-3">
                          {filtered && (
                            <Button variant="outline" size="sm" onClick={reset}>
                              Reset filters
                            </Button>
                          )}
                          {results.hasNextPage && (
                            <Button
                              variant="ghost"
                              size="sm"
                              loading={results.isFetchingNextPage}
                              onClick={() => void results.fetchNextPage()}
                            >
                              Load more
                            </Button>
                          )}
                        </div>
                      }
                    />
                  </div>
                )
              )}

              {items.length > 0 && results.hasNextPage && (
                <div className="mt-6 flex justify-center border-t border-border/60 pt-6">
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
          </section>
        </div>
      </div>
    </Page>
  )
}
