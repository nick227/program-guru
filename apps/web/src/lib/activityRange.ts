/**
 * A small, varied selection for Home and the Calendar rail (12 §5a): walk the already-ranked
 * `/discover` results and take the next Activity from each Domain in turn, so a few popular
 * Domains never crowd out the rest. Order within a Domain is the server's order. No new ranking.
 */
export function pickAcrossDomains<T extends { id: string; categoryId: string }>(
  ranked: T[],
  limit = 5,
  exclude: ReadonlySet<string> = new Set(),
): T[] {
  const queues = new Map<string, T[]>()
  for (const item of ranked) {
    if (exclude.has(item.id)) continue
    const queue = queues.get(item.categoryId)
    if (queue) {
      if (!queue.some((q) => q.id === item.id)) queue.push(item)
    } else queues.set(item.categoryId, [item])
  }
  const out: T[] = []
  while (out.length < limit) {
    let took = false
    for (const queue of queues.values()) {
      const next = queue.shift()
      if (!next) continue
      out.push(next)
      took = true
      if (out.length >= limit) break
    }
    if (!took) break
  }
  return out
}

/**
 * Alternates already-ordered lists (e.g. `/discover` POPULAR and NEW), keeping the first occurrence of
 * each id. New catalog content then appears beside established Activities without any invented score.
 */
export function interleaveUnique<T extends { id: string }>(...lists: T[][]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  const longest = Math.max(0, ...lists.map((l) => l.length))
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      const item = list[i]
      if (!item || seen.has(item.id)) continue
      seen.add(item.id)
      out.push(item)
    }
  }
  return out
}
