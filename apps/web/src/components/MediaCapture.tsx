import { useRef } from 'react'
import { useMediaDialog } from '@/lib/useMediaDialog'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Stack } from './ui/Layout'
type Props = {
  onFile: (file: File) => void
  onClose: () => void
  inDialog?: boolean
}
/** P1 uses device camera controls. The picker reuses its existing modal boundary. */
export function MediaCapture(props: Props) {
  return props.inDialog ? (
    <CaptureSurface {...props} />
  ) : (
    <CaptureDialog {...props} />
  )
}
function CaptureDialog(props: Props) {
  const dialog = useMediaDialog()
  return (
    <dialog
      ref={dialog}
      aria-label="Capture media"
      onCancel={(event) => {
        event.preventDefault()
        props.onClose()
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-background text-text"
    >
      <CaptureSurface {...props} />
    </dialog>
  )
}
function CaptureSurface({ onFile, onClose }: Props) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div
      className="fixed inset-0 z-50 flex min-h-dvh items-center bg-background p-6"
      role="region"
      aria-label="Capture media"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          event.preventDefault()
          onClose()
        }
        if (event.key === 'Tab') {
          const controls = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              'input,button',
            ),
          ]
          const first = controls[0],
            last = controls.at(-1)
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last?.focus()
          }
          if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first?.focus()
          }
        }
      }}
    >
      <Stack className="mx-auto w-full max-w-xl">
        <h2>Capture media</h2>
        <p className="text-muted">
          Use your device camera, or choose an existing recording.
        </p>
        <label>
          Photo or video
          <Input
            autoFocus
            ref={input}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onFile(file)
            }}
          />
        </label>
        <Button onClick={() => input.current?.click()}>Open camera</Button>
        <Button variant="outline" onClick={onClose}>
          Back to library
        </Button>
      </Stack>
    </div>
  )
}
