// Local dates are opaque YYYY-MM-DD values. UTC is used only for calendar arithmetic.
export function isLocalDate(value: string | null): value is string {
  return (
    !!value &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  )
}
export function today(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const part = (type: string) => parts.find((p) => p.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
export function weekOf(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay()
  return addDays(date, -((day + 6) % 7))
}
export function dateLabel(
  date: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' },
) {
  return new Intl.DateTimeFormat('en-US', {
    ...options,
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`))
}
export function calendarUrl(day: string, week = weekOf(day)) {
  return `/?week=${week}&day=${day}`
}
export function safeReturn(value: string | null, fallback = '/') {
  return value?.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\')
    ? value
    : fallback
}
