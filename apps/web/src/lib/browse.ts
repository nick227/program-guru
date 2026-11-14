import type { components } from '@project/sdk'

type DiscoverSort = components['schemas']['DiscoverSort']
type DiscoverDuration = components['schemas']['DiscoverDuration']
type ProgramLevel = components['schemas']['ProgramLevel']

export type BrowseKind = 'programs' | 'activities'
export type BrowsePick = 'program' | 'activity'
export type BrowseCreator = 'ALL' | 'PLATFORM' | 'COMMUNITY'
export type BrowseDuration = '' | 'short' | 'medium' | 'long' | 'ongoing'
export type BrowseTiming = 'ALL' | 'STARTING_SOON'

export const BROWSE_PARAM = {
  q: 'q',
  sort: 'sort',
  creator: 'creator',
  category: 'category',
  type: 'type',
  focus: 'focus',
  duration: 'duration',
  timing: 'timing',
  level: 'level',
  session: 'session',
  tags: 'tags',
  facet: 'facet',
  view: 'view',
  /** City of the suggested Place (Activities only). Never a proximity filter (12 §5a). */
  city: 'city',
  /** Default frequency kind of Activities, e.g. DAILY for daily habits (12 §5a). */
  frequency: 'frequency',
} as const

export interface BrowseUrlOptions {
  kind?: BrowseKind
  category?: string
  type?: string
  focus?: string
  duration?: BrowseDuration
  timing?: BrowseTiming
  level?: ProgramLevel | ''
  maxSessionMinutes?: number | null
  tags?: string[]
  pick?: BrowsePick
  programId?: string
  returnTo?: string
}

export interface BrowseFilters {
  q: string
  category: string
  type: string
  focus: string
  level: ProgramLevel | ''
  maxSessionMinutes: string
  tags: string[]
  sort: DiscoverSort
  creator: BrowseCreator
}

const VALID_LEVELS: readonly ProgramLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS']

export function formatProgramLevel(level?: ProgramLevel | null): string | null {
  switch (level) {
    case 'BEGINNER':
      return 'Beginner'
    case 'INTERMEDIATE':
      return 'Intermediate'
    case 'ADVANCED':
      return 'Advanced'
    case 'ALL_LEVELS':
      return 'All levels'
    default:
      return null
  }
}

export function toServerDiscoverDuration(duration: BrowseDuration): DiscoverDuration | undefined {
  switch (duration) {
    case 'short':
      return 'SHORT'
    case 'medium':
      return 'MEDIUM'
    case 'long':
      return 'LONG'
    case 'ongoing':
      return 'ONGOING'
    default:
      return undefined
  }
}

/** Build a `/browse` URL for standalone discovery or picker flows. */
export function buildBrowseUrl(options: BrowseUrlOptions = {}): string {
  const query = new URLSearchParams()
  if (options.kind && options.kind !== 'programs') query.set('kind', options.kind)
  if (options.category) query.set(BROWSE_PARAM.category, options.category)
  if (options.type) query.set(BROWSE_PARAM.type, options.type)
  if (options.focus) query.set(BROWSE_PARAM.focus, options.focus)
  if (options.duration) query.set(BROWSE_PARAM.duration, options.duration)
  if (options.timing && options.timing !== 'ALL') query.set(BROWSE_PARAM.timing, options.timing)
  if (options.level) query.set(BROWSE_PARAM.level, options.level)
  if (options.maxSessionMinutes) query.set(BROWSE_PARAM.session, String(options.maxSessionMinutes))
  if (options.tags?.length) query.set(BROWSE_PARAM.tags, options.tags.join(','))
  if (options.pick) query.set('pick', options.pick)
  if (options.programId) query.set('programId', options.programId)
  if (options.returnTo) query.set('returnTo', options.returnTo)
  const qs = query.toString()
  return qs ? `/browse?${qs}` : '/browse'
}

/** Resolve the duration bucket filter from query params. */
export function resolveBrowseDuration(
  params: URLSearchParams,
  kind: BrowseKind,
): BrowseDuration {
  const raw = params.get(BROWSE_PARAM.duration) ?? ''
  if (raw === 'short' || raw === 'medium' || raw === 'long') return raw
  if (raw === 'ongoing' && kind === 'programs') return raw
  return ''
}

/** Resolve the group timing filter from query params (Program discovery only). */
export function resolveBrowseTiming(
  params: URLSearchParams,
  kind: BrowseKind,
  isPicker = false,
): BrowseTiming {
  if (kind !== 'programs' || isPicker) return 'ALL'
  const raw = params.get(BROWSE_PARAM.timing) ?? ''
  return raw === 'STARTING_SOON' ? 'STARTING_SOON' : 'ALL'
}

export type BrowseDiscoveryScope = 'ALL' | 'STARTING_SOON' | 'MY_GROUPS'

/** Resolve whether the user selected the My Groups view (Program discovery only). */
export function resolveBrowseScope(
  params: URLSearchParams,
  kind: BrowseKind,
  isPicker = false,
): BrowseDiscoveryScope {
  if (kind !== 'programs' || isPicker) return 'ALL'
  if (params.get(BROWSE_PARAM.view) === 'my-groups') return 'MY_GROUPS'
  return resolveBrowseTiming(params, kind, isPicker)
}

/** Match a Program or Activity against the selected duration bucket. */
export function matchesBrowseDuration(
  duration: BrowseDuration,
  kind: BrowseKind,
  item: { durationDays?: number | null; durationMinutes?: number | null },
): boolean {
  if (!duration) return true
  if (kind === 'programs') {
    const days = item.durationDays
    if (duration === 'ongoing') return days == null
    if (days == null) return false
    if (duration === 'short') return days <= 14
    if (duration === 'medium') return days > 14 && days <= 28
    return days > 28
  }
  const minutes = item.durationMinutes
  if (minutes == null) return false
  if (duration === 'short') return minutes <= 15
  if (duration === 'medium') return minutes > 15 && minutes <= 30
  if (duration === 'long') return minutes > 30
  return true
}

