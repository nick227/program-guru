// Media assets, uploads, attachments, publications (11-MEDIA.md). An asset is private to its owner;
// attaching never changes who can see it; only an explicit publication gives it an audience.
import type { Readable } from 'stream'
import { db, type MediaAsset, type Prisma } from '@project/db'
import { badRequest, conflict, notFound } from '../../lib/errors'
import { enqueue } from '../../lib/outbox'
import { offsetArgs, toOffsetPage, type PageQuery } from '../../lib/paging'
import { storage } from '../../infrastructure/storage'
import { canReadRevision } from '../activities/access'
import { canSeeProgram, isProgramOwner } from '../programs/access'
import { isBlockedEitherWay } from '../users/follow.service'
import { toUserSummary } from '../users/mapper'
import { localUploadUrl, mediaUrl, uploadToken, verifyUploadToken, type MediaVariantName } from './urls'

const MB = 1024 * 1024
const LIMITS = {
  PHOTO: Number(process.env.MEDIA_MAX_PHOTO_BYTES ?? 20 * MB),
  VIDEO: Number(process.env.MEDIA_MAX_VIDEO_BYTES ?? 500 * MB),
  AUDIO: Number(process.env.MEDIA_MAX_AUDIO_BYTES ?? 100 * MB),
}
const QUOTA_BYTES = Number(process.env.MEDIA_QUOTA_BYTES ?? 5 * 1024 * MB)
const UPLOAD_WINDOW_MS = 60 * 60 * 1000

const MIME: Record<string, 'PHOTO' | 'VIDEO' | 'AUDIO'> = {
  'image/jpeg': 'PHOTO',
  'image/png': 'PHOTO',
  'image/webp': 'PHOTO',
  'image/heic': 'PHOTO',
  'video/mp4': 'VIDEO',
  'video/quicktime': 'VIDEO',
  'video/webm': 'VIDEO',
  'audio/mpeg': 'AUDIO',
  'audio/mp4': 'AUDIO',
  'audio/webm': 'AUDIO',
  'audio/ogg': 'AUDIO',
}

/** Content sniffing: the claimed type must match the bytes (11 §6.3). */
function sniff(head: Buffer): string | null {
  const s = (a: number, b: number) => head.subarray(a, b).toString('latin1')
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg'
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP') return 'image/webp'
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return 'webm'
  if (s(4, 8) === 'ftyp') {
    const brand = s(8, 12)
    if (['heic', 'heix', 'mif1', 'msf1'].includes(brand)) return 'image/heic'
    if (brand === 'qt  ') return 'video/quicktime'
    if (brand.startsWith('M4A')) return 'audio/mp4'
    return 'video/mp4'
  }
  if (s(0, 3) === 'ID3' || (head[0] === 0xff && (head[1]! & 0xe0) === 0xe0)) return 'audio/mpeg'
  if (s(0, 4) === 'OggS') return 'audio/ogg'
  return null
}

function sniffMatches(claimed: string, actual: string | null) {
  if (!actual) return false
  if (actual === 'webm') return claimed === 'video/webm' || claimed === 'audio/webm'
  if (actual === 'video/mp4') return ['video/mp4', 'video/quicktime', 'audio/mp4'].includes(claimed)
  return actual === claimed
}

export const thumbFor = (m: Pick<MediaAsset, 'id' | 'state' | 'type'>) => (m.state === 'READY' ? mediaUrl(m.id, m.type === 'AUDIO' ? 'original' : 'thumb') : null)

async function toAsset(viewerId: string | null, m: MediaAsset) {
  const attachmentCount = await db.mediaAttachment.count({ where: { mediaId: m.id } })
  return {
    id: m.id,
    type: m.type,
    state: m.state,
    thumbnailUrl: thumbFor(m),
    mime: m.mime,
    byteSize: Number(m.byteSize),
    width: m.width,
    height: m.height,
    durationMs: m.durationMs,
    alt: m.alt,
    license: m.license,
    attribution: m.attribution,
    attachmentCount,
    isOwner: !!viewerId && m.ownerId === viewerId,
    createdAt: m.createdAt.toISOString(),
  }
}

async function ownAsset(userId: string, mediaId: string) {
  const m = await db.mediaAsset.findUnique({ where: { id: mediaId } })
  if (!m || m.ownerId !== userId || m.deletedAt) throw notFound('Media')
  return m
}

// ── Authorization ───────────────────────────────────────────────────────────

