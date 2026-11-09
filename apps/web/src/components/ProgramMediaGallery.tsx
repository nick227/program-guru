import { RelatedMedia } from './RelatedMedia'

export interface ProgramMediaItem {
  id: string
  thumbnailUrl?: string | null
  title?: string | null
  alt?: string | null
  type?: 'PHOTO' | 'VIDEO' | 'AUDIO' | string
  durationMs?: number | null
  durationLabel?: string | null
  publicationId?: string
  credit?: string | null
  attribution?: string | null
  license?: string | null
}

export interface ProgramMediaGalleryProps {
  title?: string
  description?: string
  items?: ProgramMediaItem[]
  coverUrl?: string | null
  className?: string
}

export function ProgramMediaGallery({ items = [], coverUrl, className }: ProgramMediaGalleryProps) {
  return <RelatedMedia className={className} items={items.filter(item => item.thumbnailUrl && item.thumbnailUrl !== coverUrl).map(item => ({ ...item, url: item.thumbnailUrl }))} />
}
