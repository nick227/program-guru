import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { apiData, getApiClient } from '../client'
import { queryKeys as keys } from '../queryKeys'
import type { components, paths } from '../generated/types'
import { useApiMutation } from './mutation'
import { useViewerKey } from './viewerKey'

type S = components['schemas']
export type NotificationFilterParam = NonNullable<
  NonNullable<paths['/notifications']['get']['parameters']['query']>['filter']
>

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: useViewerKey(keys.unreadCount),
    queryFn: async ({ signal }) =>
      apiData(
        await getApiClient().GET('/notifications/unread-count', { signal }),
      ).data,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
}

export function useNotifications(options?: {
  limit?: number
  enabled?: boolean
  filter?: NotificationFilterParam
}) {
  const limit = options?.limit ?? 30
  const filter = options?.filter ?? 'all'
  return useInfiniteQuery({
    // 'list' segment keeps filter='unread' from colliding with keys.unreadCount.
    queryKey: useViewerKey([...keys.notifications, 'list', filter]),
    enabled: options?.enabled ?? true,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET('/notifications', {
          signal,
          params: {
            query: {
              cursor: pageParam,
              limit,
              filter: filter === 'all' ? undefined : filter,
            },
          },
        }),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
}

export function useMarkNotificationsRead() {
  return useApiMutation(
    async (body: S['MarkNotificationsReadInput']) =>
      apiData(
        await getApiClient().POST('/notifications/read', { body }),
      ).data,
    [keys.notifications, keys.unreadCount, keys.calendar, keys.occurrences],
  )
}

export function useUnsubscribeDailyEmail() {
  return useApiMutation(
    async (body: S['EmailUnsubscribeInput']) =>
      apiData(
        await getApiClient().POST('/email/unsubscribe', { body }),
      ).data,
    [keys.me],
  )
}
