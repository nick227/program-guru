// Dev-time generator for the platform Activity illustration set (run: pnpm --filter @project/db assets:generate).
// Output is COMMITTED under prisma/platform-assets/ with a manifest of checksums, so every environment
// seeds byte-identical files and production bootstrap never needs ffmpeg.
//
// Each illustration is original, text-free artwork: a category palette, soft seeded shapes, and one
// simple subject glyph chosen from the Activity's title (weights, path, ripples, book, coins, voices,
// music). It is our own work, dedicated CC0-1.0. The same slug always renders the same image.
// Curated Program covers are a separate script (fetch-program-covers.ts) and are preserved here.
import { execFileSync } from 'child_process'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { CATEGORIES, SEEDED_ACTIVITIES, TAXONOMY } from '../prisma/seed'
import { ASSET_DIR, MANIFEST_VERSION, type PlatformManifest } from '../prisma/platform-media'

const W = 1200
const H = 900

type Palette = { from: string; to: string; glow: string; ink: string; soft: string }
const FALLBACK_PALETTE: Palette = { from: '#353D48', to: '#5A6472', glow: '#7FD1C7', ink: '#F4F6F8', soft: '#AEB8C4' }
const PALETTE: Record<string, Palette> = TAXONOMY.palettes

type Glyph = 'weights' | 'path' | 'ripples' | 'moon' | 'book' | 'coins' | 'voices' | 'music' | 'spark'
const GLYPH_RULES: [Glyph, RegExp][] = [
  ['music', /music|piano|guitar|scale|song|instrument|rhythm|soundcheck/],
  ['moon', /sleep|evening|wind-?down|night|rest\b|bedtime/],
  ['coins', /budget|sav|spend|money|fund|invest|bill|expense|debt|financ|net worth|tax|account|income|subscription/],
  ['book', /read|study|lesson|vocab|language|note|journal|exam|review|flashcard|course|learn|chapter|write|reflect/],
  ['voices', /call|message|family|friend|partner|gratitude|check-in|date|dinner|connect|letter|outreach|together|talk|thank/],
  ['path', /run|walk|jog|hike|stair|bike|cycl|sprint|interval|cardio|trail|step/],
  ['ripples', /breath|medit|mindful|relax|calm|yoga|stretch|mobility|cool-?down|warm-?up|recovery|flow|balance|swim/],
  ['weights', /squat|push|pull|lift|press|row|plank|core|strength|dumbbell|lunge|deadlift|crunch|raise|bridge|burpee|dip|curl|circuit/],
]
const DEFAULT_GLYPH: Record<string, Glyph> = {
  fitness: 'weights',
  wellness: 'ripples',
  finance: 'coins',
  relationships: 'voices',
  education: 'book',
  custom: 'spark',
  ...(TAXONOMY.defaultGlyphs as Record<string, Glyph>),
}

