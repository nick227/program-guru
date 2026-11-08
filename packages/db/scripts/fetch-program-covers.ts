// Dev-time curation of starter Program cover photographs (run: pnpm --filter @project/db assets:covers).
// Sources live in prisma/platform-assets/program-cover-sources.json. For each entry this script asks the
// Wikimedia Commons API for the file's current licence and refuses anything that is not CC0, then renders
// a 16:9 cover (1600x900 JPEG) and thumbnail (640x360 WebP) with ffmpeg, and records checksums plus the
// source, author and licence in manifest.json. Output is COMMITTED, like the illustrations, so seed and
// bootstrap never touch the network.
import { execFileSync } from 'child_process'
import { createHash } from 'crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { ASSET_DIR, type AssetSource, type PlatformManifest } from '../prisma/platform-media'

const UA = 'programs-app-asset-curation/1.0 (dev tooling)'
const COVER_DIR = 'covers'
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
/** Commons often renders "Display Name username" or repeats a name; keep the display name once. */
function authorName(html: string) {
  const words = stripHtml(html).split(' ').filter(Boolean)
  const half = words.length / 2
  if (Number.isInteger(half) && words.slice(0, half).join(' ') === words.slice(half).join(' ')) return words.slice(0, half).join(' ')
  const last = words.at(-1)?.toLowerCase()
  if (words.length > 1 && last === words.slice(0, -1).join('').toLowerCase()) return words.slice(0, -1).join(' ')
  // Unsplash uploads append the lowercase account handle to a capitalised name.
  if (words.length > 2 && /^[a-z0-9_]+$/.test(words.at(-1)!) && words.slice(0, -1).every((w) => /^\p{Lu}/u.test(w))) return words.slice(0, -1).join(' ')
  return words.join(' ') || 'Unknown author'
}

async function get(url: string): Promise<Response> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (res.status !== 429) {
      if (!res.ok) throw new Error(`${res.status} ${url}`)
      return res
    }
    await sleep(10_000 * (attempt + 1))
  }
  throw new Error(`Rate limited: ${url}`)
}

type ImageInfo = {
  url: string
  thumburl: string
  descriptionurl: string
  extmetadata: Record<string, { value: string } | undefined>
}

async function imageInfo(title: string): Promise<ImageInfo> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    titles: title,
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: '2400',
  })
  const data = (await (await get(`https://commons.wikimedia.org/w/api.php?${params}`)).json()) as {
    query: { pages: Record<string, { imageinfo?: ImageInfo[]; missing?: string }> }
  }
  const page = Object.values(data.query.pages)[0]
  const info = page?.imageinfo?.[0]
  if (!info) throw new Error(`Commons file not found: ${title}`)
  return info
}

const sources = JSON.parse(readFileSync(join(ASSET_DIR, 'program-cover-sources.json'), 'utf8')) as {
  covers: Record<string, { file: string; alt: string }>
}
const manifestPath = join(ASSET_DIR, 'manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PlatformManifest

async function main() {
rmSync(join(ASSET_DIR, COVER_DIR), { recursive: true, force: true })
mkdirSync(join(ASSET_DIR, COVER_DIR), { recursive: true })
const covers: NonNullable<PlatformManifest['programCovers']> = {}
const retrievedAt = new Date().toISOString().slice(0, 10)

for (const [slug, entry] of Object.entries(sources.covers)) {
  const info = await imageInfo(entry.file)
  const licence = info.extmetadata.LicenseShortName?.value
  const licenceUrl = info.extmetadata.LicenseUrl?.value ?? 'https://creativecommons.org/publicdomain/zero/1.0/'
  if (licence !== 'CC0') throw new Error(`${entry.file} is "${licence}", not CC0. Choose another source for ${slug}.`)
  const source = Buffer.from(await (await get(info.thumburl)).arrayBuffer())
  // Centre-crop to 16:9 and normalise size; strips all metadata (no EXIF/GPS in committed files).
  const crop = 'crop=if(gt(iw/ih\\,16/9)\\,ih*16/9\\,iw):if(gt(iw/ih\\,16/9)\\,ih\\,iw*9/16)'
  const original = execFileSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-vf', `${crop},scale=1600:900`, '-map_metadata', '-1', '-frames:v', '1', '-q:v', '4', '-f', 'image2pipe', '-c:v', 'mjpeg', 'pipe:1'], { input: source, maxBuffer: 64 * 1024 * 1024 })
  const thumb = execFileSync('ffmpeg', ['-v', 'error', '-f', 'mjpeg', '-i', 'pipe:0', '-vf', 'scale=640:360', '-map_metadata', '-1', '-c:v', 'libwebp', '-quality', '78', '-f', 'image2pipe', 'pipe:1'], { input: original })
  const files = { original: `${COVER_DIR}/${slug}.jpg`, thumb: `${COVER_DIR}/${slug}-thumb.webp` }
  writeFileSync(join(ASSET_DIR, files.original), original)
  writeFileSync(join(ASSET_DIR, files.thumb), thumb)
  const sourceRecord: AssetSource = {
    title: entry.file,
    pageUrl: info.descriptionurl,
    author: authorName(info.extmetadata.Artist?.value ?? ''),
    license: 'CC0-1.0',
    licenseUrl: licenceUrl,
    retrievedAt,
  }
  covers[slug] = {
    alt: entry.alt,
    original: { file: files.original, mime: 'image/jpeg', bytes: original.length, sha256: sha256(original), width: 1600, height: 900 },
    thumb: { file: files.thumb, mime: 'image/webp', bytes: thumb.length, sha256: sha256(thumb), width: 640, height: 360 },
    source: sourceRecord,
  }
  console.log(`✓ ${slug}  ${(original.length / 1024).toFixed(0)} KiB  ${sourceRecord.author}`)
  await sleep(1500)
}

manifest.programCovers = covers
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Wrote ${Object.keys(covers).length} Program covers to ${join(ASSET_DIR, COVER_DIR)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
