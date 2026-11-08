// Media pipeline (11-MEDIA.md §6.4): probe, strip metadata, make variants, mark READY or FAILED.
// Browsers record different formats, so every video becomes H.264 MP4 with a poster and thumbnail.
import { execFile } from 'child_process'
import { mkdtemp, rm, stat } from 'fs/promises'
import { createReadStream, createWriteStream } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { pipeline } from 'stream/promises'
import { promisify } from 'util'
import { db, type MediaVariantKind, type MediaAttachmentIntent, type MediaAsset, type Prisma } from '@project/db'
import { storage } from '../infrastructure/storage'

const run = promisify(execFile)
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg'
const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe'
const TIMEOUT_MS = Number(process.env.MEDIA_PROCESS_TIMEOUT_MS ?? 15 * 60_000)

type Probe = { width: number | null; height: number | null; durationMs: number | null; hasVideo: boolean; hasAudio: boolean }

async function probe(file: string): Promise<Probe> {
  const { stdout } = await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file], { timeout: 60_000 })
  const info = JSON.parse(stdout) as { streams?: any[]; format?: { duration?: string } }
  const video = info.streams?.find((s) => s.codec_type === 'video')
  const audio = info.streams?.find((s) => s.codec_type === 'audio')
  const duration = Number(info.format?.duration)
  return {
    width: video?.width ?? null,
    height: video?.height ?? null,
    durationMs: Number.isFinite(duration) && duration > 0 ? Math.round(duration * 1000) : null,
    hasVideo: !!video,
    hasAudio: !!audio,
  }
}

const ff = (args: string[]) => run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeout: TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 })