/** May this viewer see this asset? Every delivery URL is issued only after this passes. */
export async function canViewMedia(viewerId: string | null, m: MediaAsset): Promise<boolean> {
  if (m.deletedAt || m.state === 'BLOCKED') return false
  if (m.ownerId === null) return true // platform library, rights-cleared
  if (viewerId && m.ownerId === viewerId) return true
  if (viewerId && m.ownerId && (await isBlockedEitherWay(viewerId, m.ownerId))) return false
  const publications = await db.mediaPublication.findMany({
    where: { mediaId: m.id, status: 'APPROVED' },
    include: { program: { include: { policy: true } } },
  })
  if (
    publications.some(
      (p) =>
        p.audience === 'PUBLIC' &&
        p.license !== null &&
        (!p.program ||
          (p.program.status === 'PUBLISHED' &&
            p.program.visibility === 'PUBLIC' &&
            !p.program.moderatedAt &&
            (p.program.policy?.accessMode ?? 'OPEN') === 'OPEN')),
    )
  ) {
    return true
  }
  if (viewerId) {
    for (const p of publications.filter((x) => x.audience === 'GROUP' && x.groupId)) {
      const member = await db.groupMember.findUnique({ where: { groupId_userId: { groupId: p.groupId!, userId: viewerId } } })
      if (member?.status === 'ACTIVE') return true
    }
  }
  // Instructional media inside a Program the viewer may read (07 §6), covers and avatars.
  const attachments = await db.mediaAttachment.findMany({
    where: { mediaId: m.id, OR: [{ activityRevisionId: { not: null } }, { instructionId: { not: null } }, { programId: { not: null } }] },
    include: { revision: { include: { activity: true } }, instruction: { include: { revision: { include: { activity: true } } } }, program: true },
  })
  for (const a of attachments) {
    const rev = a.revision ?? a.instruction?.revision
    if (rev && (await canReadRevision(viewerId, rev.activity, rev))) return true
    if (a.program && (await canSeeProgram(viewerId, a.program))) return true
  }
  const profile = await db.userProfile.findFirst({ where: { user: { status: 'ACTIVE' }, OR: [{ avatarMediaId: m.id }, { coverMediaId: m.id }] } })
  if (profile) return true
  const cover = await db.program.findFirst({ where: { coverMediaId: m.id } })
  return !!cover && (await canSeeProgram(viewerId, cover))
}

export async function deliveryUrl(viewerId: string | null, mediaId: string) {
  const m = await db.mediaAsset.findUnique({ where: { id: mediaId } })
  if (!m || !(await canViewMedia(viewerId, m))) throw notFound('Media')
  if (m.state !== 'READY') throw badRequest('This media is still processing')
  const variant: MediaVariantName = m.type === 'VIDEO' ? 'stream' : 'original'
  return {
    url: mediaUrl(m.id, variant)!,
    posterUrl: m.type === 'VIDEO' ? mediaUrl(m.id, 'poster') : null,
    mime: m.type === 'VIDEO' ? 'video/mp4' : m.mime,
    expiresAt: new Date((Math.floor(Date.now() / 3_600_000) + 2) * 3_600_000).toISOString(),
  }
}

/** Resolves a signed delivery request to a stream or a storage redirect. */
export async function fileForDelivery(mediaId: string, variant: MediaVariantName) {
  const m = await db.mediaAsset.findUnique({ where: { id: mediaId }, include: { variants: true } })
  if (!m || m.deletedAt || m.state === 'BLOCKED') throw notFound('Media')
  const wanted = m.variants.find((v) => v.kind === variant.toUpperCase())
  // Before processing finishes (or for platform seeds without variants), photos and audio fall back
  // to the original. Unprocessed video originals are never served as the stream.
  const fallback = m.type !== 'VIDEO' || variant === 'original' ? { storageKey: m.originalStorageKey, mime: m.mime } : null
  const file = wanted ? { storageKey: wanted.storageKey, mime: wanted.mime } : fallback
  if (!file) throw notFound('Media')
  const redirect = await storage().presignGet(file.storageKey, 300)
  if (redirect) return { redirect }
  return { stream: await storage().read(file.storageKey), mime: file.mime, size: await storage().size(file.storageKey) }
}

// ── Library ─────────────────────────────────────────────────────────────────

