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
    enabled: !!itemId,
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
    [keys.calendar, keys.occurrences, ['achievements'], keys.programs, keys.activityAttempts, keys.gatherings],
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
    [keys.calendar, keys.occurrences, ['achievements'], keys.programs, keys.activityAttempts, keys.gatherings],
  )
}
export function useQuickCompleteCalendarItem() {
  return useApiMutation(
    async ({
      itemId,
      idempotencyKey,
    }: {
      itemId: string
      idempotencyKey: string
    }) => {
      const session = apiData(
        await getApiClient().POST('/sessions', {
          body: { calendarItemId: itemId, idempotencyKey },
        }),
      ).data
      // A previous FINISH may have succeeded even if its response was lost.
      // Read the occurrence before retrying a terminal session.
      if (session.status === 'FINISHED') {
        const occurrence = apiData(await getApiClient().GET('/calendar-items/{itemId}/occurrence', {
          params: { path: { itemId } },
        })).data
        if (occurrence.item.status !== 'DONE') throw new Error('Completion was not confirmed. Open the Activity to continue.')
        return { session, item: occurrence.item, achievementsEarned: [] }
      }
      const result = apiData(
        await getApiClient().POST('/sessions/{sessionId}/actions', {
          params: { path: { sessionId: session.id } },
          body: { action: 'FINISH', expectedRevision: session.revision },
        }),
      ).data
      if (result.session.status !== 'FINISHED' || result.item?.status !== 'DONE') throw new Error('Completion was not confirmed. Open the Activity to continue.')
      return result
    },
    [keys.calendar, keys.occurrences, ['achievements'], keys.programs, keys.activityAttempts, keys.gatherings],
  )
}
export function useCancelCalendarItem() {
  return useApiMutation(
    async ({
      itemId,
      scope,
    }: {
      itemId: string
      scope: S['RecurrenceScope']
    }) =>
      apiData(
        await getApiClient().DELETE('/calendar-items/{itemId}', {
          params: { path: { itemId }, query: { scope } },
        }),
      ).data,
    // Removing a gathering item also leaves the gathering (10 §9.6).
    [keys.calendar, keys.occurrences, keys.programs, keys.gatherings],
  )
}
export function useAddCalendarItem() {
  return useApiMutation(
    async (body: S['AddCalendarItemInput']) =>
      apiData(await getApiClient().POST('/calendar/items', { body })).data,
    [keys.calendar],
  )
}
export function useUpdateCalendarItem() {
  return useApiMutation(
    async ({
      itemId,
      ...body
    }: S['UpdateCalendarItemInput'] & { itemId: string }) =>
      apiData(
        await getApiClient().PATCH('/calendar-items/{itemId}', {
          params: { path: { itemId } },
          body,
        }),
      ).data,
    // Moving or cancelling a gathering item leaves the gathering (10 §9.6).
    [keys.calendar, keys.occurrences, keys.gatherings],
  )
}
/** The viewer's personal repeat rules (09 §4.8), refreshed with every Calendar change. */
export function useCalendarRecurrences(enabled = true) {
  return useQuery({
    queryKey: useViewerKey([...keys.calendar, 'recurrences']),
    enabled,
    queryFn: async ({ signal }) => apiData(await getApiClient().GET('/calendar/recurrences', { signal })).data,
  })
}
/** Edit a series from a date on: earlier entries and results stay (09 §4.8). */
export function useUpdateCalendarRecurrence() {
  return useApiMutation(
    async ({ recurrenceId, ...body }: S['UpdateRecurrenceInput'] & { recurrenceId: string }) =>
      apiData(
        await getApiClient().PATCH('/calendar/recurrences/{recurrenceId}', {
          params: { path: { recurrenceId } },
          body,
        }),
      ).data,
    [keys.calendar, keys.occurrences],
  )
}
/** End a series from a date on: later planned entries are removed; earlier ones and results stay. */
export function useEndCalendarRecurrence() {
  return useApiMutation(
    async ({ recurrenceId, effectiveFromDate }: { recurrenceId: string; effectiveFromDate: string }) =>
      apiData(
        await getApiClient().DELETE('/calendar/recurrences/{recurrenceId}', {
          params: { path: { recurrenceId }, query: { effectiveFromDate } },
        }),
      ).data,
    [keys.calendar, keys.occurrences],
  )
}
/** One-tap fix for a conflict: the next free half hour that day (until 22:00), else the next day. */
export function useMoveCalendarItemToOpenSlot() {
  return useApiMutation(
    async ({ itemId }: { itemId: string }) =>
      apiData(
        await getApiClient().POST('/calendar-items/{itemId}/move-to-open-slot', {
          params: { path: { itemId } },
        }),
      ).data,
    // Moving a gathering item leaves the gathering (10 §9.6).
    [keys.calendar, keys.occurrences, keys.gatherings],
  )
}
