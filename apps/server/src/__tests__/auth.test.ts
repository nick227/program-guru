// Real session transport: these tests use the production security handlers and cookies.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db } from '@project/db'
import { buildApp } from '../app'
import { consumeRateLimit, pruneExpiredRateLimitBuckets } from '../lib/rateLimit'
import { validateResponse } from './helpers'

let app: FastifyInstance
beforeAll(async () => {
  app = await buildApp({ rateLimit: false })
  await app.ready()
})
afterAll(() => app.close())

const sessionCookie = (res: any) => {
  const c = res.cookies.find((c: any) => c.name === 'session')
  return c ? { cookie: `session=${c.value}` } : {}
}
const registerBody = { email: 'Casey@Example.com', password: 'correct horse battery', handle: 'Casey', displayName: 'Casey', timezone: 'America/Chicago' }
const register = (body: any = registerBody) => app.inject({ method: 'POST', url: '/auth/register', payload: body })
const latestToken = async (type: string) => {
  const ev = await db.outboxEvent.findFirst({ where: { type }, orderBy: { createdAt: 'desc' } })
  return (ev!.payload as any).token as string
}

describe('register', () => {
  it('creates user, profile, preferences, credential; sets an httpOnly session cookie', async () => {
    const res = await register()
    expect(res.statusCode).toBe(201)
    await validateResponse('register', 201, res.json())
    const me = res.json().data
    expect(me.email).toBe('casey@example.com')
    expect(me.profile.handle).toBe('casey')
    expect(me.preferences.timezone).toBe('America/Chicago')
    expect(me.preferences.notifications.dailyEmail).toBe(false)
    const cookie = res.cookies.find((c: any) => c.name === 'session')!
    expect(cookie.httpOnly).toBe(true)
    expect(cookie.sameSite).toBe('Lax')
    const session = await db.session.findFirst()
    expect(session!.tokenHash).not.toBe(cookie.value) // only the hash is stored
  })

  it('rejects a duplicate email and a reserved handle', async () => {
    await register()
    expect((await register({ ...registerBody, handle: 'other' })).statusCode).toBe(409)
    const reserved = await register({ ...registerBody, email: 'x@example.com', handle: 'settings' })
    expect(reserved.statusCode).toBe(400)
    expect(reserved.json()).toMatchObject({ code: 'VALIDATION_ERROR', fieldErrors: { handle: 'is reserved' } })
  })

  it('returns the documented error shape for schema validation failures', async () => {
    const res = await register({ email: 'not-an-email' })
    expect(res.statusCode).toBe(400)
    await validateResponse('register', 400, res.json())
    expect(res.json().code).toBe('VALIDATION_ERROR')
  })
})

describe('login, getCurrentUser, logout', () => {
  it('signs in, reads the session, and signs out', async () => {
    await register()
    expect((await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'casey@example.com', password: 'wrong password' } })).statusCode).toBe(401)
    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'CASEY@example.com', password: 'correct horse battery' } })
    expect(login.statusCode).toBe(200)
    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: sessionCookie(login) })
    expect(me.statusCode).toBe(200)
    await validateResponse('getCurrentUser', 200, me.json())
    await app.inject({ method: 'POST', url: '/auth/logout', headers: sessionCookie(login) })
    expect((await app.inject({ method: 'GET', url: '/auth/me', headers: sessionCookie(login) })).statusCode).toBe(401)
  })

  it('refuses a suspended account', async () => {
    await register()
    await db.user.updateMany({ data: { status: 'SUSPENDED' } })
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'casey@example.com', password: 'correct horse battery' } })
    expect(res.statusCode).toBe(403)
  })
})

describe('verifyEmail', () => {
  it('verifies once with the emailed token and rejects reuse', async () => {
    const reg = await register()
    expect(reg.json().data.emailVerified).toBe(false)
    const token = await latestToken('EmailVerificationRequested')
    expect((await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { token } })).statusCode).toBe(200)
    expect((await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { token } })).statusCode).toBe(400)
    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: sessionCookie(reg) })
    expect(me.json().data.emailVerified).toBe(true)
  })
})

describe('forgotPassword and resetPassword', () => {
  it('does not reveal unknown emails, and a reset signs out every session', async () => {
    expect((await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email: 'nobody@example.com' } })).statusCode).toBe(200)
    const reg = await register()
    await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email: 'casey@example.com' } })
    const token = await latestToken('PasswordResetRequested')
    expect((await app.inject({ method: 'POST', url: '/auth/reset-password', payload: { token, password: 'a brand new secret' } })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: '/auth/me', headers: sessionCookie(reg) })).statusCode).toBe(401)
    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'casey@example.com', password: 'a brand new secret' } })
    expect(login.statusCode).toBe(200)
  })
})

