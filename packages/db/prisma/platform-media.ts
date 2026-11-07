// Deterministic platform media bytes for seed/bootstrap. Writes real, readable files under the
// local storage root before any MediaAsset / MediaVariant row is created. Never invents DB keys
// that do not exist on disk.
import { createHash } from 'crypto'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { deflateSync } from 'zlib'

export type PlatformPhotoFiles = {
  original: { storageKey: string; mime: 'image/png'; byteSize: number; width: number; height: number }
  thumb: { storageKey: string; mime: 'image/webp'; byteSize: number; width: number; height: number }
}

export type PlatformVideoFiles = {
  original: { storageKey: string; mime: 'video/mp4'; byteSize: number; width: number; height: number; durationMs: number }
  stream: { storageKey: string; mime: 'video/mp4'; byteSize: number; width: number; height: number }
  poster: { storageKey: string; mime: 'image/webp'; byteSize: number; width: number; height: number }
}

function storageRoot() {
  return resolve(process.env.STORAGE_DIR ?? join(__dirname, '../../../uploads'))
}

/** CRC32 for PNG chunks. */
function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crc])
}

/** Solid-color PNG whose RGB is derived from the slug (stable, rights-cleared placeholder). */
export function platformPng(slug: string, width = 1200, height = 900): Buffer {
  const h = createHash('sha256').update(slug).digest()
  const r = h[0]!, g = h[1]!, b = h[2]!
  const stride = width * 3 + 1
  const raw = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const row = y * stride
    raw[row] = 0
    for (let x = 0; x < width; x++) {
      const i = row + 1 + x * 3
      raw[i] = r
      raw[i + 1] = g
      raw[i + 2] = b
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2 // RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

/** Minimal lossy-looking WebP (VP8L 1×1) — browsers accept it as image/webp. */
export function platformWebp(): Buffer {
  return Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64')
}

/** Minimal ISO BMFF `ftyp`+`mdat` stub so the object is a non-empty readable video key. */
export function platformMp4Stub(): Buffer {
  const ftyp = Buffer.from([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x00, 0x01, 0x69, 0x73, 0x6f, 0x6d, 0x61, 0x76, 0x63, 0x31,
  ])
  const mdatHeader = Buffer.from([0x00, 0x00, 0x00, 0x08, 0x6d, 0x64, 0x61, 0x74])
  return Buffer.concat([ftyp, mdatHeader])
}

function writeKey(key: string, bytes: Buffer): number {
  const path = join(storageRoot(), key)
  mkdirSync(dirname(path), { recursive: true })
  // Idempotent: rewrite only when missing or content length differs (keeps re-seed cheap and safe).
  if (!existsSync(path) || readFileSync(path).length !== bytes.length) writeFileSync(path, bytes)
  return bytes.length
}

/** Materialize illustration + thumb for an Activity slug; returns metadata for DB rows. */
export function ensurePlatformPhoto(slug: string): PlatformPhotoFiles {
  const originalKey = `platform/illustrations/${slug}.png`
  const thumbKey = `platform/illustrations/${slug}-thumb.webp`
  const png = platformPng(slug)
  const webp = platformWebp()
  return {
    original: {
      storageKey: originalKey,
      mime: 'image/png',
      byteSize: writeKey(originalKey, png),
      width: 1200,
      height: 900,
    },
    thumb: {
      storageKey: thumbKey,
      mime: 'image/webp',
      byteSize: writeKey(thumbKey, webp),
      width: 400,
      height: 300,
    },
  }
}

/** Materialize demo original + stream + poster for an Activity that declares hasVideo. */
export function ensurePlatformVideo(slug: string): PlatformVideoFiles {
  const originalKey = `platform/demos/${slug}.mp4`
  const streamKey = `platform/demos/${slug}-stream.mp4`
  const posterKey = `platform/demos/${slug}-poster.webp`
  const mp4 = platformMp4Stub()
  const webp = platformWebp()
  return {
    original: {
      storageKey: originalKey,
      mime: 'video/mp4',
      byteSize: writeKey(originalKey, mp4),
      width: 1280,
      height: 720,
      durationMs: 15000,
    },
    stream: {
      storageKey: streamKey,
      mime: 'video/mp4',
      byteSize: writeKey(streamKey, mp4),
      width: 1280,
      height: 720,
    },
    poster: {
      storageKey: posterKey,
      mime: 'image/webp',
      byteSize: writeKey(posterKey, webp),
      width: 1280,
      height: 720,
    },
  }
}

/** Assert every platform MediaAsset / MediaVariant key is readable under the storage root. */
export function assertReadable(keys: string[]) {
  const root = storageRoot()
  const missing = keys.filter((k) => !existsSync(join(root, k)))
  if (missing.length) {
    throw new Error(`Platform media missing on disk (${missing.length}): ${missing.slice(0, 5).join(', ')}`)
  }
}
