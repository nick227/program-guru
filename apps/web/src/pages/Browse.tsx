import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import {
  useAddCalendarItem,
  useCategories,
  useCurrentUser,
  useDiscoverActivities,
  useDiscoverPrograms,
  useFocuses,
  useJoinPublicGroupById,
  useMyGroups,
  useProgramPrefetch,
  useProgramTypes,
  useProgramWorkspace,
  useTags,
  type components,
} from '@project/sdk'
import {
  Calendar,
  CalendarClock,
  CalendarPlus,
  Check,
  ChevronDown,
  Clock,
  LayoutGrid,
  Repeat,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Page } from '@/components/ui/Layout'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { EmptyState, ErrorMessage } from '@/components/ui/Feedback'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Skeleton } from '@/components/ui/Skeleton'
import { CategoryIcon } from '@/components/shared/CategoryIcon'
import { EntityHero, useCategorySlugOf } from '@/components/shared/EntityHero'
import { formatProgramDuration } from '@/components/program-authoring/programFields'
import { formatFrequency } from '@/components/program-authoring/ScheduleControls'
import { useAddExistingActivity } from '@/components/program-authoring/useAddExistingActivity'
import type { Workspace } from '@/components/program-authoring/types'
import {
  BROWSE_PARAM,
  formatProgramLevel,
  matchesBrowseDuration,
  resolveBrowseDuration,
  resolveBrowseFilters,
  resolveBrowseScope,
  toServerDiscoverDuration,
  type BrowseCreator,
  type BrowseDiscoveryScope,
  type BrowseDuration,
  type BrowseKind,
} from '@/lib/browse'
import { dateLabel, safeReturn, today } from '@/lib/dates'
import { formatDurationMinutes } from '@/lib/durationMinutes'
import { activityHero, programHero, toHeroCategory, type Hero } from '@/lib/hero'
import { useDocumentTitle } from '@/lib/title'
import { buildGroupUrl } from '@/lib/urls'
import { cn } from '@/lib/utils'

type S = components['schemas']
type Sort = S['DiscoverSort']

const SCROLL_KEY_PREFIX = 'browse-scroll:'
const GRID_CLASS =
  'grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'

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
  kind: BrowseKind
  revisionId?: string | null
  title: string
  description: string | null
  creatorLabel: string | null
  categoryLabel: string | null
  focusLabel: string | null
  levelLabel: string | null
  sessionLabel: string | null
  frequencyLabel: string | null
  lengthLabel: string | null
  hero: Hero
  featuredGroup?: S['PublicGroupSummary'] | null
  onSelect: () => void
}

interface DurationOption {
  value: BrowseDuration
  label: string
}

const PROGRAM_DURATION_OPTIONS: DurationOption[] = [
  { value: '', label: 'Any length' },
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

const PROGRAM_LEVEL_OPTIONS: { value: S['ProgramLevel'] | ''; label: string }[] = [
  { value: '', label: 'Any level' },
  { value: 'BEGINNER', label: 'Beginner' },
  { value: 'INTERMEDIATE', label: 'Intermediate' },
  { value: 'ADVANCED', label: 'Advanced' },
  { value: 'ALL_LEVELS', label: 'All levels' },
]

const SESSION_LENGTH_OPTIONS = [
  { value: '', label: 'Any session length' },
  { value: '15', label: '15 min or less' },
  { value: '30', label: '30 min or less' },
  { value: '45', label: '45 min or less' },
]

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
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  useEffect(() => {
    if (defaultOpen) setOpen(true)
  }, [defaultOpen])

  return (
    <div className="border-b border-border/50 py-3 first:pt-0 last:border-b-0">
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
      {open && <div className="mt-2">{children}</div>}
    </div>
  )
}

function FilterOptionList<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
  scrollable = false,
  showCheckmark = false,
}: {
  ariaLabel: string
  options: {
    value: T
    label: string
    icon?: ReactNode
    disabled?: boolean
    hint?: string
    title?: string
  }[]
  value: T
  onChange: (next: T) => void
  scrollable?: boolean
  showCheckmark?: boolean
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
            disabled={option.disabled}
            aria-disabled={option.disabled || undefined}
            aria-pressed={option.disabled ? undefined : active}
            title={option.title}
            onClick={() => {
              if (!option.disabled) onChange(option.value)
            }}
            className={cn(
              'flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors duration-fast md:min-h-0',
              option.disabled
                ? 'cursor-not-allowed text-muted/55'
                : active
                  ? 'bg-accent/15 font-medium text-accent'
                  : 'text-muted hover:bg-surface-muted/60 hover:text-foreground',
            )}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              {option.icon && (
                <span className="shrink-0 opacity-85">{option.icon}</span>
              )}
              <span className="truncate">{option.label}</span>
            </span>
            {option.hint ? (
              <span className="shrink-0 text-[11px] font-medium text-muted/70">
                {option.hint}
              </span>
            ) : (
              showCheckmark &&
              active && <Check size={14} aria-hidden className="shrink-0 text-accent" />
            )}
          </button>
        )
      })}
    </div>
  )
}

function GroupAvatars({
  avatars,
}: {
  avatars?: S['UserSummary'][]
}) {
  const list = (avatars ?? []).slice(0, 3)
  if (list.length === 0) {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-muted">
        <Users size={12} aria-hidden />
      </span>
    )
  }
  return (
    <span className="flex shrink-0 -space-x-1.5" aria-hidden>
      {list.map((u) => (
        <Avatar
          key={u.id}
          name={u.displayName}
          src={u.avatarUrl}
          size="sm"
          className="h-6 w-6 text-[10px] ring-2 ring-surface"
        />
      ))}
    </span>
  )
}

