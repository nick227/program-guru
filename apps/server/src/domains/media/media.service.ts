import { assertHistoryReadable } from '../activities/history.service'
// Media assets, uploads, attachments, publications (11-MEDIA.md). An asset is private to its owner;
// attaching never changes who can see it; only an explicit publication gives it an audience.
import type { Readable } from 'stream'
import { db, Prisma, type MediaAsset } from '@project/db'
import { badRequest, conflict, notFound } from '../../lib/errors'
import { enqueue } from '../../lib/outbox'
import { afterCursor, offsetArgs, pageArgs, pageOrder, toOffsetPage, toPage, type PageQuery } from '../../lib/paging'
import { fromDbDate } from '../../lib/time'
import { isStorageMiss, storage } from '../../infrastructure/storage'
import { canReadRevision } from '../activities/access'
import { canSeeProgram, hasActiveGrant, isProgramOwner } from '../programs/access'
import { authorFor } from '../admin/authors'
import { isBlockedEitherWay } from '../users/follow.service'
import { toUserSummary } from '../users/mapper'
import { localUploadUrl, mediaUrl, uploadToken, verifyUploadToken, type DeliveryContext, type MediaVariantName } from './urls'

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

/** Delivery is re-authorized per fetch, so bind the URL to who it was issued for (viewer or publication). */
export const thumbFor = (m: Pick<MediaAsset, 'id' | 'state' | 'type'>, context: DeliveryContext = {}) => (m.state === 'READY' ? mediaUrl(m.id, m.type === 'AUDIO' ? 'original' : 'thumb', context) : null)
/** For media listed only to its owner. */
export const ownerThumb = (m: Pick<MediaAsset, 'id' | 'state' | 'type' | 'ownerId'>) => thumbFor(m, m.ownerId ? { viewerId: m.ownerId } : {})