/** Deterministic PRNG seeded from the slug, so regeneration is byte-stable. */
function rng(slug: string) {
  let a = createHash('sha256').update(slug).digest().readUInt32LE(0)
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const f = (n: number) => n.toFixed(1)

function glyphSvg(glyph: Glyph, p: Palette, r: () => number): string {
  const cx = W / 2
  const cy = H / 2
  const ink = p.ink
  switch (glyph) {
    case 'weights': {
      const tilt = -18 + r() * 12
      const plate = (x: number, h: number) => `<rect x="${f(x)}" y="${f(cy - h / 2)}" width="44" height="${f(h)}" rx="14" fill="${ink}"/>`
      return `<g transform="rotate(${f(tilt)} ${cx} ${cy})">
        <rect x="${cx - 250}" y="${cy - 14}" width="500" height="28" rx="14" fill="${ink}" opacity=".92"/>
        ${plate(cx - 230, 230)}${plate(cx - 178, 180)}${plate(cx + 134, 180)}${plate(cx + 186, 230)}
        <rect x="${cx - 290}" y="${cy - 10}" width="60" height="20" rx="10" fill="${ink}"/>
        <rect x="${cx + 230}" y="${cy - 10}" width="60" height="20" rx="10" fill="${ink}"/>
      </g>`
    }
    case 'path': {
      const sway = 120 + r() * 120
      const d = `M ${cx - 380} ${H - 80} C ${cx - 380 + sway} ${cy + 120}, ${cx + 220 - sway} ${cy + 60}, ${cx + 60} ${cy - 120} S ${cx + 300} ${cy - 260}, ${cx + 380} ${90}`
      return `<path d="${d}" fill="none" stroke="${ink}" stroke-opacity=".9" stroke-width="64" stroke-linecap="round"/>
        <path d="${d}" fill="none" stroke="${p.from}" stroke-width="8" stroke-dasharray="34 30" stroke-linecap="round"/>
        <circle cx="${cx + 380}" cy="90" r="34" fill="${p.glow}"/>`
    }
    case 'ripples': {
      const rings = Array.from({ length: 6 }, (_, i) => `<circle cx="${cx}" cy="${cy}" r="${70 + i * 58}" fill="none" stroke="${ink}" stroke-width="${f(10 - i * 1.2)}" stroke-opacity="${f(0.95 - i * 0.14)}"/>`)
      return `${rings.join('')}<circle cx="${cx}" cy="${cy}" r="44" fill="${p.glow}"/>`
    }
    case 'moon': {
      const stars = Array.from({ length: 7 }, () => `<circle cx="${f(160 + r() * 880)}" cy="${f(110 + r() * 260)}" r="${f(4 + r() * 6)}" fill="${ink}" opacity="${f(0.5 + r() * 0.5)}"/>`)
      return `${stars.join('')}<circle cx="${cx}" cy="${cy}" r="170" fill="${ink}"/><circle cx="${cx + 78}" cy="${cy - 52}" r="150" fill="${p.to}"/>`
    }
    case 'book': {
      const page = (dir: -1 | 1) => {
        const x0 = cx
        const x1 = cx + dir * 270
        return `<path d="M ${x0} ${cy - 150} Q ${(x0 + x1) / 2} ${cy - 190} ${x1} ${cy - 160} L ${x1} ${cy + 170} Q ${(x0 + x1) / 2} ${cy + 140} ${x0} ${cy + 180} Z" fill="${ink}"/>`
      }
      const lines = Array.from({ length: 5 }, (_, i) => [-1, 1].map((dir) => `<line x1="${cx + dir * 50}" y1="${cy - 80 + i * 50}" x2="${cx + dir * (210 - (i === 4 ? 70 : 0))}" y2="${cy - 92 + i * 50}" stroke="${p.from}" stroke-opacity=".35" stroke-width="12" stroke-linecap="round"/>`).join(''))
      return `${page(-1)}${page(1)}${lines.join('')}<line x1="${cx}" y1="${cy - 150}" x2="${cx}" y2="${cy + 180}" stroke="${p.from}" stroke-opacity=".5" stroke-width="6"/>`
    }
    case 'coins': {
      const bars = Array.from({ length: 5 }, (_, i) => {
        const h = 90 + i * 55 + r() * 30
        return `<rect x="${cx - 330 + i * 74}" y="${f(cy + 210 - h)}" width="52" height="${f(h)}" rx="12" fill="${ink}" opacity="${f(0.55 + i * 0.09)}"/>`
      })
      const coin = (x: number, y: number) => `<ellipse cx="${x}" cy="${y}" rx="120" ry="38" fill="${p.glow}" stroke="${p.from}" stroke-opacity=".35" stroke-width="6"/>`
      const stack = Array.from({ length: 4 }, (_, i) => coin(cx + 190, cy + 170 - i * 46)).join('')
      return `${bars.join('')}${stack}<ellipse cx="${cx + 190}" cy="${cy + 32}" rx="70" ry="20" fill="none" stroke="${p.from}" stroke-opacity=".35" stroke-width="6"/>`
    }
    case 'voices': {
      const bubble = (x: number, y: number, w: number, h: number, tail: -1 | 1, fill: string) =>
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2.4}" fill="${fill}"/><path d="M ${x + (tail < 0 ? 70 : w - 70)} ${y + h - 4} l ${tail * -10} 70 l ${tail * 70} -70 Z" fill="${fill}"/>`
      return `${bubble(cx - 340, cy - 210, 400, 220, -1, ink)}${bubble(cx - 40, cy - 10, 380, 200, 1, p.glow)}
        ${[0, 1, 2].map((i) => `<circle cx="${cx - 230 + i * 70}" cy="${cy - 100}" r="18" fill="${p.from}" opacity=".55"/>`).join('')}`
    }
    case 'music': {
      return `<g fill="${ink}">
        <ellipse cx="${cx - 130}" cy="${cy + 150}" rx="88" ry="64" transform="rotate(-20 ${cx - 130} ${cy + 150})"/>
        <ellipse cx="${cx + 170}" cy="${cy + 100}" rx="88" ry="64" transform="rotate(-20 ${cx + 170} ${cy + 100})"/>
        <rect x="${cx - 62}" y="${cy - 230}" width="28" height="390"/>
        <rect x="${cx + 238}" y="${cy - 280}" width="28" height="390"/>
        <path d="M ${cx - 62} ${cy - 230} L ${cx + 266} ${cy - 280} L ${cx + 266} ${cy - 200} L ${cx - 62} ${cy - 150} Z"/>
      </g>`
    }
    case 'spark': {
      const pts = Array.from({ length: 16 }, (_, i) => {
        const a = (Math.PI * i) / 8
        const rad = i % 2 ? 90 : 230
        return `${f(cx + Math.cos(a) * rad)},${f(cy + Math.sin(a) * rad)}`
      })
      return `<polygon points="${pts.join(' ')}" fill="${ink}"/><circle cx="${cx}" cy="${cy}" r="56" fill="${p.glow}"/>`
    }
  }
}

