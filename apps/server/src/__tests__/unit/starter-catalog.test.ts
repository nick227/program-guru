// Editorial standard and reference integrity for the raw starter catalog (01 §11, 08 §9a). Mirrors
// seed/starter/validate.py so CI does not need Python.
import { describe, expect, it } from 'vitest'
import catalog from '@project/db/prisma/seed/starter/catalog.json'
import examples from '@project/db/prisma/seed/starter/examples.json'
import { DOMAIN_SLUG_ALIASES, STARTER_ACTIVITIES, STARTER_CATALOG_PROGRAMS, TAXONOMY } from '@project/db/prisma/seed'

const words = (s: string) => s.trim().split(/\s+/).length
const within = (s: string, min: number, max: number) => words(s) >= min && words(s) <= max

describe('starter catalog editorial standard', () => {
  it('every Activity title, summary and instruction is within the standard word ranges', () => {
    const problems: string[] = []
    for (const a of examples.activities) {
      if (!within(a.title, 2, 7)) problems.push(`${a.id} title: ${words(a.title)} words`)
      if (!within(a.description, 20, 30)) problems.push(`${a.id} summary: ${words(a.description)} words`)
      for (const i of a.instructions) {
        if (!within(i.title, 6, 12)) problems.push(`${a.id} instruction ${i.order} title: ${words(i.title)} words`)
        if (!within(i.body, 40, 80)) problems.push(`${a.id} instruction ${i.order} body: ${words(i.body)} words`)
      }
    }
    expect(problems).toEqual([])
  })

  it('carries no tier or focus classification and keeps instruction order unique', () => {
    for (const e of [...examples.activities, ...examples.programs]) {
      expect(e, e.id).not.toHaveProperty('tier')
      expect(e, e.id).not.toHaveProperty('focus')
    }
    for (const a of examples.activities) {
      expect(new Set(a.instructions.map((i) => i.order)).size, a.id).toBe(a.instructions.length)
    }
  })

  it('every reference resolves: IDs unique, Program Activities and dependencies, Places', () => {
    const ids = (xs: { id: string }[]) => xs.map((x) => x.id)
    for (const list of [examples.activities, examples.programs, examples.places]) expect(new Set(ids(list)).size).toBe(list.length)
    const activityIds = new Set(ids(examples.activities))
    for (const p of examples.programs) {
      for (const id of p.activityIds) expect(activityIds.has(id), `${p.id} → ${id}`).toBe(true)
      for (const d of p.dependencies) expect(p.activityIds.includes(d.before) && p.activityIds.includes(d.after), p.id).toBe(true)
    }
    const placeIds = new Set(ids(examples.places))
    for (const a of examples.activities) {
      const placeId = (a.location as { placeId?: string }).placeId
      if (placeId) expect(placeIds.has(placeId), `${a.id} → ${placeId}`).toBe(true)
    }
  })

  it('every editorial Domain and Category maps onto a stored Category and Focus', () => {
    const focusKeys = new Set(TAXONOMY.focuses.map((f) => `${f.categorySlug}:${f.slug}`))
    const labels = new Map(TAXONOMY.categories.map((c) => [c.slug, c.label]))
    for (const d of catalog.domains) {
      const stored = DOMAIN_SLUG_ALIASES[d.slug] ?? d.slug
      expect(labels.get(stored), d.slug).toBe(d.label)
      for (const c of d.categories) expect(focusKeys.has(`${stored}:${c.slug}`), `${d.slug}/${c.slug}`).toBe(true)
    }
  })

  it('maps every editorial Activity and Program into the content pack with stable slugs', () => {
    expect(STARTER_ACTIVITIES.map((a) => a.slug)).toEqual(examples.activities.map((a) => a.slug))
    expect(STARTER_CATALOG_PROGRAMS.map((p) => p.slug)).toEqual(examples.programs.map((p) => `starter-${p.id.replace(/^seed-program-/, '')}`))
  })
})
