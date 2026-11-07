import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { apiData, getApiClient } from '../client'
import { queryKeys as keys } from '../queryKeys'
import type { components } from '../generated/types'
import { useApiMutation } from './mutation'
import { useViewerKey } from './viewerKey'

type S = components['schemas']

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: useViewerKey(keys.unreadCount),
    queryFn: async ({ signal }) =>
      apiData(
        await getApiClient().GET('/notifications/unread-count', { signal }),
      ).data,
    refetchOnWindowFocus: true,
  })
}

export function useNotifications(options?: {
  limit?: number
  enabled?: boolean
}) {
  const limit = options?.limit ?? 30
  return useInfiniteQuery({
    queryKey: useViewerKey(keys.notifications),
    enabled: options?.enabled ?? true,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      apiData(
        await getApiClient().GET('/notifications', {
          signal,
          params: { query: { cursor: pageParam, limit } },
        }),
      ),
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    refetchOnWindowFocus: true,
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
