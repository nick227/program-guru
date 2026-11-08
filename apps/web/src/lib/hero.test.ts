import { describe, expect, it } from 'vitest'
import { activityHero, programHero, resolveHero, toHeroCategory } from './hero'

const slugs: Record<string, string> = { 'cat-fit': 'fitness', 'cat-x': 'unknown' }
const slugOf = (id?: string | null) => (id ? (slugs[id] ?? null) : null)

describe('resolveHero', () => {
  it('uses the first available image in resolution order', () => {
    expect(resolveHero({ title: 'A', images: [null, '', '/b.jpg', '/c.jpg'] }).src).toBe('/b.jpg')
  })

  it('falls back to the category, then the neutral category, without an image', () => {
    expect(resolveHero({ title: 'A', images: [], category: 'finance' })).toEqual({
      src: null,
      category: 'finance',
      alt: 'A',
    })
    expect(toHeroCategory('unknown')).toBe('custom')
    expect(toHeroCategory(null)).toBe('custom')
  })

  it('programs prefer their cover, then other entity media, and use the type category', () => {
    const program = { title: 'Strong', coverUrl: null, type: { categoryId: 'cat-fit' } }
    expect(programHero(program, slugOf, ['/activity.webp'])).toEqual({
      src: '/activity.webp',
      category: 'fitness',
      alt: 'Strong',
    })
    expect(programHero({ ...program, coverUrl: '/cover.jpg' }, slugOf, ['/activity.webp']).src).toBe('/cover.jpg')
  })

  it('activities use the server-resolved identity thumbnail and their category', () => {
    expect(activityHero({ title: 'Squats', thumbnailUrl: null, categoryId: 'cat-x' }, slugOf)).toEqual({
      src: null,
      category: 'custom',
      alt: 'Squats',
    })
  })
})
