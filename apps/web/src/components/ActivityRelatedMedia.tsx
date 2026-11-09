import { useActivityMedia } from '@/lib/useEntityMedia'
import { RelatedMedia, type RelatedMediaItem } from './RelatedMedia'
import { RelatedMediaMenu } from './RelatedMediaMenu'

export function ActivityRelatedMedia({ activityId, revisionId, items }: {
  activityId: string
  revisionId: string | null
  items: RelatedMediaItem[]
}) {
  const media = useActivityMedia(revisionId)
  const ready = media.items.filter(item => item.status === 'ready' && item.mediaId)
  const ids = new Set(ready.map(item => item.mediaId))
  return <RelatedMedia
    items={[
      ...items.filter(item => !ids.has(item.id)),
      ...ready.map(item => ({ id: item.mediaId!, thumbnailUrl: item.src, type: item.type, alt: item.alt,
        menu: <RelatedMediaMenu mediaId={item.mediaId!} activityId={activityId} />,
      })),
    ]}
    onAdd={revisionId ? media.add : undefined}
    pending={media.items.filter(item => !ids.has(item.mediaId))}
  />
}
