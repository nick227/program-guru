// Adapted from the factory template: hashed session tokens, UserStatus instead of suspendedAt,
// and adminAuth admits MODERATOR as well as ADMIN (12-SOCIAL.md §7).
import type { FastifyRequest } from 'fastify'
import { resolveSessionUser } from '../lib/auth'
import { forbidden, unauthorized } from '../lib/errors'

export async function bearerAuth(request: FastifyRequest) {
  const user = await resolveSessionUser(request)
  if (!user) throw unauthorized()
  request.user = user
}

export async function adminAuth(request: FastifyRequest) {
  await bearerAuth(request)
  const role = request.user!.role
  if (role !== 'ADMIN' && role !== 'MODERATOR') throw forbidden()
}
