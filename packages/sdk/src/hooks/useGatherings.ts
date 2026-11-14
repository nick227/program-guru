// Standalone Activity gatherings (10-COLLABORATION §9). Every write refreshes the Calendar, the
// occurrence room and discovery, because joining, leaving and moving all change what they show.
import { useQuery } from '@tanstack/react-query'
import { useViewerKey } from './viewerKey'
import { apiData, getApiClient } from '../client'
import { queryKeys as keys } from '../queryKeys'
import { useApiMutation } from './mutation'
import type { components } from '../generated/types'
type S = components['schemas']

const AFFECTED = [keys.gatherings, keys.calendar, keys.occurrences, keys.discover]

export function useActivityGatherings(activityId: string, enabled = true) {
  return useQuery({
    queryKey: useViewerKey([...keys.gatherings, 'activity', activityId]),
    enabled: enabled && !!activityId,
    queryFn: async ({ signal }) =>
      apiData(await getApiClient().GET('/activities/{activityId}/gatherings', { params: { path: { activityId } }, signal })).data,
  })
}

export function usePublicGatherings(filter: { when?: 'NOW' | 'UPCOMING'; locality?: string; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: useViewerKey([...keys.gatherings, 'public', filter.when ?? 'UPCOMING', filter.locality ?? null]),
    enabled: filter.enabled ?? true,
    queryFn: async ({ signal }) =>
      apiData(
        await getApiClient().GET('/gatherings', { params: { query: { when: filter.when, locality: filter.locality || undefined } }, signal }),
      ).data,
  })
}

export function useGathering(gatheringId: string | null | undefined, invite?: string | null) {
  return useQuery({
    queryKey: useViewerKey([...keys.gatherings, 'one', gatheringId ?? '', invite ?? null]),
    enabled: !!gatheringId,
    queryFn: async ({ signal }) =>
      apiData(
        await getApiClient().GET('/gatherings/{gatheringId}', {
          params: { path: { gatheringId: gatheringId! }, query: { invite: invite || undefined } },
          signal,
        }),
      ).data,
  })
}

export function useCreateGathering() {
  return useApiMutation(
    async ({ activityId, ...body }: S['CreateGatheringInput'] & { activityId: string }) =>
      apiData(await getApiClient().POST('/activities/{activityId}/gatherings', { params: { path: { activityId } }, body })).data,
    AFFECTED,
  )
}

export function useJoinGathering() {
  return useApiMutation(
    async ({ gatheringId, ...body }: S['JoinGatheringInput'] & { gatheringId: string }) =>
      apiData(await getApiClient().POST('/gatherings/{gatheringId}/join', { params: { path: { gatheringId } }, body })).data,
    AFFECTED,
  )
}

export function useLeaveGathering() {
  return useApiMutation(
    async ({ gatheringId }: { gatheringId: string }) =>
      apiData(await getApiClient().POST('/gatherings/{gatheringId}/leave', { params: { path: { gatheringId } } })).data,
    AFFECTED,
  )
}

export function useUpdateGathering() {
  return useApiMutation(
    async ({ gatheringId, ...body }: S['UpdateGatheringInput'] & { gatheringId: string }) =>
      apiData(await getApiClient().PATCH('/gatherings/{gatheringId}', { params: { path: { gatheringId } }, body })).data,
    AFFECTED,
  )
}

export function useCreateGatheringLink() {
  return useApiMutation(
    async ({ gatheringId }: { gatheringId: string }) =>
      apiData(await getApiClient().POST('/gatherings/{gatheringId}/link', { params: { path: { gatheringId } } })).data,
    [],
  )
}
