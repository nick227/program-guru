import type { QueryKey } from '@tanstack/react-query'
import { authStateOf, useCurrentUser } from './useAuth'

/** Public DTOs also contain viewer permissions. Never reuse another viewer's projection. */
export function useViewerKey(key: QueryKey): QueryKey {
  const me = useCurrentUser()
  const state = authStateOf(me)
  // A transient /auth/me failure is not 'anonymous': keep it apart so a signed-out projection is
  // never cached under that key and later shown as if it were the viewer's.
  const viewer =
    state === 'signed-in'
      ? me.data!.data.id
      : state === 'signed-out'
        ? 'anonymous'
        : me.isPending
          ? 'pending'
          : 'unknown'
  return [...key, { viewer }]
}
