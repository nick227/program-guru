import { useState } from 'react'
import { Play, ArrowRight, Video, Image as ImageIcon } from 'lucide-react'
import { MediaViewer, type ViewerItem } from '@/components/MediaViewer'
import { formatMediaDuration } from '@/lib/mediaDuration'
import { cn } from '@/lib/utils'
import { SectionHeader } from '@/components/ui/SectionHeader'

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

export function ProgramMediaGallery({
  title = 'Related Media',
  description = 'Videos, examples and resources for this program.',
  items = [],
  coverUrl,
  className,
}: ProgramMediaGalleryProps) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

  // Filter out any items that duplicate the Program cover
  const filteredItems = items.filter((item) => {
    if (!item.thumbnailUrl) return false
    if (coverUrl && item.thumbnailUrl === coverUrl) return false
    return true
  })

  // Real media only: with nothing to show, the section is omitted (04-UI §4a).
  const displayItems = filteredItems
  if (displayItems.length === 0) return null

  const viewerItems: ViewerItem[] = displayItems.map((item) => ({
    id: item.id,
    publicationId: item.publicationId,
    thumbnailUrl: item.thumbnailUrl,
    type: item.type,
    alt: item.alt || item.title,
    credit: item.credit,
    attribution: item.attribution,
    license: item.license,
  }))

  return (
    <section aria-label={title} className={cn('space-y-4', className)}>
      <SectionHeader
        title={title}
        description={description}
        action={
          <button
            type="button"
            onClick={() => setViewerIndex(0)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
          >
            <span>View all {displayItems.length}</span>
            <ArrowRight size={14} aria-hidden />
          </button>
        }
      />

      {/* Up to four previews; View all opens the viewer */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {displayItems.slice(0, 4).map((item, idx) => {
          const isVideo = item.type === 'VIDEO'
          const duration = formatMediaDuration(item.durationMs) || item.durationLabel

          return (
            <button
              key={item.id || idx}
              type="button"
              onClick={() => setViewerIndex(idx)}
              className={cn(
                'group relative aspect-preview w-full overflow-hidden rounded-[var(--radius-panel)] border border-border bg-surface-muted text-left',
                'transition-all duration-200 hover:border-accent hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              )}
            >
              {item.thumbnailUrl ? (
                <img
                  src={item.thumbnailUrl}
                  alt={item.title || 'Related media preview'}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-surface-muted text-muted text-xs">
                  {isVideo ? <Video size={20} /> : <ImageIcon size={20} />}
                </div>
              )}

              {/* Video Play Button Overlay */}
              {isVideo && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/25 group-hover:bg-black/15 transition-colors">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm group-hover:scale-110 shadow-lg transition-transform">
                    <Play size={16} className="translate-x-0.5 fill-current" />
                  </span>
                </div>
              )}

              {/* Duration Timestamp Badge (e.g. 4:36) in bottom-right corner */}
              {duration && (
                <div className="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
                  {duration}
                </div>
              )}

              {/* Gradient Title Overlay */}
              {item.title && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-2 text-white">
                  <p className="truncate text-xs font-medium leading-tight">
                    {item.title}
                  </p>
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Full Screen Interactive Lightbox / Player */}
      {viewerIndex !== null && (
        <MediaViewer
          items={viewerItems}
          index={viewerIndex}
          onIndex={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </section>
  )
}
