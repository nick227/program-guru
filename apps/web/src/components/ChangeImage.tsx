import { useEffect, useRef, useState } from 'react'
import { ImageIcon, Loader2 } from 'lucide-react'
import type { Hero } from '@/lib/hero'
import type { CoverController } from '@/lib/useEntityCover'
import { useOnline } from '@/lib/useOnline'
import { useInboundMedia } from '@project/sdk'
import { EntityHero } from './EntityHero'
import { MediaPicker } from './MediaPicker'
import { Button } from './ui/Button'
import { ErrorMessage } from './ui/Feedback'

/**
 * Compact identity-image control: the hero, `Change image` (choose from the
 * media library, photos only, no capture), `Upload image` as an additional
 * direct path with server-backed intent, and `Remove image`.
 */
export function ChangeImage({
  hero,
  cover,
  label,
  canEdit,
  compact = false,
}: {
  hero: Hero
  cover: CoverController
  /** e.g. "Program cover" or "Activity image" */
  label: string
  canEdit: boolean
  compact?: boolean
}) {
  const online = useOnline()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<unknown>(null)
  const [picking, setPicking] = useState(false)

  const inbound = useInboundMedia({
    target: cover.target,
    purpose: 'COVER',
    onError: setError,
  })

  // Once upload reaches ready, notify cover controller to invalidate caches
  useEffect(() => {
    if (inbound.stage === 'ready' && inbound.mediaId) {
      cover.set(inbound.mediaId).catch(() => {})
    }
  }, [inbound.stage, inbound.mediaId, cover])

  const working = inbound.busy || inbound.stage === 'processing' || cover.pending
  const disabled = !online || working

  return (
    <div className="flex items-center gap-3" aria-label={label} role="group">
      {(!compact || cover.hasCover) && (
        <EntityHero hero={hero} size={compact ? 'thumb' : 'header'} />
      )}
      {canEdit && (
        <div className="flex min-w-0 flex-col items-start gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            disabled={disabled}
            onChange={async (event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              if (!file.type.startsWith('image/')) {
                setError(new Error('Choose an image for this cover.'))
                return
              }
              setError(null)
              try {
                const asset = await inbound.upload(file)
                if (asset?.state === 'READY') {
                  await cover.set(asset.id)
                }
              } catch (err) {
                setError(err)
              }
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => setPicking(true)}
          >
            {working ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <ImageIcon size={14} aria-hidden />
            )}
            {working ? 'Uploading…' : compact && !cover.hasCover ? 'Attach Program image' : 'Change image'}
          </Button>
          <Button
            variant="link"
            size="sm"
            className="px-0 text-xs"
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
          >
            Upload image
          </Button>
          {cover.hasCover && (
            <Button
              variant="link"
              size="sm"
              className="px-0 text-xs"
              disabled={disabled}
              onClick={async () => {
                setError(null)
                try {
                  await cover.remove()
                } catch (err) {
                  setError(err)
                }
              }}
            >
              Remove image
            </Button>
          )}
          <ErrorMessage error={error || cover.error || inbound.error} />
        </div>
      )}
      {picking && (
        <MediaPicker
          title={`Choose ${label.toLowerCase()}`}
          allowCapture={false}
          onClose={() => setPicking(false)}
          onSelect={async (asset) => {
            if (asset.type !== 'PHOTO')
              throw new Error('Choose a photo for this image.')
            await cover.set(asset.id)
          }}
        />
      )}
    </div>
  )
}
