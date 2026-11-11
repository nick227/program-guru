// Platform media for seed/bootstrap: committed, checksummed files (prisma/platform-assets/), published
// to whatever storage the caller provides. Nothing is generated at runtime, so every environment gets
// byte-identical assets and production needs neither ffmpeg nor fonts. Regenerate with
// `pnpm --filter @project/db assets:generate` and commit the result.
import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

export const MANIFEST_VERSION = 2

type AssetFile = { file: string; mime: 'image/jpeg' | 'image/webp'; bytes: number; sha256: string; width: number; height: number }
/** Where a curated (non-generated) asset came from; verified CC0 when fetched. */
export type AssetSource = {
  title: string
  pageUrl: string
  author: string
  license: 'CC0-1.0'
  licenseUrl: string
  retrievedAt: string
}
export type PlatformManifest = {
  version: number
  license: string
  attribution: string
  renderedWith: string
  /** Activity illustrations (original work), keyed by Activity slug. */
  assets: Record<string, { alt: string; original: AssetFile; thumb: AssetFile }>
  /** Curated Program cover photographs, keyed by starter Program slug. */
  programCovers?: Record<string, { alt: string; original: AssetFile; thumb: AssetFile; source: AssetSource }>
}

/** The monorepo root, found from this file whether it runs from source or from a bundle in dist/. */
export function repoRoot(): string {
  let dir = __dirname
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const up = dirname(dir)
    if (up === dir) throw new Error(`pnpm-workspace.yaml not found above ${__dirname}`)
    dir = up
  }
}

export const ASSET_DIR = join(repoRoot(), 'packages/db/prisma/platform-assets')

let manifest: PlatformManifest | undefined
export function loadManifest(): PlatformManifest {
  if (manifest) return manifest
  const m = JSON.parse(readFileSync(join(ASSET_DIR, 'manifest.json'), 'utf8')) as PlatformManifest
  if (m.version !== MANIFEST_VERSION) throw new Error(`Platform asset manifest v${m.version}; expected v${MANIFEST_VERSION}`)
  return (manifest = m)
}

/** Storage keys are versioned so a regenerated set never collides with cached objects. */
const keyFor = (file: string) => `platform/v${MANIFEST_VERSION}/${file}`

export type PlatformFile = { storageKey: string; mime: string; byteSize: number; width: number; height: number; sha256: string; source: string }
export type PlatformIllustration = { alt: string; license: string; attribution: string; original: PlatformFile; thumb: PlatformFile }

export function platformIllustration(slug: string): PlatformIllustration {
  const m = loadManifest()
  const a = m.assets[slug]
  if (!a) throw new Error(`No platform illustration for "${slug}": run pnpm --filter @project/db assets:generate`)
  const file = (f: AssetFile): PlatformFile => ({ storageKey: keyFor(f.file), mime: f.mime, byteSize: f.bytes, width: f.width, height: f.height, sha256: f.sha256, source: join(ASSET_DIR, f.file) })
  return { alt: a.alt, license: m.license, attribution: m.attribution, original: file(a.original), thumb: file(a.thumb) }
}

/** A starter Program's curated cover, or null when none is curated for that slug. */
export function platformProgramCover(slug: string): PlatformIllustration | null {
  const m = loadManifest()
  const c = m.programCovers?.[slug]
  if (!c) return null
  const file = (f: AssetFile): PlatformFile => ({ storageKey: keyFor(f.file), mime: f.mime, byteSize: f.bytes, width: f.width, height: f.height, sha256: f.sha256, source: join(ASSET_DIR, f.file) })
  return {
    alt: c.alt,
    license: c.source.license,
    attribution: `${c.source.author} (${c.source.license}), via Wikimedia Commons: ${c.source.pageUrl}`,
    original: file(c.original),
    thumb: file(c.thumb),
  }
}

/** Where platform media goes: local disk in development and tests, the API's storage (R2) in production. */
export interface PlatformMediaSink {
  readonly name: string
  size(key: string): Promise<number | null>
  put(key: string, bytes: Buffer, mime: string): Promise<void>
}

