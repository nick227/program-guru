// Completion opens on the item's day, or at the gathering's time (09 §3). The server decides the
// instant (`completionOpensAt`); the client only compares it with the clock and says when it opens.

export function completionOpen(item: { completionOpensAt?: string | null }, now = Date.now()): boolean {
  if (!item.completionOpensAt) return true
  return now >= Date.parse(item.completionOpensAt)
}

/** "Available Sun, Dec 6" or, for a timed gathering, "Available Sun, Dec 6 at 3:00 PM". */
export function completionOpensLabel(
  item: { completionOpensAt?: string | null; gatheringId?: string | null },
  locale?: string,
): string | null {
  if (!item.completionOpensAt || completionOpen(item)) return null
  const at = new Date(item.completionOpensAt)
  const day = at.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })
  const midnight = at.getHours() === 0 && at.getMinutes() === 0
  if (!item.gatheringId || midnight) return `Available ${day}`
  return `Available ${day} at ${at.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}`
}
