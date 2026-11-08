import { requireUser, resolveViewer } from '../lib/auth'
import * as groups from '../domains/groups/group.service'

const uid = (request: any) => requireUser(request).id

export async function listMyGroups(request: any) {
  return groups.listMine(uid(request), request.query)
}
export async function createGroup(request: any) {
  return { data: await groups.create(uid(request), request.body) }
}
export async function getGroup(request: any) {
  return { data: await groups.get(uid(request), request.params.groupId) }
}
export async function updateGroup(request: any) {
  return { data: await groups.update(uid(request), request.params.groupId, request.body) }
}
export async function updateMyGroupMembership(request: any) {
  return { data: await groups.updateMyMembership(uid(request), request.params.groupId, request.body) }
}
export async function removeGroupMember(request: any) {
  await groups.removeMember(uid(request), request.params.groupId, request.params.userId)
  return { data: { ok: true } }
}
export async function listGroupInvitations(request: any) {
  return { data: await groups.listInvitations(uid(request), request.params.groupId) }
}
export async function createGroupInvitation(request: any) {
  return { data: await groups.invite(uid(request), request.params.groupId, request.body) }
}
export async function revokeGroupInvitation(request: any) {
  await groups.revokeInvitation(uid(request), request.params.groupId, request.params.invitationId)
  return { data: { ok: true } }
}
export async function getGroupInvitation(request: any) {
  const viewer = await resolveViewer(request)
  return { data: await groups.previewInvitation(viewer?.id ?? null, request.params.token) }
}
export async function acceptGroupInvitation(request: any) {
  return { data: await groups.accept(uid(request), request.params.token, request.body ?? undefined) }
}
export async function declineGroupInvitation(request: any) {
  await groups.decline(uid(request), request.params.token)
  return { data: { ok: true } }
}
export async function listMyGroupInvitations(request: any) {
  return groups.listReceived(uid(request), request.query)
}
export async function acceptMyGroupInvitation(request: any) {
  return { data: await groups.acceptMine(uid(request), request.params.invitationId, request.body ?? undefined) }
}
export async function declineMyGroupInvitation(request: any) {
  await groups.declineMine(uid(request), request.params.invitationId)
  return { data: { ok: true } }
}
export async function listGroupCompletions(request: any) {
  return groups.listCompletions(uid(request), request.params.groupId, request.query)
}
export async function addCompletionReaction(request: any) {
  return { data: await groups.react(uid(request), request.params.shareId, request.body.emoji, request.body.idempotencyKey) }
}
export async function removeCompletionReaction(request: any) {
  return { data: await groups.unreact(uid(request), request.params.shareId, decodeURIComponent(request.params.emoji)) }
}
export async function listGroupMedia(request: any) {
  return groups.listMedia(uid(request), request.params.groupId, request.query)
}
