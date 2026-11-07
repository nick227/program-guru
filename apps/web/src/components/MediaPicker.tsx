import { useMediaDialog } from '@/lib/useMediaDialog'
import { useRef, useState } from 'react'
import type { components } from '@project/sdk'
import { MediaLibrary } from './MediaLibrary'
import { Button } from './ui/Button'
import { ErrorMessage } from './ui/Feedback'
import { Row, Stack } from './ui/Layout'

/** Keep the originating route mounted: selection preserves day, scroll and drafts. */
export function MediaPicker({
  onClose,
  onSelect,
  selected = [],
  title = 'Attach media',
}: {
  onClose: () => void
  onSelect: (asset: components['schemas']['MediaAsset']) => Promise<void>
  selected?: string[]
  title?: string
}) {
  const dialog = useMediaDialog()
  const busy = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  return (
    <dialog
      ref={dialog}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy.current) onClose()
      }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[90dvh] w-full max-w-none overflow-auto rounded-t-2xl border border-border bg-surface p-4 text-text backdrop:bg-black/50 sm:bottom-0 sm:left-auto sm:right-0 sm:top-0 sm:h-dvh sm:max-h-none sm:w-[32rem] sm:rounded-none"
    >
      <Stack>
        <Row className="justify-between">
          <h2>{title}</h2>
          <Button variant="ghost" disabled={pending} onClick={onClose}>
            Close
          </Button>
        </Row>
        <ErrorMessage error={error} />
        {pending && <p role="status">Attaching…</p>}
        <fieldset disabled={pending}>
          <MediaLibrary
            selecting
            selected={selected}
            onSelect={(asset) => {
              if (
                busy.current ||
                asset.state !== 'READY' ||
                selected.includes(asset.id)
              )
                return
              busy.current = true
              setPending(true)
              setError(null)
              void onSelect(asset)
                .then(onClose)
                .catch(setError)
                .finally(() => {
                  busy.current = false
                  setPending(false)
                })
            }}
          />
        </fieldset>
      </Stack>
    </dialog>
  )
}
