import { useEffect, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/Button'
import { hasPwaUpdate, installApp, isInstalled, reloadForUpdate, subscribePwa } from '@/lib/pwa'
import { trackPwaEdits } from '@/lib/pwaSafety'

export function InstallApp() {
  const installed = useSyncExternalStore(subscribePwa, isInstalled, () => false)
  const [instructions, setInstructions] = useState(false)
  if (installed) return null
  return (
    <div>
      <Button variant="ghost" onClick={async () => {
        setInstructions(await installApp() === 'instructions')
      }}>Install App</Button>
      {instructions && (
        <p role="status" className="mt-2 max-w-sm text-sm text-muted">
          On iPhone or iPad, open this site in Safari, then use Share → Add to Home Screen.
          On other devices, look for Install app or Add to Home Screen in your browser menu.
          If unavailable, you can keep using this site in your browser.
        </p>
      )}
    </div>
  )
}

export function PwaUpdatePrompt() {
  const available = useSyncExternalStore(subscribePwa, hasPwaUpdate, () => false)
  const [later, setLater] = useState(false)
  const [blocked, setBlocked] = useState(false)
  useEffect(trackPwaEdits, [])
  useEffect(() => {
    const resume = () => { if (document.visibilityState === 'visible') setLater(false) }
    document.addEventListener('visibilitychange', resume)
    return () => document.removeEventListener('visibilitychange', resume)
  }, [])
  if (!available || later) return null
  return (
    <aside aria-label="App update" className="sticky top-0 z-50 border-b bg-surface px-4 py-3 shadow-sm">
      <p role="status">Update available</p>
      {blocked && <p className="text-sm">Save your work and leave the edited view, and wait for uploads to finish before reloading. Connect to the internet to update.</p>}
      <div className="mt-2 flex gap-2">
        <Button onClick={() => setBlocked(!reloadForUpdate())}>Reload</Button>
        <Button variant="ghost" onClick={() => setLater(true)}>Later</Button>
      </div>
    </aside>
  )
}
