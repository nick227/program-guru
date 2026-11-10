// The registry is the admin's routing table: keep it unambiguous as resources are added.
import { describe, expect, it } from 'vitest'
import { resources } from './registry'
import { SECTIONS } from './components/AdminLayout'

describe('admin resource registry', () => {
  it('gives every resource a unique path', () => {
    const paths = resources.map((r) => r.path)
    expect(new Set(paths).size).toBe(paths.length)
  })
  it('gives every section a listed home resource', () => {
    for (const s of SECTIONS) expect(resources.some((r) => r.section === s.key && r.list && r.nav !== false), s.key).toBe(true)
  })
  it('defines something to render for each resource', () => {
    for (const r of resources) expect(r.list || r.editor || r.create || r.import, r.path).toBeTruthy()
  })
  it('keeps fields, columns and filters uniquely named within a resource', () => {
    for (const r of resources) {
      const unique = (xs: string[]) => expect(new Set(xs).size, r.path).toBe(xs.length)
      if (r.list) unique(r.list.columns.map((c) => c.key))
      if (r.list?.filters) unique(r.list.filters.map((f) => f.key))
      if (r.create) unique(r.create.fields.map((f) => f.name))
    }
  })
})
