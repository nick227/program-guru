import { useEffect } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Row, Stack } from '@/components/ui/Layout'

export type ViewerItem = {
  id: string
  url?: string | null
  thumbnailUrl?: string | null
  type?: string
  alt?: string | null
  credit?: string | null
}

export function MediaViewer({
  items,
  index,
  onClose,
  onIndex,
}: {
  items: ViewerItem[]
  index: number
  onClose: () => void
  onIndex: (i: number) => void
}) {
  const item = items[index]
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onIndex(Math.min(items.length - 1, index + 1))
      if (e.key === 'ArrowLeft') onIndex(Math.max(0, index - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, items.length, onClose, onIndex])
  if (!item) return null
  const src = item.url || item.thumbnailUrl
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.alt || 'Media viewer'}
      className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4 text-white"
    >
      <Row className="justify-between">
        <p className="text-sm text-white/80">
          {index + 1} / {items.length}
          {item.credit ? ` · ${item.credit}` : ''}
        </p>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close"
          className="text-white hover:bg-white/10"
          onClick={onClose}
        >
          <X size={18} />
        </Button>
      </Row>
      <Stack className="min-h-0 flex-1 items-center justify-center">
        {item.type === 'VIDEO' && src ? (
          <video
            key={item.id}
            src={src}
            controls
            autoPlay
            className="max-h-[75vh] max-w-full"
          />
        ) : src ? (
          <img
            src={src}
            alt={item.alt || ''}
            className="max-h-[75vh] max-w-full object-contain"
          />
        ) : (
          <p>Preview unavailable</p>
        )}
      </Stack>
      <Row className="justify-center">
        <Button
          variant="outline"
          disabled={index === 0}
          aria-label="Previous"
          className="border-white/30 bg-transparent text-white"
          onClick={() => onIndex(index - 1)}
        >
          <ChevronLeft size={16} />
        </Button>
        <Button
          variant="outline"
          disabled={index >= items.length - 1}
          aria-label="Next"
          className="border-white/30 bg-transparent text-white"
          onClick={() => onIndex(index + 1)}
        >
          <ChevronRight size={16} />
        </Button>
      </Row>
    </div>
  )
}
