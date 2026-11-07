// Calendar time model (05-ARCHITECTURE.md §9, 09-CALENDARS.md §4).
// Local dates are plain YYYY-MM-DD strings in the user's IANA timezone; instants are UTC.
// Stored @db.Date columns are read and written as UTC midnight of that local date.

export type LocalDate = string // YYYY-MM-DD

export function toDbDate(d: LocalDate): Date {
  return new Date(`${d}T00:00:00.000Z`)
}

export function fromDbDate(d: Date): LocalDate {
  return d.toISOString().slice(0, 10)
}

export function addDays(d: LocalDate, days: number): LocalDate {
  const x = toDbDate(d)
  x.setUTCDate(x.getUTCDate() + days)
  return fromDbDate(x)
}

export function diffDays(a: LocalDate, b: LocalDate): number {
  return Math.round((toDbDate(a).getTime() - toDbDate(b).getTime()) / 86_400_000)
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(d: LocalDate): number {
  return toDbDate(d).getUTCDay()
}

/** Today's local date in a timezone. */
export function todayIn(timeZone: string, now = new Date()): LocalDate {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Offset of `timeZone` from UTC at an instant, in minutes (e.g. -360 for CST). */
function offsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - at.getTime()) / 60_000)
}

/**
 * The UTC instant for a local wall-clock time.
 * DST policy (09 §4): a nonexistent spring-forward time moves forward to the first valid time;
 * an ambiguous fall-back time resolves to the earlier (first) occurrence.
 */
export function localToUtc(date: LocalDate, time: string, timeZone: string): Date {
  const [h, m] = time.split(':').map(Number) as [number, number]
  const naive = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), h, m)
  // Two passes converge for every real-world zone, including at DST edges.
  const first = naive - offsetMinutes(timeZone, new Date(naive)) * 60_000
  const second = naive - offsetMinutes(timeZone, new Date(first)) * 60_000
  const candidates = [first, second].sort((a, b) => a - b)
  for (const c of candidates) {
    const back = new Date(c + offsetMinutes(timeZone, new Date(c)) * 60_000)
    if (back.getUTCHours() === h && back.getUTCMinutes() === m) return new Date(c)
  }
  // Nonexistent local time (spring forward): first valid instant after it.
  return new Date(Math.max(...candidates))
}

export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}
