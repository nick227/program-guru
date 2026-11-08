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
  return { data: await media.deliveryUrl(viewer?.id ?? null, request.params.mediaId, request.query.publicationId) }
}
export async function getMediaFile(request: any, reply: FastifyReply) {
  const { mediaId, variant } = request.params as { mediaId: string; variant: MediaVariantName }
  const context = { ...(request.query.viewerId ? { viewerId: request.query.viewerId } : {}), ...(request.query.publicationId ? { publicationId: request.query.publicationId } : {}) }
  if (!verifyMediaSignature(mediaId, variant, Number(request.query.exp), request.query.sig, context)) throw notFound('Media')
  const viewer = context.viewerId ?? (await resolveViewer(request))?.id ?? null
  // Re-authorize on every fetch (revocation, blocks, lapsed membership), then serve the range.
  await media.authorizeDelivery(viewer, mediaId, context.publicationId)
  const file = await media.fileForDelivery(mediaId, variant, request.headers.range)
  reply.header('cache-control', 'private, no-store')
  reply.header('x-content-type-options', 'nosniff')
  reply.header('accept-ranges', 'bytes')
  if ('unsatisfiable' in file) {
    reply.header('content-range', `bytes */${file.size}`)
    return reply.code(416).send()
  }
  if ('range' in file && file.range) {
    reply.code(206)
    reply.header('content-range', `bytes ${file.range.start}-${file.range.end}/${file.size}`)
    reply.header('content-length', String(file.range.end - file.range.start + 1))
  } else {
    reply.header('content-length', String(file.size))
  }
  const stream = file.stream!
  // Mid-stream I/O errors after headers: destroy the socket; never leave an unhandled stream error
  // and never attempt a JSON error body once bytes have started.
  stream.on('error', (err) => {
    request.log.error({ err }, 'media stream failed')
    if (!reply.raw.writableEnded) reply.raw.destroy()
  })
  return reply.type(file.mime!).send(stream)
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

export async function listMediaAttachments(request: any) {
  return media.listAttachments(uid(request), request.query)
}

export async function listActivityMyMedia(request: any) {
  return media.listActivityHistory(uid(request), request.params.activityId, request.query)
}
