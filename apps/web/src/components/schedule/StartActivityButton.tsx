import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play } from 'lucide-react'
import { toast } from 'sonner'
import { getApiClient, useAddCalendarItem, useUpdateCalendarItem } from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { reusableTodayItem } from '@/lib/participation'
import { today } from '@/lib/dates'

/**
 * Start now from a dedicated page (03-UX §2a): reuse today's planned personal item of this Activity,
 * else add one for today, then open its occurrence. Signed out, sign in first.
 */
export function StartActivityButton({
  activityId,
  placeId,
  signedIn,
  returnTo,
}: {
  placeId?: string | null
  activityId: string
  signedIn: boolean
  returnTo: string
}) {
  const navigate = useNavigate()
  const add = useAddCalendarItem()
  const update = useUpdateCalendarItem()
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [key] = useState(() => crypto.randomUUID())

  const start = async () => {
    if (!signedIn) return navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`)
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      const day = today(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
      const res = await getApiClient().GET('/calendar/items', { params: { query: { start: day, end: day } } })
      if (res.error) throw new Error(res.error.message ?? 'Could not load your Calendar')
      const items = res.data?.data ?? []
      const existingId = reusableTodayItem(items, activityId)
      const existing = items.find(item => item.id === existingId)
      if (existing && placeId !== undefined && placeId !== (existing.place?.id ?? null)) {
        await update.mutateAsync({ itemId: existing.id, placeId, expectedUpdatedAt: existing.updatedAt })
      }
      const itemId = existing?.id ??
        (await add.mutateAsync({ activityId, localDate: day, placeId, idempotencyKey: key })).item.id
      navigate(`/occurrences/${itemId}?returnTo=${encodeURIComponent(returnTo)}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start it right now')
      setBusy(false)
      inFlight.current = false
    }
  }

  return (
    <Button loading={busy} disabled={busy} onClick={() => void start()}>
      {!busy && <Play size={15} className="fill-current" aria-hidden />}
      Start now
    </Button>
  )
}
