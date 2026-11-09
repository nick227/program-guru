import { usePwaReloadBlocker } from '@/lib/pwaSafety'
import { useEffect, useRef, useState } from 'react'
import { useBeforeUnload, useBlocker } from 'react-router-dom'
/** Single-field draft controller: one request in flight, latest edit wins locally, CAS on server. */
export function useAutosave(
  initial: string,
  initialRevision: number,
  save: (value: string, revision: number) => Promise<{ draftRevision: number }>,
  online: boolean,
) {
  const [value, setValue] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const revision = useRef(initialRevision)
  const saveRef = useRef(save)
  saveRef.current = save
  const dirty = value !== saved
  usePwaReloadBlocker(dirty || pending)
  useEffect(() => {
    if (dirty || pending || error) return
    revision.current = initialRevision
    setValue(initial)
    setSaved(initial)
  }, [initial, initialRevision, dirty, pending, error])
  useEffect(() => {
    if (!online && dirty && !error) {
      setError(
        new Error('Your edit is kept here. Reconnect, then Retry to save.'),
      )
      return
    }
    if (!dirty || pending || error || !online || !value.trim()) return
    const timer = window.setTimeout(() => {
      setPending(true)
      void saveRef
        .current(value, revision.current)
        .then((result) => {
          revision.current = result.draftRevision
          setSaved(value)
        })
        .catch(setError)
        .finally(() => setPending(false))
    }, 600)
    return () => window.clearTimeout(timer)
  }, [value, dirty, pending, error, online])
  const blocker = useBlocker(dirty || pending)
  useBeforeUnload((event) => {
    if (dirty || pending) {
      event.preventDefault()
      event.returnValue = ''
    }
  })
  return {
    value,
    setValue,
    pending,
    dirty,
    error,
    blocker,
    retry: () => setError(null),
    reload: (next: string, rev: number) => {
      setValue(next)
      setSaved(next)
      revision.current = rev
      setError(null)
    },
  }
}
