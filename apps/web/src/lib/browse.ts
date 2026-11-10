import type { components } from '@project/sdk'

type DiscoverSort = components['schemas']['DiscoverSort']

export type BrowseKind = 'programs' | 'activities'
export type BrowsePick = 'program' | 'activity'
export type BrowseCreator = 'ALL' | 'PLATFORM' | 'COMMUNITY'
export type BrowseDuration = '' | 'short' | 'medium' | 'long' | 'ongoing'

export const BROWSE_PARAM = {
  q: 'q',
  sort: 'sort',
  creator: 'creator',
  category: 'category',
  type: 'type',
  focus: 'focus',
  duration: 'duration',
  facet: 'facet',
} as const

export interface BrowseUrlOptions {
  kind?: BrowseKind
  category?: string
  type?: string
  focus?: string
  duration?: BrowseDuration
  pick?: BrowsePick
  programId?: string
  returnTo?: string
}

export interface BrowseFilters {
  q: string
  category: string
  type: string
  focus: string
  sort: DiscoverSort
  creator: BrowseCreator
}

/** Build a `/browse` URL for standalone discovery or picker flows. */
export function buildBrowseUrl(options: BrowseUrlOptions = {}): string {
  const query = new URLSearchParams()
  if (options.kind && options.kind !== 'programs') query.set('kind', options.kind)
  if (options.category) query.set(BROWSE_PARAM.category, options.category)
  if (options.type) query.set(BROWSE_PARAM.type, options.type)
  if (options.focus) query.set(BROWSE_PARAM.focus, options.focus)
  if (options.duration) query.set(BROWSE_PARAM.duration, options.duration)
  if (options.pick) query.set('pick', options.pick)
  if (options.programId) query.set('programId', options.programId)
  if (options.returnTo) query.set('returnTo', options.returnTo)
  const qs = query.toString()
  return qs ? `/browse?${qs}` : '/browse'
}

/** Resolve the client-side duration bucket filter from query params. */
export function resolveBrowseDuration(
  params: URLSearchParams,
  kind: BrowseKind,
): BrowseDuration {
  const raw = params.get(BROWSE_PARAM.duration) ?? ''
  if (raw === 'short' || raw === 'medium' || raw === 'long') return raw
  if (raw === 'ongoing' && kind === 'programs') return raw
  return ''
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

