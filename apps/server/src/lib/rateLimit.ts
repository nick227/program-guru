// Database-backed fixed-window rate limiter using RateLimitBucket (05-ARCHITECTURE.md §6, 06-USERS.md §7).
// Shares state across multiple server instances via atomic MySQL row updates with expiration.
import type { FastifyReply, FastifyRequest } from 'fastify'
import { db } from '@project/db'
import { rateLimited } from './errors'
import { clientIp } from './clientIp'

export type RateLimitOptions = {
  key: string
  max: number
  windowMs: number
  now?: Date
}

export type RateLimitStatus = {
  allowed: boolean
  count: number
  limit: number
  remaining: number
  resetAt: Date
  retryAfterSeconds: number
}

export type AuthRouteLimit = {
  scope: string
  max: number
  windowMs: number
  byEmail?: boolean
}

export const GLOBAL_RATE_LIMIT = {
  max: 300,
  windowMs: 60_000,
}

export const AUTH_ROUTE_LIMITS: Record<string, AuthRouteLimit> = {
  'POST /auth/register': { scope: 'auth:register', max: 10, windowMs: 60_000 },
  'POST /auth/login': { scope: 'auth:login', max: 10, windowMs: 60_000, byEmail: true },
  'POST /auth/google': { scope: 'auth:google', max: 10, windowMs: 60_000 },
  'POST /auth/verify-email': { scope: 'auth:verify-email', max: 10, windowMs: 60_000 },
  'POST /auth/resend-verification': { scope: 'auth:resend-verification', max: 5, windowMs: 60_000 },
  'POST /auth/forgot-password': { scope: 'auth:forgot-password', max: 5, windowMs: 60_000, byEmail: true },
  'POST /auth/reset-password': { scope: 'auth:reset-password', max: 10, windowMs: 60_000 },
}

let lastPruneMs = 0
const PRUNE_INTERVAL_MS = 60_000

function isTransientLockError(err: unknown): boolean {
  const anyErr = err as { code?: string; meta?: { code?: string | number }; message?: string }
  return (
    anyErr?.code === 'P2034' ||
    String(anyErr?.meta?.code) === '1213' ||
    String(anyErr?.meta?.code) === '1205' ||
    /deadlock|lock wait timeout/i.test(anyErr?.message ?? '')
  )
}

/**
 * Atomically increments (or resets if expired) the counter for `key` in `RateLimitBucket`
 * and returns the caller's exact monotonic slot count within the active window.
 *
 * Uses `INSERT ... ON DUPLICATE KEY UPDATE` with `LAST_INSERT_ID(...)` inside a pinned
 * connection transaction so concurrent calls across multiple server instances receive
 * distinct, strictly ordered counts (`1, 2, ..., N`) without race conditions.
 */
export async function consumeRateLimit(opts: RateLimitOptions): Promise<RateLimitStatus> {
  const now = opts.now ?? new Date()
  const nextResetAt = new Date(now.getTime() + opts.windowMs)
  const key = opts.key.slice(0, 191)

  if (opts.max <= 0) {
    return {
      allowed: false,
      count: 1,
      limit: opts.max,
      remaining: 0,
      resetAt: nextResetAt,
      retryAfterSeconds: Math.max(1, Math.ceil(opts.windowMs / 1000)),
    }
  }

  let slotCount = 1
  let resetAt = nextResetAt

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const row = await db.$transaction(async (tx) => {
        await tx.$executeRaw`
          INSERT INTO \`RateLimitBucket\` (\`key\`, \`count\`, \`resetAt\`, \`updatedAt\`)
          VALUES (${key}, LAST_INSERT_ID(1), ${nextResetAt}, ${now})
          ON DUPLICATE KEY UPDATE
            \`count\` = LAST_INSERT_ID(IF(\`resetAt\` <= ${now}, 1, \`count\` + 1)),
            \`resetAt\` = IF(\`resetAt\` <= ${now}, ${nextResetAt}, \`resetAt\`),
            \`updatedAt\` = ${now}
        `
        const rows = await tx.$queryRaw<{ myCount: bigint | number; resetAt: Date }[]>`
          SELECT LAST_INSERT_ID() AS myCount, \`resetAt\`
          FROM \`RateLimitBucket\`
          WHERE \`key\` = ${key}
        `
        return rows[0]!
      })
      slotCount = Number(row.myCount)
      resetAt = row.resetAt instanceof Date ? row.resetAt : new Date(row.resetAt)
      break
    } catch (err) {
      if (attempt < 4 && isTransientLockError(err)) continue
      throw err
    }
  }

  const allowed = slotCount <= opts.max
  const remaining = allowed ? Math.max(0, opts.max - slotCount) : 0
  const retryAfterSeconds = allowed ? 0 : Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000))

  // Opportunistic non-blocking cleanup of expired buckets once per minute.
  if (now.getTime() - lastPruneMs >= PRUNE_INTERVAL_MS) {
    lastPruneMs = now.getTime()
    void pruneExpiredRateLimitBuckets(now).catch(() => {})
  }

  return {
    allowed,
    count: slotCount,
    limit: opts.max,
    remaining,
    resetAt,
    retryAfterSeconds,
  }
}

/** Deletes expired rate-limit buckets (`resetAt <= now`). */
export async function pruneExpiredRateLimitBuckets(now: Date = new Date()): Promise<number> {
  const res = await db.rateLimitBucket.deleteMany({
    where: { resetAt: { lte: now } },
  })
  return res.count
}

export function setRateLimitHeaders(reply: FastifyReply, status: RateLimitStatus) {
  reply.header('x-ratelimit-limit', String(status.limit))
  reply.header('x-ratelimit-remaining', String(status.remaining))
  reply.header('x-ratelimit-reset', String(Math.ceil(status.resetAt.getTime() / 1000)))
  if (!status.allowed) {
    reply.header('retry-after', String(status.retryAfterSeconds))
  }
}

export async function enforceRateLimit(opts: RateLimitOptions, reply?: FastifyReply): Promise<RateLimitStatus> {
  const status = await consumeRateLimit(opts)
  if (reply) setRateLimitHeaders(reply, status)
  if (!status.allowed) throw rateLimited()
  return status
}

/**
 * Fastify preHandler enforcing both the global per-IP rate limit and stricter per-route
 * auth limits backed by `RateLimitBucket` in MySQL.
 */
export async function rateLimitPreHandler(request: FastifyRequest, reply: FastifyReply, now?: Date) {
  const ip = clientIp(request)
  const routePath = (request.routeOptions?.url ?? request.url.split('?')[0]) || '/'
  const routeKey = `${request.method.toUpperCase()} ${routePath}`
  const authRule = AUTH_ROUTE_LIMITS[routeKey]

  if (authRule) {
    await enforceRateLimit(
      { key: `${authRule.scope}:ip:${ip}`, max: authRule.max, windowMs: authRule.windowMs, now },
      reply,
    )
    const rawEmail = (request.body as { email?: unknown } | null)?.email
    if (authRule.byEmail && typeof rawEmail === 'string' && rawEmail.trim()) {
      const normalizedEmail = rawEmail.trim().toLowerCase()
      await enforceRateLimit(
        { key: `${authRule.scope}:email:${normalizedEmail}`, max: authRule.max, windowMs: authRule.windowMs, now },
        reply,
      )
    }
    return
  }

  await enforceRateLimit(
    { key: `global:ip:${ip}`, max: GLOBAL_RATE_LIMIT.max, windowMs: GLOBAL_RATE_LIMIT.windowMs, now },
    reply,
  )
}