/** Resolve composable discovery filters from query params, supporting legacy `?facet=` links. */
export function resolveBrowseFilters(
  params: URLSearchParams,
  kind: BrowseKind,
  lockedProgramTypeId?: string,
): BrowseFilters {
  const legacyFacet = params.get(BROWSE_PARAM.facet) ?? ''
  const rawLevel = params.get(BROWSE_PARAM.level) ?? ''
  const level = VALID_LEVELS.includes(rawLevel as ProgramLevel) ? (rawLevel as ProgramLevel) : ''
  const rawSession = params.get(BROWSE_PARAM.session) ?? ''
  const parsedSession = Number(rawSession)
  const maxSessionMinutes =
    kind === 'programs' && Number.isInteger(parsedSession) && parsedSession > 0
      ? String(parsedSession)
      : ''
  const rawTags = params.get(BROWSE_PARAM.tags) ?? ''
  const tags =
    kind === 'programs'
      ? [...new Set(rawTags.split(',').map((s) => s.trim()).filter(Boolean))]
      : []

  return {
    q: params.get(BROWSE_PARAM.q) ?? '',
    category:
      params.get(BROWSE_PARAM.category) ??
      (kind === 'activities' ? legacyFacet : ''),
    type:
      kind === 'programs'
        ? (lockedProgramTypeId ?? params.get(BROWSE_PARAM.type) ?? '')
        : '',
    focus:
      params.get(BROWSE_PARAM.focus) ??
      (kind === 'programs' ? legacyFacet : ''),
    level: kind === 'programs' ? level : '',
    maxSessionMinutes,
    tags,
    sort: (params.get(BROWSE_PARAM.sort) as DiscoverSort | null) ?? 'POPULAR',
    creator: (params.get(BROWSE_PARAM.creator) as BrowseCreator | null) ?? 'ALL',
  }
}

export function writeBrowseDraft<T>(key: string, value: T) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore storage errors */
  }
}

export function readBrowseDraft<T>(key: string, shouldRestore: boolean): T | null {
  if (!shouldRestore) return null
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function clearBrowseDraft(key: string) {
  try {
    sessionStorage.removeItem(key)
  } catch {
    /* ignore storage errors */
  }
}

/**
 * "How I want to spend my time" shortcuts (12 §5a). Each one is only a preset of existing Community
 * filters (kind, duration, frequency, Domain, city, timing), never another classification.
 */
export type DiscoveryShortcut = {
  key: string
  label: string
  kind: BrowseKind
  set: Record<string, string>
}

export function discoveryShortcuts(input: { domainIdBySlug: Record<string, string>; cities: string[]; hasStartingSoon?: boolean }): DiscoveryShortcut[] {
  const out: DiscoveryShortcut[] = [
    { key: 'quick', label: 'Quick · 15 min', kind: 'activities', set: { [BROWSE_PARAM.duration]: 'short' } },
    { key: 'daily', label: 'Daily habits', kind: 'activities', set: { [BROWSE_PARAM.frequency]: 'DAILY' } },
  ]
  const social = input.domainIdBySlug['relationships']
  if (social) out.push({ key: 'social', label: 'Social', kind: 'activities', set: { [BROWSE_PARAM.category]: social } })
  const outdoors = input.domainIdBySlug['outdoors-nature']
  if (outdoors) out.push({ key: 'outdoors', label: 'Outdoors', kind: 'activities', set: { [BROWSE_PARAM.category]: outdoors } })
  for (const city of input.cities.slice(0, 2)) {
    out.push({ key: `city:${city}`, label: `In ${city}`, kind: 'activities', set: { [BROWSE_PARAM.city]: city } })
  }
  // Shown only when a Program group is actually starting soon.
  if (input.hasStartingSoon) {
    out.push({ key: 'starting-soon', label: 'Starting soon', kind: 'programs', set: { [BROWSE_PARAM.timing]: 'STARTING_SOON' } })
  }
  return out
}

const KIND_ONLY_PARAMS: Record<BrowseKind, string[]> = {
  programs: [BROWSE_PARAM.type, BROWSE_PARAM.timing, BROWSE_PARAM.view, BROWSE_PARAM.level, BROWSE_PARAM.session, BROWSE_PARAM.tags],
  activities: [BROWSE_PARAM.city, BROWSE_PARAM.frequency],
}

export function isShortcutActive(params: URLSearchParams, kind: BrowseKind, shortcut: DiscoveryShortcut): boolean {
  return kind === shortcut.kind && Object.entries(shortcut.set).every(([k, v]) => params.get(k) === v)
}

/** Toggles a shortcut: applying switches to its kind and drops the other kind's filters; toggling off removes only its own values. */
export function toggleShortcut(previous: URLSearchParams, kind: BrowseKind, shortcut: DiscoveryShortcut): URLSearchParams {
  const next = new URLSearchParams(previous)
  next.delete(BROWSE_PARAM.facet)
  if (isShortcutActive(previous, kind, shortcut)) {
    for (const k of Object.keys(shortcut.set)) next.delete(k)
    return next
  }
  const other: BrowseKind = shortcut.kind === 'activities' ? 'programs' : 'activities'
  for (const k of KIND_ONLY_PARAMS[other]) next.delete(k)
  if (shortcut.kind === 'activities') next.set('kind', 'activities')
  else next.delete('kind')
  for (const [k, v] of Object.entries(shortcut.set)) next.set(k, v)
  return next
}