export async function listMine(userId: string, query: PageQuery & { q?: string; type?: 'PHOTO' | 'VIDEO' | 'AUDIO' }) {
  const { limit, skip, take } = offsetArgs(query)
  const rows = await db.mediaAsset.findMany({
    where: { ownerId: userId, deletedAt: null, state: { not: 'UPLOADING' }, ...(query.type ? { type: query.type } : {}), ...(query.q ? { alt: { contains: query.q } } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip,
    take,
  })
  const page = toOffsetPage(rows, limit, skip, (m) => m)
  return { data: await Promise.all(page.data.map((m) => toAsset(userId, m))), meta: page.meta }
}

export async function listPlatform(query: PageQuery & { q?: string; type?: 'PHOTO' | 'VIDEO' | 'AUDIO'; categoryId?: string; activityId?: string }) {
  const { limit, skip, take } = offsetArgs(query)
  const where: Prisma.MediaAssetWhereInput = {
    ownerId: null,
    deletedAt: null,
    state: 'READY',
    ...(query.type ? { type: query.type } : {}),
    ...(query.q ? { OR: [{ alt: { contains: query.q } }, { attribution: { contains: query.q } }] } : {}),
    ...(query.activityId || query.categoryId
      ? {
          attachments: {
            some: {
              OR: [
                { revision: { activity: query.activityId ? { id: query.activityId } : { categoryId: query.categoryId } } },
                { instruction: { revision: { activity: query.activityId ? { id: query.activityId } : { categoryId: query.categoryId } } } },
              ],
            },
          },
        }
      : {}),
  }
  const rows = await db.mediaAsset.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take })
  const page = toOffsetPage(rows, limit, skip, (m) => m)
  return { data: await Promise.all(page.data.map((m) => toAsset(null, m))), meta: page.meta }
}

export async function get(userId: string, mediaId: string) {
  return toAsset(userId, await ownAsset(userId, mediaId))
}

export async function update(userId: string, mediaId: string, input: { alt?: string | null }) {
  await ownAsset(userId, mediaId)
  return toAsset(userId, await db.mediaAsset.update({ where: { id: mediaId }, data: { alt: input.alt === undefined ? undefined : input.alt?.trim() || null } }))
}

// ── Upload ──────────────────────────────────────────────────────────────────

export async function createUpload(userId: string, input: { filename: string; mime: string; sizeBytes: number; checksum?: string; durationMs?: number; alt?: string }) {
  const type = MIME[input.mime]
  if (!type) throw badRequest('That file type is not supported', { mime: 'not allowed' })
  if (input.sizeBytes > LIMITS[type]) throw badRequest(`Files up to ${Math.round(LIMITS[type] / MB)} MB`, { sizeBytes: 'too large' })
  const used = await db.mediaAsset.aggregate({ where: { ownerId: userId, deletedAt: null }, _sum: { byteSize: true } })
  if (Number(used._sum.byteSize ?? 0) + input.sizeBytes > QUOTA_BYTES) throw badRequest('Your media storage is full', { sizeBytes: 'over quota' })
  const id = crypto.randomUUID()
  const key = `u/${userId}/${id}/original`
  const expiresAt = new Date(Date.now() + UPLOAD_WINDOW_MS)
  await db.mediaAsset.create({
    data: { id, ownerId: userId, type, originalStorageKey: key, mime: input.mime, byteSize: BigInt(input.sizeBytes), durationMs: input.durationMs ?? null, checksum: input.checksum ?? null, alt: input.alt?.trim() || null, state: 'UPLOADING', uploadExpiresAt: expiresAt },
  })
  const direct = await storage().presignPut(key, input.mime, UPLOAD_WINDOW_MS / 1000)
  return {
    uploadId: id,
    mediaId: id,
    method: 'PUT',
    uploadUrl: direct ?? localUploadUrl(id, uploadToken(id, expiresAt)),
    expiresAt: expiresAt.toISOString(),
    headers: { 'content-type': direct ? input.mime : 'application/octet-stream' },
    maxBytes: LIMITS[type],
  }
}

export async function receiveLocalUpload(uploadId: string, token: string, body: Readable) {
  if (!verifyUploadToken(uploadId, token)) throw notFound('Upload')
  const m = await db.mediaAsset.findUnique({ where: { id: uploadId } })
  if (!m || m.state !== 'UPLOADING' || !m.uploadExpiresAt || m.uploadExpiresAt < new Date()) throw notFound('Upload')
  try {
    await storage().write(m.originalStorageKey, body, LIMITS[m.type])
  } catch (err: any) {
    if (err?.code === 'TOO_LARGE') throw badRequest('The file is larger than allowed', { file: 'too large' })
    throw err
  }
}

