// Activity participation (03-UX §2b, 12 §10a). Every Activity rendered in the same moment shares one
// request: ids are collected for a few milliseconds and sent together (at most 50 per request), so a
// page of 20 cards costs one call, never 20. Lives under the Calendar key: any Calendar or gathering
// change refreshes it.
import { useQuery } from '@tanstack/react-query'
import { useViewerKey } from './viewerKey'
import { apiData, getApiClient } from '../client'
import { queryKeys as keys } from '../queryKeys'
import type { components } from '../generated/types'

export type ActivityParticipation = components['schemas']['ActivityParticipation']

const MAX_PER_REQUEST = 50
const WINDOW_MS = 12

type Waiter = { resolve: (p: ActivityParticipation | null) => void; reject: (e: unknown) => void }
let queue = new Map<string, Waiter[]>()
let timer: ReturnType<typeof setTimeout> | null = null

async function flush() {
  const batch = queue
  queue = new Map()
  timer = null
  const ids = [...batch.keys()]
  for (let i = 0; i < ids.length; i += MAX_PER_REQUEST) {
    const chunk = ids.slice(i, i + MAX_PER_REQUEST)
    try {
      const list = apiData(
        await getApiClient().GET('/activities/participation', { params: { query: { ids: chunk.join(',') } } }),
      ).data
      const byId = new Map(list.map((p) => [p.activityId, p]))
      // An omitted id is one the viewer may not see: null, never a guessed zero.
      for (const id of chunk) for (const w of batch.get(id) ?? []) w.resolve(byId.get(id) ?? null)
    } catch (error) {
      for (const id of chunk) for (const w of batch.get(id) ?? []) w.reject(error)
    }
  }
}

/** Queue one id into the current batch. Exported for tests. */
export function loadActivityParticipation(activityId: string): Promise<ActivityParticipation | null> {
  return new Promise((resolve, reject) => {
    const waiters = queue.get(activityId) ?? []
    waiters.push({ resolve, reject })
    queue.set(activityId, waiters)
    if (!timer) timer = setTimeout(() => void flush(), WINDOW_MS)
  })
}

export function useActivityParticipation(activityId: string | null | undefined) {
  return useQuery({
    queryKey: useViewerKey([...keys.calendar, 'participation', activityId ?? '']),
    enabled: !!activityId,
    staleTime: 30_000,
    queryFn: () => loadActivityParticipation(activityId!),
  })
}
