/** Planned Activity duration in whole minutes (08-ACTIVITIES.md §2): 1–1440, or null. */
export const MAX_DURATION_MINUTES = 1440

/** 45 → "45 min", 60 → "1 hr", 90 → "1 hr 30 min"; null when unset. */
export function formatDurationMinutes(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest} min`
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`
}

/** Form text → API value: '' → null; otherwise a whole number of minutes clamped to 1–1440. */
export function parseDurationMinutes(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const value = Math.round(Number(trimmed))
  if (!Number.isFinite(value) || value < 1) return null
  return Math.min(value, MAX_DURATION_MINUTES)
}

/** API value → form text. */
export function durationInput(minutes: number | null | undefined): string {
  return minutes == null ? '' : String(minutes)
}
