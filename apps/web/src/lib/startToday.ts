/**
 * Start now (03-UX §2a), one implementation for every surface (consolidation MR 5): reuse today's
 * planned personal entry of the Activity (lib/participation, the rule Join uses), else add one for
 * today, and return its id. Each surface decides what opening it means (the occurrence page, Home's
 * stage). Today is read fresh so a stale cache never adds a duplicate; one start at a time; a retry
 * after a failure replays the same idempotency key.
 */
import { useRef, useState } from 'react'
import { getApiClient, useAddCalendarItem, useCurrentUser, useUpdateCalendarItem } from '@project/sdk'
import { reusableTodayItem } from '@/lib/participation'
import { today } from '@/lib/dates'

export function useStartToday() {
  const me = useCurrentUser()
  const add = useAddCalendarItem()
  const update = useUpdateCalendarItem()
  const inFlight = useRef(false)
  const keys = useRef(new Map<string, string>())
  const [pendingId, setPendingId] = useState<string | null>(null)

  /** Today's entry for the Activity, reused or added; null when a start is already running. */
  const start = async (
    activityId: string,
    options: { placeId?: string | null; revisionId?: string | null } = {},
  ): Promise<string | null> => {
    if (inFlight.current) return null
    inFlight.current = true
    setPendingId(activityId)
    try {
      const day = today(me.data?.data.preferences.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
      const res = await getApiClient().GET('/calendar/items', { params: { query: { start: day, end: day } } })
      if (res.error) throw new Error(res.error.message ?? 'Could not load your Calendar')
      const items = res.data?.data ?? []
      const existing = items.find((item) => item.id === reusableTodayItem(items, activityId))
      const { placeId } = options
      if (existing) {
        if (placeId !== undefined && placeId !== (existing.place?.id ?? null)) {
          await update.mutateAsync({ itemId: existing.id, placeId, expectedUpdatedAt: existing.updatedAt })
        }
        return existing.id
      }
      const key = keys.current.get(activityId) ?? crypto.randomUUID()
      keys.current.set(activityId, key)
      const added = await add.mutateAsync({
        activityId,
        localDate: day,
        ...(options.revisionId ? { revisionId: options.revisionId } : {}),
        ...(placeId !== undefined ? { placeId } : {}),
        idempotencyKey: key,
      })
      keys.current.delete(activityId)
      return added.item.id
    } finally {
      inFlight.current = false
      setPendingId(null)
    }
  }

  return { start, pendingId, pending: pendingId !== null }
}
