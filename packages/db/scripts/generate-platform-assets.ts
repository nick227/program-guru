// Dev-time generator for the platform illustration set (run: pnpm --filter @project/db assets:generate).
// Output is COMMITTED under prisma/platform-assets/ with a manifest of checksums, so every environment
// seeds byte-identical files and production bootstrap never needs ffmpeg or fonts.
//
// Each illustration is an original title card (Activity title, category, platform credit) on a
// category colour: our own work, dedicated CC0-1.0. Text is rendered with DejaVu Sans Bold, whose
// licence permits rendering; the font itself is not distributed. Instructional drawings and real
// demonstration footage are separate content work (docs/release/poc-release-checklist.md).
import { execFileSync } from 'child_process'
import { createHash } from 'crypto'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { CATEGORIES, SEEDED_ACTIVITIES } from '../prisma/seed'
import { ASSET_DIR, MANIFEST_VERSION, type PlatformManifest } from '../prisma/platform-media'

const FONT = process.env.PLATFORM_ASSET_FONT ?? '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
const PALETTE: Record<string, { bg: string; band: string; ink: string }> = {
  fitness: { bg: '0x176B73', band: '0x0F4F55', ink: 'white' },
  wellness: { bg: '0x6B5BA8', band: '0x4E4185', ink: 'white' },
  finance: { bg: '0x2F7D4F', band: '0x1F5C39', ink: 'white' },
  relationships: { bg: '0xB4534B', band: '0x8C3A34', ink: 'white' },
  education: { bg: '0x2E5E9E', band: '0x1F4577', ink: 'white' },
  custom: { bg: '0x5A6472', band: '0x3F4752', ink: 'white' },
}

/** Greedy word wrap into at most three lines of ~18 characters. */
function wrap(title: string) {
  const lines: string[] = []
  for (const word of title.split(/\s+/)) {
    const last = lines.at(-1)
    if (last !== undefined && (last + ' ' + word).length <= 18) lines[lines.length - 1] = `${last} ${word}`
    else lines.push(word)
  }
  return lines.slice(0, 3)
}

const work = join(tmpdir(), `platform-assets-${process.pid}`)
mkdirSync(work, { recursive: true })
const text = (name: string, value: string) => {
  const file = join(work, name)
  writeFileSync(file, value)
  return file.replace(/\\/g, '/').replace(/:/g, '\\:')
}
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')

rmSync(join(ASSET_DIR, 'illustrations'), { recursive: true, force: true })
mkdirSync(join(ASSET_DIR, 'illustrations'), { recursive: true })
const manifest: PlatformManifest = {
  version: MANIFEST_VERSION,
  license: 'CC0-1.0',
  attribution: 'Programs App platform illustration (original work, CC0 1.0 Public Domain Dedication)',
  renderedWith: 'ffmpeg drawtext, DejaVu Sans Bold',
  assets: {},
}
for (const act of SEEDED_ACTIVITIES) {
  if (act.textOnly) continue
  const colours = PALETTE[act.categorySlug] ?? PALETTE.custom!
  const category = CATEGORIES.find((c) => c.slug === act.categorySlug)?.label ?? 'Activity'
  const lines = wrap(act.title)
  const size = lines.length === 1 ? 96 : lines.length === 2 ? 84 : 72
  const top = 450 - (lines.length * (size + 18)) / 2
  const filters = [
    `drawbox=x=0:y=760:w=1200:h=140:color=${colours.band}:t=fill`,
    `drawbox=x=80:y=96:w=${80 + category.length * 22}:h=64:color=${colours.band}:t=fill`,
    `drawtext=fontfile='${FONT}':textfile='${text(`${act.slug}-cat.txt`, category.toUpperCase())}':fontsize=32:fontcolor=${colours.ink}:x=120:y=112`,
    ...lines.map((line, i) => `drawtext=fontfile='${FONT}':textfile='${text(`${act.slug}-${i}.txt`, line)}':fontsize=${size}:fontcolor=${colours.ink}:x=(w-text_w)/2:y=${Math.round(top + i * (size + 18))}`),
    `drawtext=fontfile='${FONT}':textfile='${text(`${act.slug}-credit.txt`, 'Programs App')}':fontsize=30:fontcolor=${colours.ink}@0.85:x=80:y=815`,
  ].join(',')
  const original = execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `color=c=${colours.bg}:s=1200x900`, '-vf', filters, '-frames:v', '1', '-q:v', '3', '-f', 'image2pipe', '-c:v', 'mjpeg', 'pipe:1'])
  const thumb = execFileSync('ffmpeg', ['-v', 'error', '-f', 'mjpeg', '-i', 'pipe:0', '-vf', 'scale=480:360', '-c:v', 'libwebp', '-quality', '80', '-f', 'image2pipe', 'pipe:1'], { input: original })
  const files = { original: `illustrations/${act.slug}.jpg`, thumb: `illustrations/${act.slug}-thumb.webp` }
  writeFileSync(join(ASSET_DIR, files.original), original)
  writeFileSync(join(ASSET_DIR, files.thumb), thumb)
  manifest.assets[act.slug] = {
    alt: `${act.title}: ${category} activity`,
    original: { file: files.original, mime: 'image/jpeg', bytes: original.length, sha256: sha256(original), width: 1200, height: 900 },
    thumb: { file: files.thumb, mime: 'image/webp', bytes: thumb.length, sha256: sha256(thumb), width: 480, height: 360 },
  }
}
writeFileSync(join(ASSET_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
rmSync(work, { recursive: true, force: true })
const total = Object.values(manifest.assets).reduce((n, a) => n + a.original.bytes + a.thumb.bytes, 0)
console.log(`Wrote ${Object.keys(manifest.assets).length} illustrations (${(total / 1024).toFixed(0)} KiB) to ${ASSET_DIR}`)
