// Thin handlers: one named export per operationId, delegating to services.
import type { FastifyReply } from 'fastify'
import { clearSessionCookie, createSession, destroySession, requireUser } from '../lib/auth'
import * as auth from '../domains/users/auth.service'
import { buildMe } from '../domains/users/profile.service'

export async function register(request: any, reply: FastifyReply) {
  const user = await auth.register(request.body)
  await createSession(user.id, reply)
  return reply.status(201).send({ data: await buildMe(user.id) })
}

export async function login(request: any, reply: FastifyReply) {
  const user = await auth.login(request.body)
  await createSession(user.id, reply)
  return { data: await buildMe(user.id) }
}

export async function loginWithGoogle(request: any, reply: FastifyReply) {
  const user = await auth.loginWithGoogle(request.body)
  await createSession(user.id, reply)
  return { data: await buildMe(user.id) }
}

export async function logout(request: any, reply: FastifyReply) {
  await destroySession(request)
  clearSessionCookie(reply)
  return { data: null }
}

export async function getCurrentUser(request: any) {
  return { data: await buildMe(requireUser(request).id) }
}

export async function verifyEmail(request: any) {
  await auth.verifyEmail(request.body.token)
  return { data: { ok: true } }
}

export async function resendVerificationEmail(request: any) {
  await auth.resendVerification(requireUser(request).id)
  return { data: { ok: true } }
}

export async function forgotPassword(request: any) {
  await auth.forgotPassword(request.body.email)
  return { data: { ok: true } }
}

export async function resetPassword(request: any) {
  await auth.resetPassword(request.body.token, request.body.password)
  return { data: { ok: true } }
}