describe('security errors', () => {
  it('answers 401 UNAUTHORIZED without a session, and 403 FORBIDDEN for a non-moderator on a moderation route', async () => {
    const anon = await app.inject({ method: 'GET', url: '/auth/me' })
    expect(anon.statusCode).toBe(401)
    expect(anon.json().code).toBe('UNAUTHORIZED')
    const reg = await register()
    const res = await app.inject({ method: 'GET', url: '/moderation/reports', headers: sessionCookie(reg) })
    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBe('FORBIDDEN')
  })
})

describe('database-backed rate limiting (RateLimitBucket)', () => {
  it('enforces auth rate limits across multiple server instances and preserves the 429 error contract', async () => {
    const instanceA = await buildApp({ rateLimit: true })
    const instanceB = await buildApp({ rateLimit: true })
    await Promise.all([instanceA.ready(), instanceB.ready()])

    try {
      // POST /auth/forgot-password allows 5 requests per minute per IP/email across the cluster.
      for (let i = 0; i < 5; i++) {
        const target = i % 2 === 0 ? instanceA : instanceB
        const ok = await target.inject({
          method: 'POST',
          url: '/auth/forgot-password',
          remoteAddress: '203.0.113.10',
          payload: { email: 'Casey@Example.com' },
        })
        expect(ok.statusCode).toBe(200)
        expect(ok.headers['x-ratelimit-limit']).toBe('5')
        expect(ok.headers['x-ratelimit-remaining']).toBe(String(4 - i))
      }

      const blocked = await instanceB.inject({
        method: 'POST',
        url: '/auth/forgot-password',
        remoteAddress: '203.0.113.10',
        payload: { email: 'Casey@Example.com' },
      })
      expect(blocked.statusCode).toBe(429)
      await validateResponse('forgotPassword', 429, blocked.json())
      expect(blocked.json()).toMatchObject({
        code: 'RATE_LIMITED',
        message: 'Too many requests',
      })
      expect(blocked.headers['x-ratelimit-remaining']).toBe('0')
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThanOrEqual(1)
    } finally {
      await Promise.all([instanceA.close(), instanceB.close()])
    }
  })

  it('atomically admits exactly max requests under high concurrency', async () => {
    const now = new Date('2026-11-07T12:00:00.000Z')
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        consumeRateLimit({
          key: 'concurrent:auth:login:ip:198.51.100.7',
          max: 5,
          windowMs: 60_000,
          now,
        }),
      ),
    )

    const allowed = results.filter((r) => r.allowed)
    const denied = results.filter((r) => !r.allowed)
    expect(allowed).toHaveLength(5)
    expect(denied).toHaveLength(15)

    // Every concurrent caller receives a distinct monotonic slot count from 1..20.
    const counts = results.map((r) => r.count).sort((a, b) => a - b)
    expect(counts).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))

    const bucket = await db.rateLimitBucket.findUniqueOrThrow({
      where: { key: 'concurrent:auth:login:ip:198.51.100.7' },
    })
    expect(bucket.count).toBe(20)
  })

  it('resets expired buckets atomically under concurrency and prunes stale rows', async () => {
    const t0 = new Date('2026-11-07T12:00:00.000Z')
    const key = 'expiry:auth:login:ip:198.51.100.99'

    expect((await consumeRateLimit({ key, max: 2, windowMs: 10_000, now: t0 })).allowed).toBe(true)
    expect((await consumeRateLimit({ key, max: 2, windowMs: 10_000, now: new Date(t0.getTime() + 1_000) })).allowed).toBe(true)
    const deniedMidWindow = await consumeRateLimit({ key, max: 2, windowMs: 10_000, now: new Date(t0.getTime() + 5_000) })
    expect(deniedMidWindow.allowed).toBe(false)
    expect(deniedMidWindow.retryAfterSeconds).toBe(5)

    // At t0 + 10_000ms the bucket has expired; 6 concurrent requests should reset the window once and admit 2.
    const tExpired = new Date(t0.getTime() + 10_000)
    const afterExpiry = await Promise.all(
      Array.from({ length: 6 }, () => consumeRateLimit({ key, max: 2, windowMs: 10_000, now: tExpired })),
    )
    expect(afterExpiry.filter((r) => r.allowed)).toHaveLength(2)
    expect(afterExpiry.filter((r) => !r.allowed)).toHaveLength(4)

    const refreshed = await db.rateLimitBucket.findUniqueOrThrow({ where: { key } })
    expect(refreshed.count).toBe(6)
    expect(refreshed.resetAt.toISOString()).toBe(new Date(tExpired.getTime() + 10_000).toISOString())

    // Add a stale bucket and verify pruneExpiredRateLimitBuckets removes only expired rows.
    await consumeRateLimit({ key: 'stale:bucket', max: 5, windowMs: 1_000, now: t0 })
    const pruned = await pruneExpiredRateLimitBuckets(tExpired)
    expect(pruned).toBe(1)
    expect(await db.rateLimitBucket.findUnique({ where: { key: 'stale:bucket' } })).toBeNull()
    expect(await db.rateLimitBucket.findUnique({ where: { key } })).not.toBeNull()
  })
})
