import { useEffect } from 'react'

export const APP_NAME = 'Programs'
export const DEFAULT_TAGLINE = 'Your week'
export const DEFAULT_TITLE = `${APP_NAME} — ${DEFAULT_TAGLINE}`

export function formatTitle(pageTitle?: string | null): string {
  if (!pageTitle || !pageTitle.trim()) {
    return DEFAULT_TITLE
  }
  return `${pageTitle.trim()} — ${APP_NAME}`
}

export function useDocumentTitle(title?: string | null, raw = false) {
  useEffect(() => {
    if (title === undefined) return
    const prev = document.title
    document.title = raw ? (title || DEFAULT_TITLE) : formatTitle(title)
    return () => {
      document.title = prev
    }
  }, [title, raw])
}

