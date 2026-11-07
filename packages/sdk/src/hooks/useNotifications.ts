import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { apiData, getApiClient } from '../client'
import { queryKeys as keys } from '../queryKeys'
import { useApiMutation } from './mutation'
import { useViewerKey } from './viewerKey'

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: useViewerKey(keys.unreadCount),
    queryFn: async ({ signal }) =>
      apiData(
        await getApiClient().GET('/notifications/unread-count', { signal }),
      ).data,
    refetchInterval: 60_000,
  })
}

export function useNotifications() {
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.notifications),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET('/notifications', {
          signal,
          params: { query: { cursor: pageParam, limit: 30 } },
        }),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  })
}

export function useMarkNotificationsRead() {
  return useApiMutation(
    async (body: { ids?: string[]; all?: boolean }) =>
      apiData(
        await getApiClient().POST('/notifications/read', { body }),
      ).data,
    [keys.notifications, keys.unreadCount],
  )
}