function toAssetDto(viewerId: string | null, m: MediaAsset, attachmentCount: number) {
  return {
    id: m.id,
    type: m.type,
    state: m.state,
    thumbnailUrl: ownerThumb(m),
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

async function toAsset(viewerId: string | null, m: MediaAsset) {
  const attachmentCount = await db.mediaAttachment.count({ where: { mediaId: m.id } })
  return toAssetDto(viewerId, m, attachmentCount)
}

/** One groupBy for the page instead of N attachment.count queries. */
async function toAssets(viewerId: string | null, rows: MediaAsset[]) {
  if (!rows.length) return []
  const counts = await db.mediaAttachment.groupBy({
    by: ['mediaId'],
    where: { mediaId: { in: rows.map((m) => m.id) } },
    _count: { _all: true },
  })
  const byId = new Map(counts.map((c) => [c.mediaId, c._count._all]))
  return rows.map((m) => toAssetDto(viewerId, m, byId.get(m.id) ?? 0))
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
  const publications = await db.mediaPublication.findMany({ where: { mediaId: m.id, status: 'APPROVED' }, select: { id: true } })
  for (const publication of publications) if (await canSeePublication(viewerId, publication)) return true
  // Instructional media inside a Program the viewer may read (07 §6), covers and avatars.
  const attachments = await db.mediaAttachment.findMany({
    where: { mediaId: m.id, OR: [{ activityRevisionId: { not: null } }, { instructionId: { not: null } }, { programId: { not: null } }] },
    include: { revision: { include: { activity: true } }, instruction: { include: { revision: { include: { activity: true } } } }, program: true },
  })
  for (const a of attachments) {
    const rev = a.revision ?? a.instruction?.revision
    if (rev && (await canReadRevision(viewerId, rev.activity, rev))) return true
    if (a.program && await canReadProgramMedia(viewerId, a.program.id, a.purpose === 'COVER')) return true
  }
  const profile = await db.userProfile.findFirst({ where: { user: { status: 'ACTIVE' }, OR: [{ avatarMediaId: m.id }, { coverMediaId: m.id }] } })
  if (profile) return true
  const cover = await db.program.findFirst({ where: { coverMediaId: m.id } })
  return !!cover && (await canReadProgramMedia(viewerId, cover.id, true))
}

async function canReadProgramMedia(viewerId: string | null, programId: string, preview = false) {
  const program = await db.program.findUnique({ where: { id: programId }, include: { policy: true } })
  if (!program || program.moderatedAt || !(await canSeeProgram(viewerId, program))) return false
  if (viewerId && program.creatorId && await isBlockedEitherWay(viewerId, program.creatorId)) return false
  return preview || isProgramOwner(program, viewerId) || (program.policy?.accessMode ?? 'OPEN') === 'OPEN' || (!!viewerId && await hasActiveGrant(viewerId, programId))
}

/** Rechecked at URL issuance AND origin fetch: a signature is integrity, not a lasting grant. */
export async function authorizeDelivery(viewerId: string | null, mediaId: string, publicationId?: string) {
  if (viewerId && !(await db.user.findFirst({ where: { id: viewerId, status: 'ACTIVE' } }))) throw notFound('Media')
  const m = await db.mediaAsset.findUnique({ where: { id: mediaId } })
  if (!m || m.deletedAt || m.state === 'BLOCKED') throw notFound('Media')
  if (publicationId) {
    const publication = await db.mediaPublication.findUnique({ where: { id: publicationId } })
    if (!publication || publication.mediaId !== mediaId || publication.status !== 'APPROVED' || !(await canSeePublication(viewerId, publication))) throw notFound('Media')
  } else if (!(await canViewMedia(viewerId, m))) throw notFound('Media')
  if (m.state !== 'READY') throw badRequest('This media is still processing')
  return m
}

export async function deliveryUrl(viewerId: string | null, mediaId: string, publicationId?: string) {
  const m = await authorizeDelivery(viewerId, mediaId, publicationId)
  const context = { ...(viewerId ? { viewerId } : {}), ...(publicationId ? { publicationId } : {}) }
  const variant: MediaVariantName = m.type === 'VIDEO' ? 'stream' : 'original'
  return {
    url: mediaUrl(m.id, variant, context)!,
    posterUrl: m.type === 'VIDEO' ? mediaUrl(m.id, 'poster', context) : null,
    mime: m.type === 'VIDEO' ? 'video/mp4' : m.mime,
    expiresAt: new Date((Math.floor(Date.now() / 3_600_000) + 2) * 3_600_000).toISOString(),
  }
}

/** Resolves an authorized delivery request to a (ranged) stream. Both providers are proxied. */
export async function fileForDelivery(mediaId: string, variant: MediaVariantName, rangeHeader?: string) {
  const m = await db.mediaAsset.findUnique({ where: { id: mediaId }, include: { variants: true } })
  if (!m || m.deletedAt || m.state === 'BLOCKED') throw notFound('Media')
  // "original" for a user's photo is the metadata-stripped WEB rendition: raw uploads (with EXIF and
  // GPS) are never served. Only rights-cleared platform assets without variants fall back to the file.
  const kind = variant === 'original' && m.type === 'PHOTO' ? 'WEB' : variant === 'original' && m.type === 'AUDIO' ? 'STREAM' : variant.toUpperCase()
  const wanted = m.variants.find((v) => v.kind === kind) ??
    (variant === 'thumb' ? m.variants.find((v) => v.kind === 'POSTER') : undefined) ??
    (variant === 'poster' && m.type === 'PHOTO' ? m.variants.find((v) => v.kind === 'WEB') : undefined)
  const fallback = m.ownerId === null ? { storageKey: m.originalStorageKey, mime: m.mime } : null
  const file = wanted ? { storageKey: wanted.storageKey, mime: wanted.mime } : fallback
  if (!file) throw notFound('Media')
  // Proxy both providers: a storage redirect would bypass subsequent revocation checks.
  // Size then open before returning a stream: missing keys must 404. Never return a ReadStream that
  // emits ENOENT later — that raced Fastify's listener and crashed the API process.
  let size: number | null
  try {
    size = await storage().size(file.storageKey)
  } catch (err) {
    if (isStorageMiss(err)) throw notFound('Media')
    throw err
  }
  if (size === null) throw notFound('Media')
  // HTTP Range lets <video> and <audio> start quickly and seek (05 §10).
  const range = parseRange(rangeHeader, size)
  if (range === 'unsatisfiable') return { unsatisfiable: true as const, size }
  try {
    if (range) return { stream: await storage().read(file.storageKey, range), mime: file.mime, size, range }
    return { stream: await storage().read(file.storageKey), mime: file.mime, size }
  } catch (err) {
    if (isStorageMiss(err)) throw notFound('Media')
    throw err
  }
}

/** Single `bytes=` ranges only (what media elements send); anything else gets the full file. */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | 'unsatisfiable' | null {
  const m = header?.match(/^bytes=(\d*)-(\d*)$/)
  if (!m || (m[1] === '' && m[2] === '')) return null
  let start: number
  let end: number
  if (m[1] === '') {
    const suffix = Number(m[2])
    if (suffix === 0) return 'unsatisfiable'
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  }
  if (start >= size || start > end) return 'unsatisfiable'
  return { start, end }
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
  return { data: await toAssets(userId, page.data), meta: page.meta }
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
  return { data: await toAssets(null, page.data), meta: page.meta }
}

export async function get(userId: string, mediaId: string) {
  return toAsset(userId, await ownAsset(userId, mediaId))
}

export async function update(userId: string, mediaId: string, input: { alt?: string | null }) {
  await ownAsset(userId, mediaId)
  return toAsset(userId, await db.mediaAsset.update({ where: { id: mediaId }, data: { alt: input.alt === undefined ? undefined : input.alt?.trim() || null } }))
}

// ── Upload ──────────────────────────────────────────────────────────────────

export async function createUpload(
  userId: string,
  raw: {
    filename: string
    mime: string
    sizeBytes: number
    checksum?: string
    durationMs?: number
    alt?: string
    target?: { kind: TargetKind; id: string }
    purpose?: Prisma.MediaAttachmentCreateInput['purpose']
  },
) {
  // MediaRecorder reports types with codec parameters ("video/webm;codecs=vp8,opus"): keep only the type.
  const input = { ...raw, mime: raw.mime.split(';')[0]!.trim().toLowerCase() }
  const type = MIME[input.mime]
  if (!type) throw badRequest('That file type is not supported', { mime: 'not allowed' })
  if (input.sizeBytes > LIMITS[type]) throw badRequest(`Files up to ${Math.round(LIMITS[type] / MB)} MB`, { sizeBytes: 'too large' })

  if (input.purpose) {
    if (input.purpose === 'AVATAR' && type !== 'PHOTO') {
      throw badRequest('Avatar media must be a photo', { purpose: 'must be photo' })
    }
    if (input.purpose === 'COVER' && type !== 'PHOTO' && type !== 'VIDEO') {
      throw badRequest('Cover media must be a photo or video', { purpose: 'must be photo or video' })
    }
  }

  const id = crypto.randomUUID()
  const key = `u/${userId}/${id}/original`
  const expiresAt = new Date(Date.now() + UPLOAD_WINDOW_MS)

  await db.$transaction(async (tx) => {
    // Lock User row to serialize concurrent quota checks for this user
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${userId} FOR UPDATE`

    if (input.target && input.purpose) {
      await assertTargetOwner(userId, input.target.kind, input.target.id, true, tx)
    }

    const now = new Date()
    const activeAssets = await tx.mediaAsset.findMany({
      where: {
        ownerId: userId,
        deletedAt: null,
        OR: [
          { state: { in: ['PROCESSING', 'READY'] } },
          { state: 'UPLOADING', uploadExpiresAt: { gt: now } },
        ],
      },
      select: { byteSize: true },
    })
    const totalReserved = activeAssets.reduce((sum, a) => sum + Number(a.byteSize), 0)
    if (totalReserved + input.sizeBytes > QUOTA_BYTES) {
      throw badRequest('Your media storage is full', { sizeBytes: 'over quota' })
    }

    if (input.target && input.purpose === 'COVER') {
      await tx.mediaAttachmentIntent.updateMany({
        where: {
          targetKind: input.target.kind,
          targetId: input.target.id,
          purpose: 'COVER',
          status: 'PENDING',
        },
        data: { status: 'SUPERSEDED' },
      })
    }

    await tx.mediaAsset.create({
      data: {
        id,
        ownerId: userId,
        type,
        originalStorageKey: key,
        mime: input.mime,
        byteSize: BigInt(input.sizeBytes),
        durationMs: input.durationMs ?? null,
        checksum: input.checksum ?? null,
        alt: input.alt?.trim() || null,
        state: 'UPLOADING',
        uploadExpiresAt: expiresAt,
      },
    })

    if (input.target && input.purpose) {
      await tx.mediaAttachmentIntent.create({
        data: {
          mediaId: id,
          userId,
          targetKind: input.target.kind,
          targetId: input.target.id,
          purpose: input.purpose,
          status: 'PENDING',
        },
      })
    }
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
  if (size > LIMITS[m.type]) {
    await storage().remove(m.originalStorageKey).catch(() => {})
    await db.mediaAsset.update({ where: { id: m.id }, data: { state: 'FAILED', uploadExpiresAt: null } })
    await db.mediaAttachmentIntent.updateMany({ where: { mediaId: m.id, status: 'PENDING' }, data: { status: 'FAILED', error: 'The file is larger than allowed' } })
    throw badRequest('The file is larger than allowed', { file: 'too large' })
  }
  if (!sniffMatches(m.mime, sniff(await storage().head(m.originalStorageKey, 32)))) {
    await storage().remove(m.originalStorageKey).catch(() => {})
    await db.mediaAsset.update({ where: { id: m.id }, data: { state: 'FAILED', uploadExpiresAt: null } })
    await db.mediaAttachmentIntent.updateMany({ where: { mediaId: m.id, status: 'PENDING' }, data: { status: 'FAILED', error: 'The file does not match its type' } })
    throw badRequest('The file does not match its type', { mime: 'content mismatch' })
  }

  const extraBytes = size - Number(m.byteSize)
  let overQuota = false
  const updated = await db.$transaction(async (tx) => {
    if (extraBytes > 0) {
      await tx.$queryRaw`SELECT id FROM User WHERE id = ${userId} FOR UPDATE`
      const activeAssets = await tx.mediaAsset.findMany({
        where: {
          ownerId: userId,
          deletedAt: null,
          id: { not: m.id },
          OR: [
            { state: { in: ['PROCESSING', 'READY'] } },
            { state: 'UPLOADING', uploadExpiresAt: { gt: new Date() } },
          ],
        },
        select: { byteSize: true },
      })
      const totalOther = activeAssets.reduce((sum, a) => sum + Number(a.byteSize), 0)
      if (totalOther + size > QUOTA_BYTES) {
        overQuota = true
        await tx.mediaAsset.update({ where: { id: m.id }, data: { state: 'FAILED', uploadExpiresAt: null } })
        await tx.mediaAttachmentIntent.updateMany({ where: { mediaId: m.id, status: 'PENDING' }, data: { status: 'FAILED', error: 'Your media storage is full' } })
        return null
      }
    }
    const r = await tx.mediaAsset.update({
      where: { id: m.id },
      data: { state: 'PROCESSING', byteSize: BigInt(size), uploadedAt: new Date(), uploadExpiresAt: null },
    })
    await enqueue(tx, 'MediaUploaded', { mediaId: m.id })
    return r
  })

  if (overQuota || !updated) {
    await storage().remove(m.originalStorageKey).catch(() => {})
    throw badRequest('Your media storage is full', { sizeBytes: 'over quota' })
  }
  return toAsset(userId, updated)
}

/**
 * Platform content (creatorId null, 12 §7a) is shared by every admin, but its media stays owned by
 * the admin who uploaded it. Their own library delete must not strip it from everyone's content:
 * refuse while a platform Program cover or platform Program/Activity/Instruction attachment uses it.
 */
async function usedByPlatformContent(mediaId: string) {
  const platformActivity = { activity: { creatorId: null } }
  const [covers, attachments] = await Promise.all([
    db.program.count({ where: { coverMediaId: mediaId, creatorId: null, deletedAt: null } }),
    db.mediaAttachment.count({
      where: { mediaId, OR: [{ program: { creatorId: null, deletedAt: null } }, { revision: platformActivity }, { instruction: { revision: platformActivity } }] },
    }),
  ])
  return covers + attachments > 0
}

export async function remove(userId: string, mediaId: string) {
  const m = await ownAsset(userId, mediaId)
  if (await usedByPlatformContent(m.id)) throw conflict('Platform content uses this file. Remove it from that Program or Activity first.')
  // Soft delete hides it everywhere and ends every publication; the worker purges files after retention.
  await db.$transaction([
    db.mediaPublication.updateMany({ where: { mediaId: m.id, status: { in: ['PENDING', 'APPROVED'] } }, data: { status: 'REVOKED' } }),
    db.mediaAttachmentIntent.updateMany({ where: { mediaId: m.id, status: 'PENDING' }, data: { status: 'CANCELLED' } }),
    db.userProfile.updateMany({ where: { avatarMediaId: m.id }, data: { avatarMediaId: null } }),
    db.userProfile.updateMany({ where: { coverMediaId: m.id }, data: { coverMediaId: null } }),
    db.program.updateMany({ where: { coverMediaId: m.id }, data: { coverMediaId: null } }),
    db.mediaAsset.update({ where: { id: m.id }, data: { deletedAt: new Date(), uploadExpiresAt: null } }),
  ])
}

// ── Attachments ─────────────────────────────────────────────────────────────

type TargetKind = 'PROGRAM' | 'ACTIVITY_REVISION' | 'INSTRUCTION' | 'RESULT_ENTRY' | 'PROFILE'

/** Only the owner of the target may attach, and only to editable drafts of their content. */
async function assertTargetOwner(
  userId: string,
  kind: TargetKind,
  id: string,
  editable = true,
  client: Prisma.TransactionClient | typeof db = db,
) {
  // Platform content is authored by admins (12 §7a); resolved once per call.
  const author = kind === 'PROGRAM' || kind === 'ACTIVITY_REVISION' || kind === 'INSTRUCTION' ? await authorFor(userId, client) : null
  const draftRevisionOwned = async (revisionId: string) => {
    const rev = await client.activityRevision.findUnique({ where: { id: revisionId }, include: { activity: true } })
    if (!rev || !author!.activity(rev.activity)) throw notFound('Target')
    if (editable && rev.publishedAt) throw badRequest('Edit the draft to change its media', { target: 'is published' })
  }
  switch (kind) {
    case 'PROGRAM': {
      const p = await client.program.findUnique({ where: { id } })
      if (!p || !author!.program(p)) throw notFound('Target')
      return { programId: id }
    }
    case 'ACTIVITY_REVISION':
      await draftRevisionOwned(id)
      return { activityRevisionId: id }
    case 'INSTRUCTION': {
      const i = await client.instruction.findUnique({ where: { id } })
      if (!i) throw notFound('Target')
      await draftRevisionOwned(i.activityRevisionId)
      return { instructionId: id }
    }
    case 'RESULT_ENTRY': {
      const e = await client.resultEntry.findUnique({ where: { id }, include: { session: true } })
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
    mediaState: a.media.state,
    mediaDeleted: !!a.media.deletedAt,
    target: { kind, id: (a.programId ?? a.activityRevisionId ?? a.instructionId ?? a.resultEntryId ?? a.userProfileId)! },
    purpose: a.purpose,
    position: a.position,
    media: { id: a.media.id, thumbnailUrl: a.media.deletedAt ? null : ownerThumb(a.media), type: a.media.type, durationMs: a.media.durationMs, alt: a.media.alt ?? '', canSelect: a.media.state === 'READY' && !a.media.deletedAt },
  }
}

export async function attach(userId: string, input: { mediaId: string; target: { kind: TargetKind; id: string }; purpose: Prisma.MediaAttachmentCreateInput['purpose']; position?: number }) {
  const m = await db.mediaAsset.findUnique({ where: { id: input.mediaId } })
  // Your own assets or the rights-cleared platform library (11 §3).
  if (!m || m.deletedAt || (m.ownerId !== null && m.ownerId !== userId)) throw badRequest('Choose one of your files or a platform image', { mediaId: 'not available' })
  if (m.state !== 'READY') throw badRequest('That file is not ready', { mediaId: 'not ready' })
  const target = await assertTargetOwner(userId, input.target.kind, input.target.id)
  const where = { mediaId: m.id, purpose: input.purpose, ...target }
  const replay = (a: Prisma.MediaAttachmentGetPayload<{ include: { media: true } }>) => {
    if (input.position !== undefined && input.position !== a.position) throw conflict('This media is already attached at a different position')
    return toAttachment(a)
  }
  const existing = await db.mediaAttachment.findFirst({ where, include: { media: true } })
  if (existing) return replay(existing)
  const position = input.position ?? (await db.mediaAttachment.count({ where: target }))
  try {
    return toAttachment(await db.mediaAttachment.create({ data: { ...where, position }, include: { media: true } }))
  } catch (error) {
    // The unique indexes, not this preflight lookup, arbitrate concurrent requests.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
    const winner = await db.mediaAttachment.findFirstOrThrow({ where, include: { media: true } })
    return replay(winner)
  }
}

/** Management projection: ownership is checked before reading links, including empty lists. */
export async function listAttachments(userId: string, query: PageQuery & { targetKind: TargetKind; targetId: string }) {
  const target = await assertTargetOwner(userId, query.targetKind, query.targetId, false)
  const { limit, skip, take } = offsetArgs(query)
  const rows = await db.mediaAttachment.findMany({ where: target, include: { media: true }, orderBy: [{ position: 'asc' }, { id: 'asc' }], skip, take })
  const result = toOffsetPage(rows, limit, skip, toAttachment)

  // Surface active PENDING attachment intents for this target so UI reactively reflects processing
  const pendingIntents = await db.mediaAttachmentIntent.findMany({
    where: {
      targetKind: query.targetKind,
      targetId: query.targetId,
      status: 'PENDING',
      media: { deletedAt: null },
    },
    include: { media: true },
    orderBy: { createdAt: 'desc' },
  })
  for (const intent of pendingIntents) {
    if (!result.data.some((a) => a.mediaId === intent.mediaId)) {
      result.data.unshift({
        id: `intent-${intent.id}`,
        mediaId: intent.mediaId,
        mediaState: intent.media.state,
        mediaDeleted: false,
        target: { kind: query.targetKind, id: query.targetId },
        purpose: intent.purpose,
        position: intent.position ?? 0,
        media: {
          id: intent.media.id,
          thumbnailUrl: null,
          type: intent.media.type,
          durationMs: intent.media.durationMs,
          alt: intent.media.alt ?? '',
          canSelect: false,
        },
      })
    }
  }
  return result
}

/**
 * Activity media history (11 §5): attachments on the viewer's own result entries for one Activity,
 * across every session and occurrence. A view over ResultEntry + MediaAttachment; never another
 * participant's results. Own history outlives lapse/archive/moderation; otherwise the Activity must
 * be readable, so the endpoint does not reveal private Activities.
 */
export async function listActivityHistory(
  userId: string,
  activityId: string,
  query: PageQuery & { calendarItemId?: string; type?: MediaAsset['type'] },
) {
  await assertHistoryReadable(userId, activityId)
  const own = { userId, activityRevision: { activityId } }
  const { limit, take } = pageArgs(query)
  const rows = await db.mediaAttachment.findMany({
    where: {
      resultEntry: { session: { ...own, ...(query.calendarItemId ? { calendarItemId: query.calendarItemId } : {}) } },
      ...(query.type ? { media: { type: query.type } } : {}),
      ...afterCursor(query.cursor),
    },
    orderBy: pageOrder,
    take,
    include: { media: true, resultEntry: { include: { session: { include: { calendarItem: { select: { localDate: true } } } } } } },
  })
  return toPage(rows, limit, (a) => {
    const entry = a.resultEntry!
    return {
      attachment: toAttachment(a),
      resultEntryId: entry.id,
      sessionId: entry.sessionId,
      sessionStatus: entry.session.status,
      calendarItemId: entry.session.calendarItemId,
      occurrenceDate: entry.session.calendarItem ? fromDbDate(entry.session.calendarItem.localDate) : null,
      instructionId: entry.instructionId,
      recordedAt: entry.recordedAt.toISOString(),
    }
  })
}

export async function detach(userId: string, attachmentId: string) {
  if (attachmentId.startsWith('intent-')) {
    const intentId = attachmentId.replace(/^intent-/, '')
    const intent = await db.mediaAttachmentIntent.findUnique({ where: { id: intentId } })
    if (!intent || intent.userId !== userId) throw notFound('Attachment')
    await db.mediaAttachmentIntent.update({ where: { id: intent.id }, data: { status: 'CANCELLED' } })
    return
  }
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
    media: { id: p.media.id, thumbnailUrl: p.media.state === 'READY' ? mediaUrl(p.media.id, 'thumb', { publicationId: p.id }) : null, type: p.media.type, durationMs: p.media.durationMs, alt: p.media.alt ?? '', canSelect: false },
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

export async function canSeePublication(viewerId: string | null, reference: { id: string }) {
  const p = await db.mediaPublication.findUnique({ where: { id: reference.id }, include: {
    media: true, publishedBy: true, activity: true, program: { include: { policy: true } },
    group: { include: { version: true } },
  } })
  if (!p || p.media.deletedAt || p.media.state !== 'READY' || p.status === 'REVOKED' || p.publishedBy.status !== 'ACTIVE') return false
  if (viewerId && await isBlockedEitherWay(viewerId, p.publishedById)) return false
  if (p.media.ownerId && viewerId && await isBlockedEitherWay(viewerId, p.media.ownerId)) return false
  if (p.activity && (p.activity.moderatedAt || p.activity.status !== 'PUBLISHED' || p.activity.visibility === 'PRIVATE')) return false
  if (p.program && !(await canReadProgramMedia(viewerId, p.program.id))) return false
  if (p.audience === 'GROUP') {
    if (!viewerId || !p.group || p.group.status !== 'ACTIVE') return false
    // Program groups also require Program access; a gathering's media needs membership only (10 §9.3).
    if (p.group.version && !(await canReadProgramMedia(viewerId, p.group.version.programId))) return false
    const member = await db.groupMember.findUnique({ where: { groupId_userId: { groupId: p.group.id, userId: viewerId } } })
    return p.status === 'APPROVED' && member?.status === 'ACTIVE'
  }
  if (viewerId === p.publishedById && p.status !== 'APPROVED') return true // review status, never delivery
  if (p.program && (p.program.visibility !== 'PUBLIC' || p.program.status !== 'PUBLISHED' || (p.program.policy?.accessMode ?? 'OPEN') !== 'OPEN')) return false
  return p.status === 'APPROVED' && !!p.license
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

