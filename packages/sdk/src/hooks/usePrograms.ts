import { useApiMutation } from './mutation'
import { useApiQuery } from './query'
import { useViewerKey } from './viewerKey'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { apiData, getApiClient } from '../client'
import { queryKeys as keys } from '../queryKeys'
import type { components } from '../generated/types'
type S = components['schemas']

export type DiscoverProgramsOptions = {
  q?: string
  categoryId?: string
  programTypeId?: string
  focusId?: string
  level?: S['ProgramLevel']
  duration?: S['DiscoverDuration']
  maxSessionMinutes?: number
  tags?: string[]
  sort?: S['DiscoverSort']
  timing?: S['DiscoverTiming']
  accessMode?: S['AccessMode']
  activityId?: string
  limit?: number
  enabled?: boolean
}

export function useDiscoverPrograms(
  qOrOpts: string | DiscoverProgramsOptions = '',
  programTypeId = '',
  enabled = true,
) {
  const opts: DiscoverProgramsOptions =
    typeof qOrOpts === 'object'
      ? qOrOpts
      : {
          q: qOrOpts,
          programTypeId,
          enabled,
        }

  const queryQ = opts.q || undefined
  const queryCategoryId = opts.categoryId || undefined
  const queryTypeId = opts.programTypeId || undefined
  const queryFocusId = opts.focusId || undefined
  const queryLevel = opts.level || undefined
  const queryDuration = opts.duration || undefined
  const queryMaxSessionMinutes = opts.maxSessionMinutes || undefined
  const queryTags = opts.tags?.length ? opts.tags.join(',') : undefined
  const querySort = opts.sort || undefined
  const queryTiming = opts.timing && opts.timing !== 'ALL' ? opts.timing : undefined
  const queryAccessMode = opts.accessMode || undefined
  const queryActivityId = opts.activityId || undefined
  const queryLimit = opts.limit ?? 20
  const queryEnabled =
    opts.enabled ??
    (!!opts.categoryId ||
      !!opts.programTypeId ||
      !!opts.q ||
      !!opts.activityId)

  return useInfiniteQuery({
    queryKey: useViewerKey([
      'discover',
      'list',
      {
        kind: 'PROGRAM',
        q: queryQ,
        categoryId: queryCategoryId,
        programTypeId: queryTypeId,
        focusId: queryFocusId,
        activityId: queryActivityId,
        level: queryLevel,
        duration: queryDuration,
        maxSessionMinutes: queryMaxSessionMinutes,
        tags: queryTags,
        sort: querySort,
        timing: queryTiming,
        accessMode: queryAccessMode,
        limit: queryLimit,
      },
    ]),
    enabled: queryEnabled,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET('/discover', {
          signal,
          params: {
            query: {
              kind: 'PROGRAM',
              q: queryQ,
              categoryId: queryCategoryId,
              programTypeId: queryTypeId,
              focusId: queryFocusId,
              activityId: queryActivityId,
              level: queryLevel,
              duration: queryDuration,
              maxSessionMinutes: queryMaxSessionMinutes,
              tags: queryTags,
              sort: querySort,
              timing: queryTiming,
              accessMode: queryAccessMode,
              cursor: pageParam,
              limit: queryLimit,
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
  return useApiQuery({
    queryKey: useViewerKey(keys.types),
    request: (signal) => getApiClient().GET('/catalog/program-types', { signal }),
  })
}
export function useCategories() {
  return useApiQuery({
    queryKey: useViewerKey(keys.categories),
    request: (signal) => getApiClient().GET('/catalog/categories', { signal }),
  })
}
export function useTags() {
  return useApiQuery({
    queryKey: useViewerKey(keys.tags),
    request: (signal) => getApiClient().GET('/catalog/tags', { signal }),
  })
}
export type FocusesFilter = {
  categoryId?: string
  programTypeId?: string
  enabled?: boolean
}

export function useFocuses(filterOrProgramTypeId: string | FocusesFilter = '') {
  const filter: FocusesFilter =
    typeof filterOrProgramTypeId === 'string'
      ? { programTypeId: filterOrProgramTypeId, enabled: !!filterOrProgramTypeId }
      : filterOrProgramTypeId
  const categoryId = filter.categoryId || undefined
  const programTypeId = filter.programTypeId || undefined
  const enabled = filter.enabled ?? (!!programTypeId || !!categoryId)

  return useQuery({
    queryKey: useViewerKey(keys.focuses({ categoryId, programTypeId })),
    enabled,
    queryFn: async ({ signal }) =>
      apiData(
        await getApiClient().GET('/catalog/focuses', {
          signal,
          params: { query: { categoryId, programTypeId } },
        }),
      ).data,
  })
}
export function useProgramPreview(programId: string) {
  return useApiQuery({
    queryKey: useViewerKey(keys.preview(programId)),
    enabled: !!programId,
    request: (signal) => getApiClient().GET('/programs/{programId}', {
      signal,
      params: { path: { programId } },
    }),
  })
}
export function useProgramVersion(versionId: string, enabled = true) {
  return useApiQuery({
    queryKey: useViewerKey(keys.version(versionId)),
    enabled: enabled && !!versionId,
    request: (signal) => getApiClient().GET('/program-versions/{versionId}', {
      signal,
      params: { path: { versionId } },
    }),
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
export function useProgramWorkspace(programId: string, enabled = true) {
  return useApiQuery({
    queryKey: useViewerKey(keys.workspace(programId)),
    enabled: enabled && !!programId,
    request: (signal) => getApiClient().GET('/programs/{programId}/workspace', {
      signal,
      params: { path: { programId } },
    }),
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
export function usePublishCheck(programId: string, enabled = true) {
  return useQuery({
    queryKey: useViewerKey(keys.publishCheck(programId)),
    enabled: enabled && !!programId,
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
      description,
      expectedRevision,
    }: {
      programId: string
      title: string
      description?: string
      expectedRevision: number
    }) =>
      apiData(
        await getApiClient().PATCH('/programs/{programId}/draft', {
          params: { path: { programId } },
          body: { title, description, expectedRevision },
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
export function useUpdateActivityDraft(activityId?: string) {
  return useApiMutation(
    async ({
      activityId: requestedActivityId,
      ...body
    }: S['UpdateActivityDraftInput'] & { activityId?: string }) => {
      const targetActivityId = requestedActivityId ?? activityId
      if (!targetActivityId) {
        throw new Error('An Activity is required to update its draft.')
      }
      return apiData(
        await getApiClient().PATCH('/activities/{activityId}/draft', {
          params: { path: { activityId: targetActivityId } },
          body,
        }),
      ).data
    },
    [['activities'], keys.programs],
    activityId ? `activity-draft:${activityId}` : undefined,
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
export function useUpdateProgramActivity(programId: string) {
  return useApiMutation(
    async ({
      activityId,
      ...body
    }: S['UpdateProgramActivityInput'] & { activityId: string }) =>
      apiData(
        await getApiClient().PATCH(
          '/programs/{programId}/draft/activities/{activityId}',
          {
            params: { path: { programId, activityId } },
            body,
          },
        ),
      ).data,
    [keys.programs],
    `draft:${programId}`,
  )
}
export function useRemoveProgramActivity(programId: string) {
  return useApiMutation(
    async ({
      activityId,
      expectedRevision,
    }: {
      activityId: string
      expectedRevision: number
    }) =>
      apiData(
        await getApiClient().DELETE(
          '/programs/{programId}/draft/activities/{activityId}',
          {
            params: {
              path: { programId, activityId },
              query: { expectedRevision },
            },
          },
        ),
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
export function useUpdateProgramVisibility(programId: string) {
  return useApiMutation(
    async (body: S['UpdateProgramVisibilityInput']) =>
      apiData(
        await getApiClient().PATCH('/programs/{programId}/visibility', {
          params: { path: { programId } },
          body,
        }),
      ).data,
    [keys.programs, keys.discover, keys.mine],
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
/** Permanent owner delete (07 §6); clears Studio, My Programs, Calendar and discovery caches. */
export function useDeleteProgram() {
  return useApiMutation(
    async (programId: string) =>
      apiData(
        await getApiClient().DELETE('/programs/{programId}', {
          params: { path: { programId } },
        }),
      ).data,
    [keys.programs, keys.discover, keys.calendar, ['enrollments'], keys.occurrences],
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
    enabled: !!activityId,
    queryFn: async ({ signal }) =>
      apiData(
        await getApiClient().GET('/activities/{activityId}', {
          signal,
          params: { path: { activityId } },
        }),
      ).data,
  })
}
