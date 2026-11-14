import { useState } from 'react'
import { Users } from 'lucide-react'
import { toast } from 'sonner'
import {
  useCreateGathering,
  useCreateGatheringLink,
  useGathering,
  useLeaveGathering,
  useUpdateGathering,
  type components,
} from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { ShareLinkField } from '@/components/social/ShareLink'

type S = components['schemas']

/**
 * Gathering controls inside the existing occurrence room (10 §9): who this occurrence is shared with,
 * a share link for this exact time, leaving, and (owner) public listing. A personal, standalone item
 * can be opened to others in place. The room itself (Together row, shared media) is unchanged.
 */
export function OccurrenceGathering({ item, activity }: { item: S['CalendarItem']; activity?: S['ActivityDetail'] }) {
  const gathering = useGathering(item.gatheringId)
  const create = useCreateGathering()
  const link = useCreateGatheringLink()
  const leave = useLeaveGathering()
  const update = useUpdateGathering()
  const [url, setUrl] = useState<string | null>(null)

  if (item.gatheringId) {
    const g = gathering.data
    if (!g) return null
    const onLeave = async () => {
      if (!window.confirm('Leave this gathering? It stays on your Calendar as your own Activity.')) return
      try {
        await leave.mutateAsync({ gatheringId: g.id })
        toast.success('You left the gathering. It is still on your Calendar.')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not leave')
      }
    }
    const onLink = async () => {
      try {
        setUrl((await link.mutateAsync({ gatheringId: g.id })).url)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not create a link')
      }
    }
    const onListing = async (listPublicly: boolean) => {
      try {
        await update.mutateAsync({ gatheringId: g.id, listPublicly })
        toast.success(listPublicly ? 'Listed publicly' : 'Only people with the link can join now')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not update')
      }
    }
    return (
      <div className="activity-hero__gathering">
        <p className="activity-hero__gathering-line">
          <Users size={14} aria-hidden />
          <span>
            Open to others · {g.memberCount} {g.memberCount === 1 ? 'person' : 'people'}
            {g.capacity ? ` of ${g.capacity}` : ''} · {g.visibility === 'PUBLIC' ? 'listed publicly' : 'invite only'}
          </span>
        </p>
        <div className="activity-hero__gathering-actions">
          {g.status === 'ACTIVE' && !g.isPast && !url && (
            <Button size="sm" variant="outline" loading={link.isPending} onClick={() => void onLink()}>
              Share link
            </Button>
          )}
          {g.viewerIsOwner && g.status === 'ACTIVE' && activity?.visibility === 'PUBLIC' && (
            <Button size="sm" variant="ghost" loading={update.isPending} onClick={() => void onListing(g.visibility !== 'PUBLIC')}>
              {g.visibility === 'PUBLIC' ? 'Stop listing publicly' : 'List publicly'}
            </Button>
          )}
          <Button size="sm" variant="ghost" loading={leave.isPending} onClick={() => void onLeave()}>
            Leave gathering
          </Button>
        </div>
        {url && <ShareLinkField url={url} shareTitle={activity?.title ?? 'Join me'} copiedMessage="Link copied" inputLabel="Gathering link" />}
      </div>
    )
  }

  // A personal standalone item can become a gathering in place (10 §9.4).
  const canOpen =
    !item.enrollmentId && item.status === 'PLANNED' && !!activity && activity.status === 'PUBLISHED' && activity.visibility !== 'PRIVATE'
  if (!canOpen) return null
  const onOpen = async () => {
    try {
      await create.mutateAsync({
        activityId: item.activityId,
        localDate: item.localDate,
        localTime: item.localTime,
        placeId: item.place?.id ?? null,
        calendarItemId: item.id,
        idempotencyKey: crypto.randomUUID(),
      })
      toast.success('Open to others. Share the link to invite people.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open this to others')
    }
  }
  return (
    <div className="activity-hero__gathering">
      <Button size="sm" variant="outline" loading={create.isPending} onClick={() => void onOpen()} className="self-start">
        <Users size={14} aria-hidden />
        Open to others
      </Button>
    </div>
  )
}
