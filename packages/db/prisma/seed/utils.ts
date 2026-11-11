import { createHash } from 'crypto'

export const SEEDED_AT = new Date('2026-01-01T00:00:00.000Z')

/** Deterministic UUID v4-shaped identifier derived from a stable namespace key. */
export function deterministicUuid(key: string): string {
  const hex = createHash('sha256').update(`programs-app-seed:${key}`).digest('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-')
}

function stableEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => stableEqual(v, b[i]))
  }
  const ak = Object.keys(a as Record<string, unknown>).sort()
  const bk = Object.keys(b as Record<string, unknown>).sort()
  if (ak.length !== bk.length) return false
  return ak.every((k, i) => k === bk[i] && stableEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

/** True when any field in `next` differs from the stored row (handles nested JSON fields like frequency). */
export function changed(row: Record<string, unknown>, next: Record<string, unknown>): boolean {
  return Object.entries(next).some(([k, v]) => !stableEqual(row[k], v))
}

