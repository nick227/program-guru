import { useEffect, useRef, useState } from 'react'
import { Upload, Loader2, Check } from 'lucide-react'
import { useMediaUpload } from '@project/sdk'
import { Button } from './ui/Button'
import { ErrorMessage } from './ui/Feedback'

/**
 * Streamlined upload action beside Session Controls.
 * Selects a photo or video to upload privately and attaches
 * the READY asset to the current attempt. Replaces the legacy
 * device camera capture.
 */
export function SessionUpload({
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
    ? 'Uploading…'
    : waitingId && upload.stage === 'processing'
      ? 'Processing media…'
      : attaching
        ? 'Attaching to this attempt…'
        : upload.stage === 'failed' && waitingId
          ? 'Couldn’t process this file.'
          : attached
            ? 'Media attached to this attempt.'
            : null

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*,video/*"
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
        variant="outline"
        aria-label="Upload media"
        title="Upload a photo or video for this attempt"
        disabled={disabled || working}
        onClick={() => input.current?.click()}
        className="gap-1.5"
      >
        {working ? (
          <Loader2 size={16} className="animate-spin" aria-hidden />
        ) : attached ? (
          <Check size={16} className="text-accent" aria-hidden />
        ) : (
          <Upload size={16} aria-hidden />
        )}
        <span>{working ? 'Uploading…' : 'Upload media'}</span>
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


