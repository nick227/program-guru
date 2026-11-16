import { useRef, useState } from 'react'
import { useBeforeUnload, useBlocker } from 'react-router-dom'
import { usePwaReloadBlocker } from './pwaSafety'

/** Navigation and in-place closing share the same unsaved-results protection. */
export function useSessionLeaveGuard({ unsaved, busy, save, discard }: {
  unsaved: boolean
  busy: boolean
  save: () => Promise<boolean>
  discard: () => void
}) {
  const pending = useRef<(() => void) | null>(null)
  const [localPrompt, setLocalPrompt] = useState(false)
  usePwaReloadBlocker(unsaved || busy)
  const blocker = useBlocker(() => unsaved || busy)
  useBeforeUnload((event) => {
    if (unsaved || busy) { event.preventDefault(); event.returnValue = '' }
  })
  const keep = () => {
    pending.current = null
    setLocalPrompt(false)
    if (blocker.state === 'blocked') blocker.reset()
  }
  const leave = () => {
    const callback = pending.current
    pending.current = null
    setLocalPrompt(false)
    if (blocker.state === 'blocked') blocker.proceed()
    else callback?.()
  }
  return {
    open: localPrompt || blocker.state === 'blocked',
    busy,
    requestLeave: (callback: () => void) => {
      if (unsaved || busy) { pending.current = callback; setLocalPrompt(true) }
      else callback()
    },
    keep,
    saveAndLeave: async () => { if (!busy && await save()) leave() },
    discardAndLeave: () => { if (!busy) { discard(); leave() } },
  }
}
