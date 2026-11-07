import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { apiData, getApiClient } from '../client'
import { queryKeys as keys } from '../queryKeys'
import type { components } from '../generated/types'
import { useApiMutation } from './mutation'
import { useViewerKey } from './viewerKey'

type S = components['schemas']

export function useUserByHandle(handle: string) {
  return useQuery({
    queryKey: useViewerKey(keys.user(handle)),
    enabled: !!handle,
    queryFn: async ({ signal }) =>
      apiData(
        await getApiClient().GET('/users/{handle}', {
          signal,
          params: { path: { handle } },
        }),
      ).data,
  })
}

export function useUserPrograms(handle: string) {
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.userPrograms(handle)),
    enabled: !!handle,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET('/users/{handle}/programs', {
          signal,
          params: {
            path: { handle },
            query: { cursor: pageParam, limit: 12 },
          },
        }),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  })
}

export function useUserActivities(handle: string) {
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.userActivities(handle)),
    enabled: !!handle,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET('/users/{handle}/activities', {
          signal,
          params: {
            path: { handle },
            query: { cursor: pageParam, limit: 20 },
          },
        }),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  })
}

export function useUserPublications(handle: string) {
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.userPublications(handle)),
    enabled: !!handle,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET('/users/{handle}/publications', {
          signal,
          params: {
            path: { handle },
            query: { cursor: pageParam, limit: 24 },
          },
        }),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  })
}

export function useFollowUser(handle: string) {
  return useApiMutation(
    async (userId: string) =>
      apiData(
        await getApiClient().POST('/follow-users/{userId}', {
          params: { path: { userId } },
        }),
      ).data,
    [keys.user(handle), keys.userPrograms(handle)],
  )
}

export function useUnfollowUser(handle: string) {
  return useApiMutation(
    async (userId: string) =>
      apiData(
        await getApiClient().DELETE('/follow-users/{userId}', {
          params: { path: { userId } },
        }),
      ).data,
    [keys.user(handle), keys.userPrograms(handle)],
  )
}

export function useUpdatePreferences() {
  return useApiMutation(
    async (body: S['UpdatePreferencesInput']) =>
      apiData(
        await getApiClient().PATCH('/users/me/preferences', { body }),
      ).data,
    [keys.me, keys.calendar],
  )
}

export function useMyFollowRequests() {
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.followRequests),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET('/users/me/follow-requests', {
          signal,
          params: { query: { cursor: pageParam, limit: 20 } },
        }),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  })
}

export function useApproveFollowRequest() {
  return useApiMutation(
    async (requestId: string) =>
      apiData(
        await getApiClient().POST('/follow-requests/{requestId}/approve', {
          params: { path: { requestId } },
        }),
      ).data,
    [keys.followRequests, keys.notifications, keys.unreadCount, ['users'], keys.me],
  )
}

export function useDeclineFollowRequest() {
  return useApiMutation(
    async (requestId: string) =>
      apiData(
        await getApiClient().POST('/follow-requests/{requestId}/decline', {
          params: { path: { requestId } },
        }),
      ).data,
    [keys.followRequests, keys.notifications, keys.unreadCount, ['users']],
  )
}

export function useMyAchievements() {
  return useQuery({
    queryKey: useViewerKey(keys.myAchievements),
    queryFn: async ({ signal }) =>
      apiData(await getApiClient().GET('/achievements/me', { signal })).data,
  })
}

export function useUpdateAchievement() {
  return useApiMutation(
    async ({
      achievementId,
      isShared,
    }: {
      achievementId: string
      isShared: boolean
    }) =>
      apiData(
        await getApiClient().PATCH('/achievements/{achievementId}', {
          params: { path: { achievementId } },
          body: { isShared },
        }),
      ).data,
    [keys.achievements, ['users']],
  )
}

export function useUserAchievements(handle: string) {
  return useQuery({
    queryKey: useViewerKey(keys.userAchievements(handle)),
    enabled: !!handle,
    queryFn: async ({ signal }) =>
      apiData(
        await getApiClient().GET('/users/{handle}/achievements', {
          signal,
          params: { path: { handle } },
        }),
      ).data,
  })
}
