import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useViewerKey } from './viewerKey'
import { apiData, getApiClient } from '../client'
import type { components } from '../generated/types'
type S = components['schemas']

/**
 * One discovery data source for the full-screen browser and the top-5
 * suggestion rails (`GET /discover`). Keys share the `['discover', 'list', …]`
 * prefix used by `useDiscoverPrograms`, so browser and rail reuse the cache.
 */

type DiscoverFilters = {
  q?: string
  categoryId?: string
  programTypeId?: string
  focusId?: string
  /** Activity results only (12 §5a): suggested Place, city, or any Place. */
  placeId?: string
  locality?: string
  hasPlace?: boolean
  /** Activity results: planned-minutes bucket and published default frequency kind. */
  duration?: S['DiscoverDuration']
  frequency?: S['FrequencyKind']
  sort?: S['DiscoverSort']
}

async function discoverPage(
  kind: S['DiscoverKind'],
  filters: DiscoverFilters,
  limit: number,
  cursor?: string,
  signal?: AbortSignal,
) {
  return apiData(
    await getApiClient().GET('/discover', {
      signal,
      params: {
        query: {
          kind,
          q: filters.q || undefined,
          categoryId: filters.categoryId || undefined,
          programTypeId: filters.programTypeId || undefined,
          focusId: filters.focusId || undefined,
          placeId: filters.placeId || undefined,
          locality: filters.locality || undefined,
          hasPlace: filters.hasPlace || undefined,
          duration: filters.duration || undefined,
          frequency: filters.frequency || undefined,
          sort: filters.sort,
          cursor,
          limit,
        },
      },
    }),
  )
}

/** Public, published Activities: the browser's Activity mode. */
export function useDiscoverActivities(
  filters: DiscoverFilters & { enabled?: boolean } = {},
) {
  const { enabled = true, ...query } = filters
  return useInfiniteQuery({
    queryKey: useViewerKey(['discover', 'list', { kind: 'ACTIVITY', ...query }]),
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      discoverPage('ACTIVITY', query, 20, pageParam, signal),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  })
}

/** Public creators with at least one discoverable Program. */
export function useDiscoverCreators(
  filters: Pick<DiscoverFilters, 'q'> & { enabled?: boolean } = {},
) {
  const { enabled = true, ...query } = filters
  return useInfiniteQuery({
    queryKey: useViewerKey(['discover', 'list', { kind: 'CREATOR', ...query }]),
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      discoverPage('CREATOR', query, 12, pageParam, signal),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  })
}

/**
 * Deterministic top-N: take tiers in order (most specific filters first),
 * keep first occurrences, skip excluded ids, stop at `limit`.
 */
export function mergeSuggestionTiers<T extends { id: string }>(
  tiers: T[][],
  exclude: ReadonlySet<string> = new Set(),
  limit = 5,
): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const tier of tiers)
    for (const item of tier) {
      if (out.length >= limit) return out
      if (seen.has(item.id) || exclude.has(item.id)) continue
      seen.add(item.id)
      out.push(item)
    }
  return out
}

/** Filters widened from most to least specific, without duplicates. */
export function suggestionTiers(
  levels: DiscoverFilters[],
): DiscoverFilters[] {
  const keys = new Set<string>()
  return levels.filter((level) => {
    const key = JSON.stringify(level)
    if (keys.has(key)) return false
    keys.add(key)
    return true
  })
}

const PER_TIER = 12

function useSuggestions<T extends { id: string }>(
  kind: 'PROGRAM' | 'ACTIVITY',
  levels: DiscoverFilters[],
  pick: (item: S['DiscoverItem']) => T | null,
  exclude: string[],
  enabled: boolean,
) {
  const tiers = suggestionTiers(levels)
  const query = useQuery({
    queryKey: useViewerKey(['discover', 'suggestions', { kind, tiers }]),
    enabled,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const results: T[][] = []
      for (const filters of tiers) {
        const page = await discoverPage(
          kind,
          { ...filters, sort: 'POPULAR' },
          PER_TIER,
          undefined,
          signal,
        )
        results.push(
          page.data.flatMap((item) => {
            const value = pick(item)
            return value ? [value] : []
          }),
        )
        // Enough unique candidates already: skip the wider tiers.
        if (mergeSuggestionTiers(results, new Set(), PER_TIER).length >= PER_TIER)
          break
      }
      return results
    },
  })
  return {
    ...query,
    items: query.data
      ? mergeSuggestionTiers(query.data, new Set(exclude))
      : [],
  }
}

/** Top-5 starting points for Add Program: type + focus, then type, then any. */
export function useProgramSuggestions({
  programTypeId,
  focusId,
  exclude = [],
  enabled = true,
}: {
  programTypeId?: string
  focusId?: string | null
  exclude?: string[]
  enabled?: boolean
}) {
  return useSuggestions(
    'PROGRAM',
    [
      { programTypeId, focusId: focusId ?? undefined },
      { programTypeId },
      {},
    ],
    (item) => item.program,
    exclude,
    enabled,
  )
}

/** Top-5 starting points for Add Activity: category + focus, then category, then any. */
export function useActivitySuggestions({
  categoryId,
  focusId,
  exclude = [],
  enabled = true,
}: {
  categoryId?: string
  focusId?: string | null
  exclude?: string[]
  enabled?: boolean
}) {
  return useSuggestions(
    'ACTIVITY',
    [{ categoryId, focusId: focusId ?? undefined }, { categoryId }, {}],
    (item) => item.activity,
    exclude,
    enabled,
  )
}
