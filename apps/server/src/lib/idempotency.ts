// 05-ARCHITECTURE.md §4: claim the key with a request hash before doing work.
//   same key + same request, completed  → return the stored result (no second write)
//   same key + different request        → CONFLICT
//   same key, still in progress          → CONFLICT (the client retries later)
//   the work fails                       → the claim is released so a retry can run
import { Prisma, db } from '@project/db'
import { conflict } from './errors'
import { sha256 } from './auth'

const DEFAULT_TTL_HOURS = 24

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
}

export const requestHash = (request: unknown) => sha256(stableStringify(request))

export async function withIdempotency<T>(opts: {
  userId: string
  scope: string
  key: string
  request: unknown
  /** Rebuild the response for a replay from the stored result reference (usually a row id). */
  load: (resultRef: string) => Promise<T>
  /** Do the work once. Return the reference to store and the response. */
  run: () => Promise<{ ref: string; result: T }>
  ttlHours?: number
}): Promise<T> {
  const id = { userId: opts.userId, scope: opts.scope, key: opts.key }
  const hash = requestHash(opts.request)
  const expiresAt = new Date(Date.now() + (opts.ttlHours ?? DEFAULT_TTL_HOURS) * 3600_000)

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await db.idempotencyKey.create({ data: { ...id, requestHash: hash, expiresAt } })
      break
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err
      const existing = await db.idempotencyKey.findUnique({ where: { userId_scope_key: id } })
      if (!existing) continue // released between our insert and read: try again
      if (existing.expiresAt < new Date()) {
        await db.idempotencyKey.deleteMany({ where: { ...id, expiresAt: existing.expiresAt } })
        continue
      }
      if (existing.requestHash !== hash) throw conflict('This idempotency key was already used for a different request')
      if (existing.state === 'IN_PROGRESS' || !existing.resultRef) {
        throw conflict('A request with this idempotency key is still in progress')
      }
      return opts.load(existing.resultRef)
    }
  }

  try {
    const { ref, result } = await opts.run()
    await db.idempotencyKey.update({
      where: { userId_scope_key: id },
      data: { state: 'COMPLETED', resultRef: ref, responseStatus: 200 },
    })
    return result
  } catch (err) {
    await db.idempotencyKey.deleteMany({ where: { ...id, state: 'IN_PROGRESS' } })
    throw err
  }
}
