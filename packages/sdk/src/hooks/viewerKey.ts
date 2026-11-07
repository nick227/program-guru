import type { QueryKey } from '@tanstack/react-query'
import { useCurrentUser } from './useAuth'

/** Public DTOs also contain viewer permissions. Never reuse another viewer's projection. */
export function useViewerKey(key: QueryKey): QueryKey {
  const me = useCurrentUser()
  const viewer = me.isPending
    ? 'pending'
    : me.isError
      ? 'anonymous'
      : (me.data?.data.id ?? 'anonymous')
  return [...key, { viewer }]
}