/** Re-encoding with -map_metadata -1 drops EXIF, including GPS, from everything we serve (11 §6). */
async function variantsFor(type: 'PHOTO' | 'VIDEO' | 'AUDIO', input: string, dir: string, p: Probe) {
  const out: { kind: MediaVariantKind; file: string; mime: string }[] = []
  const thumbFilter = 'scale=480:480:force_original_aspect_ratio=increase,crop=480:480'
  if (type === 'PHOTO') {
    await ff(['-i', input, '-map_metadata', '-1', '-vf', "scale='min(2048,iw)':-2", '-frames:v', '1', '-q:v', '3', join(dir, 'web.jpg')])
    await ff(['-i', input, '-map_metadata', '-1', '-vf', thumbFilter, '-frames:v', '1', '-q:v', '4', join(dir, 'thumb.jpg')])
    out.push({ kind: 'WEB', file: join(dir, 'web.jpg'), mime: 'image/jpeg' }, { kind: 'THUMB', file: join(dir, 'thumb.jpg'), mime: 'image/jpeg' })
  } else if (type === 'VIDEO') {
    if (!p.hasVideo) throw new Error('No video stream')
    await ff([
      '-i', input, '-map_metadata', '-1', '-map', '0:v:0', ...(p.hasAudio ? ['-map', '0:a:0'] : []),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-vf', "scale='min(1280,iw)':-2",
      ...(p.hasAudio ? ['-c:a', 'aac', '-b:a', '128k'] : []), '-movflags', '+faststart', join(dir, 'stream.mp4'),
    ])
    const at = p.durationMs && p.durationMs > 2000 ? '1' : '0'
    await ff(['-ss', at, '-i', input, '-map_metadata', '-1', '-frames:v', '1', '-vf', "scale='min(1280,iw)':-2", '-q:v', '3', join(dir, 'poster.jpg')])
    await ff(['-ss', at, '-i', input, '-map_metadata', '-1', '-frames:v', '1', '-vf', thumbFilter, '-q:v', '4', join(dir, 'thumb.jpg')])
    out.push(
      { kind: 'STREAM', file: join(dir, 'stream.mp4'), mime: 'video/mp4' },
      { kind: 'POSTER', file: join(dir, 'poster.jpg'), mime: 'image/jpeg' },
      { kind: 'THUMB', file: join(dir, 'thumb.jpg'), mime: 'image/jpeg' },
    )
  } else {
    if (!p.hasAudio) throw new Error('No audio stream')
    await ff(['-i', input, '-map_metadata', '-1', '-vn', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', join(dir, 'stream.m4a')])
    out.push({ kind: 'STREAM', file: join(dir, 'stream.m4a'), mime: 'audio/mp4' })
  }
  return out
}

async function finalizeIntent(tx: Prisma.TransactionClient, intent: MediaAttachmentIntent, m: MediaAsset) {
  if (intent.status !== 'PENDING') return

  if (intent.targetKind === 'PROGRAM') {
    const p = await tx.program.findUnique({ where: { id: intent.targetId } })
    if (!p) {
      await tx.mediaAttachmentIntent.update({ where: { id: intent.id }, data: { status: 'FAILED', error: 'Program not found' } })
      return
    }
    const newer = await tx.mediaAttachmentIntent.findFirst({
      where: { targetKind: 'PROGRAM', targetId: p.id, purpose: intent.purpose, createdAt: { gt: intent.createdAt }, status: { in: ['PENDING', 'COMPLETED'] } },
    })
    if (newer) {
      await tx.mediaAttachmentIntent.update({ where: { id: intent.id }, data: { status: 'SUPERSEDED' } })
      return
    }
    if (p.updatedAt > intent.createdAt && p.coverMediaId !== null && p.coverMediaId !== m.id) {
      await tx.mediaAttachmentIntent.update({ where: { id: intent.id }, data: { status: 'SUPERSEDED' } })
      return
    }
    if (intent.purpose === 'COVER') {
      await tx.program.update({ where: { id: p.id }, data: { coverMediaId: m.id } })
    }
    await tx.mediaAttachmentIntent.update({ where: { id: intent.id }, data: { status: 'COMPLETED' } })
    return
  }

  if (intent.targetKind === 'ACTIVITY_REVISION') {
    const rev = await tx.activityRevision.findUnique({ where: { id: intent.targetId } })
    if (!rev) {
      await tx.mediaAttachmentIntent.update({ where: { id: intent.id }, data: { status: 'FAILED', error: 'Revision not found' } })
      return
    }
    if (rev.publishedAt) {
      await tx.mediaAttachmentIntent.update({ where: { id: intent.id }, data: { status: 'FAILED', error: 'Revision is published' } })
      return
    }
    if (intent.purpose === 'COVER') {
      const newer = await tx.mediaAttachmentIntent.findFirst({
        where: { targetKind: 'ACTIVITY_REVISION', targetId: rev.id, purpose: 'COVER', createdAt: { gt: intent.createdAt }, status: { in: ['PENDING', 'COMPLETED'] } },
      })
      if (newer) {
        await tx.mediaAttachmentIntent.update({ where: { id: intent.id }, data: { status: 'SUPERSEDED' } })
        return
      }
      await tx.mediaAttachment.deleteMany({ where: { activityRevisionId: rev.id, purpose: 'COVER' } })
      await tx.mediaAttachment.create({
        data: { mediaId: m.id, activityRevisionId: rev.id, purpose: 'COVER', position: 0 },
      })
      await tx.mediaAttachmentIntent.update({ where: { id: intent.id }, data: { status: 'COMPLETED' } })
      return
    }

    const existing = await tx.mediaAttachment.findFirst({ where: { mediaId: m.id, activityRevisionId: rev.id, purpose: intent.purpose } })
    if (!existing) {
      const pos = intent.position ?? (await tx.mediaAttachment.count({ where: { activityRevisionId: rev.id } }))
      await tx.mediaAttachment.create({
        data: { mediaId: m.id, activityRevisionId: rev.id, purpose: intent.purpose, position: pos },
      })
    }
    await tx.mediaAttachmentIntent.update({ where: { id: intent.id }, data: { status: 'COMPLETED' } })
    return
  }

  if (intent.targetKind === 'RESULT_ENTRY') {
    const entry = await tx.resultEntry.findUnique({ where: { id: intent.targetId } })
    if (!entry) {
      await tx.mediaAttachmentIntent.update({ where: { id: intent.id }, data: { status: 'FAILED', error: 'Result entry not found' } })
      return
    }
    const existing = await tx.mediaAttachment.findFirst({ where: { mediaId: m.id, resultEntryId: entry.id, purpose: intent.purpose } })
    if (!existing) {
      const pos = intent.position ?? (await tx.mediaAttachment.count({ where: { resultEntryId: entry.id } }))
      await tx.mediaAttachment.create({
        data: { mediaId: m.id, resultEntryId: entry.id, purpose: intent.purpose, position: pos },
      })
    }
    await tx.mediaAttachmentIntent.update({ where: { id: intent.id }, data: { status: 'COMPLETED' } })
    return
  }

  if (intent.targetKind === 'INSTRUCTION') {
    const inst = await tx.instruction.findUnique({ where: { id: intent.targetId }, include: { revision: true } })
    if (!inst || inst.revision.publishedAt) {
      await tx.mediaAttachmentIntent.update({ where: { id: intent.id }, data: { status: 'FAILED', error: 'Instruction not found or published' } })
      return
    }
    const existing = await tx.mediaAttachment.findFirst({ where: { mediaId: m.id, instructionId: inst.id, purpose: intent.purpose } })
    if (!existing) {
      const pos = intent.position ?? (await tx.mediaAttachment.count({ where: { instructionId: inst.id } }))
      await tx.mediaAttachment.create({
        data: { mediaId: m.id, instructionId: inst.id, purpose: intent.purpose, position: pos },
      })
    }
    await tx.mediaAttachmentIntent.update({ where: { id: intent.id }, data: { status: 'COMPLETED' } })
    return
  }
}

export async function processMedia(mediaId: string) {
  const m = await db.mediaAsset.findUnique({ where: { id: mediaId }, include: { attachmentIntent: true } })
  // Idempotent: only PROCESSING assets are worked on; a retry after success is a no-op.
  if (!m || m.state !== 'PROCESSING' || m.deletedAt) return
  const dir = await mkdtemp(join(tmpdir(), 'media-'))
  try {
    const input = join(dir, 'original')
    await pipeline(await storage().read(m.originalStorageKey), createWriteStream(input))
    let p: Probe
    let variants: Awaited<ReturnType<typeof variantsFor>>
    try {
      p = await probe(input)
      variants = await variantsFor(m.type, input, dir, p)
    } catch (err) {
      // Undecodable content is a terminal failure for the asset, not a retryable worker error.
      await db.$transaction([
        db.mediaAsset.update({ where: { id: m.id }, data: { state: 'FAILED' } }),
        db.mediaAttachmentIntent.updateMany({ where: { mediaId: m.id, status: 'PENDING' }, data: { status: 'FAILED', error: (err as Error).message.slice(0, 200) } }),
      ])
      console.warn(`[media] ${m.id} failed: ${(err as Error).message.slice(0, 200)}`)
      return
    }
    const rows: Prisma.MediaVariantCreateManyInput[] = []
    for (const v of variants) {
      const key = `${m.originalStorageKey.replace(/\/original$/, '')}/${v.kind.toLowerCase()}`
      const size = (await stat(v.file)).size
      await storage().write(key, createReadStream(v.file), Number.MAX_SAFE_INTEGER)
      rows.push({ mediaId: m.id, kind: v.kind, storageKey: key, mime: v.mime, width: null, height: null, durationMs: p.durationMs, byteSize: BigInt(size) })
    }
    await db.$transaction(async (tx) => {
      await tx.mediaVariant.deleteMany({ where: { mediaId: m.id } })
      await tx.mediaVariant.createMany({ data: rows })
      await tx.mediaAsset.update({ where: { id: m.id }, data: { state: 'READY', width: p.width, height: p.height, durationMs: p.durationMs ?? m.durationMs } })
      if (m.attachmentIntent && m.attachmentIntent.status === 'PENDING') {
        await finalizeIntent(tx, m.attachmentIntent, m)
      }
    })
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
