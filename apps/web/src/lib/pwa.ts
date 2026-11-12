import { onlineManager } from '@tanstack/react-query'
import { queryClient } from './queryClient'
import { canReloadPwa } from './pwaSafety'

type InstallPrompt = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
let installPrompt: InstallPrompt | undefined
let registration: ServiceWorkerRegistration | undefined
let reloadRequested = false
let updateAvailable = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(listener => listener())
export const subscribePwa = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export const hasPwaUpdate = () => updateAvailable
export const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

export async function installApp(): Promise<'prompted' | 'instructions'> {
  if (!installPrompt) return 'instructions'
  const prompt = installPrompt
  installPrompt = undefined
  try {
    await prompt.prompt()
    await prompt.userChoice
    return 'prompted'
  } catch {
    return 'instructions'
  }
}

/** Only the client that explicitly requests an update may reload. */
export function reloadForUpdate(): boolean {
  if (!canReloadPwa() || !navigator.onLine) return false
  if (!registration?.waiting) {
    // Another window may already have activated the update. No forced reload there.
    if (updateAvailable) window.location.reload()
    return true
  }
  reloadRequested = true
  registration.waiting.postMessage({ type: 'SKIP_WAITING' })
  return true
}

export function startPwa() {
  onlineManager.setOnline(navigator.onLine)
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault()
    installPrompt = event as InstallPrompt
  })
  window.addEventListener('appinstalled', () => {
    installPrompt = undefined
    emit()
  })

  let lastCheck = 0
  const resume = () => {
    if (document.visibilityState !== 'visible' || !navigator.onLine) return
    // A resumed tab may miss the stale timer (e.g. after backgrounding or
    // a browser clock jump). Check the session timestamp explicitly.
    const session = queryClient.getQueryState(['me'])
    if (session?.dataUpdatedAt && Date.now() - session.dataUpdatedAt >= 60_000) {
      void queryClient.refetchQueries({ queryKey: ['me'], exact: true, type: 'active' })
    }
    void queryClient.refetchQueries({ type: 'active', stale: true })
    if (registration && Date.now() - lastCheck > 60_000) {
      lastCheck = Date.now()
      void registration.update().catch(() => { /* Keep the current shell on network failure. */ })
    }
  }
  window.addEventListener('online', resume)
  window.addEventListener('focus', resume)
  window.addEventListener('pageshow', resume)
  document.addEventListener('visibilitychange', resume)

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updateAvailable && !reloadRequested) return
    updateAvailable = true
    emit()
    if (reloadRequested && canReloadPwa()) {
      reloadRequested = false
      window.location.reload()
    } else {
      reloadRequested = false
    }
  })
  void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(reg => {
    registration = reg
    const waiting = () => {
      if (reg.waiting && navigator.serviceWorker.controller) {
        updateAvailable = true
        emit()
      }
    }
    waiting()
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing
      worker?.addEventListener('statechange', waiting)
    })
    resume()
    window.setInterval(resume, 60 * 60 * 1000)
  }).catch(() => { /* Installation is optional: the online website remains usable. */ })
}
