import { useQueryClient } from '@tanstack/react-query'
import { apiData, getApiClient } from '../client'
import { queryKeys as keys } from '../queryKeys'
import { useViewerKey } from './viewerKey'

/** Warm the same viewer-scoped caches used by destination routes. No synthetic DTOs. */
export function useProgramPrefetch() {
  const cache = useQueryClient()
  const viewerKey = useViewerKey([])
  return (
    programId: string,
    destination: 'preview' | 'workspace' = 'preview',
  ) => {
    const queryKey = [
      ...(destination === 'workspace'
        ? keys.workspace(programId)
        : keys.preview(programId)),
      ...viewerKey,
    ]
    void cache.prefetchQuery({
      queryKey,
      staleTime: 30_000,
      queryFn: async ({ signal }) =>
        destination === 'workspace'
          ? apiData(
              await getApiClient().GET('/programs/{programId}/workspace', {
                signal,
                params: { path: { programId } },
              }),
            ).data
          : apiData(
              await getApiClient().GET('/programs/{programId}', {
                signal,
                params: { path: { programId } },
              }),
            ).data,
    })
  }
}
