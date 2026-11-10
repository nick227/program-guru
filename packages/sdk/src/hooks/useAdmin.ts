// Platform administration (12-SOCIAL §7a). One typed list hook serves every admin collection; the
// rest are thin adapters over operations that already exist. Every admin cache lives under ['admin'].
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiData, getApiClient } from '../client'
import { queryKeys as keys } from '../queryKeys'
import type { components, paths } from '../generated/types'
import { useApiMutation } from './mutation'
import { useViewerKey } from './viewerKey'
type S = components['schemas']

export const adminKey = ['admin'] as const

/** Every GET collection under /admin. Adding one to the spec makes it listable here. */
export type AdminListPath =
  | '/admin/content'
  | '/admin/users'
  | '/admin/audit'
  | '/admin/membership/prices'
  | '/admin/membership/purchases'
  | '/admin/membership/subscriptions'
  | '/admin/membership/grants'
  // Moderation queues (MODERATOR or ADMIN): reports and pending public contributions.
  | '/moderation/reports'
  | '/moderation/publications'
export type AdminListQuery<P extends AdminListPath> = NonNullable<paths[P]['get']['parameters']['query']>
export type AdminListPage<P extends AdminListPath> = paths[P]['get']['responses'][200]['content']['application/json']
export type AdminListRow<P extends AdminListPath> = AdminListPage<P>['data'][number]

export function useAdminList<P extends AdminListPath>(path: P, query: AdminListQuery<P>, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: useViewerKey([...adminKey, path, query]),
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      // openapi-fetch cannot narrow a generic path; the return type comes from the spec above.
      const get = getApiClient().GET as unknown as (p: P, init: object) => Promise<{ data?: AdminListPage<P>; error?: S['Error']; response: Response }>
      return apiData(await get(path, { signal, params: { query } }))
    },
  })
}

export function useAdminUser(userId: string) {
  return useQuery({
    queryKey: useViewerKey([...adminKey, 'user', userId]),
    enabled: !!userId,
    queryFn: async ({ signal }) => apiData(await getApiClient().GET('/admin/users/{userId}', { signal, params: { path: { userId } } })).data,
  })
}

export function useUpdateAdminUser() {
  return useApiMutation(
    async ({ userId, ...body }: S['UpdateAdminUserInput'] & { userId: string }) =>
      apiData(await getApiClient().PATCH('/admin/users/{userId}', { params: { path: { userId } }, body })).data,
    [adminKey],
  )
}

export function useModerateAdminContent() {
  return useApiMutation(
    async ({ kind, id, ...body }: S['ModerateContentInput'] & { kind: S['AdminContentKind']; id: string }) =>
      apiData(await getApiClient().POST('/admin/content/{kind}/{id}/moderation', { params: { path: { kind, id } }, body })).data,
    [adminKey, keys.programs, keys.discover, ['activities']],
  )
}

export function useImportAdminContent() {
  return useApiMutation(
    async (body: S['AdminImportInput']) => apiData(await getApiClient().POST('/admin/content/import', { body })).data,
    [adminKey],
  )
}

/** Publish a Program or Activity by id (the existing operations), for table and bulk actions. */
export function useAdminPublish() {
  return useApiMutation(
    async (v: { kind: S['AdminContentKind']; id: string; visibility: S['Visibility']; accessMode?: S['AccessMode']; expectedRevision: number }) =>
      v.kind === 'PROGRAM'
        ? apiData(
            await getApiClient().POST('/programs/{programId}/publish', {
              params: { path: { programId: v.id } },
              body: { visibility: v.visibility, accessMode: v.accessMode ?? 'OPEN', expectedRevision: v.expectedRevision },
            }),
          ).data
        : apiData(
            await getApiClient().POST('/activities/{activityId}/publish', {
              params: { path: { activityId: v.id } },
              body: { visibility: v.visibility, expectedRevision: v.expectedRevision },
            }),
          ).data,
    [adminKey, keys.programs, keys.discover, ['activities']],
  )
}

/** Archive (unpublish) a Program or Activity by id. */
export function useAdminArchive() {
  return useApiMutation(
    async (v: { kind: S['AdminContentKind']; id: string }) =>
      v.kind === 'PROGRAM'
        ? apiData(await getApiClient().POST('/programs/{programId}/archive', { params: { path: { programId: v.id } } })).data
        : apiData(await getApiClient().POST('/activities/{activityId}/archive', { params: { path: { activityId: v.id } } })).data,
    [adminKey, keys.programs, keys.discover, ['activities']],
  )
}

export function useGrantProgramAccess() {
  return useApiMutation(
    async ({ programId, ...body }: S['GrantAccessInput'] & { programId: string }) =>
      apiData(await getApiClient().POST('/moderation/programs/{programId}/grants', { params: { path: { programId } }, body })).data,
    [adminKey],
  )
}

export function useRevokeProgramAccess() {
  return useApiMutation(
    async (grantId: string) => apiData(await getApiClient().DELETE('/moderation/grants/{grantId}', { params: { path: { grantId } } })).data,
    [adminKey],
  )
}

export function useResolveReport() {
  return useApiMutation(
    async ({ reportId, ...body }: S['ResolveReportInput'] & { reportId: string }) =>
      apiData(await getApiClient().POST('/moderation/reports/{reportId}/resolve', { params: { path: { reportId } }, body })).data,
    [adminKey, keys.programs, keys.discover, ['activities'], keys.media],
  )
}

/** Approve or reject a PENDING public contribution. Rejecting never deletes the owner's asset. */
export function useModeratePublication() {
  return useApiMutation(
    async ({ publicationId, ...body }: S['ModeratePublicationInput'] & { publicationId: string }) =>
      apiData(await getApiClient().POST('/moderation/publications/{publicationId}', { params: { path: { publicationId } }, body })).data,
    [adminKey, keys.media, ['activities']],
  )
}

/** Any signed-in user may report a Program, Activity, media publication, comment or account. */
export function useCreateReport() {
  return useApiMutation(async (body: S['ReportContentInput']) => apiData(await getApiClient().POST('/reports', { body })).data, [])
}
