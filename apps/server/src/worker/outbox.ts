// Outbox delivery (05-ARCHITECTURE.md §11): claim with FOR UPDATE SKIP LOCKED so several workers
// can run safely, lease each claimed event, retry with backoff, give up after MAX_ATTEMPTS.
import { Prisma, db } from '@project/db'
import { SECRET_FIELDS, handlers } from './handlers'

const BATCH = 20
const LEASE_MS = 15 * 60_000 // long enough for a video transcode
const MAX_ATTEMPTS = 8

export async function claim(now = new Date()) {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM OutboxEvent
      WHERE status = 'PENDING' AND availableAt <= ${now}
      ORDER BY createdAt ASC
      LIMIT ${BATCH}
      FOR UPDATE SKIP LOCKED`
    if (!rows.length) return []
    const ids = rows.map((r) => r.id)
    await tx.outboxEvent.updateMany({ where: { id: { in: ids } }, data: { attempts: { increment: 1 }, availableAt: new Date(now.getTime() + LEASE_MS) } })
    return tx.outboxEvent.findMany({ where: { id: { in: ids } }, orderBy: { createdAt: 'asc' } })
  })
}

function scrub(type: string, payload: Prisma.JsonValue) {
  const fields = SECRET_FIELDS[type]
  if (!fields || !payload || typeof payload !== 'object' || Array.isArray(payload)) return payload as Prisma.InputJsonValue
  const copy = { ...(payload as Record<string, unknown>) }
  for (const f of fields) delete copy[f]
  return copy as Prisma.InputJsonValue
}

export async function deliver(event: Awaited<ReturnType<typeof claim>>[number]) {
  const handler = handlers[event.type]
  try {
    if (!handler) throw new Error(`No handler for ${event.type}`)
    await handler({ id: event.id, type: event.type, payload: (event.payload ?? {}) as Record<string, any> })
    await db.outboxEvent.update({ where: { id: event.id }, data: { status: 'DONE', processedAt: new Date(), lastError: null, payload: scrub(event.type, event.payload) } })
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const failed = event.attempts >= MAX_ATTEMPTS
    await db.outboxEvent.update({
      where: { id: event.id },
      data: {
        status: failed ? 'FAILED' : 'PENDING',
        lastError: message.slice(0, 2000),
        availableAt: new Date(Date.now() + Math.min(60, 2 ** event.attempts) * 60_000),
        ...(failed ? { payload: scrub(event.type, event.payload) } : {}),
      },
    })
    console.error(`[outbox] ${event.type} ${event.id} attempt ${event.attempts} failed: ${message}`)
    return false
  }
}

/** Drains the outbox until no deliverable events remain. Returns how many were delivered. */
export async function drain(now = new Date()) {
  let delivered = 0
  for (;;) {
    const batch = await claim(now)
    if (!batch.length) return delivered
    for (const e of batch) if (await deliver(e)) delivered++
  }
}
