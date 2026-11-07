// Shared cursor paging over a stable (createdAt, id) pair (factory list-query conventions).
import { decodeCursor, encodeCursor, normalizeLimit } from './pagination'

export type PageQuery = { cursor?: string; limit?: number }

/** Prisma `where` fragment for rows after the cursor, ordered createdAt desc, id desc. */
export function afterCursor(cursor?: string) {
  const c = decodeCursor(cursor)
  if (!c) return {}
  const at = new Date(c.createdAt)
  if (Number.isNaN(at.getTime())) return {}
  return { OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: c.id } }] }
}

export const pageOrder = [{ createdAt: 'desc' as const }, { id: 'desc' as const }]

export function pageArgs(query: PageQuery) {
  const limit = normalizeLimit(query.limit)
  return { limit, take: limit + 1 }
}

/** Builds the `{ data, meta }` envelope from rows fetched with take = limit + 1. */
export function toPage<R extends { createdAt: Date; id: string }, T>(rows: R[], limit: number, map: (row: R) => T) {
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const last = items.at(-1)
  return {
    data: items.map(map),
    meta: { hasMore, nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null },
  }
}

/** Offset-free paging for lists not ordered by createdAt: the cursor is an opaque numeric offset. */
export function offsetArgs(query: PageQuery) {
  const limit = normalizeLimit(query.limit)
  let skip = 0
  if (query.cursor) {
    const n = Number(Buffer.from(query.cursor, 'base64url').toString('utf8'))
    if (Number.isInteger(n) && n >= 0) skip = n
  }
  return { limit, skip, take: limit + 1 }
}

export function toOffsetPage<R, T>(rows: R[], limit: number, skip: number, map: (row: R) => T) {
  const hasMore = rows.length > limit
  return {
    data: (hasMore ? rows.slice(0, limit) : rows).map(map),
    meta: { hasMore, nextCursor: hasMore ? Buffer.from(String(skip + limit)).toString('base64url') : null },
  }
}
