import { useLayoutEffect, useRef } from 'react'
/** Native modal focus containment, background inertness, scroll lock and focus restoration. */
export function useMediaDialog() {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const dialog = ref.current
    const origin =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
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
