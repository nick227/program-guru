import type { FastifyReply } from 'fastify'
import { clearSessionCookie, requireUser, resolveViewer } from '../lib/auth'
import * as auth from '../domains/users/auth.service'
import * as directory from '../domains/users/directory.service'
import * as follows from '../domains/users/follow.service'

export async function deactivateMe(request: any, reply: FastifyReply) {
  await auth.deactivate(requireUser(request).id)
  clearSessionCookie(reply)
  return { data: { ok: true } }
}

export async function listMyFollowRequests(request: any) {
  return follows.listIncomingRequests(requireUser(request).id, request.query)
}

export async function searchUsers(request: any) {
  const viewer = await resolveViewer(request)
  return directory.search(viewer?.id ?? null, request.query)
}

export async function getUserByHandle(request: any) {
  const viewer = await resolveViewer(request)
  return { data: await directory.byHandle(viewer?.id ?? null, request.params.handle) }
}

export async function approveFollowRequest(request: any) {
  return { data: await follows.resolveRequest(requireUser(request).id, request.params.requestId, 'APPROVED') }
}

export async function declineFollowRequest(request: any) {
  return { data: await follows.resolveRequest(requireUser(request).id, request.params.requestId, 'DECLINED') }
}

export async function blockUser(request: any) {
  await follows.block(requireUser(request).id, request.params.userId)
  return { data: { ok: true } }
}

export async function unblockUser(request: any) {
  await follows.unblock(requireUser(request).id, request.params.userId)
  return { data: { ok: true } }
}