function illustration(slug: string, title: string, categorySlug: string): string {
  const p = PALETTE[categorySlug] ?? FALLBACK_PALETTE
  const r = rng(slug)
  const text = `${slug} ${title}`.toLowerCase()
  const glyph = GLYPH_RULES.find(([, re]) => re.test(text))?.[0] ?? DEFAULT_GLYPH[categorySlug] ?? 'spark'
  const blobs = Array.from({ length: 3 }, (_, i) => {
    const colour = [p.glow, p.soft, p.to][i]!
    return `<circle cx="${f(r() * W)}" cy="${f(r() * H)}" r="${f(160 + r() * 220)}" fill="${colour}" opacity="${f(0.28 + r() * 0.2)}" filter="url(#blur)"/>`
  })
  const dots: string[] = []
  const ox = r() * 40
  for (let y = 40; y < H; y += 56) for (let x = ox; x < W; x += 56) if (r() < 0.22) dots.push(`<circle cx="${f(x)}" cy="${y}" r="3" fill="${p.ink}" opacity=".18"/>`)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.from}"/><stop offset="1" stop-color="${p.to}"/></linearGradient>
    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="70"/></filter>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity=".22"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${blobs.join('\n  ')}
  ${dots.join('')}
  <g filter="url(#shadow)">${glyphSvg(glyph, p, r)}</g>
</svg>`
}

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')
const work = join(tmpdir(), `platform-assets-${process.pid}`)
mkdirSync(work, { recursive: true })

const manifestPath = join(ASSET_DIR, 'manifest.json')
const previous = existsSync(manifestPath) ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as PlatformManifest) : undefined
rmSync(join(ASSET_DIR, 'illustrations'), { recursive: true, force: true })
mkdirSync(join(ASSET_DIR, 'illustrations'), { recursive: true })
const manifest: PlatformManifest = {
  version: MANIFEST_VERSION,
  license: 'CC0-1.0',
  attribution: 'Program.Guru platform illustration (original work, CC0 1.0 Public Domain Dedication)',
  renderedWith: 'SVG rendered by ffmpeg (librsvg)',
  assets: {},
  ...(previous?.programCovers ? { programCovers: previous.programCovers } : {}),
}
for (const act of SEEDED_ACTIVITIES) {
  if (act.textOnly) continue
  const category = CATEGORIES.find((c) => c.slug === act.categorySlug)?.label ?? 'Activity'
  const svgPath = join(work, `${act.slug}.svg`)
  writeFileSync(svgPath, illustration(act.slug, act.title, act.categorySlug))
  const original = execFileSync('ffmpeg', ['-v', 'error', '-i', svgPath, '-frames:v', '1', '-map_metadata', '-1', '-q:v', '3', '-f', 'image2pipe', '-c:v', 'mjpeg', 'pipe:1'])
  const thumb = execFileSync('ffmpeg', ['-v', 'error', '-f', 'mjpeg', '-i', 'pipe:0', '-vf', 'scale=480:360', '-map_metadata', '-1', '-c:v', 'libwebp', '-quality', '80', '-f', 'image2pipe', 'pipe:1'], { input: original })
  const files = { original: `illustrations/${act.slug}.jpg`, thumb: `illustrations/${act.slug}-thumb.webp` }
  writeFileSync(join(ASSET_DIR, files.original), original)
  writeFileSync(join(ASSET_DIR, files.thumb), thumb)
  manifest.assets[act.slug] = {
    alt: `Illustration for ${act.title} (${category})`,
    original: { file: files.original, mime: 'image/jpeg', bytes: original.length, sha256: sha256(original), width: W, height: H },
    thumb: { file: files.thumb, mime: 'image/webp', bytes: thumb.length, sha256: sha256(thumb), width: 480, height: 360 },
  }
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
rmSync(work, { recursive: true, force: true })
const total = Object.values(manifest.assets).reduce((n, a) => n + a.original.bytes + a.thumb.bytes, 0)
console.log(`Wrote ${Object.keys(manifest.assets).length} illustrations (${(total / 1024).toFixed(0)} KiB) to ${ASSET_DIR}`)
