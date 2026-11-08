import { useRef, useState } from 'react'
import { Upload, Loader2, Check } from 'lucide-react'
import { Button } from './ui/Button'
import { ErrorMessage } from './ui/Feedback'

/**
 * Streamlined upload action beside Session Controls.
 * Selects a photo or video to upload privately and attaches
 * it to the current attempt with durable server intent.
 */
export function SessionUpload({
  attach,
  disabled,
}: {
  attach: (fileOrMediaId: File | string) => Promise<void>
  disabled: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [attached, setAttached] = useState(false)
  const [error, setError] = useState<unknown>(null)

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*,video/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        disabled={disabled || busy}
        onChange={async (event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          setError(null)
          setAttached(false)
          setBusy(true)
          try {
            await attach(file)
            setAttached(true)
          } catch (err) {
            setError(err)
          } finally {
            setBusy(false)
          }
        }}
      />
      <Button
        variant="outline"
        aria-label="Upload media"
        title="Upload a photo or video for this attempt"
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
        className="gap-1.5"
      >
        {busy ? (
          <Loader2 size={16} className="animate-spin" aria-hidden />
        ) : attached ? (
          <Check size={16} className="text-accent" aria-hidden />
        ) : (
          <Upload size={16} aria-hidden />
        )}
        <span>{busy ? 'Uploading…' : 'Upload media'}</span>
      </Button>
      {attached && (
        <p role="status" className="basis-full text-xs text-muted">
          Media attached to this attempt.
        </p>
      )}
      <div className="basis-full empty:hidden">
        <ErrorMessage error={error} />
      </div>
    </>
  )
}
