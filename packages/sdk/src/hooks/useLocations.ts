import { useInfiniteQuery } from '@tanstack/react-query'
import { apiData, getApiClient } from '../client'
import { queryKeys as keys } from '../queryKeys'
import type { components } from '../generated/types'
import { useApiMutation } from './mutation'
import { useViewerKey } from './viewerKey'
type S = components['schemas']
export function useLocationSearch(q: string, publicOnly = false) {
  return useInfiniteQuery({
    queryKey: useViewerKey([...keys.places, 'search', q, publicOnly]),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => apiData(await getApiClient().GET('/catalog/places', {
      params: { query: { q, cursor: pageParam, limit: 10, publicOnly } }, signal,
    })),
    getNextPageParam: last => last.meta?.nextCursor ?? undefined,
  })
}
const invalidations = [keys.places, keys.me, ['users'], keys.calendar, keys.occurrences, ['activities'], ['discover'], keys.gatherings]
export function useCreatePlace() {
  return useApiMutation(async (body: S['CreatePlaceInput']) => apiData(await getApiClient().POST('/catalog/places', { body })).data, invalidations)
}
export function useUpdatePlace() {
  return useApiMutation(async ({ placeId, ...body }: S['UpdatePlaceInput'] & { placeId: string }) =>
    apiData(await getApiClient().PATCH('/catalog/places/{placeRef}', { params: { path: { placeRef: placeId } }, body })).data, invalidations)
}