export function localSink(root = resolve(process.env.STORAGE_DIR ?? join(repoRoot(), 'uploads'))): PlatformMediaSink {
  return {
    name: `local:${root}`,
    async size(key) {
      try {
        return statSync(join(root, key)).size
      } catch {
        return null
      }
    },
    async put(key, bytes) {
      const path = join(root, key)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, bytes)
    },
  }
}

/** Verifies every committed asset in manifest.json exists on disk and matches its byteSize + SHA-256. */
export function verifyPlatformAssetChecksums() {
  const m = loadManifest()
  const entries = [
    ...Object.entries(m.assets).flatMap(([slug, a]) => [
      { label: `assets.${slug}.original`, file: a.original },
      { label: `assets.${slug}.thumb`, file: a.thumb },
    ]),
    ...Object.entries(m.programCovers ?? {}).flatMap(([slug, c]) => [
      { label: `programCovers.${slug}.original`, file: c.original },
      { label: `programCovers.${slug}.thumb`, file: c.thumb },
    ]),
  ]
  for (const { label, file } of entries) {
    const abs = join(ASSET_DIR, file.file)
    if (!existsSync(abs)) throw new Error(`Missing platform asset (${label}): ${abs}`)
    const bytes = readFileSync(abs)
    const digest = createHash('sha256').update(bytes).digest('hex')
    if (bytes.length !== file.bytes || digest !== file.sha256) {
      throw new Error(`Checksum mismatch for platform asset (${label}): ${abs}`)
    }
  }
  return entries.length
}

/** S3-compatible / Cloudflare R2 / Railway Bucket sink using the standard STORAGE_PROVIDER=r2 env vars. */
export function r2Sink(env: NodeJS.ProcessEnv = process.env): PlatformMediaSink {
  const bucket = env.R2_BUCKET
  const accessKeyId = env.R2_ACCESS_KEY_ID
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY
  const endpoint = env.S3_ENDPOINT || (env.R2_ACCOUNT_ID ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '')
  if (!bucket || !accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error('R2 storage requires R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and S3_ENDPOINT or R2_ACCOUNT_ID')
  }
  const s3 = new S3Client({
    region: env.S3_REGION || 'auto',
    endpoint,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId, secretAccessKey },
  })
  return {
    name: `r2:${bucket}`,
    async size(key) {
      try {
        const res = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
        return res.ContentLength ?? null
      } catch (err) {
        const details = err as { code?: string; name?: string; $metadata?: { httpStatusCode?: number } } | null
        const code = details?.code ?? details?.name
        if (details?.$metadata?.httpStatusCode === 404 || code === 'NoSuchKey' || code === 'NotFound' || code === '404') return null
        throw err
      }
    },
    async put(key, bytes, mime) {
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentLength: bytes.length, ContentType: mime }))
    },
  }
}

export function configuredSink(env: NodeJS.ProcessEnv = process.env): PlatformMediaSink {
  if (env.STORAGE_PROVIDER === 'r2') return r2Sink(env)
  return localSink(resolve(env.STORAGE_DIR ?? join(repoRoot(), 'uploads')))
}

/**
 * Uploads each file whose object is missing or a different size, after checking the committed bytes
 * against the manifest checksum. Then confirms every object is present at the expected size, so no
 * MediaAsset row ever points at a key storage cannot serve.
 */
export async function publishPlatformFiles(sink: PlatformMediaSink, files: PlatformFile[]) {
  let uploaded = 0
  for (const f of files) {
    if ((await sink.size(f.storageKey)) === f.byteSize) continue
    const bytes = readFileSync(f.source)
    const digest = createHash('sha256').update(bytes).digest('hex')
    if (digest !== f.sha256 || bytes.length !== f.byteSize) throw new Error(`Platform asset ${f.source} does not match its manifest checksum`)
    await sink.put(f.storageKey, bytes, f.mime)
    uploaded++
  }
  const missing: string[] = []
  for (const f of files) if ((await sink.size(f.storageKey)) !== f.byteSize) missing.push(f.storageKey)
  if (missing.length) throw new Error(`Platform media not readable in ${sink.name} (${missing.length}): ${missing.slice(0, 5).join(', ')}`)
  return { uploaded, verified: files.length }
}
