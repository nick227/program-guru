import { describe, expect, it } from 'vitest'
import { interleaveUnique, pickAcrossDomains } from './activityRange'

const a = (id: string, categoryId: string) => ({ id, categoryId })

describe('pickAcrossDomains', () => {
  it('takes one per Domain in rank order before a second from any Domain', () => {
    const ranked = [a('f1', 'fit'), a('f2', 'fit'), a('f3', 'fit'), a('m1', 'music'), a('o1', 'out'), a('m2', 'music')]
    expect(pickAcrossDomains(ranked, 5).map((x) => x.id)).toEqual(['f1', 'm1', 'o1', 'f2', 'm2'])
  })

  it('spans at least three Domains when three exist, and never exceeds the limit', () => {
    const ranked = [...Array.from({ length: 10 }, (_, i) => a(`f${i}`, 'fit')), a('m1', 'music'), a('o1', 'out')]
    const picked = pickAcrossDomains(ranked, 5)
    expect(picked).toHaveLength(5)
    expect(new Set(picked.map((x) => x.categoryId)).size).toBe(3)
  })

  it('skips excluded and duplicate items and returns fewer when data is short', () => {
    expect(pickAcrossDomains([a('x', 'fit'), a('x', 'fit'), a('y', 'music')], 5, new Set(['y'])).map((x) => x.id)).toEqual(['x'])
    expect(pickAcrossDomains([], 5)).toEqual([])
  })
})

describe('interleaveUnique', () => {
  it('alternates lists and keeps the first occurrence of each id', () => {
    const popular = [a('p1', 'fit'), a('shared', 'fit'), a('p2', 'fit')]
    const fresh = [a('n1', 'art'), a('shared', 'fit'), a('n2', 'music')]
    expect(interleaveUnique(popular, fresh).map((x) => x.id)).toEqual(['p1', 'n1', 'shared', 'p2', 'n2'])
  })

  it('lets new catalog content into a five-card mix that popularity alone would fill', () => {
    const popular = Array.from({ length: 20 }, (_, i) => a(`old${i}`, ['fit', 'well', 'learn'][i % 3]!))
    const fresh = [a('film', 'art'), a('guitar', 'music'), a('garden', 'home')]
    const picked = pickAcrossDomains(interleaveUnique(popular, fresh), 5).map((x) => x.id)
    expect(picked).toEqual(expect.arrayContaining(['film', 'guitar']))
    expect(picked).toHaveLength(5)
  })
})
