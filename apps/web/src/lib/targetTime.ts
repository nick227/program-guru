const TIME_24H = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

/** True when `value` is a valid 24-hour local time (`HH:mm`). */
export function isValidTargetTime(value: string | null | undefined): value is string {
  return !!value && TIME_24H.test(value)
}

/** Form text → API value: '' → null; otherwise valid `HH:mm` or null. */
export function parseTargetTime(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const hhmm = trimmed.slice(0, 5)
  return TIME_24H.test(hhmm) ? hhmm : null
}

/** API value → `<input type="time">` value. */
export function targetTimeInput(time: string | null | undefined): string {
  return isValidTargetTime(time) ? time : ''
}

/** `'07:00'` → `'7:00 AM'`, `'18:30'` → `'6:30 PM'`, null when unset or invalid. */
export function formatTargetTime(hhmm: string | null | undefined): string | null {
  if (!isValidTargetTime(hhmm)) return null
  const [hStr, mStr] = hhmm.split(':')
  const hour = Number(hStr)
  const minute = Number(mStr)
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`
}

/** `0` → `'12:00 AM'`, `12` → `'12:00 PM'`, `23` → `'11:00 PM'`. */
export function formatHourLabel(hour: number): string {
  const normalized = ((Math.floor(hour) % 24) + 24) % 24
  const suffix = normalized >= 12 ? 'PM' : 'AM'
  const hour12 = normalized % 12 === 0 ? 12 : normalized % 12
  return `${hour12}:00 ${suffix}`
}

