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
export function addMonths(date: string, months: number) {
  const source = new Date(`${date}T12:00:00Z`)
  const day = source.getUTCDate()
  source.setUTCDate(1)
  source.setUTCMonth(source.getUTCMonth() + months)
  const lastDay = new Date(
    Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + 1, 0),
  ).getUTCDate()
  source.setUTCDate(Math.min(day, lastDay))
  return source.toISOString().slice(0, 10)
}
export function monthBounds(date: string) {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  const start = `${date.slice(0, 7)}-01`
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  return { start, end }
}
export function monthGrid(date: string) {
  const { start } = monthBounds(date)
  const firstWeek = weekOf(start)
  return Array.from({ length: 42 }, (_, index) => addDays(firstWeek, index))
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
export function calendarUrl(day: string, _week?: string) {
  return `/?view=day&day=${day}`
}
export function safeReturn(value: string | null, fallback = '/') {
  return value?.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\')
    ? value
    : fallback
}

export function formatRelativeTime(iso: string, nowMs = Date.now()) {
  const diffSeconds = Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 1000))
  if (Number.isNaN(diffSeconds)) return ''
  if (diffSeconds < 60) return 'Just now'
  const minutes = Math.floor(diffSeconds / 60)
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`
  return dateLabel(iso.slice(0, 10))
}
