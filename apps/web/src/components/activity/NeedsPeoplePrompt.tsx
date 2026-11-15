import { Users } from 'lucide-react'
import { toast } from 'sonner'
import { useCreateGatheringLink, type components } from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { dateLabel } from '@/lib/dates'

/**
 * A gathering I joined still has open spots (12 §5b): a participation prompt whose one action is
 * Share. It never suggests joining again.
 */
export function NeedsPeoplePrompt({ item }: { item: components['schemas']['NeedsPeople'] }) {
  const link = useCreateGatheringLink()
  const g = item.gathering
  const onShare = async () => {
    try {
      const { url } = await link.mutateAsync({ gatheringId: g.id })
      if (navigator.share) await navigator.share({ title: g.activity.title, url }).catch(() => undefined)
      else {
        await navigator.clipboard.writeText(url)
        toast.success('Link copied')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create a link')
    }
  }
  return (
    <div className="gathering-suggestion" role="status">
      <Users size={14} aria-hidden />
      <span className="min-w-0 flex-1">
        Your {g.activity.title} gathering on {dateLabel(g.localDate, { weekday: 'short', month: 'short', day: 'numeric' })} has{' '}
        {item.openSpots} open {item.openSpots === 1 ? 'spot' : 'spots'}
      </span>
      <Button size="sm" variant="outline" loading={link.isPending} onClick={() => void onShare()}>
        Share
      </Button>
    </div>
  )
}
