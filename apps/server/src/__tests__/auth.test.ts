// Real session transport: these tests use the production security handlers and cookies.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db } from '@project/db'
import { buildApp } from '../app'
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
