import { RelatedMedia, type RelatedMediaItem } from './RelatedMedia'

export type RiverItem = RelatedMediaItem & { title?: string | null }

export function RelatedMediaRiver({ items = [], className }: {
  title?: string
  description?: string
  items?: RiverItem[]
  emptyText?: string
  className?: string
}) {
  return <RelatedMedia items={items} className={className} />
}