function BrowseFeedCard({
  item,
  actionLabel,
  isPicker,
  currentUrl,
  signedIn,
  joinedIds,
  joiningGroupId,
  onQuickJoin,
  addedActivityIds,
  addingActivityId,
  onAddActivityToToday,
}: {
  item: BrowseFeedItem
  actionLabel: string
  isPicker?: boolean
  currentUrl: string
  signedIn: boolean
  joinedIds: Set<string>
  joiningGroupId: string | null
  onQuickJoin: (groupId: string) => void
  addedActivityIds?: Set<string>
  addingActivityId?: string | null
  onAddActivityToToday?: (item: BrowseFeedItem) => void
}) {
  const g = !isPicker && item.featuredGroup?.visibility === 'PUBLIC' ? item.featuredGroup : null
  const groupName = g ? (g.name?.trim() || `${item.title} group`) : null
  const isMember = !!g && (g.viewerIsMember || joinedIds.has(g.id))
  const canQuickJoin = !!g && !isMember && g.joinPolicy === 'OPEN'
  const recentCheckIns = g?.recentCheckInCount ?? 0
  const groupSchedule = g?.startLocalDate ? `Starts ${dateLabel(g.startLocalDate)}` : null
  const tone = `var(--cat-${item.hero.category}, var(--color-accent))`
  const isActivity = item.kind === 'activities'
  const isActivityAdded = !!addedActivityIds?.has(item.id)
  const isAddingActivity = addingActivityId === item.id

  return (
    <article className="flex h-full flex-col justify-between rounded-xl border border-border/80 bg-surface p-3 transition-colors hover:border-border">
      <button
        type="button"
        aria-label={`${actionLabel}: ${item.title}`}
        onClick={item.onSelect}
        className="group flex w-full flex-col gap-2.5 text-left"
      >
        <div className="browse-thumb relative aspect-video w-full overflow-hidden rounded-lg border border-border/50 bg-surface-muted">
          <EntityHero
            hero={item.hero}
            size="card"
            interactive={false}
            showVideoBadge={false}
            className="h-full w-full rounded-none"
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {(item.categoryLabel || item.focusLabel || item.levelLabel) && (
            <div className="flex flex-wrap items-center gap-1">
              {item.categoryLabel && (
                <span
                  style={
                    {
                      color: `hsl(${tone})`,
                      backgroundColor: `hsl(${tone} / 0.14)`,
                      borderColor: `hsl(${tone} / 0.3)`,
                    } as CSSProperties
                  }
                  className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight border"
                >
                  {item.categoryLabel}
                </span>
              )}
              {item.focusLabel && (
                <span className="inline-flex items-center rounded border border-border/60 bg-surface-muted/70 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-foreground/85">
                  {item.focusLabel}
                </span>
              )}
              {item.levelLabel && (
                <span className="ml-auto inline-flex items-center rounded border border-border/70 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-muted">
                  {item.levelLabel}
                </span>
              )}
            </div>
          )}

          <h3 className="line-clamp-2 font-display text-sm font-semibold leading-snug tracking-[-0.01em] text-foreground transition-colors group-hover:text-accent">
            {item.title}
          </h3>

          {item.description && (
            <p className="line-clamp-2 text-xs leading-relaxed text-muted">
              {item.description}
            </p>
          )}

          {item.creatorLabel && (
            <p className="truncate text-[11px] text-muted/85">
              {item.creatorLabel}
            </p>
          )}

          {(item.sessionLabel || item.frequencyLabel || item.lengthLabel) && (
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 pt-0.5 text-[11px] text-muted">
              {item.sessionLabel && (
                <span className="inline-flex items-center gap-1">
                  <Clock size={11} aria-hidden className="shrink-0 opacity-80" />
                  <span>{item.sessionLabel}</span>
                </span>
              )}
              {item.frequencyLabel && (
                <span className="inline-flex items-center gap-1">
                  <Repeat size={11} aria-hidden className="shrink-0 opacity-80" />
                  <span>{item.frequencyLabel}</span>
                </span>
              )}
              {item.lengthLabel && (
                <span className="inline-flex items-center gap-1">
                  <Calendar size={11} aria-hidden className="shrink-0 opacity-80" />
                  <span>{item.lengthLabel}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </button>

      {g && groupName ? (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <GroupAvatars avatars={g.memberAvatars} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">
                {groupName}
              </p>
              <p className="truncate text-[11px] text-muted">
                {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}
                {recentCheckIns > 0
                  ? ` · ${recentCheckIns} recent ${recentCheckIns === 1 ? 'check-in' : 'check-ins'}`
                  : ''}
                {groupSchedule ? ` · ${groupSchedule}` : ''}
                {g.joinPolicy === 'INVITE_ONLY' && !isMember ? ' · Invite only' : ''}
              </p>
            </div>
          </div>
          {isMember ? (
            <Link
              to={buildGroupUrl(g.id, { returnTo: currentUrl })}
              aria-label={`Open Group ${groupName}`}
              className="btn btn--outline btn--sm shrink-0"
            >
              Open
            </Link>
          ) : canQuickJoin && signedIn ? (
            <Button
              type="button"
              size="sm"
              loading={joiningGroupId === g.id}
              disabled={joiningGroupId === g.id}
              aria-label={`Join ${groupName}`}
              onClick={() => onQuickJoin(g.id)}
              className="shrink-0"
            >
              Join
            </Button>
          ) : (
            <Link
              to={buildGroupUrl(g.id, { returnTo: currentUrl })}
              aria-label={`${canQuickJoin ? 'Join' : 'View'} ${groupName}`}
              className={cn(
                'btn btn--sm shrink-0',
                canQuickJoin ? 'btn--primary' : 'btn--outline',
              )}
            >
              {canQuickJoin ? 'Join' : 'View'}
            </Link>
          )}
        </div>
      ) : (
        isActivity &&
        !isPicker && (
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
            <span className="truncate text-[11px] text-muted">
              Standalone Activity
            </span>
            {signedIn && onAddActivityToToday ? (
              <Button
                type="button"
                size="sm"
                variant={isActivityAdded ? 'outline' : 'default'}
                loading={isAddingActivity}
                disabled={isAddingActivity || isActivityAdded}
                aria-label={`Add ${item.title} to today`}
                onClick={() => onAddActivityToToday(item)}
                className="shrink-0 gap-1"
              >
                {isActivityAdded ? (
                  <>
                    <Check size={12} aria-hidden />
                    <span>Added</span>
                  </>
                ) : (
                  <>
                    <CalendarPlus size={12} aria-hidden />
                    <span>Add today</span>
                  </>
                )}
              </Button>
            ) : (
              <Link
                to={`/activities/${item.id}?returnTo=${encodeURIComponent(currentUrl)}`}
                className="btn btn--outline btn--sm shrink-0"
              >
                Open
              </Link>
            )}
          </div>
        )
      )}
    </article>
  )
}

function MyGroupCard({
  group,
  currentUrl,
}: {
  group: S['GroupSummary']
  currentUrl: string
}) {
  const groupName = group.name?.trim() || `${group.programTitle} group`
  const recentCheckIns = group.recentCheckInCount ?? 0
  const groupSchedule = group.startLocalDate
    ? `Starts ${dateLabel(group.startLocalDate)}`
    : null

  return (
    <article className="flex flex-col justify-between gap-3 rounded-xl border border-border/80 bg-surface p-3.5 transition-colors hover:border-border">
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium text-muted">
            {group.programTitle}
          </p>
          <h3 className="mt-0.5 truncate font-display text-sm font-semibold text-foreground">
            {groupName}
          </h3>
        </div>
        <Link
          to={buildGroupUrl(group.id, { returnTo: currentUrl })}
          aria-label={`Open Group ${groupName}`}
          className="btn btn--outline btn--sm shrink-0"
        >
          Open
        </Link>
      </div>

      <div className="flex items-center gap-2 border-t border-border/60 pt-2.5">
        <GroupAvatars avatars={group.memberAvatars} />
        <p className="min-w-0 flex-1 truncate text-[11px] text-muted">
          {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
          {recentCheckIns > 0
            ? ` · ${recentCheckIns} recent ${recentCheckIns === 1 ? 'check-in' : 'check-ins'}`
            : ''}
          {groupSchedule ? ` · ${groupSchedule}` : ''}
        </p>
      </div>
    </article>
  )
}

function LibraryBrowser({ mode }: { mode: BrowserMode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const currentUrl = `${location.pathname}${location.search}`
  const categorySlugOf = useCategorySlugOf()
  const types = useProgramTypes()
  const categories = useCategories()
  const tagsCatalog = useTags()
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
  const scope = resolveBrowseScope(params, mode.kind, mode.isPicker)
  const timing = scope === 'STARTING_SOON' ? 'STARTING_SOON' : 'ALL'
  const isMyGroups = scope === 'MY_GROUPS'

  const categoryId = filters.category
  const programTypeId = filters.type
  const focusId = filters.focus
  const level = filters.level
  const maxSessionMinutes = filters.maxSessionMinutes
  const selectedTags = filters.tags
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
  const visibleFocuses = categoryId
    ? (focuses.data ?? []).filter((f) => f.categoryId === categoryId)
    : (focuses.data ?? [])

  const typeLabel = types.data?.find((t) => t.id === programTypeId)?.label
  const categoryLabelOf = (id?: string | null) =>
    id ? (categories.data?.find((c) => c.id === id)?.label ?? null) : null
  const focusLabelOf = (id: string) =>
    focuses.data?.find((f) => f.id === id)?.label ?? null

  const [query, setQuery] = useState(search)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const me = useCurrentUser()
  const myGroups = useMyGroups(!!me.data && !mode.isPicker && mode.kind === 'programs')
  const joinGroup = useJoinPublicGroupById()
  const addCalendarItem = useAddCalendarItem()
  const [joinedGroupIds, setJoinedGroupIds] = useState<Set<string>>(() => new Set())
  const [joiningGroupId, setJoiningGroupId] = useState<string | null>(null)
  const [addedActivityIds, setAddedActivityIds] = useState<Set<string>>(() => new Set())
  const [addingActivityId, setAddingActivityId] = useState<string | null>(null)

  const handleQuickJoin = async (groupId: string) => {
    if (joiningGroupId) return
    setJoiningGroupId(groupId)
    try {
      await joinGroup.mutateAsync({ groupId })
      setJoinedGroupIds((prev) => new Set(prev).add(groupId))
      toast.success('Joined group')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not join group')
    } finally {
      setJoiningGroupId(null)
    }
  }

  const handleAddActivityToToday = async (item: BrowseFeedItem) => {
    if (addingActivityId) return
    setAddingActivityId(item.id)
    try {
      await addCalendarItem.mutateAsync({
        activityId: item.id,
        revisionId: item.revisionId ?? undefined,
        localDate: today(
          me.data?.data.preferences.timezone ??
            Intl.DateTimeFormat().resolvedOptions().timeZone,
        ),
        idempotencyKey: crypto.randomUUID(),
      })
      setAddedActivityIds((prev) => new Set(prev).add(item.id))
      toast.success(`Added "${item.title}" to today`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add activity')
    } finally {
      setAddingActivityId(null)
    }
  }

  useEffect(() => {
    setQuery(search)
  }, [search])

  useEffect(() => {
    if (!mobileFiltersOpen) return
    const isMobile = window.matchMedia('(max-width: 767.98px)').matches
    const prevOverflow = document.body.style.overflow
    if (isMobile) {
      document.body.style.overflow = 'hidden'
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileFiltersOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      if (isMobile) {
        document.body.style.overflow = prevOverflow
      }
      window.removeEventListener('keydown', onKeyDown)
    }
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

  const setScope = (nextScope: BrowseDiscoveryScope) => {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.delete(BROWSE_PARAM.timing)
        next.delete(BROWSE_PARAM.view)
        if (nextScope === 'STARTING_SOON') {
          next.set(BROWSE_PARAM.timing, 'STARTING_SOON')
        } else if (nextScope === 'MY_GROUPS') {
          next.set(BROWSE_PARAM.view, 'my-groups')
        }
        return next
      },
      { replace: true },
    )
  }

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
          next.delete(BROWSE_PARAM.timing)
          next.delete(BROWSE_PARAM.view)
          next.delete(BROWSE_PARAM.level)
          next.delete(BROWSE_PARAM.session)
          next.delete(BROWSE_PARAM.tags)
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

  const toggleTag = (slug: string) => {
    const nextTags = selectedTags.includes(slug)
      ? selectedTags.filter((s) => s !== slug)
      : [...selectedTags, slug]
    setParam(BROWSE_PARAM.tags, nextTags.join(','))
  }

  const filtered =
    !!categoryId ||
    (!mode.lockedProgramTypeId && !!programTypeId) ||
    !!focusId ||
    !!level ||
    !!maxSessionMinutes ||
    selectedTags.length > 0 ||
    !!duration ||
    scope !== 'ALL' ||
    !!search ||
    sort !== 'POPULAR' ||
    creator !== 'ALL'

  const showDirectorySections =
    !mode.isPicker && mode.kind === 'programs' && !filtered

  const programs = useDiscoverPrograms({
    q: search,
    categoryId: categoryId || undefined,
    programTypeId: programTypeId || undefined,
    focusId: focusId || undefined,
    level: level || undefined,
    duration: toServerDiscoverDuration(duration),
    maxSessionMinutes: maxSessionMinutes ? Number(maxSessionMinutes) : undefined,
    tags: selectedTags.length ? selectedTags : undefined,
    sort,
    timing: timing !== 'ALL' ? timing : undefined,
    enabled: mode.kind === 'programs' && !isMyGroups,
  })

  const startingSoonPrograms = useDiscoverPrograms({
    timing: 'STARTING_SOON',
    sort: 'POPULAR',
    limit: 5,
    enabled: showDirectorySections,
  })

  const activities = useDiscoverActivities({
    q: search,
    categoryId: categoryId || undefined,
    focusId: focusId || undefined,
    sort,
    enabled: mode.kind === 'activities' || showDirectorySections,
  })

  const results = isMyGroups
    ? myGroups
    : mode.kind === 'programs'
      ? programs
      : activities

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

  const mapProgramItem = (
    program: S['ProgramSummary'],
    featuredGroup: S['PublicGroupSummary'] | null,
  ): BrowseFeedItem => ({
    id: program.id,
    kind: 'programs',
    title: program.title,
    description: program.description?.trim() || null,
    creatorLabel: program.creator?.displayName
      ? `by ${program.creator.displayName}`
      : null,
    categoryLabel: categoryLabelOf(program.type.categoryId),
    focusLabel: program.focus?.label ?? null,
    levelLabel: formatProgramLevel(program.level),
    sessionLabel: program.sessionMinutes
      ? `${program.sessionMinutes} min`
      : null,
    frequencyLabel: program.frequencyLabel || null,
    lengthLabel: formatProgramDuration(program.durationDays),
    hero: programHero(program, categorySlugOf),
    featuredGroup,
    onSelect: () => {
      if (mode.onPickProgram) {
        mode.onPickProgram(program)
      } else {
        saveBrowseScroll(currentUrl)
        navigate(
          `/programs/${program.id}?returnTo=${encodeURIComponent(currentUrl)}`,
        )
      }
    },
  })

  const mapActivityItem = (activity: S['ActivitySummary']): BrowseFeedItem => {
    const firstFocus =
      activity.focusIds
        .map(focusLabelOf)
        .find((label): label is string => !!label) ?? null
    return {
      id: activity.id,
      kind: 'activities',
      revisionId: activity.revisionId,
      title: activity.title,
      description: activity.summary?.trim() || null,
      creatorLabel: activity.creator?.displayName
        ? `by ${activity.creator.displayName}`
        : null,
      categoryLabel: categoryLabelOf(activity.categoryId),
      focusLabel: firstFocus,
      levelLabel: null,
      sessionLabel: formatDurationMinutes(activity.durationMinutes),
      frequencyLabel: formatFrequency(activity.frequency) || null,
      lengthLabel: null,
      hero: activityHero(activity, categorySlugOf),
      onSelect: () => {
        if (mode.onPickActivity && mode.kind === 'activities') {
          mode.onPickActivity(activity)
        } else {
          saveBrowseScroll(currentUrl)
          navigate(
            `/activities/${activity.id}?returnTo=${encodeURIComponent(currentUrl)}`,
          )
        }
      },
    }
  }

  const programItems: BrowseFeedItem[] = (programs.data?.pages ?? [])
    .flatMap((page) =>
      page.data.flatMap((d) =>
        d.program ? [{ program: d.program, featuredGroup: d.featuredGroup ?? null }] : [],
      ),
    )
    .filter(({ program }) => keep(program))
    .map(({ program, featuredGroup }) => mapProgramItem(program, featuredGroup))

  const activityItems: BrowseFeedItem[] = (activities.data?.pages ?? [])
    .flatMap((page) =>
      page.data.flatMap((d) => (d.activity ? [d.activity] : [])),
    )
    .filter((a) => (mode.kind === 'activities' ? keep(a) : true))
    .map(mapActivityItem)

  const recentActivityItems: BrowseFeedItem[] = programItems
    .filter(
      (item) =>
        item.featuredGroup?.visibility === 'PUBLIC' &&
        ((item.featuredGroup.recentCheckInCount ?? 0) > 0 ||
          !!item.featuredGroup.latestCheckIn),
    )
    .slice(0, 5)

  const startingSoonItems: BrowseFeedItem[] = (startingSoonPrograms.data?.pages ?? [])
    .flatMap((page) =>
      page.data.flatMap((d) =>
        d.program ? [{ program: d.program, featuredGroup: d.featuredGroup ?? null }] : [],
      ),
    )
    .slice(0, 5)
    .map(({ program, featuredGroup }) => mapProgramItem(program, featuredGroup))

  const items = mode.kind === 'programs' ? programItems : activityItems

  const myGroupItems = (myGroups.data?.pages ?? [])
    .flatMap((page) => page.data)
    .filter((g) => {
      if (!search) return true
      const needle = search.toLowerCase()
      return (
        (g.name ?? '').toLowerCase().includes(needle) ||
        g.programTitle.toLowerCase().includes(needle)
      )
    })

  const focusOptions = visibleFocuses.map((f) => ({
    value: f.id,
    label: f.label,
  }))
  const durationOptions =
    mode.kind === 'programs'
      ? PROGRAM_DURATION_OPTIONS
      : ACTIVITY_DURATION_OPTIONS
  const noun = isMyGroups ? 'group' : 'result'
  const nounPlural = isMyGroups ? 'groups' : 'results'
  const title = mode.isPicker
    ? mode.kind === 'programs'
      ? `${typeLabel ?? 'Program'} Library`
      : 'Activity Library'
    : 'Community'
  useDocumentTitle(title)

  const activeSidebarFilterCount = [
    categoryId,
    !mode.lockedProgramTypeId ? programTypeId : '',
    focusId,
    level,
    maxSessionMinutes,
    duration,
    scope !== 'ALL' ? scope : '',
    creator !== 'ALL' ? creator : '',
  ].filter(Boolean).length + selectedTags.length

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
        next.delete(BROWSE_PARAM.level)
        next.delete(BROWSE_PARAM.session)
        next.delete(BROWSE_PARAM.tags)
        next.delete(BROWSE_PARAM.duration)
        next.delete(BROWSE_PARAM.timing)
        next.delete(BROWSE_PARAM.view)
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
  if (scope === 'STARTING_SOON') {
    activeFilterChips.push({
      key: 'timing',
      label: 'Starting Soon',
      onRemove: () => setScope('ALL'),
    })
  } else if (scope === 'MY_GROUPS') {
    activeFilterChips.push({
      key: 'view',
      label: 'My Groups',
      onRemove: () => setScope('ALL'),
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
  if (level) {
    activeFilterChips.push({
      key: 'level',
      label: formatProgramLevel(level) ?? level,
      onRemove: () => setParam(BROWSE_PARAM.level, ''),
    })
  }
  if (maxSessionMinutes) {
    activeFilterChips.push({
      key: 'session',
      label: `${maxSessionMinutes} min or less`,
      onRemove: () => setParam(BROWSE_PARAM.session, ''),
    })
  }
  for (const slug of selectedTags) {
    const label = tagsCatalog.data?.find((t) => t.slug === slug)?.label ?? slug
    activeFilterChips.push({
      key: `tag:${slug}`,
      label: `#${label}`,
      onRemove: () => toggleTag(slug),
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
    {
      value: '',
      label: 'All categories',
      icon: <LayoutGrid size={15} aria-hidden />,
    },
    ...(categories.data ?? []).map((c) => ({
      value: c.id,
      label: c.label,
      icon: <CategoryIcon category={toHeroCategory(c.slug)} size={15} />,
    })),
  ]

  const displayedCount = isMyGroups ? myGroupItems.length : items.length
  const myGroupsCount = me.data && !myGroups.isPending ? myGroupItems.length : null

  const renderCardGrid = (cardItems: BrowseFeedItem[]) => (
    <ul className={GRID_CLASS}>
      {cardItems.map((item) => (
        <li
          key={`${item.kind}:${item.id}`}
          onPointerEnter={() => {
            if (item.kind === 'programs') prefetchProgram(item.id)
          }}
          onFocus={() => {
            if (item.kind === 'programs') prefetchProgram(item.id)
          }}
        >
          <BrowseFeedCard
            item={item}
            actionLabel={
              mode.isPicker
                ? mode.actionLabel
                : item.kind === 'programs'
                  ? 'View Program'
                  : 'View Activity'
            }
            isPicker={mode.isPicker}
            currentUrl={currentUrl}
            signedIn={!!me.data}
            joinedIds={joinedGroupIds}
            joiningGroupId={joiningGroupId}
            onQuickJoin={(groupId) => void handleQuickJoin(groupId)}
            addedActivityIds={addedActivityIds}
            addingActivityId={addingActivityId}
            onAddActivityToToday={(act) => void handleAddActivityToToday(act)}
          />
        </li>
      ))}
    </ul>
  )

  return (
    <Page className="page--wide pb-20">
      <div className="mx-auto w-full pt-4 md:pt-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-7">
          {/* Left: Fixed 248px sticky sidebar on desktop, slide-over drawer on mobile */}
          <aside
            aria-label="Filters"
            className="w-full shrink-0 md:sticky md:top-20 md:w-[248px]"
          >
            <div
              id="browse-filter-groups"
              className={cn(
                mobileFiltersOpen
                  ? 'fixed inset-0 z-40 flex md:static md:inset-auto md:z-auto md:block'
                  : 'hidden md:block',
              )}
            >
              <button
                type="button"
                aria-label="Close filters"
                onClick={() => setMobileFiltersOpen(false)}
                className="fixed inset-0 bg-black/50 backdrop-blur-[1px] md:hidden"
              />

              <div className="browse-sidebar-scroll relative z-10 flex h-full w-[min(20rem,86vw)] flex-col overflow-y-auto border-r border-border bg-surface p-5 shadow-md md:h-auto md:max-h-[calc(100vh-6.5rem)] md:w-auto md:border-r md:border-border/50 md:bg-transparent md:p-0 md:pr-4 md:shadow-none">
                <div className="mb-4 flex items-center justify-between border-b border-border/60 pb-3 md:hidden">
                  <span className="font-display text-base font-semibold text-foreground">
                    Filters
                  </span>
                  <button
                    type="button"
                    aria-label="Close filters"
                    onClick={() => setMobileFiltersOpen(false)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface-muted hover:text-foreground"
                  >
                    <X size={18} aria-hidden />
                  </button>
                </div>

                {!mode.isPicker && (
                  <div className="mb-4 hidden md:block">
                    <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">
                      Explore
                    </h2>
                    <p className="mt-0.5 text-xs text-muted">
                      Programs, activities, and groups.
                    </p>
                  </div>
                )}

                <div className="flex-1">
                  {/* Content type switcher (Programs / Activities) */}
                  {!mode.isPicker && (
                    <div className="border-b border-border/50 pb-3.5">
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
                    </div>
                  )}

                  {/* Simple discovery options: All Programs, Starting Soon, My Groups */}
                  {mode.kind === 'programs' && !mode.isPicker && (
                    <div className="border-b border-border/50 py-3.5">
                      <FilterOptionList<BrowseDiscoveryScope>
                        ariaLabel="Filter by group timing"
                        options={[
                          {
                            value: 'ALL',
                            label: 'All Programs',
                            icon: <LayoutGrid size={15} aria-hidden />,
                          },
                          {
                            value: 'STARTING_SOON',
                            label: 'Starting Soon',
                            icon: <CalendarClock size={15} aria-hidden />,
                          },
                          {
                            value: 'MY_GROUPS',
                            label: 'My Groups',
                            icon: <Users size={15} aria-hidden />,
                            hint:
                              myGroupsCount != null
                                ? String(myGroupsCount)
                                : undefined,
                          },
                        ]}
                        value={scope}
                        onChange={setScope}
                      />
                    </div>
                  )}

                  {/* Categories shown immediately */}
                  {!mode.lockedProgramTypeId &&
                    (categories.data?.length ?? 0) > 0 && (
                      <FilterGroup title="Category" defaultOpen>
                        <FilterOptionList
                          ariaLabel="Category"
                          options={categoryOptions}
                          value={categoryId}
                          onChange={handleCategoryChange}
                          showCheckmark
                        />
                      </FilterGroup>
                    )}

                  {/* Collapsed by default unless active: Program type, Focus, Level, Duration, Tags, Creator */}
                  {mode.kind === 'programs' && !mode.lockedProgramTypeId && (
                    <FilterGroup
                      title="Program type"
                      defaultOpen={!!programTypeId}
                    >
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

                  {focusOptions.length > 0 && (
                    <FilterGroup title="Focus" defaultOpen={!!focusId}>
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

                  {mode.kind === 'programs' && (
                    <FilterGroup title="Level" defaultOpen={!!level}>
                      <FilterOptionList
                        ariaLabel="Filter by level"
                        options={PROGRAM_LEVEL_OPTIONS}
                        value={level}
                        onChange={(value) => setParam(BROWSE_PARAM.level, value)}
                      />
                    </FilterGroup>
                  )}

                  <FilterGroup
                    title="Duration"
                    defaultOpen={!!duration || !!maxSessionMinutes}
                  >
                    <div className="space-y-3">
                      <FilterOptionList
                        ariaLabel="Filter by duration"
                        options={durationOptions}
                        value={duration}
                        onChange={(value) =>
                          setParam(BROWSE_PARAM.duration, value)
                        }
                      />
                      {mode.kind === 'programs' && (
                        <div className="border-t border-border/40 pt-2.5">
                          <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                            Session length
                          </p>
                          <FilterOptionList
                            ariaLabel="Filter by session length"
                            options={SESSION_LENGTH_OPTIONS}
                            value={maxSessionMinutes}
                            onChange={(value) =>
                              setParam(BROWSE_PARAM.session, value)
                            }
                          />
                        </div>
                      )}
                    </div>
                  </FilterGroup>

                  {mode.kind === 'programs' &&
                    (tagsCatalog.data?.length ?? 0) > 0 && (
                      <FilterGroup
                        title="Tags"
                        defaultOpen={selectedTags.length > 0}
                      >
                        <div
                          role="group"
                          aria-label="Filter by tags"
                          className="flex flex-wrap gap-1.5"
                        >
                          {(tagsCatalog.data ?? []).map((tag) => {
                            const active = selectedTags.includes(tag.slug)
                            return (
                              <button
                                key={tag.id}
                                type="button"
                                aria-pressed={active}
                                onClick={() => toggleTag(tag.slug)}
                                className={cn(
                                  'min-h-9 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-fast md:min-h-0 md:px-2.5 md:py-1',
                                  active
                                    ? 'border-accent bg-accent/15 text-accent'
                                    : 'border-border/70 text-muted hover:border-border hover:text-foreground',
                                )}
                              >
                                {tag.label}
                              </button>
                            )
                          })}
                        </div>
                      </FilterGroup>
                    )}

                  <FilterGroup title="Creator" defaultOpen={creator !== 'ALL'}>
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

                {/* Drawer footer */}
                <div className="sticky bottom-0 mt-4 flex items-center justify-between gap-3 border-t border-border/60 bg-surface pt-3 pb-[calc(0.25rem+env(safe-area-inset-bottom))] md:static md:bg-transparent md:pt-4 md:pb-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={reset}
                    disabled={!filtered}
                    className="min-h-10 gap-1.5 px-2 text-xs text-muted hover:text-foreground md:min-h-0"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    Clear filters
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setMobileFiltersOpen(false)}
                    className="min-h-10 md:hidden"
                  >
                    {results.isPending
                      ? 'Show results'
                      : `Show ${displayedCount}`}
                  </Button>
                </div>
              </div>
            </div>
          </aside>

          {/* Right: Main header, prominent search, active chips, and sections / grid */}
          <section aria-label={`${nounPlural} feed`} className="min-w-0 flex-1">
            <header className="mb-5">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {title}
              </h1>
              <p className="mt-1 text-sm text-muted">
                {mode.isPicker
                  ? mode.kind === 'programs'
                    ? 'Choose a Program to use as a starting point.'
                    : 'Choose an Activity to add.'
                  : isMyGroups
                    ? 'Groups you belong to.'
                    : 'Programs, Activities, and open Groups from the community.'}
              </p>
            </header>

            {/* Prominent search + sort row */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search
                    aria-hidden
                    className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted"
                  />
                  <Input
                    aria-label={
                      mode.kind === 'activities'
                        ? 'Search Activities'
                        : 'Search Programs and Activities'
                    }
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        setParam(BROWSE_PARAM.q, query.trim())
                      }
                    }}
                    placeholder={
                      isMyGroups
                        ? 'Search your groups…'
                        : mode.kind === 'activities'
                          ? 'Search activities…'
                          : 'Search programs and activities…'
                    }
                    className="pl-9 pr-10"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery('')
                        setParam(BROWSE_PARAM.q, '')
                      }}
                      className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted transition-colors hover:text-foreground"
                      aria-label="Clear search"
                    >
                      <X className="h-4 w-4" />
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

              {!isMyGroups && (
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
              )}
            </div>

            {/* Active filter chips + result count */}
            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-3.5">
              <div
                aria-label="Active filters"
                className="flex flex-wrap items-center gap-2"
              >
                {activeFilterChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={chip.onRemove}
                    aria-label={`Remove ${chip.label} filter`}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-accent/40 bg-accent/15 px-3 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/20 sm:min-h-0"
                  >
                    <span>{chip.label}</span>
                    <X size={12} aria-hidden />
                  </button>
                ))}
                {activeFilterChips.length > 0 && (
                  <button
                    type="button"
                    onClick={reset}
                    className="min-h-8 px-2 py-1 text-xs font-medium text-muted transition-colors hover:text-foreground sm:min-h-0"
                  >
                    Clear all
                  </button>
                )}
              </div>

              <p role="status" className="ml-auto text-xs font-medium text-muted">
                {isMyGroups && !me.data
                  ? 'Sign in required'
                  : results.isPending
                    ? `Loading ${nounPlural}…`
                    : `${displayedCount} ${displayedCount === 1 ? noun : nounPlural}`}
              </p>
            </div>

            {/* Feed */}
            <div className="mt-5">
              {isMyGroups ? (
                !me.data ? (
                  <EmptyState
                    level={3}
                    title="Sign in to view your groups"
                    description="Join a group from any Program to see it here."
                    action={
                      <Link
                        to={`/login?returnTo=${encodeURIComponent(currentUrl)}`}
                        className="btn btn--primary btn--sm"
                      >
                        Sign in
                      </Link>
                    }
                  />
                ) : (
                  <>
                    <ErrorMessage
                      error={myGroups.error}
                      retry={() => void myGroups.refetch()}
                    />
                    {myGroups.isPending ? (
                      <div
                        className={GRID_CLASS}
                        role="status"
                        aria-label="Loading groups"
                      >
                        {Array.from({ length: 5 }, (_, index) => (
                          <div
                            key={index}
                            className="rounded-xl border border-border/60 bg-surface p-3.5"
                          >
                            <Skeleton className="h-3 w-24" />
                            <Skeleton className="mt-2 h-5 w-2/3" />
                            <Skeleton className="mt-4 h-6 w-1/2" />
                          </div>
                        ))}
                      </div>
                    ) : myGroupItems.length > 0 ? (
                      <ul className={GRID_CLASS}>
                        {myGroupItems.map((group) => (
                          <li key={group.id}>
                            <MyGroupCard group={group} currentUrl={currentUrl} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      !myGroups.error && (
                        <EmptyState
                          level={3}
                          title={
                            search
                              ? 'No groups match your search'
                              : 'You have not joined any groups yet'
                          }
                          description={
                            search
                              ? 'Try a different search term.'
                              : 'Browse All Programs to find an open group to join.'
                          }
                          action={
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setScope('ALL')}
                            >
                              Browse All Programs
                            </Button>
                          }
                        />
                      )
                    )}

                    {myGroupItems.length > 0 && myGroups.hasNextPage && (
                      <div className="mt-6 flex justify-center border-t border-border/60 pt-6">
                        <Button
                          variant="outline"
                          loading={myGroups.isFetchingNextPage}
                          onClick={() => void myGroups.fetchNextPage()}
                        >
                          Load more
                        </Button>
                      </div>
                    )}
                  </>
                )
              ) : (
                <>
                  <ErrorMessage
                    error={results.error}
                    retry={() => void results.refetch()}
                  />

                  {results.isPending ? (
                    <div
                      className={GRID_CLASS}
                      role="status"
                      aria-label={`Loading ${nounPlural}`}
                    >
                      {Array.from({ length: 10 }, (_, index) => (
                        <div
                          key={index}
                          className="flex flex-col gap-2.5 rounded-xl border border-border/60 bg-surface p-3"
                        >
                          <Skeleton className="aspect-video w-full rounded-lg" />
                          <Skeleton className="h-3.5 w-24" />
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-full" />
                        </div>
                      ))}
                    </div>
                  ) : showDirectorySections ? (
                    <div className="space-y-8">
                      {/* 1. Recent Activity (hidden if empty) */}
                      {recentActivityItems.length > 0 && (
                        <section aria-labelledby="section-recent-activity">
                          <div className="mb-3 flex items-baseline justify-between gap-2">
                            <h2
                              id="section-recent-activity"
                              className="font-display text-base font-semibold tracking-tight text-foreground"
                            >
                              Recent Activity
                            </h2>
                          </div>
                          {renderCardGrid(recentActivityItems)}
                        </section>
                      )}

                      {/* 2. Starting Soon (hidden if empty) */}
                      {!startingSoonPrograms.isPending &&
                        startingSoonItems.length > 0 && (
                          <section aria-labelledby="section-starting-soon">
                            <div className="mb-3 flex items-baseline justify-between gap-2">
                              <h2
                                id="section-starting-soon"
                                className="font-display text-base font-semibold tracking-tight text-foreground"
                              >
                                Starting Soon
                              </h2>
                              <button
                                type="button"
                                onClick={() => setScope('STARTING_SOON')}
                                className="text-xs font-medium text-accent hover:underline"
                              >
                                View all
                              </button>
                            </div>
                            {renderCardGrid(startingSoonItems)}
                          </section>
                        )}

                      {/* 3. Programs */}
                      <section aria-labelledby="section-programs">
                        <div className="mb-3 flex items-baseline justify-between gap-2">
                          <h2
                            id="section-programs"
                            className="font-display text-base font-semibold tracking-tight text-foreground"
                          >
                            Programs
                          </h2>
                        </div>
                        {programItems.length > 0 ? (
                          <>
                            {renderCardGrid(programItems)}
                            {programs.hasNextPage && (
                              <div className="mt-5 flex justify-center border-t border-border/60 pt-5">
                                <Button
                                  variant="outline"
                                  loading={programs.isFetchingNextPage}
                                  onClick={() => void programs.fetchNextPage()}
                                >
                                  Load more
                                </Button>
                              </div>
                            )}
                          </>
                        ) : (
                          !programs.error && (
                            <EmptyState
                              level={3}
                              title="No Programs available yet"
                            />
                          )
                        )}
                      </section>

                      {/* 4. Activities (hidden if empty) */}
                      {!activities.isPending && activityItems.length > 0 && (
                        <section aria-labelledby="section-activities">
                          <div className="mb-3 flex items-baseline justify-between gap-2">
                            <h2
                              id="section-activities"
                              className="font-display text-base font-semibold tracking-tight text-foreground"
                            >
                              Activities
                            </h2>
                            <button
                              type="button"
                              onClick={() => switchKind('activities')}
                              className="text-xs font-medium text-accent hover:underline"
                            >
                              View all
                            </button>
                          </div>
                          {renderCardGrid(activityItems.slice(0, 5))}
                        </section>
                      )}
                    </div>
                  ) : items.length > 0 ? (
                    <>
                      {renderCardGrid(items)}
                      {results.hasNextPage && (
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
                    </>
                  ) : (
                    !results.error && (
                      <div className="pt-4">
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
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </Page>
  )
}
