// Publishing never requires a verified email. REQUIRE_EMAIL_VERIFICATION: enforced by default for payout
// onboarding; `false` (UAT) relaxes that gate without
// marking anyone verified or touching verification, password reset, or email-invitation ownership.
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { db } from '@project/db'
import { buildTestApp, asAuth, validateResponse } from './helpers'
import { seedCatalog } from './helpers/fixtures'
import { emailVerificationRequired, passesEmailVerification } from '../lib/verification'

const app = buildTestApp()
let cat: Awaited<ReturnType<typeof seedCatalog>>
const saved = process.env.REQUIRE_EMAIL_VERIFICATION
beforeEach(async () => {
  cat = await seedCatalog()
  delete process.env.REQUIRE_EMAIL_VERIFICATION
})
afterAll(() => {
  if (saved === undefined) delete process.env.REQUIRE_EMAIL_VERIFICATION
  else process.env.REQUIRE_EMAIL_VERIFICATION = saved
})

let n = 0
/** A real registration: the new account is unverified. */
async function newUnverifiedUser() {
  const id = `${Date.now().toString(36)}${++n}`
  const res = await app.inject({ method: 'POST', url: '/auth/register', payload: { email: `uv-${id}@test.local`, password: `Unverified-${id}`, handle: `uv_${id}`, displayName: 'Unverified' } })
  expect(res.statusCode).toBe(201)
  const userId = res.json().data.id as string
  expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).emailVerifiedAt).toBeNull()
  const call = (method: string, url: string, payload?: unknown) => app.inject({ method: method as any, url, headers: asAuth(userId), ...(payload !== undefined ? { payload: payload as any } : {}) })
  return { userId, email: `uv-${id}@test.local`, call }
}

/** Creates a Program with one seeded Activity and returns its draft workspace. */
async function draftProgram(call: Awaited<ReturnType<typeof newUnverifiedUser>>['call']) {
  let ws = (await call('POST', '/programs', { programTypeId: cat.workout.id, focusId: cat.strength.id })).json().data
  ws = (await call('POST', `/programs/${ws.id}/draft/activities`, { activityIds: [cat.squats.activity.id], expectedRevision: ws.draftRevision })).json().data
  return ws
}

describe('emailVerificationRequired', () => {
  it('is enforced unless explicitly set to false', () => {
    expect(emailVerificationRequired({})).toBe(true)
    expect(emailVerificationRequired({ REQUIRE_EMAIL_VERIFICATION: 'true' })).toBe(true)
    expect(emailVerificationRequired({ REQUIRE_EMAIL_VERIFICATION: '' })).toBe(true)
    expect(emailVerificationRequired({ REQUIRE_EMAIL_VERIFICATION: 'no' })).toBe(true) // typos stay secure
    expect(emailVerificationRequired({ REQUIRE_EMAIL_VERIFICATION: 'false' })).toBe(false)
    expect(emailVerificationRequired({ REQUIRE_EMAIL_VERIFICATION: ' FALSE ' })).toBe(false)
  })

  it('a verified user always passes; an unverified one only when not required', () => {
    expect(passesEmailVerification({ emailVerifiedAt: new Date() })).toBe(true)
    expect(passesEmailVerification({ emailVerifiedAt: null })).toBe(false)
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false'
    expect(passesEmailVerification({ emailVerifiedAt: null })).toBe(true)
  })
})

describe('enforced (default)', () => {
  it('an unverified user can sign in, draft, and publish to others', async () => {
    const u = await newUnverifiedUser()
    const me = await u.call('GET', '/auth/me')
    await validateResponse('getCurrentUser', 200, me.json())
    expect(me.json().data).toMatchObject({ emailVerified: false, emailVerificationRequired: true })

    const ws = await draftProgram(u.call)
    const pub = await u.call('POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision })
    expect(pub.statusCode).toBe(200)

    const act = (await u.call('POST', '/activities', { title: 'My drill', categoryId: cat.fitness.id })).json().data
    expect((await u.call('POST', `/activities/${act.id}/publish`, { visibility: 'PUBLIC', expectedRevision: 0 })).statusCode).toBe(200)
    expect((await db.user.findUniqueOrThrow({ where: { id: u.userId } })).emailVerifiedAt).toBeNull()
  })
})

describe('REQUIRE_EMAIL_VERIFICATION=false', () => {
  beforeEach(() => {
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false'
  })

  it('register → create → publish publicly works unverified, and nobody is marked verified', async () => {
    const u = await newUnverifiedUser()
    expect((await u.call('GET', '/auth/me')).json().data).toMatchObject({ emailVerified: false, emailVerificationRequired: false })

    const ws = await draftProgram(u.call)
    const pub = await u.call('POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision })
    expect(pub.statusCode).toBe(200)
    expect((await db.program.findUniqueOrThrow({ where: { id: ws.id } })).status).toBe('PUBLISHED')

    const act = (await u.call('POST', '/activities', { title: 'My public drill', categoryId: cat.fitness.id })).json().data
    expect((await u.call('POST', `/activities/${act.id}/publish`, { visibility: 'PUBLIC', expectedRevision: 0 })).statusCode).toBe(200)

    expect((await db.user.findUniqueOrThrow({ where: { id: u.userId } })).emailVerifiedAt).toBeNull()
  })

  it('verification and password reset still work unchanged', async () => {
    const u = await newUnverifiedUser()
    const token = await db.authToken.findFirstOrThrow({ where: { userId: u.userId, purpose: 'VERIFY_EMAIL' } })
    expect(token.usedAt).toBeNull() // the verification token was still issued at registration
    expect((await u.call('POST', '/auth/verify-email/resend')).statusCode).toBe(200)
    expect((await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { token: 'not-a-real-token' } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email: u.email } })).statusCode).toBe(200)
    expect(await db.authToken.count({ where: { userId: u.userId, purpose: 'RESET_PASSWORD' } })).toBe(1)
    expect((await app.inject({ method: 'POST', url: '/auth/reset-password', payload: { token: 'not-a-real-token', password: 'new-password-1' } })).statusCode).toBe(400)
  })

  it('email group invitations are still matched only to a verified address (ownership, not a publishing gate)', async () => {
    const owner = await newUnverifiedUser()
    const invitee = await newUnverifiedUser()
    const ws = await draftProgram(owner.call)
    const pub = (await owner.call('POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision })).json().data
    await owner.call('POST', `/programs/${ws.id}/enrollments`, { programVersionId: pub.latestPublishedVersionId, startLocalDate: '2026-12-01', timezone: 'UTC', idempotencyKey: `own-${owner.userId}` })
    const g = (await owner.call('POST', '/groups', { programVersionId: pub.latestPublishedVersionId, mode: 'SYNC' })).json().data
    expect((await owner.call('POST', `/groups/${g.id}/invitations`, { kind: 'EMAIL', email: invitee.email })).statusCode).toBe(201)
    expect((await invitee.call('GET', '/users/me/group-invitations')).json().data).toEqual([])
    await db.user.update({ where: { id: invitee.userId }, data: { emailVerifiedAt: new Date() } })
    expect((await invitee.call('GET', '/users/me/group-invitations')).json().data).toHaveLength(1)
  })
})