/** Verifies what actually arrived, then queues processing. Safe to call more than once. */
export async function completeUpload(userId: string, uploadId: string) {
  const m = await ownAsset(userId, uploadId)
  if (m.state !== 'UPLOADING') return toAsset(userId, m)
  const size = await storage().size(m.originalStorageKey)
  if (size === null) throw conflict('The upload has not arrived yet')
  if (size > LIMITS[m.type]) throw badRequest('The file is larger than allowed', { file: 'too large' })
  if (!sniffMatches(m.mime, sniff(await storage().head(m.originalStorageKey, 32)))) {
    await db.mediaAsset.update({ where: { id: m.id }, data: { state: 'FAILED' } })
    throw badRequest('The file does not match its type', { mime: 'content mismatch' })
  }
  const updated = await db.$transaction(async (tx) => {
    const r = await tx.mediaAsset.update({ where: { id: m.id }, data: { state: 'PROCESSING', byteSize: BigInt(size), uploadedAt: new Date(), uploadExpiresAt: null } })
    await enqueue(tx, 'MediaUploaded', { mediaId: m.id })
    return r
  })
  return toAsset(userId, updated)
}

export async function remove(userId: string, mediaId: string) {
  const m = await ownAsset(userId, mediaId)
  // Soft delete hides it everywhere and ends every publication; the worker purges files after retention.
  await db.$transaction([
    db.mediaPublication.updateMany({ where: { mediaId: m.id, status: { in: ['PENDING', 'APPROVED'] } }, data: { status: 'REVOKED' } }),
    db.userProfile.updateMany({ where: { avatarMediaId: m.id }, data: { avatarMediaId: null } }),
    db.userProfile.updateMany({ where: { coverMediaId: m.id }, data: { coverMediaId: null } }),
    db.program.updateMany({ where: { coverMediaId: m.id }, data: { coverMediaId: null } }),
    db.mediaAsset.update({ where: { id: m.id }, data: { deletedAt: new Date() } }),
  ])
}

// ── Attachments ─────────────────────────────────────────────────────────────

type TargetKind = 'PROGRAM' | 'ACTIVITY_REVISION' | 'INSTRUCTION' | 'RESULT_ENTRY' | 'PROFILE'

/** Only the owner of the target may attach, and only to editable drafts of their content. */
async function assertTargetOwner(userId: string, kind: TargetKind, id: string) {
  const draftRevisionOwned = async (revisionId: string) => {
    const rev = await db.activityRevision.findUnique({ where: { id: revisionId }, include: { activity: true } })
    if (!rev || rev.activity.creatorId !== userId) throw notFound('Target')
    if (rev.publishedAt) throw badRequest('Edit the draft to change its media', { target: 'is published' })
  }
  switch (kind) {
    case 'PROGRAM': {
      const p = await db.program.findUnique({ where: { id } })
      if (!p || !isProgramOwner(p, userId)) throw notFound('Target')
      return { programId: id }
    }
    case 'ACTIVITY_REVISION':
      await draftRevisionOwned(id)
      return { activityRevisionId: id }
    case 'INSTRUCTION': {
      const i = await db.instruction.findUnique({ where: { id } })
      if (!i) throw notFound('Target')
      await draftRevisionOwned(i.activityRevisionId)
      return { instructionId: id }
    }
    case 'RESULT_ENTRY': {
      const e = await db.resultEntry.findUnique({ where: { id }, include: { session: true } })
      if (!e || e.session.userId !== userId) throw notFound('Target')
      return { resultEntryId: id }
    }
    case 'PROFILE':
      if (id !== userId) throw notFound('Target')
      return { userProfileId: id }
  }
}

const toAttachment = (a: Prisma.MediaAttachmentGetPayload<{ include: { media: true } }>) => {
  const kind: TargetKind = a.programId ? 'PROGRAM' : a.activityRevisionId ? 'ACTIVITY_REVISION' : a.instructionId ? 'INSTRUCTION' : a.resultEntryId ? 'RESULT_ENTRY' : 'PROFILE'
  return {
    id: a.id,
    mediaId: a.mediaId,
    target: { kind, id: (a.programId ?? a.activityRevisionId ?? a.instructionId ?? a.resultEntryId ?? a.userProfileId)! },
    purpose: a.purpose,
    position: a.position,
    media: { id: a.media.id, thumbnailUrl: thumbFor(a.media), type: a.media.type, durationMs: a.media.durationMs, alt: a.media.alt ?? '', canSelect: true },
  }
}

