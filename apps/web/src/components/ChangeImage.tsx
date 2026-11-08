import { useState } from 'react'
import { ImageIcon } from 'lucide-react'
import type { Hero } from '@/lib/hero'
import type { CoverController } from '@/lib/useEntityCover'
import { useOnline } from '@/lib/useOnline'
import { EntityHero } from './EntityHero'
import { MediaPicker } from './MediaPicker'
import { Button } from './ui/Button'
import { ErrorMessage } from './ui/Feedback'

/**
 * Compact identity-image control: the hero, one `Change image` action using
 * the existing media library, and `Remove image`. Capture is not offered here;
 * it lives beside Session Controls.
 */
export function ChangeImage({
  hero,
  cover,
  label,
  canEdit,
}: {
  hero: Hero
  cover: CoverController
  /** e.g. "Program cover" or "Activity image" */
  label: string
  canEdit: boolean
}) {
  const online = useOnline()
  const [picking, setPicking] = useState(false)
  const [removeError, setRemoveError] = useState<unknown>(null)
  return (
    <div className="flex items-center gap-3" aria-label={label} role="group">
      <EntityHero hero={hero} size="header" />
      {canEdit && (
        <div className="flex min-w-0 flex-col items-start gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={!online || cover.pending}
            onClick={() => setPicking(true)}
          >
            <ImageIcon size={14} aria-hidden />
            Change image
          </Button>
          {cover.hasCover && (
            <Button
              variant="link"
              size="sm"
              className="px-0 text-xs"
              disabled={!online || cover.pending}
              onClick={async () => {
                setRemoveError(null)
                try {
                  await cover.remove()
                } catch (error) {
                  setRemoveError(error)
                }
              }}
            >
              Remove image
            </Button>
          )}
          <ErrorMessage error={removeError} />
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
