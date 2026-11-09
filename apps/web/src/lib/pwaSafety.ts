import { useLayoutEffect, useRef } from 'react'
import { queryClient } from './queryClient'

const blockers = new Set<symbol>()
const editedControls = new Set<Element>()

/** Protect an in-flight operation even if its initiating view unmounts. */
export function beginPwaWork() {
  const key = Symbol()
  blockers.add(key)
  return () => { blockers.delete(key) }
}

/** Explicit guards for state that is not represented by native form controls. */
export function usePwaReloadBlocker(blocked: boolean) {
  const key = useRef(Symbol())
  useLayoutEffect(() => {
    const id = key.current
    if (blocked) blockers.add(id)
    else blockers.delete(id)
    return () => { blockers.delete(id) }
  }, [blocked])
}

/** Conservative fallback for bespoke forms: never guess that a submit succeeded. */
export function trackPwaEdits() {
  const changed = (event: Event) => {
    const target = event.target
    if (target instanceof Element && target.matches('input, textarea, select, [contenteditable="true"]')) {
      editedControls.add(target)
    }
  }
  document.addEventListener('input', changed, true)
  document.addEventListener('change', changed, true)
  return () => {
    document.removeEventListener('input', changed, true)
    document.removeEventListener('change', changed, true)
    editedControls.clear()
  }
}

export function canReloadPwa() {
  for (const element of editedControls) {
    if (!element.isConnected) editedControls.delete(element)
  }
  return !blockers.size && !editedControls.size && queryClient.isMutating() === 0
}
