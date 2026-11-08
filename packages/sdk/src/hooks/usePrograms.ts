import { useApiMutation } from './mutation'
import { useViewerKey } from './viewerKey'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { apiData, getApiClient } from '../client'
import { queryKeys as keys } from '../queryKeys'
import type { components } from '../generated/types'
type S = components['schemas']

export function useDiscoverPrograms(q = '', programTypeId = '') {
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.discovery(q, programTypeId)),
    enabled: !!programTypeId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET('/discover', {
          signal,
          params: {
            query: {
              kind: 'PROGRAM',
              q: q || undefined,
              programTypeId: programTypeId || undefined,
              cursor: pageParam,
              limit: 20,
            },
          },
        }),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  })
}
export function useMyPrograms(status?: S['ProgramStatus']) {
  return useInfiniteQuery({
    queryKey: useViewerKey([...keys.mine, status ?? 'all']),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET('/programs', {
          signal,
          params: {
            query: { cursor: pageParam, limit: 20, status },
          },
        }),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  })
}
export function useActivities(q = '', focusId = '') {
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.activities(q, focusId)),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET('/activities', {
          signal,
          params: {
            query: {
              q: q || undefined,
              focusId: focusId || undefined,
              cursor: pageParam,
              limit: 20,
            },
          },
        }),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  })
}
export function useMyActivities(q = '') {
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.myActivities(q)),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET('/activities', {
          signal,
          params: {
            query: {
              source: 'MINE',
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
export function useProgramTypes() {
  return useQuery({
    queryKey: useViewerKey(keys.types),
    queryFn: async ({ signal }) =>
      apiData(await getApiClient().GET('/catalog/program-types', { signal }))
        .data,
  })
}
export function useCategories() {
  return useQuery({
    queryKey: useViewerKey(keys.categories),
    queryFn: async ({ signal }) =>
      apiData(await getApiClient().GET('/catalog/categories', { signal })).data,
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
    enabled: !!programId,
    queryFn: async ({ signal }) =>
      apiData(
        await getApiClient().GET('/programs/{programId}', {
          signal,
          params: { path: { programId } },
        }),
      ).data,
  })
}
export function useResolveSlugQuery(
  kind: 'PROGRAM' | 'ACTIVITY',
  slugOrId: string,
  creatorHandle?: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: useViewerKey(keys.resolveSlug(kind, slugOrId, creatorHandle)),
    queryFn: async ({ signal }) =>
      apiData(
        await getApiClient().GET('/resolve-slug', {
          signal,
          params: {
            query: {
              kind,
              slugOrId,
              creatorHandle: creatorHandle || undefined,
            },
          },
        }),
      ).data,
    enabled: enabled && !!slugOrId,
    staleTime: 60 * 1000,
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
export function useAddProgramPlacement(programId: string) {
  return useApiMutation(
    async (body: S['AddPlacementInput']) =>
      apiData(
        await getApiClient().POST(
          '/programs/{programId}/draft/placements',
          {
            params: { path: { programId } },
            body,
          },
        ),
      ).data,
    [keys.programs],
    `draft:${programId}`,
  )
}
export function useUpdateProgramPlacement(programId: string) {
  return useApiMutation(
    async ({
      placementId,
      ...body
    }: S['UpdatePlacementInput'] & { placementId: string }) =>
      apiData(
        await getApiClient().PATCH(
          '/programs/{programId}/draft/placements/{placementId}',
          {
            params: { path: { programId, placementId } },
            body,
          },
        ),
      ).data,
    [keys.programs],
    `draft:${programId}`,
  )
}
export function useDeleteProgramPlacement(programId: string) {
  return useApiMutation(
    async ({
      placementId,
      expectedRevision,
    }: {
      placementId: string
      expectedRevision: number
    }) =>
      apiData(
        await getApiClient().DELETE(
          '/programs/{programId}/draft/placements/{placementId}',
          {
            params: {
              path: { programId, placementId },
              query: { expectedRevision },
            },
          },
        ),
      ),
    [keys.programs],
    `draft:${programId}`,
  )
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
export function useCopyProgram() {
  return useApiMutation(
    async (programId: string) =>
      apiData(
        await getApiClient().POST('/programs/{programId}/copy', {
          params: { path: { programId } },
        }),
      ).data,
    [keys.programs, keys.mine, keys.discover],
  )
}
export function useRenameProgram() {
  return useApiMutation(
    async ({
      programId,
      title,
      expectedRevision,
    }: {
      programId: string
      title: string
      expectedRevision: number
    }) =>
      apiData(
        await getApiClient().PATCH('/programs/{programId}/draft', {
          params: { path: { programId } },
          body: { title, expectedRevision },
        }),
      ).data,
    [keys.programs, keys.mine],
  )
}
export function useCreateActivity() {
  return useApiMutation(
    async (body: S['CreateActivityInput']) =>
      apiData(await getApiClient().POST('/activities', { body })).data,
    [['activities'], keys.programs],
  )
}
export function useUpdateActivityDraft(activityId: string) {
  return useApiMutation(
    async (body: S['UpdateActivityDraftInput']) =>
      apiData(
        await getApiClient().PATCH('/activities/{activityId}/draft', {
          params: { path: { activityId } },
          body,
        }),
      ).data,
    [['activities'], keys.programs],
    `activity-draft:${activityId}`,
  )
}
export function usePutActivityInstructions() {
  return useApiMutation(
    async ({
      activityId,
      ...body
    }: S['PutInstructionsInput'] & { activityId: string }) =>
      apiData(
        await getApiClient().PUT(
          '/activities/{activityId}/draft/instructions',
          {
            params: { path: { activityId } },
            body,
          },
        ),
      ).data,
    [['activities'], keys.programs],
  )
}
export function useCopyActivity() {
  return useApiMutation(
    async ({
      activityId,
      ...body
    }: S['CopyActivityInput'] & { activityId: string }) =>
      apiData(
        await getApiClient().POST('/activities/{activityId}/copy', {
          params: { path: { activityId } },
          body,
        }),
      ).data,
    [['activities'], keys.programs],
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
    [keys.programs, keys.discover, keys.mine],
    `draft:${programId}`,
  )
}
export function useArchiveProgram() {
  return useApiMutation(
    async (programId: string) =>
      apiData(
        await getApiClient().POST('/programs/{programId}/archive', {
          params: { path: { programId } },
        }),
      ).data,
    [keys.programs, keys.discover, keys.mine],
  )
}
export function usePublishActivity(activityId: string) {
  return useApiMutation(
    async (body: S['PublishActivityInput']) =>
      apiData(
        await getApiClient().POST('/activities/{activityId}/publish', {
          params: { path: { activityId } },
          body,
        }),
      ).data,
    [keys.programs, keys.myActivities()],
  )
}
export function useArchiveActivity() {
  return useApiMutation(
    async (activityId: string) =>
      apiData(
        await getApiClient().POST('/activities/{activityId}/archive', {
          params: { path: { activityId } },
        }),
      ).data,
    [keys.programs, keys.myActivities()],
  )
}
export function useProgramAccessRequests(programId: string) {
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.accessRequests(programId)),
    enabled: !!programId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET('/programs/{programId}/access-requests', {
          signal,
          params: {
            path: { programId },
            query: { cursor: pageParam, limit: 20 },
          },
        }),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  })
}
export function useApproveProgramAccessRequest(programId: string) {
  return useApiMutation(
    async (requestId: string) =>
      apiData(
        await getApiClient().POST('/access-requests/{requestId}/approve', {
          params: { path: { requestId } },
        }),
      ).data,
    [keys.accessRequests(programId)],
  )
}
export function useDeclineProgramAccessRequest(programId: string) {
  return useApiMutation(
    async (requestId: string) =>
      apiData(
        await getApiClient().POST('/access-requests/{requestId}/decline', {
          params: { path: { requestId } },
        }),
      ).data,
    [keys.accessRequests(programId)],
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
    [keys.programs, keys.calendar, keys.discover, keys.enrollments, keys.groups],
  )
}
export function useMyEnrollments() {
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.enrollments),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET('/enrollments', {
          signal,
          params: { query: { cursor: pageParam, limit: 20 } },
        }),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  })
}
export function useEnrollment(enrollmentId: string) {
  return useQuery({
    queryKey: useViewerKey(keys.enrollment(enrollmentId)),
    enabled: !!enrollmentId,
    queryFn: async ({ signal }) =>
      apiData(
        await getApiClient().GET('/enrollments/{enrollmentId}', {
          signal,
          params: { path: { enrollmentId } },
        }),
      ).data,
  })
}
export function useAcceptEnrollmentUpdate(enrollmentId: string) {
  return useApiMutation(
    async () =>
      apiData(
        await getApiClient().POST('/enrollments/{enrollmentId}/accept-update', {
          params: { path: { enrollmentId } },
        }),
      ).data,
    [
      keys.enrollments,
      keys.programs,
      keys.calendar,
      keys.occurrences,
      keys.notifications,
      keys.unreadCount,
    ],
  )
}
export function useDismissEnrollmentUpdate(enrollmentId: string) {
  return useApiMutation(
    async () =>
      apiData(
        await getApiClient().POST(
          '/enrollments/{enrollmentId}/dismiss-update',
          {
            params: { path: { enrollmentId } },
          },
        ),
      ).data,
    [keys.enrollments, keys.programs, keys.notifications, keys.unreadCount],
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
