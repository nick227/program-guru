import { useEffect, useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { useMediaUpload } from '@project/sdk'
import { Button } from './ui/Button'
import { ErrorMessage } from './ui/Feedback'

/**
 * Compact camera action beside Session Controls (03-UX §6 row 4).
 * Captures with the device camera, uploads privately, and attaches the
 * READY asset to the current attempt. It never starts the session timer
 * and never touches the Activity's identity image.
 */
export function SessionCapture({
  attach,
  disabled,
}: {
  attach: (mediaId: string) => Promise<void>
  disabled: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const upload = useMediaUpload()
  const [waitingId, setWaitingId] = useState<string | null>(null)
  const [attaching, setAttaching] = useState(false)
  const [attached, setAttached] = useState(false)
  const [error, setError] = useState<unknown>(null)

  // Attachment requires a READY asset; wait for processing, then attach once.
  useEffect(() => {
    if (!waitingId || upload.stage !== 'ready' || attaching || error) return
    const id = waitingId
    setAttaching(true)
    attach(id)
      .then(() => {
        setWaitingId(null)
        setAttached(true)
      })
      .catch(setError)
      .finally(() => setAttaching(false))
  }, [waitingId, upload.stage, attaching, error, attach])

  const working =
    upload.busy || attaching || (!!waitingId && upload.stage === 'processing')
  const status = upload.busy
    ? 'Uploading capture…'
    : waitingId && upload.stage === 'processing'
      ? 'Processing capture…'
      : attaching
        ? 'Adding to this attempt…'
        : upload.stage === 'failed' && waitingId
          ? 'Couldn’t process this capture.'
          : attached
            ? 'Capture added to this attempt.'
            : null

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={async (event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          setError(null)
          setAttached(false)
          const asset = await upload.upload(file)
          if (asset) setWaitingId(asset.id)
        }}
      />
      <Button
        variant="ghost"
        size="icon"
        aria-label="Capture media"
        title="Capture a photo or video for this attempt"
        disabled={disabled || working}
        onClick={() => input.current?.click()}
      >
        <Camera size={18} aria-hidden />
      </Button>
      {status && (
        <p role="status" className="basis-full text-xs text-muted">
          {status}
        </p>
      )}
      <div className="basis-full empty:hidden">
        <ErrorMessage
          error={error || upload.error}
          retry={
            error && waitingId
              ? () => setError(null)
              : upload.canRetry
                ? () => void upload.retry()
                : undefined
          }
        />
      </div>
    </>
  )
}
