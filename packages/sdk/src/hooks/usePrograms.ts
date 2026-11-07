import { useApiMutation } from './mutation'
import { useViewerKey } from './viewerKey'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { apiData, getApiClient } from '../client'
import { queryKeys as keys } from '../queryKeys'
import type { components } from '../generated/types'
type S = components['schemas']

export function useDiscoverPrograms(q = '') {
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.discovery(q)),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET('/discover', {
          signal,
          params: {
            query: {
              kind: 'PROGRAM',
              q: q || undefined,
              cursor: pageParam,
              limit: 20,
            },
          },
        }),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  })
}
export function useMyPrograms() {
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.mine),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET('/programs', {
          signal,
          params: { query: { cursor: pageParam, limit: 20 } },
        }),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  })
}
export function useActivities(q = '') {
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.activities(q)),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET('/activities', {
          signal,
          params: {
            query: { q: q || undefined, cursor: pageParam, limit: 20 },
          },
        }),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  })
}
export function useProgramTypes() {
  return useQuery({
    queryKey: useViewerKey(keys.types),
    queryFn: async ({ signal }) =>
      apiData(await getApiClient().GET('/catalog/program-types', { signal }))
        .data,
  })
}
export function useFocuses(programTypeId: string) {
  return useQuery({
    queryKey: useViewerKey(keys.focuses(programTypeId)),
    enabled: !!programTypeId,
    queryFn: async ({ signal }) =>
      apiData(
        await getApiClient().GET('/catalog/focuses', {
          signal,
          params: { query: { programTypeId } },
        }),
      ).data,
  })
}
export function useProgramPreview(programId: string) {
  return useQuery({
    queryKey: useViewerKey(keys.preview(programId)),
    queryFn: async ({ signal }) =>
      apiData(
        await getApiClient().GET('/programs/{programId}', {
          signal,
          params: { path: { programId } },
        }),
      ).data,
  })
}
export function useProgramWorkspace(programId: string) {
  return useQuery({
    queryKey: useViewerKey(keys.workspace(programId)),
    queryFn: async ({ signal }) =>
      apiData(
        await getApiClient().GET('/programs/{programId}/workspace', {
          signal,
          params: { path: { programId } },
        }),
      ).data,
  })
}
export function useProgramPlacements(programId: string) {
  return useQuery({
    queryKey: useViewerKey(keys.placements(programId)),
    queryFn: async ({ signal }) =>
      apiData(
        await getApiClient().GET('/programs/{programId}/draft/placements', {
          signal,
          params: { path: { programId } },
        }),
      ).data,
  })
}
export function usePublishCheck(programId: string) {
  return useQuery({
    queryKey: useViewerKey(keys.publishCheck(programId)),
    queryFn: async ({ signal }) =>
      apiData(
        await getApiClient().GET('/programs/{programId}/publish-check', {
          signal,
          params: { path: { programId } },
        }),
      ).data,
  })
}
export function useCreateProgram() {
  return useApiMutation(
    async (body: S['CreateProgramInput']) =>
      apiData(await getApiClient().POST('/programs', { body })).data,
    [keys.mine],
  )
}
export function useUpdateProgram(programId: string) {
  return useApiMutation(
    async (body: S['UpdateProgramDraftInput']) =>
      apiData(
        await getApiClient().PATCH('/programs/{programId}/draft', {
          params: { path: { programId } },
          body,
        }),
      ).data,
    [keys.programs],
    `draft:${programId}`,
  )
}
export function useAddProgramActivities(programId: string) {
  return useApiMutation(
    async (body: S['AddProgramActivitiesInput']) =>
      apiData(
        await getApiClient().POST('/programs/{programId}/draft/activities', {
          params: { path: { programId } },
          body,
        }),
      ).data,
    [keys.programs],
    `draft:${programId}`,
  )
}
export function usePublishProgram(programId: string) {
  return useApiMutation(
    async (body: S['PublishProgramInput']) =>
      apiData(
        await getApiClient().POST('/programs/{programId}/publish', {
          params: { path: { programId } },
          body,
        }),
      ).data,
    [keys.programs, keys.discover],
    `draft:${programId}`,
  )
}
export function usePreviewEnrollment(programId: string) {
  return useApiMutation(
    async (body: S['PreviewEnrollmentInput']) =>
      apiData(
        await getApiClient().POST('/programs/{programId}/enrollments/preview', {
          params: { path: { programId } },
          body,
        }),
      ).data,
    [],
  )
}
export function useJoinProgram(programId: string) {
  return useApiMutation(
    async (body: S['JoinProgramInput']) =>
      apiData(
        await getApiClient().POST('/programs/{programId}/enrollments', {
          params: { path: { programId } },
          body,
        }),
      ).data,
    [keys.programs, keys.calendar, keys.discover],
  )
}
export function useActivity(activityId: string) {
  return useQuery({
    queryKey: useViewerKey(['activities', activityId]),
    queryFn: async ({ signal }) =>
      apiData(
        await getApiClient().GET('/activities/{activityId}', {
          signal,
          params: { path: { activityId } },
        }),
      ).data,
  })
}
