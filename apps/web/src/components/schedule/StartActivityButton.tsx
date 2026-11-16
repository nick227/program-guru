import { useNavigate } from 'react-router-dom'
import { Play } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { useStartToday } from '@/lib/startToday'

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
  const { start: startToday, pending } = useStartToday()

  const start = async () => {
    if (!signedIn) return navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`)
    try {
      const itemId = await startToday(activityId, { placeId })
      if (itemId) navigate(`/occurrences/${itemId}?returnTo=${encodeURIComponent(returnTo)}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start it right now')
    }
  }

  return (
    <Button loading={pending} disabled={pending} onClick={() => void start()}>
      {!pending && <Play size={15} className="fill-current" aria-hidden />}
      Start now
    </Button>
  )
}
