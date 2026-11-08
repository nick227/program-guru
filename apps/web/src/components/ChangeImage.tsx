import { useEffect, useRef, useState } from 'react'
import { ImageIcon, Loader2 } from 'lucide-react'
import type { Hero } from '@/lib/hero'
import type { CoverController } from '@/lib/useEntityCover'
import { useOnline } from '@/lib/useOnline'
import { useMediaUpload } from '@project/sdk'
import { EntityHero } from './EntityHero'
import { MediaPicker } from './MediaPicker'
import { Button } from './ui/Button'
import { ErrorMessage } from './ui/Feedback'

/**
 * Compact identity-image control: the hero, `Change image` (choose from the
 * media library, photos only, no capture), `Upload image` as an additional
 * direct path that waits for processing before setting the cover, and
 * `Remove image`.
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
  const upload = useMediaUpload()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [localBusy, setLocalBusy] = useState(false)
  const [waitingId, setWaitingId] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [picking, setPicking] = useState(false)

  // Attachment requires a READY asset; wait for processing if needed, then set cover.
  useEffect(() => {
    if (!waitingId || upload.stage !== 'ready' || localBusy || error) return
    const id = waitingId
    setLocalBusy(true)
    cover
      .set(id)
      .then(() => setWaitingId(null))
      .catch(setError)
      .finally(() => setLocalBusy(false))
  }, [waitingId, upload.stage, localBusy, error, cover])

  const working =
    localBusy ||
    upload.busy ||
    cover.pending ||
    (!!waitingId && upload.stage === 'processing')
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
              setLocalBusy(true)
              try {
                const asset = await upload.upload(file)
                if (asset) {
                  if (asset.state === 'READY') {
                    await cover.set(asset.id)
                  } else {
                    setWaitingId(asset.id)
                  }
                }
              } catch (err) {
                setError(err)
              } finally {
                setLocalBusy(false)
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
          <ErrorMessage error={error || cover.error || upload.error} />
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
