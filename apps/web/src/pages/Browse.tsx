import { useEffect, useState, type ReactNode } from 'react'
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
  useDiscoverCreators,
  useDiscoverPrograms,
  useFocuses,
  useJoinPublicGroupById,
  useLiveSessions,
  useMyGroups,
  useProgramPrefetch,
  useProgramTypes,
  useProgramWorkspace,
  useTags,
  type components,
} from '@project/sdk'
import {
  CalendarClock,
  Check,
  ChevronDown,
  LayoutGrid,
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
import { ActivityPreviewDrawer } from '@/components/activity/ActivityPreviewDrawer'
import { CreatorPreviewDrawer } from '@/components/social/CreatorPreviewDrawer'
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
import { dateLabel, formatRelativeTime, safeReturn, today } from '@/lib/dates'
import { formatDurationMinutes } from '@/lib/durationMinutes'
import { activityHero, programHero, toHeroCategory, type Hero } from '@/lib/hero'
import { useDocumentTitle } from '@/lib/title'
import { buildGroupUrl, buildProfileUrl } from '@/lib/urls'
import { cn } from '@/lib/utils'

type S = components['schemas']
type Sort = S['DiscoverSort']

const SCROLL_KEY_PREFIX = 'browse-scroll:'
const GRID_CLASS =
  'grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'

type SectionLayout = 'grid' | 'portrait-row' | 'large-cards' | 'feature' | 'action-row' | 'creator-row'
type SectionSource =
  | 'happening-now'
  | 'recent-activity'
  | 'starting-soon'
  | 'programs'
  | 'creators'
  | 'activities'

interface CommunitySectionConfig {
  id: string
  title: string
  source: SectionSource
  layout: SectionLayout
  limit?: number
  onViewAll?: () => void
}

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
  durationMinutes?: number | null
  title: string
  creator: S['UserSummary'] | null
  isPlatform: boolean
  scheduleLine: string | null
  hero: Hero
  featuredGroup?: S['PublicGroupSummary'] | null
  liveSession?: S['LiveSessionSummary'] | null
  participantCount?: number | null
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

function diversifyByVisual(items: BrowseFeedItem[]): BrowseFeedItem[] {
  const picked: BrowseFeedItem[] = []
  const pickedIds = new Set<string>()
  const seenVisuals = new Set<string>()
  const seenCategories = new Set<string>()

  for (const item of items) {
    const visualKey = item.hero.src ? `img:${item.hero.src}` : `cat:${item.hero.category}`
    if (!seenVisuals.has(visualKey) && !seenCategories.has(item.hero.category)) {
      picked.push(item)
      pickedIds.add(item.id)
      seenVisuals.add(visualKey)
      seenCategories.add(item.hero.category)
    }
  }
  for (const item of items) {
    if (pickedIds.has(item.id)) continue
    const visualKey = item.hero.src ? `img:${item.hero.src}` : `cat:${item.hero.category}`
    if (!seenVisuals.has(visualKey)) {
      picked.push(item)
      pickedIds.add(item.id)
      seenVisuals.add(visualKey)
    }
  }
  for (const item of items) {
    if (!pickedIds.has(item.id)) picked.push(item)
  }
  return picked
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
    <div className="border-b border-border/35 py-3.5 first:pt-0 last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wider text-muted transition-colors hover:text-foreground"
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
              'flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[15px] transition-colors duration-fast',
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

function ParticipationAvatars({
  avatars,
}: {
  avatars?: S['UserSummary'][]
}) {
  const list = (avatars ?? []).slice(0, 3)
  if (list.length === 0) return null
  return (
    <span className="flex shrink-0 -space-x-1.5" aria-hidden>
      {list.map((u) => (
        <Avatar
          key={u.id}
          name={u.displayName}
          src={u.avatarUrl}
          size="sm"
          className="h-6 w-6 text-[10px] ring-2 ring-background"
        />
      ))}
    </span>
  )
}

function CreatorAvatar({
  creator,
  creatorName,
  creatorProfileUrl,
  onSelectCreator,
}: {
  creator: S['UserSummary'] | null
  creatorName: string | null
  creatorProfileUrl: string | null
  onSelectCreator?: (handle: string) => void
}) {
  if (!creator) return null

  const avatar = (
    <Avatar
      src={creator.avatarUrl}
      name={creatorName ?? undefined}
      size="md"
      className="h-9 w-9 transition-opacity hover:opacity-85"
    />
  )

  if (onSelectCreator && creator.handle) {
    return (
      <button
        type="button"
        onClick={() => onSelectCreator(creator.handle)}
        aria-label={creatorName ?? 'Preview creator'}
        className="mt-0.5 shrink-0"
      >
        {avatar}
      </button>
    )
  }

  if (creatorProfileUrl) {
    return (
      <Link
        to={creatorProfileUrl}
        aria-label={creatorName ?? 'Creator profile'}
        className="mt-0.5 shrink-0"
      >
        {avatar}
      </Link>
    )
  }

  return <span className="mt-0.5 shrink-0">{avatar}</span>
}

function CreatorRowCard({
  creator,
  programs = [],
  onSelect,
}: {
  creator: S['UserSummary']
  programs?: BrowseFeedItem[]
  onSelect: (handle: string) => void
}) {
  const thumbs = programs.slice(0, 3)

  return (
    <button
      type="button"
      onClick={() => onSelect(creator.handle)}
      className="group flex w-72 shrink-0 snap-start flex-col gap-3 rounded-xl p-2 text-left transition-colors hover:bg-surface-muted/35 sm:w-80"
    >
      <div className="flex items-center gap-3">
        <Avatar
          src={creator.avatarUrl}
          name={creator.displayName || creator.handle}
          size="md"
          className="h-11 w-11 shrink-0 transition-transform duration-200 group-hover:scale-105"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-semibold text-foreground transition-colors group-hover:text-accent">
            {creator.displayName || `@${creator.handle}`}
          </p>
          <p className="truncate text-sm text-muted">@{creator.handle}</p>
        </div>
      </div>

      {thumbs.length > 0 && (
        <div
          className={cn(
            'grid gap-2',
            thumbs.length === 1
              ? 'grid-cols-1'
              : thumbs.length === 2
                ? 'grid-cols-2'
                : 'grid-cols-3',
          )}
        >
          {thumbs.map((prog) => (
            <div
              key={prog.id}
              className="browse-thumb aspect-video overflow-hidden rounded-xl bg-surface-muted"
            >
              <EntityHero
                hero={prog.hero}
                size="card"
                interactive={false}
                showVideoBadge={false}
                className="h-full w-full rounded-none"
              />
            </div>
          ))}
        </div>
      )}
    </button>
  )
}

function BrowseFeedTile({
  item,
  actionLabel,
  isPicker,
  currentUrl,
  signedIn,
  joinedIds,
  joiningGroupId,
  onQuickJoin,
  onJoinSession,
  onSelectCreator,
  isAdded = false,
  isAdding = false,
  onDoNow,
  isActionRow = false,
  aspect = 'video',
  titleSize = 'base',
}: {
  item: BrowseFeedItem
  actionLabel: string
  isPicker?: boolean
  currentUrl: string
  signedIn: boolean
  joinedIds: Set<string>
  joiningGroupId: string | null
  onQuickJoin: (groupId: string) => void
  onJoinSession?: (session: S['LiveSessionSummary']) => void
  onSelectCreator?: (handle: string) => void
  isAdded?: boolean
  isAdding?: boolean
  onDoNow?: (item: BrowseFeedItem) => void
  isActionRow?: boolean
  aspect?: 'video' | 'portrait'
  titleSize?: 'base' | 'lg' | 'xl'
}) {
  const live = !isPicker ? item.liveSession ?? null : null
  const g = !isPicker && !live && item.featuredGroup?.visibility === 'PUBLIC' ? item.featuredGroup : null
  const groupName = g ? (g.name?.trim() || `${item.title} group`) : null
  const isMember = !!g && (g.viewerIsMember || joinedIds.has(g.id))
  const canQuickJoin = !!g && !isMember && g.joinPolicy === 'OPEN'
  const recentCheckIns = g?.recentCheckInCount ?? 0
  const groupSchedule = g?.startLocalDate ? `Starts ${dateLabel(g.startLocalDate)}` : null

  const creatorName = item.creator?.displayName || (item.isPlatform ? 'Program.Guru' : null)
  const creatorProfileUrl = item.creator?.handle
    ? buildProfileUrl(item.creator.handle)
    : null

  const [hovered, setHovered] = useState(false)
  const videoPlaybackUrl =
    item.hero.media?.type === 'VIDEO' ? item.hero.media.playbackUrl ?? null : null
  const videoPosterUrl =
    item.hero.media?.posterUrl ?? item.hero.src ?? undefined

  const titleClass =
    titleSize === 'xl'
      ? 'line-clamp-2 font-display text-xl font-semibold leading-[1.35] tracking-[-0.02em] text-foreground transition-colors group-hover:text-accent sm:text-2xl'
      : titleSize === 'lg'
        ? 'line-clamp-2 font-display text-lg font-semibold leading-[1.35] tracking-[-0.015em] text-foreground transition-colors hover:text-accent sm:text-[18px]'
        : 'line-clamp-2 font-display text-base font-semibold leading-[1.35] tracking-[-0.015em] text-foreground transition-colors hover:text-accent sm:text-[17px]'

  const mediaNode = (
    <button
      type="button"
      aria-label={`${actionLabel}: ${item.title}`}
      onClick={item.onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      className="group block w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div
        className={cn(
          'browse-thumb relative w-full overflow-hidden rounded-xl bg-surface-muted',
          aspect === 'portrait' ? 'aspect-[3/4]' : 'aspect-video',
        )}
      >
        <EntityHero
          hero={item.hero}
          size="card"
          interactive={false}
          showVideoBadge={false}
          className="h-full w-full rounded-none transition-transform duration-200 ease-out group-hover:scale-[1.015]"
        />
        {hovered && videoPlaybackUrl && (
          <video
            src={videoPlaybackUrl}
            poster={videoPosterUrl}
            muted
            playsInline
            autoPlay
            loop
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </div>
    </button>
  )

  const participantCount = item.participantCount ?? 0

  const metaNode = (
    <div className={cn('flex items-start gap-3', titleSize !== 'xl' && 'mt-3.5')}>
      <CreatorAvatar
        creator={item.creator}
        creatorName={creatorName}
        creatorProfileUrl={creatorProfileUrl}
        onSelectCreator={onSelectCreator}
      />

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={item.onSelect}
          className="block w-full rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <h3 className={titleClass}>{item.title}</h3>
        </button>

        {creatorName && (
          <div className="mt-1">
            {onSelectCreator && item.creator?.handle ? (
              <button
                type="button"
                onClick={() => onSelectCreator(item.creator!.handle)}
                className="inline-block max-w-full truncate rounded text-left text-sm font-medium text-foreground/85 transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {creatorName}
              </button>
            ) : creatorProfileUrl ? (
              <Link
                to={creatorProfileUrl}
                className="inline-block max-w-full truncate text-sm font-medium text-foreground/85 transition-colors hover:text-foreground"
              >
                {creatorName}
              </Link>
            ) : (
              <p className="truncate text-sm font-medium text-foreground/75">
                {creatorName}
              </p>
            )}
          </div>
        )}

        {(item.scheduleLine || (!g && participantCount > 0)) && (
          <p className="mt-0.5 truncate text-[13px] text-muted">
            {[
              item.scheduleLine,
              !g && participantCount > 0
                ? `${participantCount} ${participantCount === 1 ? 'participant' : 'participants'}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}

        {live && (
          <div className="mt-2.5 space-y-3">
            <div className="flex items-center gap-2.5">
              <ParticipationAvatars avatars={live.participants} />
              <p className="min-w-0 truncate text-sm text-foreground/85">
                <span className="font-medium">
                  {live.activeCount} {live.activeCount === 1 ? 'person' : 'people'} in session
                </span>
                <span className="text-muted">
                  {' · '}Started {formatRelativeTime(live.startedAt)}
                </span>
              </p>
            </div>

            {signedIn && onJoinSession ? (
              <button
                type="button"
                disabled={joiningGroupId === live.groupId}
                aria-label={`Join session for ${item.title}`}
                onClick={() => onJoinSession(live)}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-accent px-5 py-2.5 text-[15px] font-semibold text-accent-fg shadow-sm transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                {joiningGroupId === live.groupId ? 'Joining session…' : 'Join Session'}
              </button>
            ) : (
              <Link
                to={buildGroupUrl(live.groupId, { returnTo: currentUrl })}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-accent px-5 py-2.5 text-[15px] font-semibold text-accent-fg shadow-sm transition-colors hover:bg-accent/90"
              >
                Join Session
              </Link>
            )}
          </div>
        )}

        {isActionRow && !live && !g && item.kind === 'activities' && (
          <div className="mt-4">
            {signedIn && onDoNow ? (
              isAdded ? (
                <Link
                  to="/"
                  className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-border/70 bg-surface-raised px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted"
                >
                  <Check size={15} aria-hidden />
                  <span>Scheduled · Open</span>
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={isAdding}
                  aria-label={`Do ${item.title} now`}
                  onClick={() => onDoNow(item)}
                  className="inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-border/70 bg-surface-raised px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted disabled:opacity-50"
                >
                  {isAdding ? 'Starting…' : 'Do Now'}
                </button>
              )
            ) : (
              <Link
                to={`/activities/${item.id}?returnTo=${encodeURIComponent(currentUrl)}`}
                className="inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-border/70 bg-surface-raised px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted"
              >
                Do Now
              </Link>
            )}
          </div>
        )}

        {g && groupName && (
          <div className={cn('mt-3', isActionRow ? 'space-y-3' : 'flex items-center justify-between gap-2')}>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <ParticipationAvatars avatars={g.memberAvatars} />
              <p className="min-w-0 truncate text-sm text-muted">
                {groupName} · {g.memberCount}{' '}
                {g.memberCount === 1 ? 'member' : 'members'}
                {recentCheckIns > 0
                  ? ` · ${recentCheckIns} recent ${recentCheckIns === 1 ? 'check-in' : 'check-ins'}`
                  : ''}
                {groupSchedule ? ` · ${groupSchedule}` : ''}
              </p>
            </div>

            {isActionRow ? (
              signedIn && onJoinSession ? (
                <button
                  type="button"
                  disabled={joiningGroupId === g.id}
                  aria-label={`Open session for ${item.title}`}
                  onClick={() =>
                    onJoinSession({
                      groupId: g.id,
                      groupName: g.name,
                      programId: g.programId,
                      programTitle: g.programTitle,
                      activityTitle: item.title,
                      durationMinutes: item.durationMinutes ?? null,
                      thumbnailUrl: null,
                      categoryId: '',
                      activeCount: 1,
                      participants: g.memberAvatars ?? [],
                      startedAt: new Date().toISOString(),
                      lastActiveAt: new Date().toISOString(),
                      viewerIsMember: isMember,
                      joinPolicy: g.joinPolicy,
                    })
                  }
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-accent px-5 py-2.5 text-[15px] font-semibold text-accent-fg shadow-sm transition-colors hover:bg-accent/90 disabled:opacity-50"
                >
                  {joiningGroupId === g.id
                    ? 'Opening stage…'
                    : isMember
                      ? 'Open Stage'
                      : 'Join Session'}
                </button>
              ) : (
                <Link
                  to={buildGroupUrl(g.id, { returnTo: currentUrl })}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-accent px-5 py-2.5 text-[15px] font-semibold text-accent-fg shadow-sm transition-colors hover:bg-accent/90"
                >
                  Join Session
                </Link>
              )
            ) : (
              canQuickJoin &&
              (signedIn ? (
                <button
                  type="button"
                  disabled={joiningGroupId === g.id}
                  aria-label={`Join ${groupName}`}
                  onClick={() => onQuickJoin(g.id)}
                  className="shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold text-accent transition-colors hover:bg-accent/15 disabled:opacity-50"
                >
                  {joiningGroupId === g.id ? 'Joining…' : 'Join'}
                </button>
              ) : (
                <Link
                  to={buildGroupUrl(g.id, { returnTo: currentUrl })}
                  aria-label={`Join ${groupName}`}
                  className="shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold text-accent transition-colors hover:bg-accent/15"
                >
                  Join
                </Link>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )

  if (titleSize === 'xl') {
    return (
      <article className="grid grid-cols-1 items-center gap-6 md:grid-cols-12">
        <div className="md:col-span-7">{mediaNode}</div>
        <div className="min-w-0 md:col-span-5">{metaNode}</div>
      </article>
    )
  }

  return (
    <article className="flex flex-col">
      {mediaNode}
      {metaNode}
    </article>
  )
}

function MyGroupTile({
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
    <Link
      to={buildGroupUrl(group.id, { returnTo: currentUrl })}
      aria-label={`Open Group ${groupName}`}
      className="group flex flex-col gap-1.5 rounded-lg py-1 transition-colors"
    >
      <p className="truncate text-[13px] text-muted">{group.programTitle}</p>
      <h3 className="truncate font-display text-[15px] font-semibold text-foreground transition-colors group-hover:text-accent">
        {groupName}
      </h3>
      <div className="flex items-center gap-2">
        <ParticipationAvatars avatars={group.memberAvatars} />
        <p className="min-w-0 truncate text-xs text-muted">
          {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
          {recentCheckIns > 0
            ? ` · ${recentCheckIns} recent ${recentCheckIns === 1 ? 'check-in' : 'check-ins'}`
            : ''}
          {groupSchedule ? ` · ${groupSchedule}` : ''}
        </p>
      </div>
    </Link>
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
  const [showAllPrograms, setShowAllPrograms] = useState(false)
  const [previewActivityId, setPreviewActivityId] = useState<string | null>(null)
  const [previewCreatorHandle, setPreviewCreatorHandle] = useState<string | null>(null)
  const me = useCurrentUser()
  const myGroups = useMyGroups(!!me.data && !mode.isPicker && mode.kind === 'programs')
  const joinGroup = useJoinPublicGroupById()
  const addCalendarItem = useAddCalendarItem()
  const [joinedGroupIds, setJoinedGroupIds] = useState<Set<string>>(() => new Set())
  const [joiningGroupId, setJoiningGroupId] = useState<string | null>(null)
  const [addedActivityIds, setAddedActivityIds] = useState<Set<string>>(() => new Set())
  const [addingActivityId, setAddingActivityId] = useState<string | null>(null)

  const handleDoNow = async (item: BrowseFeedItem) => {
    if (addingActivityId) return
    setAddingActivityId(item.id)
    try {
      const result = await addCalendarItem.mutateAsync({
        activityId: item.id,
        revisionId: item.revisionId ?? undefined,
        localDate: today(
          me.data?.data.preferences.timezone ??
            Intl.DateTimeFormat().resolvedOptions().timeZone,
        ),
        idempotencyKey: crypto.randomUUID(),
      })
      setAddedActivityIds((prev) => new Set(prev).add(item.id))
      saveBrowseScroll(currentUrl)
      navigate(`/occurrences/${result.item.id}?returnTo=${encodeURIComponent(currentUrl)}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start activity')
    } finally {
      setAddingActivityId(null)
    }
  }

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

  const handleJoinSession = async (session: S['LiveSessionSummary']) => {
    const alreadyMember =
      session.viewerIsMember || joinedGroupIds.has(session.groupId)
    if (alreadyMember) {
      saveBrowseScroll(currentUrl)
      navigate(buildGroupUrl(session.groupId, { returnTo: currentUrl }))
      return
    }
    if (joiningGroupId) return
    setJoiningGroupId(session.groupId)
    try {
      await joinGroup.mutateAsync({ groupId: session.groupId })
      setJoinedGroupIds((prev) => new Set(prev).add(session.groupId))
      saveBrowseScroll(currentUrl)
      navigate(buildGroupUrl(session.groupId, { returnTo: currentUrl }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not join session')
    } finally {
      setJoiningGroupId(null)
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
    limit: 4,
    enabled: showDirectorySections,
  })

  const activities = useDiscoverActivities({
    q: search,
    categoryId: categoryId || undefined,
    focusId: focusId || undefined,
    sort,
    enabled: mode.kind === 'activities' || showDirectorySections,
  })

  const liveSessions = useLiveSessions(showDirectorySections)
  const creatorsQuery = useDiscoverCreators({
    q: search,
    enabled: showDirectorySections || (!!search && !mode.isPicker),
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
    participantCount?: number | null,
  ): BrowseFeedItem => {
    const scheduleParts = [
      program.sessionMinutes ? `${program.sessionMinutes} min` : null,
      program.frequencyLabel || null,
      formatProgramDuration(program.durationDays),
    ].filter(Boolean)

    return {
      id: program.id,
      kind: 'programs',
      title: program.title,
      creator: program.creator ?? null,
      isPlatform: program.isPlatform,
      scheduleLine: scheduleParts.length > 0 ? scheduleParts.join(' · ') : null,
      hero: programHero(program, categorySlugOf),
      featuredGroup,
      participantCount: participantCount ?? null,
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
    }
  }

  const mapActivityItem = (
    activity: S['ActivitySummary'],
    featuredGroup: S['PublicGroupSummary'] | null = null,
    participantCount?: number | null,
  ): BrowseFeedItem => {
    const scheduleParts = [
      formatDurationMinutes(activity.durationMinutes),
      formatFrequency(activity.frequency) || null,
    ].filter(Boolean)

    return {
      id: activity.id,
      kind: 'activities',
      revisionId: activity.revisionId,
      durationMinutes: activity.durationMinutes,
      title: activity.title,
      creator: activity.creator ?? null,
      isPlatform: activity.isPlatform,
      scheduleLine: scheduleParts.length > 0 ? scheduleParts.join(' · ') : null,
      hero: activityHero(activity, categorySlugOf),
      featuredGroup,
      participantCount: participantCount ?? null,
      onSelect: () => {
        if (mode.isPicker && mode.onPickActivity && mode.kind === 'activities') {
          mode.onPickActivity(activity)
        } else {
          setPreviewActivityId(activity.id)
        }
      },
    }
  }

  const programItems: BrowseFeedItem[] = (programs.data?.pages ?? [])
    .flatMap((page) =>
      page.data.flatMap((d) =>
        d.program
          ? [
              {
                program: d.program,
                featuredGroup: d.featuredGroup ?? null,
                participantCount: d.participantCount ?? null,
              },
            ]
          : [],
      ),
    )
    .filter(({ program }) => keep(program))
    .map(({ program, featuredGroup, participantCount }) =>
      mapProgramItem(program, featuredGroup, participantCount),
    )

  const activityItems: BrowseFeedItem[] = (activities.data?.pages ?? [])
    .flatMap((page) =>
      page.data.flatMap((d) =>
        d.activity
          ? [
              {
                activity: d.activity,
                featuredGroup: d.featuredGroup ?? null,
                participantCount: d.participantCount ?? null,
              },
            ]
          : [],
      ),
    )
    .filter(({ activity }) => (mode.kind === 'activities' ? keep(activity) : true))
    .map(({ activity, featuredGroup, participantCount }) =>
      mapActivityItem(activity, featuredGroup, participantCount),
    )

  const liveSessionItems: BrowseFeedItem[] = (liveSessions.data ?? [])
    .slice(0, 4)
    .map((session) => {
      const scheduleParts = [
        session.groupName || session.programTitle,
        formatDurationMinutes(session.durationMinutes),
      ].filter(Boolean)

      return {
        id: session.groupId,
        kind: 'programs',
        durationMinutes: session.durationMinutes,
        title: session.activityTitle,
        creator: session.participants[0] ?? null,
        isPlatform: false,
        scheduleLine: scheduleParts.length > 0 ? scheduleParts.join(' · ') : null,
        hero: activityHero(
          {
            title: session.activityTitle,
            thumbnailUrl: session.thumbnailUrl,
            coverMedia: session.coverMedia ?? null,
            categoryId: session.categoryId,
          },
          categorySlugOf,
        ),
        liveSession: session,
        onSelect: () => {
          saveBrowseScroll(currentUrl)
          navigate(buildGroupUrl(session.groupId, { returnTo: currentUrl }))
        },
      }
    })

  const liveGroupIds = new Set(liveSessionItems.map((item) => item.id))
  const openGroupSessionItems: BrowseFeedItem[] = programItems
    .filter(
      (item) =>
        item.featuredGroup?.visibility === 'PUBLIC' &&
        item.featuredGroup.joinPolicy === 'OPEN' &&
        !liveGroupIds.has(item.featuredGroup.id),
    )
    .sort((a, b) => {
      const aCheckIns = a.featuredGroup?.recentCheckInCount ?? 0
      const bCheckIns = b.featuredGroup?.recentCheckInCount ?? 0
      if (bCheckIns !== aCheckIns) return bCheckIns - aCheckIns
      return (b.featuredGroup?.memberCount ?? 0) - (a.featuredGroup?.memberCount ?? 0)
    })

  const sortedQuickActivities: BrowseFeedItem[] = [...activityItems].sort((a, b) => {
    const aQuick = a.durationMinutes != null && a.durationMinutes <= 20 ? 0 : 1
    const bQuick = b.durationMinutes != null && b.durationMinutes <= 20 ? 0 : 1
    if (aQuick !== bQuick) return aQuick - bQuick
    return (a.durationMinutes ?? 999) - (b.durationMinutes ?? 999)
  })

  const quickActivityItems: BrowseFeedItem[] = diversifyByVisual(sortedQuickActivities)

  const happeningNowItems: BrowseFeedItem[] = [
    ...liveSessionItems,
    ...openGroupSessionItems,
    ...quickActivityItems,
  ].slice(0, 4)

  const happeningNowActivityIds = new Set(
    happeningNowItems.filter((item) => item.kind === 'activities').map((item) => item.id),
  )
  const uniqueBottomActivities = activityItems.filter(
    (item) => !happeningNowActivityIds.has(item.id),
  )
  const bottomActivityItems = diversifyByVisual(
    uniqueBottomActivities.length >= 4 ? uniqueBottomActivities : activityItems,
  )

  const recentActivityItems: BrowseFeedItem[] = programItems
    .filter(
      (item) =>
        item.featuredGroup?.visibility === 'PUBLIC' &&
        ((item.featuredGroup.recentCheckInCount ?? 0) > 0 ||
          !!item.featuredGroup.latestCheckIn),
    )
    .slice(0, 4)

  const startingSoonItems: BrowseFeedItem[] = (startingSoonPrograms.data?.pages ?? [])
    .flatMap((page) =>
      page.data.flatMap((d) =>
        d.program
          ? [
              {
                program: d.program,
                featuredGroup: d.featuredGroup ?? null,
                participantCount: d.participantCount ?? null,
              },
            ]
          : [],
      ),
    )
    .slice(0, 4)
    .map(({ program, featuredGroup, participantCount }) =>
      mapProgramItem(program, featuredGroup, participantCount),
    )

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
      label: categoryLabelOf(categoryId) ?? 'Domain',
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
      label: focusLabelOf(focusId) ?? 'Category',
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
      label: 'All domains',
      icon: <LayoutGrid size={15} aria-hidden />,
    },
    // `custom` is the authoring fallback, never a discovery Domain (02-DOMAIN §2).
    ...(categories.data ?? []).filter((c) => c.slug !== 'custom').map((c) => ({
      value: c.id,
      label: c.label,
      icon: <CategoryIcon category={toHeroCategory(c.slug)} size={15} />,
    })),
  ]

  const displayedCount = isMyGroups ? myGroupItems.length : items.length
  const myGroupsCount = me.data && !myGroups.isPending ? myGroupItems.length : null

  const renderSectionLayout = (
    tileItems: BrowseFeedItem[],
    layout: SectionLayout = 'grid',
  ) => {
    const isRow = layout === 'portrait-row' || layout === 'action-row'
    const listClass = isRow
      ? 'browse-sidebar-scroll flex gap-7 overflow-x-auto pb-4 snap-x snap-mandatory'
      : layout === 'large-cards'
        ? 'grid grid-cols-1 gap-x-8 gap-y-12 md:grid-cols-2'
        : layout === 'feature'
          ? 'block'
          : GRID_CLASS

    const aspect = layout === 'portrait-row' ? 'portrait' : 'video'
    const titleSize =
      layout === 'feature'
        ? 'xl'
        : layout === 'large-cards' || layout === 'action-row'
          ? 'lg'
          : 'base'
    const visibleItems = layout === 'feature' ? tileItems.slice(0, 1) : tileItems

    return (
      <ul className={listClass}>
        {visibleItems.map((item) => (
          <li
            key={`${item.kind}:${item.id}`}
            className={
              layout === 'portrait-row'
                ? 'w-48 shrink-0 snap-start sm:w-52'
                : layout === 'action-row'
                  ? 'w-[290px] shrink-0 snap-start sm:w-[320px] lg:w-[340px]'
                  : undefined
            }
            onPointerEnter={() => {
              if (item.kind === 'programs') prefetchProgram(item.id)
            }}
            onFocus={() => {
              if (item.kind === 'programs') prefetchProgram(item.id)
            }}
          >
            <BrowseFeedTile
              item={item}
              isActionRow={layout === 'action-row'}
              isAdded={addedActivityIds.has(item.id)}
              isAdding={addingActivityId === item.id}
              onDoNow={(act) => void handleDoNow(act)}
              aspect={aspect}
              titleSize={titleSize}
              actionLabel={
                mode.isPicker
                  ? mode.actionLabel
                  : item.liveSession
                    ? 'Join Session'
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
              onJoinSession={(session) => void handleJoinSession(session)}
              onSelectCreator={
                mode.isPicker ? undefined : (handle) => setPreviewCreatorHandle(handle)
              }
            />
          </li>
        ))}
      </ul>
    )
  }

  const creatorItems: S['UserSummary'][] = (creatorsQuery.data?.pages ?? []).flatMap(
    (page) => page.data.flatMap((d) => (d.creator ? [d.creator] : [])),
  )

  const sectionItemsBySource: Record<SectionSource, BrowseFeedItem[]> = {
    'happening-now':
      liveSessions.isPending && activities.isPending ? [] : happeningNowItems,
    'recent-activity': recentActivityItems,
    'starting-soon': startingSoonPrograms.isPending ? [] : startingSoonItems,
    programs: programItems,
    creators: [],
    activities: activities.isPending ? [] : bottomActivityItems,
  }

  const communitySections: CommunitySectionConfig[] = [
    {
      id: 'happening-now',
      title: 'Happening Now',
      source: 'happening-now',
      layout: 'action-row',
      limit: 4,
    },
    {
      id: 'programs',
      title: 'Programs',
      source: 'programs',
      layout: 'grid',
      limit: showAllPrograms ? undefined : 8,
      onViewAll:
        !showAllPrograms && programItems.length > 8
          ? () => setShowAllPrograms(true)
          : undefined,
    },
    {
      id: 'creators',
      title: 'Creators',
      source: 'creators',
      layout: 'creator-row',
      limit: 10,
    },
    {
      id: 'activities',
      title: 'Activities',
      source: 'activities',
      layout: 'portrait-row',
      limit: 10,
      onViewAll: () => switchKind('activities'),
    },
  ]

  return (
    <Page className="max-w-none px-5 pb-24 sm:px-8 lg:px-12">
      <div className="mx-auto w-full">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-10 lg:gap-12">
          {/* Left: Compact 216px sticky sidebar on desktop, slide-over drawer on mobile */}
          <aside
            aria-label="Filters"
            className="w-full shrink-0 md:sticky md:top-20 md:w-[216px]"
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

              <div className="browse-sidebar-scroll relative z-10 flex h-full w-[min(20rem,86vw)] flex-col overflow-y-auto border-r border-border bg-surface p-5 shadow-md md:h-auto md:max-h-[calc(100vh-6.5rem)] md:w-auto md:border-r md:border-border/35 md:bg-transparent md:p-0 md:pr-6 md:shadow-none">
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
                      <FilterGroup title="Domain" defaultOpen>
                        <FilterOptionList
                          ariaLabel="Domain"
                          options={categoryOptions}
                          value={categoryId}
                          onChange={handleCategoryChange}
                          showCheckmark
                        />
                      </FilterGroup>
                    )}

                  {/* Collapsed by default unless active */}
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
                    <FilterGroup title="Category" defaultOpen={!!focusId}>
                      <FilterOptionList
                        ariaLabel="Filter by category"
                        options={[
                          { value: '', label: 'All categories' },
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

          {/* Right: Prominent search, active chips, and borderless tiles */}
          <section aria-label={`${nounPlural} feed`} className="min-w-0 flex-1">
            {mode.isPicker ? (
              <header className="mb-4">
                <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  {title}
                </h1>
              </header>
            ) : (
              <h1 className="sr-only">{title}</h1>
            )}

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
            <div className="mt-7">
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
                        {Array.from({ length: 4 }, (_, index) => (
                          <div key={index} className="space-y-2">
                            <Skeleton className="h-3 w-24" />
                            <Skeleton className="h-5 w-2/3" />
                            <Skeleton className="h-4 w-1/2" />
                          </div>
                        ))}
                      </div>
                    ) : myGroupItems.length > 0 ? (
                      <ul className={GRID_CLASS}>
                        {myGroupItems.map((group) => (
                          <li key={group.id}>
                            <MyGroupTile group={group} currentUrl={currentUrl} />
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
                      <div className="mt-10 flex justify-center border-t border-border/50 pt-6">
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
                    showDirectorySections ? (
                      <div
                        className="space-y-16"
                        role="status"
                        aria-label="Loading Community"
                      >
                        <div className="space-y-6">
                          <Skeleton className="h-7 w-40" />
                          <div className="flex gap-7 overflow-hidden">
                            {Array.from({ length: 4 }, (_, index) => (
                              <div
                                key={index}
                                className="w-[290px] shrink-0 space-y-3.5 sm:w-[320px] lg:w-[340px]"
                              >
                                <Skeleton className="aspect-video w-full rounded-xl" />
                                <Skeleton className="h-5 w-3/4" />
                                <Skeleton className="h-4 w-1/2" />
                                <Skeleton className="h-10 w-full rounded-lg" />
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-6">
                          <Skeleton className="h-7 w-28" />
                          <div className={GRID_CLASS}>
                            {Array.from({ length: 8 }, (_, index) => (
                              <div key={index} className="flex flex-col gap-3.5">
                                <Skeleton className="aspect-video w-full rounded-xl" />
                                <div className="flex items-start gap-3">
                                  <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                                  <div className="flex-1 space-y-2">
                                    <Skeleton className="h-4 w-4/5" />
                                    <Skeleton className="h-3.5 w-1/2" />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={GRID_CLASS}
                        role="status"
                        aria-label={`Loading ${nounPlural}`}
                      >
                        {Array.from({ length: 8 }, (_, index) => (
                          <div key={index} className="flex flex-col gap-3.5">
                            <Skeleton className="aspect-video w-full rounded-xl" />
                            <div className="flex items-start gap-3">
                              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                              <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-4/5" />
                                <Skeleton className="h-3.5 w-1/2" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : showDirectorySections ? (
                    <div className="space-y-16">
                      {communitySections.map((section) => {
                        if (section.source === 'creators') {
                          const visibleCreators = section.limit
                            ? creatorItems.slice(0, section.limit)
                            : creatorItems
                          if (visibleCreators.length < 2) return null
                          return (
                            <section
                              key={section.id}
                              aria-labelledby={`section-${section.id}`}
                              className="border-t border-border/35 pt-14"
                            >
                              <div className="mb-6 flex items-baseline justify-between gap-3">
                                <h2
                                  id={`section-${section.id}`}
                                  className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
                                >
                                  {section.title}
                                </h2>
                              </div>
                              <ul className="browse-sidebar-scroll flex gap-6 overflow-x-auto pb-4 snap-x snap-mandatory">
                                {visibleCreators.map((c) => (
                                  <li key={c.id}>
                                    <CreatorRowCard
                                      creator={c}
                                      programs={programItems.filter(
                                        (p) => p.creator?.id === c.id,
                                      )}
                                      onSelect={(h) => setPreviewCreatorHandle(h)}
                                    />
                                  </li>
                                ))}
                              </ul>
                            </section>
                          )
                        }

                        const raw = sectionItemsBySource[section.source]
                        const sectionItems = section.limit
                          ? raw.slice(0, section.limit)
                          : raw
                        if (sectionItems.length === 0) return null

                        return (
                          <section
                            key={section.id}
                            aria-labelledby={`section-${section.id}`}
                            className={cn(
                              section.source === 'activities' &&
                                'border-t border-border/35 pt-14',
                            )}
                          >
                            <div className="mb-6 flex items-baseline justify-between gap-3">
                              <h2
                                id={`section-${section.id}`}
                                className="font-display text-[22px] font-semibold tracking-[-0.02em] text-foreground sm:text-2xl"
                              >
                                {section.title}
                              </h2>
                              {section.onViewAll && (
                                <button
                                  type="button"
                                  onClick={section.onViewAll}
                                  className="text-sm font-medium text-accent hover:underline"
                                >
                                  View all
                                </button>
                              )}
                            </div>

                            {renderSectionLayout(sectionItems, section.layout)}

                            {section.source === 'programs' &&
                              programs.hasNextPage && (
                                <div className="mt-12 flex justify-center border-t border-border/40 pt-8">
                                  <Button
                                    variant="outline"
                                    loading={programs.isFetchingNextPage}
                                    onClick={() =>
                                      void programs.fetchNextPage()
                                    }
                                  >
                                    Load more
                                  </Button>
                                </div>
                              )}
                          </section>
                        )
                      })}
                    </div>
                  ) : items.length > 0 || (!!search && !mode.isPicker && creatorItems.length > 0) ? (
                    <div className="space-y-12">
                      {!!search && !mode.isPicker && creatorItems.length > 0 && (
                        <section aria-labelledby="section-search-creators">
                          <h2
                            id="section-search-creators"
                            className="mb-4 font-display text-lg font-semibold tracking-tight text-foreground"
                          >
                            Creators
                          </h2>
                          <ul className="browse-sidebar-scroll flex gap-6 overflow-x-auto pb-3 snap-x snap-mandatory">
                            {creatorItems.slice(0, 8).map((c) => (
                              <li key={c.id}>
                                <CreatorRowCard
                                  creator={c}
                                  programs={programItems.filter(
                                    (p) => p.creator?.id === c.id,
                                  )}
                                  onSelect={(h) => setPreviewCreatorHandle(h)}
                                />
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}
                      {items.length > 0 && renderSectionLayout(items, 'grid')}
                      {results.hasNextPage && (
                        <div className="mt-10 flex justify-center border-t border-border/50 pt-6">
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

      <ActivityPreviewDrawer
        activityId={previewActivityId}
        currentUrl={currentUrl}
        onClose={() => setPreviewActivityId(null)}
      />

      <CreatorPreviewDrawer
        handle={previewCreatorHandle}
        currentUrl={currentUrl}
        onClose={() => setPreviewCreatorHandle(null)}
        onSelectActivity={(id) => setPreviewActivityId(id)}
      />
    </Page>
  )
}
