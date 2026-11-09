/** Formats a media duration in milliseconds as M:SS (276000 → "4:36"); null when unknown. */
export function formatMediaDuration(durationMs?: number | null): string | null {
  if (durationMs == null || durationMs <= 0) return null
  const totalSeconds = Math.round(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
}
