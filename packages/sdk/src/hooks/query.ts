import { useQuery, type QueryKey } from '@tanstack/react-query'
import type { components } from '../generated/types'
import { apiData } from '../client'

type Envelope<T> = { data: T }
type FetchResult<T> = {
  data?: Envelope<T>
  error?: components['schemas']['Error']
  response: Response
}

/** One place for the common GET + {data} response unwrapping pattern.
 * Query keys, authorization-sensitive keys and stale times remain caller-owned.
 */
export function useApiQuery<T>({
  queryKey,
  enabled,
  staleTime,
  request,
}: {
  queryKey: QueryKey
  enabled?: boolean
  staleTime?: number
  request: (signal: AbortSignal) => Promise<FetchResult<T>>
}) {
  return useQuery({
    queryKey,
    enabled,
    staleTime,
    queryFn: async ({ signal }) => apiData(await request(signal)).data,
  })
}
