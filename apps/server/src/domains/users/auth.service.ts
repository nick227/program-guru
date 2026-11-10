import bcrypt from 'bcryptjs'
import { OAuth2Client } from 'google-auth-library'
import { db, type Prisma } from '@project/db'
import { newToken, sha256 } from '../../lib/auth'
import { AppError, badRequest, conflict, forbidden, unauthorized } from '../../lib/errors'
import { enqueue } from '../../lib/outbox'
import { assertAdminRemains } from '../admin/users.service'
import { assertHandleAvailable, assertTimezone, normalizeHandle, suggestHandle } from './profile.service'

const BCRYPT_COST = 12 // 05 §15
const VERIFY_TTL_MS = 48 * 3600_000
const RESET_TTL_MS = 3600_000

let dummy: Promise<string> | null = null
const dummyHash = () => (dummy ??= bcrypt.hash('timing-equalizer', BCRYPT_COST))

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

/** 05 §5: identity, profile, preferences, and credential in one transaction. */
async function createAccount(
  tx: Prisma.TransactionClient,
  input: { email: string; handle: string; displayName: string; timezone?: string; passwordHash?: string; emailVerified?: boolean },
) {
  const user = await tx.user.create({
    data: {
      email: input.email,
      emailVerifiedAt: input.emailVerified ? new Date() : null,
      profile: { create: { handle: input.handle, displayName: input.displayName } },
      preferences: { create: { timezone: input.timezone ?? 'UTC' } },
      ...(input.passwordHash ? { credential: { create: { passwordHash: input.passwordHash } } } : {}),
    },
  })
  return user
}

async function issueEmailToken(tx: Prisma.TransactionClient, userId: string, purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD') {
  const token = newToken()
  await tx.authToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } })
  await tx.authToken.create({
    data: {
      userId,
      purpose,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + (purpose === 'VERIFY_EMAIL' ? VERIFY_TTL_MS : RESET_TTL_MS)),
    },
  })
  // The worker emails the raw token and then clears it from the event payload.
  await enqueue(tx, purpose === 'VERIFY_EMAIL' ? 'EmailVerificationRequested' : 'PasswordResetRequested', { userId, token })
}

export async function register(input: { email: string; password: string; handle: string; displayName: string; timezone?: string }) {
  const email = normalizeEmail(input.email)
  const handle = normalizeHandle(input.handle)
  if (input.timezone) assertTimezone(input.timezone)
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST)
  try {
    return await db.$transaction(async (tx) => {
      if (await tx.user.findUnique({ where: { email }, select: { id: true } })) {
        throw conflict('An account with that email already exists')
      }
      await assertHandleAvailable(handle, tx)
      const user = await createAccount(tx, { email, handle, displayName: input.displayName.trim(), timezone: input.timezone, passwordHash })
      await issueEmailToken(tx, user.id, 'VERIFY_EMAIL')
      return user
    })
  } catch (err: any) {
    // Parallel registration with the same email or handle loses the unique-index race (06 §7).
    if (err?.code === 'P2002') throw conflict('That email or handle is already taken')
    throw err
  }
}

function assertCanSignIn(status: string) {
  if (status === 'SUSPENDED') throw forbidden('This account is suspended')
  if (status === 'DEACTIVATED') throw forbidden('This account is deactivated')
}

export async function login(input: { email: string; password: string }) {
  const user = await db.user.findUnique({ where: { email: normalizeEmail(input.email) }, include: { credential: true } })
  // Same error for unknown email and wrong password; still hash to keep timing similar.
  const ok = user?.credential
    ? await bcrypt.compare(input.password, user.credential.passwordHash)
    : (await bcrypt.compare(input.password, await dummyHash()), false)
  if (!user || !ok) throw unauthorized('Email or password is incorrect')
  assertCanSignIn(user.status)
  return user
}

let googleClient: OAuth2Client | null = null

export async function loginWithGoogle(input: { idToken: string; handle?: string; timezone?: string }) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) throw new AppError('NOT_IMPLEMENTED', 'Google sign-in is not configured')
  googleClient ??= new OAuth2Client(clientId)
  let payload
  try {
    payload = (await googleClient.verifyIdToken({ idToken: input.idToken, audience: clientId })).getPayload()
  } catch {
    throw unauthorized('Google sign-in failed')
  }
  if (!payload?.sub || !payload.email || !payload.email_verified) throw unauthorized('Google account email is not verified')

  const identity = await db.authIdentity.findUnique({
    where: { provider_providerSubject: { provider: 'GOOGLE', providerSubject: payload.sub } },
    include: { user: true },
  })
  if (identity) {
    assertCanSignIn(identity.user.status)
    return identity.user
  }

  const email = normalizeEmail(payload.email)
  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    // Google verified this email, so linking to the matching account is safe.
    assertCanSignIn(existing.status)
    await db.authIdentity.create({ data: { userId: existing.id, provider: 'GOOGLE', providerSubject: payload.sub } })
    if (!existing.emailVerifiedAt) await db.user.update({ where: { id: existing.id }, data: { emailVerifiedAt: new Date() } })
    return existing
  }

  const handle = input.handle ? normalizeHandle(input.handle) : await suggestHandle(payload.given_name ?? email.split('@')[0]!)
  if (input.timezone) assertTimezone(input.timezone)
  return db.$transaction(async (tx) => {
    await assertHandleAvailable(handle, tx)
    const user = await createAccount(tx, {
      email,
      handle,
      displayName: (payload!.name ?? handle).slice(0, 80),
      timezone: input.timezone,
      emailVerified: true,
    })
    await tx.authIdentity.create({ data: { userId: user.id, provider: 'GOOGLE', providerSubject: payload!.sub } })
    return user
  })
}

async function consumeToken(token: string, purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD') {
  const row = await db.authToken.findUnique({ where: { tokenHash: sha256(token) } })
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt < new Date()) {
    throw badRequest('This link is invalid or has expired', { token: 'is invalid or expired' })
  }
  const claimed = await db.authToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } })
  if (claimed.count === 0) throw badRequest('This link was already used', { token: 'was already used' })
  return row
}

export async function verifyEmail(token: string) {
  const row = await consumeToken(token, 'VERIFY_EMAIL')
  await db.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } })
}

export async function resendVerification(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } })
  if (user.emailVerifiedAt) return
  await db.$transaction((tx) => issueEmailToken(tx, userId, 'VERIFY_EMAIL'))
}

/** Always succeeds from the caller's view so it cannot reveal whether an email is registered. */
export async function forgotPassword(email: string) {
  const user = await db.user.findUnique({ where: { email: normalizeEmail(email) } })
  if (!user || user.status !== 'ACTIVE') return
  await db.$transaction((tx) => issueEmailToken(tx, user.id, 'RESET_PASSWORD'))
}

export async function resetPassword(token: string, password: string) {
  const row = await consumeToken(token, 'RESET_PASSWORD')
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST)
  await db.$transaction([
    db.localCredential.upsert({ where: { userId: row.userId }, create: { userId: row.userId, passwordHash }, update: { passwordHash } }),
    // Token rotation: a reset signs out every existing session.
    db.session.deleteMany({ where: { userId: row.userId } }),
  ])
}

export async function deactivate(userId: string) {
  await db.$transaction(async (tx) => {
    await assertAdminRemains(tx, userId)
    await tx.user.update({ where: { id: userId }, data: { status: 'DEACTIVATED', deactivatedAt: new Date() } })
    await tx.session.deleteMany({ where: { userId } })
  })
}
