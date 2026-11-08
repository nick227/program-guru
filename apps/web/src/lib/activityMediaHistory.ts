import type { components } from '@project/sdk'
export type HistoryItem = components['schemas']['ActivityMediaHistoryItem']
/** Preserve server order; the same asset can have distinct links in several attempts. */
export function groupActivityMedia(items: HistoryItem[]) {
  const groups = new Map<string, HistoryItem[]>()
  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(item.attachment.id)) continue
    seen.add(item.attachment.id)
    const group = groups.get(item.sessionId) ?? []
    group.push(item)
    groups.set(item.sessionId, group)
  }
  return [...groups.entries()].map(([sessionId, items]) => ({
    sessionId,
    items,
  }))
}
export function historyDate(item: HistoryItem) {
  // Date-only occurrence values must not shift a day in the browser's timezone.
  return item.occurrenceDate ?? item.recordedAt.slice(0, 10)
}
