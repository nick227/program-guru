import { useLayoutEffect, useRef, type DialogHTMLAttributes, type ReactNode } from 'react'

/**
 * Shows a native modal for as long as the calling component is mounted: focus containment and an
 * inert background (from `showModal`), body scroll lock, and focus returned to the element that
 * opened it when it unmounts.
 */
export function useModalDialog() {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const dialog = ref.current
    const origin =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog?.showModal()
    return () => {
      dialog?.close()
      document.body.style.overflow = overflow
      origin?.focus({ preventScroll: true })
    }
  }, [])
  return ref
}

type DialogProps = Omit<
  DialogHTMLAttributes<HTMLDialogElement>,
  'open' | 'onCancel' | 'onClose' | 'children'
> & {
  /** Escape and every dismiss path call this; the caller unmounts the dialog. */
  onClose: () => void
  children: ReactNode
}

/** The one modal dialog. Render it while open and unmount it to close. Styling stays with the caller. */
export function Dialog({ onClose, children, ...props }: DialogProps) {
  const ref = useModalDialog()
  return (
    <dialog
      ref={ref}
      {...props}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      {children}
    </dialog>
  )
}
