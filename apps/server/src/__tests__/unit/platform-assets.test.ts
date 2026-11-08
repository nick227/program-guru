import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { SEEDED_ACTIVITIES, STARTER_PROGRAMS } from '@project/db'
import { ASSET_DIR, loadManifest, platformIllustration, platformProgramCover } from '@project/db/prisma/platform-media'

const manifest = loadManifest()
const digest = (file: string) => createHash('sha256').update(readFileSync(join(ASSET_DIR, file))).digest('hex')

describe('platform asset manifest', () => {
  it('every Activity illustration and Program cover matches its committed checksum', () => {
    const files = [
      ...Object.values(manifest.assets).flatMap((a) => [a.original, a.thumb]),
      ...Object.values(manifest.programCovers ?? {}).flatMap((c) => [c.original, c.thumb]),
    ]
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) expect(digest(f.file), f.file).toBe(f.sha256)
  })

  it('every seeded Activity with media has a text-free original illustration', () => {
    for (const act of SEEDED_ACTIVITIES.filter((a) => !a.textOnly)) {
      const art = platformIllustration(act.slug)
      expect(art.license).toBe('CC0-1.0')
      expect(art.original.storageKey).toMatch(/^platform\/v2\/illustrations\//)
    }
  })

  it('Program covers are CC0 Wikimedia Commons photographs for existing starter Programs', () => {
    const starterSlugs = new Set(STARTER_PROGRAMS.map((p) => p.slug))
    const covers = Object.entries(manifest.programCovers ?? {})
    expect(covers.length).toBeGreaterThan(0)
    for (const [slug, cover] of covers) {
      expect(starterSlugs.has(slug), `orphan cover ${slug}`).toBe(true)
      expect(cover.source.license).toBe('CC0-1.0')
      expect(cover.source.pageUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/)
      expect(cover.source.author.length).toBeGreaterThan(0)
      expect(platformProgramCover(slug)?.attribution).toContain(cover.source.pageUrl)
    }
    expect(platformProgramCover('no-such-program')).toBeNull()
  })
})
