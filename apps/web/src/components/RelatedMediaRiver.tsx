import { useRef, useState } from 'react'
import { Play, ChevronLeft, ChevronRight, Upload, Loader2, Image as ImageIcon } from 'lucide-react'
import { Button } from './ui/Button'
import { MediaViewer, type ViewerItem } from './MediaViewer'
import { ErrorMessage } from './ui/Feedback'

export type RiverItem = {
  id: string
  thumbnailUrl?: string | null
  title?: string | null
  alt?: string | null
  type?: 'PHOTO' | 'VIDEO' | 'AUDIO' | string
  publicationId?: string
  credit?: string | null
  attribution?: string | null
  license?: string | null
}

export function RelatedMediaRiver({
  title = 'Related Media',
  description,
  items = [],
  emptyText = 'No related media yet.',
  canUpload = false,
  onUpload,
  className = '',
}: {
  title?: string
  description?: string
  items?: RiverItem[]
  emptyText?: string
  canUpload?: boolean
  onUpload?: (file: File) => Promise<void>
  className?: string
}) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<unknown>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const riverRef = useRef<HTMLDivElement>(null)

  function scroll(direction: 'left' | 'right') {
    if (!riverRef.current) return
    const offset = direction === 'left' ? -320 : 320
    riverRef.current.scrollBy({ left: offset, behavior: 'smooth' })
  }

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !onUpload) return
    setUploading(true)
    setUploadError(null)
    try {
      await onUpload(file)
    } catch (err) {
      setUploadError(err)
    } finally {
      setUploading(false)
    }
  }

  const viewerItems: ViewerItem[] = items.map((item) => ({
    id: item.id,
    publicationId: item.publicationId,
    thumbnailUrl: item.thumbnailUrl,
    type: item.type,
    alt: item.alt || item.title,
    credit: item.credit,
    attribution: item.attribution,
    license: item.license,
  }))

  const hasItems = items.length > 0

  return (
    <section aria-label={title} className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description && <p className="text-xs text-muted">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {canUpload && onUpload && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                disabled={uploading}
                onChange={(e) => void handleFileSelect(e)}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="gap-1.5 text-xs"
              >
                {uploading ? (
                  <Loader2 size={14} className="animate-spin text-accent" />
                ) : (
                  <Upload size={14} />
                )}
                <span>{uploading ? 'Uploading…' : 'Upload media'}</span>
              </Button>
            </>
          )}
          {hasItems && items.length > 3 && (
            <div className="hidden sm:flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Scroll left"
                onClick={() => scroll('left')}
                className="h-8 w-8 rounded-full"
              >
                <ChevronLeft size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Scroll right"
                onClick={() => scroll('right')}
                className="h-8 w-8 rounded-full"
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          )}
        </div>
      </div>

      <ErrorMessage error={uploadError} />

      {!hasItems ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-8 text-center bg-surface/50">
          <ImageIcon className="h-10 w-10 text-muted/60 mb-2" />
          <p className="text-sm text-muted">{emptyText}</p>
          {canUpload && onUpload && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 gap-1.5"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={14} />
              Upload first photo or video
            </Button>
          )}
        </div>
      ) : (
        <div
          ref={riverRef}
          role="region"
          aria-label={`${title} carousel`}
          tabIndex={0}
          className="flex gap-3 overflow-x-auto pb-2 pt-1 scroll-smooth snap-x snap-mandatory focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          {items.map((item, idx) => {
            const isVideo = item.type === 'VIDEO'
            return (
              <button
                key={item.id || idx}
                type="button"
                onClick={() => setViewerIndex(idx)}
                className="group relative flex-shrink-0 snap-start w-48 sm:w-60 aspect-[16/10] overflow-hidden rounded-xl border border-border bg-surface-muted text-left transition-all duration-200 hover:border-accent hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {item.thumbnailUrl ? (
                  <img
                    src={item.thumbnailUrl}
                    alt={item.alt || item.title || 'Related media'}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-surface-muted text-muted text-xs">
                    {isVideo ? 'Video' : 'Photo'}
                  </div>
                )}

                {isVideo && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition-colors">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm group-hover:scale-110 transition-transform">
                      <Play size={18} className="translate-x-0.5 fill-current" />
                    </span>
                  </div>
                )}

                {(item.title || item.credit) && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 text-white">
                    {item.title && (
                      <p className="truncate text-xs font-medium">{item.title}</p>
                    )}
                    {item.credit && (
                      <p className="truncate text-[10px] text-white/70">
                        {item.credit}
                      </p>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {viewerIndex !== null && viewerItems.length > 0 && (
        <MediaViewer
          items={viewerItems}
          index={viewerIndex}
          onIndex={(i) => setViewerIndex(i)}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </section>
  )
}

