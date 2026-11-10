import type { components } from '@project/sdk'

type DiscoverSort = components['schemas']['DiscoverSort']

export type BrowseKind = 'programs' | 'activities'
export type BrowsePick = 'program' | 'activity'
export type BrowseCreator = 'ALL' | 'PLATFORM' | 'COMMUNITY'

export const BROWSE_PARAM = {
  q: 'q',
  sort: 'sort',
  creator: 'creator',
  category: 'category',
  type: 'type',
  focus: 'focus',
  facet: 'facet',
} as const

export interface BrowseUrlOptions {
  kind?: BrowseKind
  category?: string
  type?: string
  focus?: string
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
  if (options.pick) query.set('pick', options.pick)
  if (options.programId) query.set('programId', options.programId)
  if (options.returnTo) query.set('returnTo', options.returnTo)
  const qs = query.toString()
  return qs ? `/browse?${qs}` : '/browse'
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

