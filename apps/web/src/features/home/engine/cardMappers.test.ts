import { describe, expect, it } from 'vitest'
import type { components } from '@project/sdk'
import { leadProgramFor, mapActivityToCard, mapCreatorToCard, mapProgramToCard } from './cardMappers'

type S = components['schemas']

const creator = { id: 'u1', handle: 'maya', displayName: 'Maya', avatarUrl: 'avatar.jpg' }
const program = (id: string, over: Partial<S['ProgramSummary']> = {}) =>
  ({ id, title: id, creator, coverUrl: null, coverMedia: null, type: { categoryId: 'cat-arts', label: 'Art' }, ...over }) as unknown as S['ProgramSummary']
const item = (p: S['ProgramSummary']) => ({ kind: 'PROGRAM', program: p, activity: null, creator: null }) as S['DiscoverItem']

describe('card heroes (03-UX §2a)', () => {
  it('puts an Activity cover poster ahead of its thumbnail', () => {
    const card = mapActivityToCard({
      id: 'a1',
      title: 'Sketch',
      categoryId: 'cat-arts',
      thumbnailUrl: 'thumb.jpg',
      coverMedia: { posterUrl: 'poster.jpg' },
      creator: null,
    } as unknown as S['ActivitySummary'])
    expect(card.hero).toEqual({ images: ['poster.jpg', 'thumb.jpg'], categoryId: 'cat-arts' })
  })

  it("uses a Program's cover and its type's Domain", () => {
    const card = mapProgramToCard(program('p1', { coverUrl: 'cover.jpg' }))
    expect(card.hero).toEqual({ images: [undefined, 'cover.jpg'], categoryId: 'cat-arts' })
  })

  it("gives a creator their leading Program's cover plus their avatar", () => {
    const lists = [[item(program('bare'))], [item(program('covered', { coverUrl: 'c.jpg' }))]]
    const lead = leadProgramFor('u1', lists)
    expect(lead?.id).toBe('covered')
    expect(mapCreatorToCard(creator, lead).hero).toMatchObject({ images: [undefined, 'c.jpg'], avatarUrl: 'avatar.jpg' })
  })

  it('falls back to category art (no images) for a creator without Programs', () => {
    expect(leadProgramFor('nobody', [[item(program('p'))]])).toBeNull()
    expect(mapCreatorToCard(creator, null).hero).toEqual({ images: [], categoryId: null, avatarUrl: 'avatar.jpg' })
  })
})
