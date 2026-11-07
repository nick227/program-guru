import {
  onlineManager,
  useMutation,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query'
import { ApiError } from '../client'

// Writes are never queued offline or retried automatically. A caller retains its input/key on failure.
export function useApiMutation<V, T>(
  write: (variables: V) => Promise<T>,
  invalidates: QueryKey[],
  scope?: string,
) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: (variables: V) => {
      if (!onlineManager.isOnline())
        throw new ApiError(
          0,
          'You are offline. Reconnect before saving.',
          'OFFLINE',
        )
      return write(variables)
    },
    scope: scope ? { id: scope } : undefined,
    networkMode: 'always',
    retry: false,
    onError: async (error) => {
      if (error instanceof ApiError && error.code === 'VERSION_CONFLICT')
        await Promise.all(
          invalidates.map((queryKey) => cache.invalidateQueries({ queryKey })),
        )
    },
    onSuccess: async () => {
      await Promise.all(
        invalidates.map((queryKey) => cache.invalidateQueries({ queryKey })),
      )
    },
  })
}
