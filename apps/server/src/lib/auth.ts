import { createHash, randomBytes } from 'crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { db, type User, type UserProfile } from '@project/db'
import { unauthorized } from './errors'

export const SESSION_COOKIE = 'session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export type AuthUser = User & { profile: UserProfile | null }

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser
  }
}

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
export const newToken = () => randomBytes(32).toString('base64url')

// 06-USERS §7: httpOnly + Secure, SameSite=Lax across sibling subdomains (no SameSite=None).
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  domain: process.env.COOKIE_DOMAIN || undefined,
  maxAge: SESSION_TTL_MS / 1000,
})

export async function createSession(userId: string, reply: FastifyReply) {
  const token = newToken()
  await db.session.create({
    data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  })
  reply.setCookie(SESSION_COOKIE, token, cookieOptions())
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/', domain: process.env.COOKIE_DOMAIN || undefined })
}

export function readToken(request: FastifyRequest): string | null {
  const cookie = request.cookies?.[SESSION_COOKIE]
  if (cookie) return cookie
  const header = request.headers.authorization
  return header?.startsWith('Bearer ') ? header.slice(7) : null
}

export async function destroySession(request: FastifyRequest) {
  const token = readToken(request)
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } })
}

/** Resolves the session to an active user, or null. Never throws. */
export async function resolveSessionUser(request: FastifyRequest): Promise<AuthUser | null> {
  const token = readToken(request)
  if (!token) return null
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { profile: true } } },
  })
  if (!session || session.expiresAt < new Date()) return null
  if (session.user.status !== 'ACTIVE') return null
  return session.user
}

/**
 * Public routes (`security: []`) still personalize for a signed-in viewer
 * (relationship, likedByMe, viewerAccess). Call this from those handlers.
 */
type ViewerResolver = (request: FastifyRequest) => Promise<AuthUser | null>
let viewerResolver: ViewerResolver = resolveSessionUser

/** Tests replace this together with the security handlers (see __tests__/helpers). */
export function setViewerResolver(fn: ViewerResolver | null) {
  viewerResolver = fn ?? resolveSessionUser
}

export async function resolveViewer(request: FastifyRequest): Promise<AuthUser | null> {
  if (request.user) return request.user
  const user = await viewerResolver(request)
  if (user) request.user = user
  return user
}

export function requireUser(request: FastifyRequest): AuthUser {
  if (!request.user) throw unauthorized()
  return request.user
}
