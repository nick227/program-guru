import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play } from 'lucide-react'
import { toast } from 'sonner'
import { getApiClient, useAddCalendarItem } from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { reusableTodayItem } from '@/features/home/engine/surferDeck'
import { today } from '@/lib/dates'

/**
 * Start now from a dedicated page (03-UX §2a): reuse today's planned personal item of this Activity,
 * else add one for today, then open its occurrence. Signed out, sign in first.
 */
export function StartActivityButton({
  activityId,
  signedIn,
  returnTo,
}: {
  activityId: string
  signedIn: boolean
  returnTo: string
}) {
  const navigate = useNavigate()
  const add = useAddCalendarItem()
  const [busy, setBusy] = useState(false)
  const [key] = useState(() => crypto.randomUUID())

  const start = async () => {
    if (!signedIn) return navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`)
    if (busy) return
    setBusy(true)
    try {
      const day = today(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
      const res = await getApiClient().GET('/calendar/items', { params: { query: { start: day, end: day } } })
      const itemId =
        reusableTodayItem(res.data?.data ?? [], activityId) ??
        (await add.mutateAsync({ activityId, localDate: day, idempotencyKey: key })).item.id
      navigate(`/occurrences/${itemId}?returnTo=${encodeURIComponent(returnTo)}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start it right now')
      setBusy(false)
    }
  }

  return (
    <Button loading={busy} disabled={busy} onClick={() => void start()}>
      {!busy && <Play size={15} className="fill-current" aria-hidden />}
      Start now
    </Button>
  )
}
