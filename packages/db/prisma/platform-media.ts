// Platform media for seed/bootstrap: committed, checksummed files (prisma/platform-assets/), published
// to whatever storage the caller provides. Nothing is generated at runtime, so every environment gets
// byte-identical assets and production needs neither ffmpeg nor fonts. Regenerate with
// `pnpm --filter @project/db assets:generate` and commit the result.
import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'

export const MANIFEST_VERSION = 1

type AssetFile = { file: string; mime: 'image/jpeg' | 'image/webp'; bytes: number; sha256: string; width: number; height: number }
export type PlatformManifest = {
  version: number
  license: string
  attribution: string
  renderedWith: string
  assets: Record<string, { alt: string; original: AssetFile; thumb: AssetFile }>
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
