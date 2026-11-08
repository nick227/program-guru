import { useViewerKey } from './viewerKey'
import { useQueries, useQuery } from '@tanstack/react-query'
import { apiData, getApiClient } from '../client'
import { queryKeys as keys } from '../queryKeys'
import { useApiMutation } from './mutation'
import type { components } from '../generated/types'
type S = components['schemas']
export function useCalendar(start: string, end: string, enabled = true) {
  return useQuery({
    queryKey: useViewerKey(keys.week(start, end)),
    enabled,
    queryFn: async ({ signal }) =>
      apiData(
        await getApiClient().GET('/calendar/items', {
          signal,
          params: { query: { start, end } },
        }),
      ).data,
  })
}
export function useCalendarYear(year: number, enabled = true) {
  const viewerKey = useViewerKey([])
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, '0')
    const start = `${year}-${month}-01`
    const end = new Date(Date.UTC(year, index + 1, 0))
      .toISOString()
      .slice(0, 10)
    return { start, end }
  })
  const queries = useQueries({
    queries: months.map(({ start, end }) => ({
      queryKey: [...keys.week(start, end), viewerKey[0]],
      enabled,
      queryFn: async ({ signal }: { signal: AbortSignal }) =>
        apiData(
          await getApiClient().GET('/calendar/items', {
            signal,
            params: { query: { start, end } },
          }),
        ).data,
    })),
  })
  return {
    data: queries.flatMap((query) => query.data ?? []),
    isPending: enabled && queries.some((query) => query.isPending),
    isFetching: queries.some((query) => query.isFetching),
    error: queries.find((query) => query.error)?.error ?? null,
    refetch: () => Promise.all(queries.map((query) => query.refetch())),
  }
}
export function useOccurrence(itemId: string) {
  return useQuery({
    queryKey: useViewerKey(keys.occurrence(itemId)),
    queryFn: async ({ signal }) =>
      apiData(
        await getApiClient().GET('/calendar-items/{itemId}/occurrence', {
          signal,
          params: { path: { itemId } },
        }),
      ).data,
  })
}
export function useCreateSession(itemId: string) {
  return useApiMutation(
    async (body: S['CreateSessionInput']) =>
      apiData(await getApiClient().POST('/sessions', { body })).data,
    [keys.occurrence(itemId), keys.activityAttempts],
  )
}
export function useSessionAction(itemId: string) {
  return useApiMutation(
    async ({
      sessionId,
      ...body
    }: S['SessionActionInput'] & { sessionId: string }) =>
      apiData(
        await getApiClient().POST('/sessions/{sessionId}/actions', {
          params: { path: { sessionId } },
          body,
        }),
      ).data,
    [keys.calendar, keys.occurrences, ['achievements'], keys.programs, keys.activityAttempts],
    `session:${itemId}`,
  )
}
export function useSaveResults(itemId: string) {
  return useApiMutation(
    async ({
      sessionId,
      ...body
    }: S['SaveResultEntryInput'] & { sessionId: string }) =>
      apiData(
        await getApiClient().POST('/sessions/{sessionId}/results', {
          params: { path: { sessionId } },
          body,
        }),
      ).data,
    [keys.occurrence(itemId), keys.activityAttempts],
  )
}
export function useUndoCompletion() {
  return useApiMutation(
    async (itemId: string) =>
      apiData(
        await getApiClient().POST('/calendar-items/{itemId}/undo-completion', {
          params: { path: { itemId } },
        }),
      ).data,
    [keys.calendar, keys.occurrences, ['achievements'], keys.programs, keys.activityAttempts],
  )
}
export function useAddCalendarItem() {
  return useApiMutation(
    async (body: S['AddCalendarItemInput']) =>
      apiData(await getApiClient().POST('/calendar/items', { body })).data,
    [keys.calendar],
  )
}
