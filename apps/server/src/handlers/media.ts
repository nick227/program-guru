import type { FastifyReply } from 'fastify'
import { requireUser, resolveViewer } from '../lib/auth'
import { notFound } from '../lib/errors'
import * as media from '../domains/media/media.service'
import { verifyMediaSignature, type MediaVariantName } from '../domains/media/urls'

const uid = (request: any) => requireUser(request).id

export async function listMyMedia(request: any) {
  return media.listMine(uid(request), request.query)
}
export async function listPlatformMedia(request: any) {
  requireUser(request)
  return media.listPlatform(request.query)
}
export async function createMediaUpload(request: any) {
  return { data: await media.createUpload(uid(request), request.body) }
}
export async function uploadMediaContent(request: any) {
  await media.receiveLocalUpload(request.params.uploadId, request.query.token, request.body)
  return { data: { ok: true } }
}
export async function completeMediaUpload(request: any) {
  return { data: await media.completeUpload(uid(request), request.params.uploadId) }
}
export async function getMedia(request: any) {
  return { data: await media.get(uid(request), request.params.mediaId) }
}
export async function updateMedia(request: any) {
  return { data: await media.update(uid(request), request.params.mediaId, request.body) }
}
export async function getMediaUrl(request: any) {
  const viewer = await resolveViewer(request)
  return { data: await media.deliveryUrl(viewer?.id ?? null, request.params.mediaId) }
}
export async function getMediaFile(request: any, reply: FastifyReply) {
  const { mediaId, variant } = request.params as { mediaId: string; variant: MediaVariantName }
  if (!verifyMediaSignature(mediaId, variant, Number(request.query.exp), request.query.sig)) throw notFound('Media')
  const file = await media.fileForDelivery(mediaId, variant)
  if ('redirect' in file) return reply.redirect(file.redirect!)
  reply.header('cache-control', 'private, max-age=3600')
  reply.header('x-content-type-options', 'nosniff')
  if (file.size !== null) reply.header('content-length', String(file.size))
  return reply.type(file.mime!).send(file.stream)
}
export async function deleteMedia(request: any) {
  await media.remove(uid(request), request.params.mediaId)
  return { data: { ok: true } }
}
export async function createMediaAttachment(request: any) {
  return { data: await media.attach(uid(request), request.body) }
}
export async function deleteMediaAttachment(request: any) {
  await media.detach(uid(request), request.params.attachmentId)
  return { data: { ok: true } }
}
export async function createMediaPublication(request: any) {
  return { data: await media.publish(uid(request), request.body) }
}
export async function revokeMediaPublication(request: any) {
  await media.revoke(uid(request), request.params.publicationId)
  return { data: { ok: true } }
}
export async function getMediaPublication(request: any) {
  const viewer = await resolveViewer(request)
  return { data: await media.getPublication(viewer?.id ?? null, request.params.publicationId) }
}
export async function listPendingPublications(request: any) {
  return media.listPending(request.query)
}
export async function moderateMediaPublication(request: any) {
  return { data: await media.moderate(uid(request), request.params.publicationId, request.body) }
}
