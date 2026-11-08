import { requireUser, resolveViewer, sha256 } from '../lib/auth'
import * as social from '../domains/social/social.service'
import * as notifications from '../domains/social/notification.service'
import * as moderation from '../domains/social/moderation.service'
import { clientIp } from '../lib/clientIp'

const uid = (request: any) => requireUser(request).id
const viewerId = async (request: any) => (await resolveViewer(request))?.id ?? null

export async function discover(request: any) {
  return social.discover(await viewerId(request), request.query)
}
export async function listUserPrograms(request: any) {
  return social.userPrograms(await viewerId(request), request.params.handle, request.query)
}
export async function listUserActivities(request: any) {
  return social.userActivities(await viewerId(request), request.params.handle, request.query)
}
export async function listUserPublications(request: any) {
  return social.userPublications(await viewerId(request), request.params.handle, request.query)
}
export async function listActivityPublicMedia(request: any) {
  return social.activityPublicMedia(await viewerId(request), request.params.activityId, request.query)
}
export async function likeMediaPublication(request: any) {
  return { data: await social.like(uid(request), request.params.publicationId) }
}
export async function unlikeMediaPublication(request: any) {
  return { data: await social.unlike(uid(request), request.params.publicationId) }
}
export async function recordMediaPublicationView(request: any) {
  // Anonymous views dedupe on a hash of network and agent; nothing identifying is stored.
  const fingerprint = sha256(`${clientIp(request)}:${request.headers['user-agent'] ?? ''}`)
  await social.recordView(await viewerId(request), fingerprint, request.params.publicationId)
  return { data: { ok: true } }
}
export async function listMediaPublicationComments(request: any) {
  return social.listComments(uid(request), request.params.publicationId, request.query)
}
export async function addMediaPublicationComment(request: any) {
  return { data: await social.addComment(uid(request), request.params.publicationId, request.body.body, request.body.idempotencyKey) }
}
export async function deleteMediaComment(request: any) {
  await social.deleteComment(uid(request), request.params.commentId)
  return { data: { ok: true } }
}

export async function listNotifications(request: any) {
  return notifications.list(uid(request), request.query)
}
export async function getUnreadNotificationCount(request: any) {
  return { data: await notifications.unreadCount(uid(request)) }
}
export async function markNotificationsRead(request: any) {
  await notifications.markRead(uid(request), request.body)
  return { data: { ok: true } }
}
export async function unsubscribeDailyEmail(request: any) {
  await notifications.unsubscribe(request.body.token)
  return { data: { ok: true } }
}

export async function createReport(request: any) {
  return { data: await moderation.report(uid(request), request.body) }
}
export async function listReports(request: any) {
  return moderation.listReports(request.query)
}
export async function resolveReport(request: any) {
  return { data: await moderation.resolve(uid(request), request.params.reportId, request.body) }
}
export async function grantProgramAccess(request: any) {
  return { data: await moderation.grantAccess(uid(request), request.params.programId, request.body) }
}
export async function revokeProgramAccess(request: any) {
  await moderation.revokeAccess(uid(request), request.params.grantId)
  return { data: { ok: true } }
}