export async function attach(userId: string, input: { mediaId: string; target: { kind: TargetKind; id: string }; purpose: Prisma.MediaAttachmentCreateInput['purpose']; position?: number }) {
  const m = await db.mediaAsset.findUnique({ where: { id: input.mediaId } })
  // Your own assets or the rights-cleared platform library (11 §3).
  if (!m || m.deletedAt || (m.ownerId !== null && m.ownerId !== userId)) throw badRequest('Choose one of your files or a platform image', { mediaId: 'not available' })
  if (m.state !== 'READY' && m.state !== 'PROCESSING') throw badRequest('That file is not ready', { mediaId: 'not ready' })
  const target = await assertTargetOwner(userId, input.target.kind, input.target.id)
  const position = input.position ?? (await db.mediaAttachment.count({ where: target }))
  const a = await db.mediaAttachment.create({ data: { mediaId: m.id, purpose: input.purpose, position, ...target }, include: { media: true } })
  return toAttachment(a)
}

export async function detach(userId: string, attachmentId: string) {
  const a = await db.mediaAttachment.findUnique({ where: { id: attachmentId } })
  if (!a) throw notFound('Attachment')
  const kind: TargetKind = a.programId ? 'PROGRAM' : a.activityRevisionId ? 'ACTIVITY_REVISION' : a.instructionId ? 'INSTRUCTION' : a.resultEntryId ? 'RESULT_ENTRY' : 'PROFILE'
  await assertTargetOwner(userId, kind, (a.programId ?? a.activityRevisionId ?? a.instructionId ?? a.resultEntryId ?? a.userProfileId)!)
  // Deleting one attachment never deletes the asset or its other uses (11 §3).
  await db.mediaAttachment.delete({ where: { id: a.id } })
}

// ── Publications ────────────────────────────────────────────────────────────

const publicationInclude = { media: true, publishedBy: { include: { profile: true } } } satisfies Prisma.MediaPublicationInclude
type PublicationRow = Prisma.MediaPublicationGetPayload<{ include: typeof publicationInclude }>

export async function toPublication(viewerId: string | null, p: PublicationRow) {
  const liked = viewerId ? !!(await db.mediaReaction.findUnique({ where: { publicationId_userId_type: { publicationId: p.id, userId: viewerId, type: 'LIKE' } } })) : false
  return {
    id: p.id,
    mediaId: p.mediaId,
    audience: p.audience,
    groupId: p.groupId,
    occurrenceKey: p.occurrenceKey,
    activityId: p.activityId,
    status: p.status,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    caption: p.caption,
    likes: p.likeCount,
    views: p.viewCount,
    commentCount: p.commentCount,
    likedByMe: liked,
    creator: p.publishedBy.profile ? toUserSummary(p.publishedBy.profile) : null,
    media: { id: p.media.id, thumbnailUrl: thumbFor(p.media), type: p.media.type, durationMs: p.media.durationMs, alt: p.media.alt ?? '', canSelect: false },
  }
}

