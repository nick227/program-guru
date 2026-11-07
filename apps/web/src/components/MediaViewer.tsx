import { useMediaDialog } from '@/lib/useMediaDialog'
import { useEffect, useState, type ReactNode } from 'react'
import { useMediaUrl } from '@project/sdk'
import { ErrorMessage, Loading } from './ui/Feedback'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Row, Stack } from '@/components/ui/Layout'

export type ViewerItem = {
  publicationId?: string
  id: string
  url?: string | null
  thumbnailUrl?: string | null
  type?: string
  alt?: string | null
  credit?: string | null
  attribution?: string | null
  license?: string | null
}

export function MediaViewer({
  items,
  index,
  onClose,
  onIndex,
  children,
}: {
  children?: ReactNode
  items: ViewerItem[]
  index: number
  onClose: () => void
  onIndex: (i: number) => void
}) {
  const item = items[index]
  const delivery = useMediaUrl(item?.id ?? '', item?.publicationId)
  const dialog = useMediaDialog()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
  }, [item?.id, delivery.dataUpdatedAt])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onIndex(Math.min(items.length - 1, index + 1))
      if (e.key === 'ArrowLeft') onIndex(Math.max(0, index - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, items.length, onClose, onIndex])
  if (!item) return null
  const src =
    delivery.isError || delivery.isFetching ? undefined : delivery.data?.url
  return (
    <dialog
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label={item.alt || 'Media viewer'}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none flex-col bg-black/95 overflow-auto p-4 text-white open:flex backdrop:bg-black"
    >
      <Row className="justify-between">
        <p className="text-sm text-white/80">
          {index + 1} / {items.length}
          {[item.credit, item.attribution, item.license]
            .filter(Boolean)
            .map((value) => ` · ${value}`)
            .join('')}
        </p>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close"
          className="text-white hover:bg-white/10"
          onClick={onClose}
        >
          <X aria-hidden size={18} />
        </Button>
      </Row>
      <Stack className="min-h-0 flex-1 items-center justify-center">
        {delivery.isFetching && <Loading />}
        <ErrorMessage
          error={
            delivery.error ||
            (failed ? new Error('Media could not be loaded.') : null)
          }
          retry={() => void delivery.refetch()}
        />
        {!failed && item.type === 'AUDIO' && src ? (
          <audio
            key={item.id}
            src={src}
            controls
            preload="metadata"
            onError={() => setFailed(true)}
          />
        ) : !failed && item.type === 'VIDEO' && src ? (
          <video
            key={item.id}
            src={src}
            controls
            playsInline
            preload="metadata"
            poster={delivery.data?.posterUrl ?? undefined}
            onError={() => setFailed(true)}
            className="max-h-[75vh] max-w-full"
          />
        ) : !failed && src ? (
          <img
            src={src}
            onError={() => setFailed(true)}
            alt={item.alt || ''}
            className="max-h-[75vh] max-w-full object-contain"
          />
        ) : !delivery.isFetching && !delivery.error && !failed ? (
          <p>Preview unavailable</p>
        ) : null}
      </Stack>
      {children}
      <Row className="justify-center">
        <Button
          variant="outline"
          disabled={index === 0}
          aria-label="Previous"
          className="border-white/30 bg-transparent text-white"
          onClick={() => onIndex(index - 1)}
        >
          <ChevronLeft aria-hidden size={16} />
        </Button>
        <Button
          variant="outline"
          disabled={index >= items.length - 1}
          aria-label="Next"
          className="border-white/30 bg-transparent text-white"
          onClick={() => onIndex(index + 1)}
        >
          <ChevronRight aria-hidden size={16} />
        </Button>
      </Row>
    </dialog>
  )
}