export async function publish(
  userId: string,
  input: { mediaId: string; audience: 'PUBLIC' | 'GROUP'; groupId?: string; occurrenceKey?: string; activityId?: string; instructionKey?: string; programId?: string; license?: string; caption?: string },
) {
  const m = await ownAsset(userId, input.mediaId)
  if (m.state !== 'READY') throw badRequest('Wait until the file finishes processing', { mediaId: 'not ready' })
  let status: 'PENDING' | 'APPROVED' = 'PENDING'
  if (input.audience === 'GROUP') {
    if (!input.groupId) throw badRequest('Choose a group', { groupId: 'is required' })
    const member = await db.groupMember.findUnique({ where: { groupId_userId: { groupId: input.groupId, userId } } })
    if (member?.status !== 'ACTIVE') throw notFound('Group')
    if (input.occurrenceKey && !(await db.calendarItem.findFirst({ where: { ownerId: userId, groupOccurrenceKey: input.occurrenceKey } }))) {
      throw badRequest('That activity is not part of this group', { occurrenceKey: 'not found' })
    }
    status = 'APPROVED' // group sharing needs no moderation review (11 §2)
  } else {
    if (!input.license) throw badRequest('Choose how others may use this', { license: 'is required for public media' })
    if (input.activityId) {
      const a = await db.activity.findUnique({ where: { id: input.activityId } })
      if (!a || a.status !== 'PUBLISHED' || a.visibility === 'PRIVATE') throw badRequest('That activity is not public', { activityId: 'not public' })
    }
    if (input.programId) {
      const prog = await db.program.findUnique({ where: { id: input.programId }, include: { policy: true } })
      if (!prog || prog.status !== 'PUBLISHED' || prog.visibility !== 'PUBLIC' || prog.moderatedAt || (prog.policy?.accessMode ?? 'OPEN') !== 'OPEN') {
        throw badRequest('That program is not open and public', { programId: 'not public' })
      }
    }
  }
  const p = await db.$transaction(async (tx) => {
    const row = await tx.mediaPublication.create({
      data: {
        mediaId: m.id,
        publishedById: userId,
        audience: input.audience,
        groupId: input.audience === 'GROUP' ? input.groupId! : null,
        occurrenceKey: input.audience === 'GROUP' ? input.occurrenceKey ?? null : null,
        activityId: input.activityId ?? null,
        instructionKey: input.instructionKey ?? null,
        programId: input.programId ?? null,
        license: input.license ?? null,
        caption: input.caption?.trim() || null,
        status,
        publishedAt: status === 'APPROVED' ? new Date() : null,
      },
      include: publicationInclude,
    })
    if (row.audience === 'GROUP') await enqueue(tx, 'GroupMediaShared', { publicationId: row.id, groupId: row.groupId, userId })
    return row
  })
  return toPublication(userId, p)
}

export async function revoke(userId: string, publicationId: string) {
  const p = await db.mediaPublication.findUnique({ where: { id: publicationId }, include: { group: true } })
  if (!p) throw notFound('Publication')
  const groupOwner = p.group?.ownerId === userId
  if (p.publishedById !== userId && !groupOwner) throw notFound('Publication')
  await db.mediaPublication.update({ where: { id: p.id }, data: { status: 'REVOKED' } })
}

export async function getPublication(viewerId: string | null, publicationId: string) {
  const p = await db.mediaPublication.findUnique({ where: { id: publicationId }, include: publicationInclude })
  if (!p || !(await canSeePublication(viewerId, p))) throw notFound('Publication')
  return toPublication(viewerId, p)
}

export async function canSeePublication(viewerId: string | null, p: { publishedById: string; status: string; audience: string; groupId: string | null; media: { deletedAt: Date | null } }) {
  if (p.media.deletedAt) return false
  if (viewerId === p.publishedById) return p.status !== 'REVOKED'
  if (p.status !== 'APPROVED') return false
  if (p.audience === 'PUBLIC') return true
  if (!viewerId || !p.groupId) return false
  const member = await db.groupMember.findUnique({ where: { groupId_userId: { groupId: p.groupId, userId: viewerId } } })
  return member?.status === 'ACTIVE'
}

export async function listPending(query: PageQuery) {
  const { limit, skip, take } = offsetArgs(query)
  const rows = await db.mediaPublication.findMany({ where: { status: 'PENDING', audience: 'PUBLIC' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip, take, include: publicationInclude })
  const page = toOffsetPage(rows, limit, skip, (p) => p)
  return { data: await Promise.all(page.data.map((p) => toPublication(null, p))), meta: page.meta }
}

export async function moderate(moderatorId: string, publicationId: string, input: { decision: 'APPROVE' | 'REJECT'; note?: string }) {
  const p = await db.mediaPublication.findUnique({ where: { id: publicationId } })
  if (!p || p.audience !== 'PUBLIC') throw notFound('Publication')
  if (p.status !== 'PENDING') throw conflict('This publication was already reviewed')
  const updated = await db.$transaction(async (tx) => {
    const row = await tx.mediaPublication.update({
      where: { id: p.id },
      data: {
        status: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        publishedAt: input.decision === 'APPROVE' ? new Date() : null,
        reviewedById: moderatorId,
        reviewedAt: new Date(),
        reviewNote: input.note?.trim() || null,
        qualityReviewedAt: input.decision === 'APPROVE' ? new Date() : null,
      },
      include: publicationInclude,
    })
    // Rejection never deletes the owner's asset (11 §7).
    await enqueue(tx, 'MediaPublicationModerated', { publicationId: p.id, decision: input.decision, userId: p.publishedById })
    return row
  })
  return toPublication(moderatorId, updated)
}

