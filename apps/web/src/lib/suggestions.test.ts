import { describe, expect, it } from 'vitest'
import { mergeSuggestionTiers, suggestionTiers } from '@project/sdk'

const items = (...ids: string[]) => ids.map((id) => ({ id }))

describe('suggestion ranking', () => {
  it('keeps tier order, removes duplicates and exclusions, and stops at five', () => {
    const tiers = [items('a', 'b'), items('b', 'c', 'd'), items('e', 'f', 'g')]
    expect(mergeSuggestionTiers(tiers, new Set(['c'])).map((i) => i.id)).toEqual(['a', 'b', 'd', 'e', 'f'])
  })

  it('falls back to wider tiers when the specific tier is short', () => {
    expect(mergeSuggestionTiers([items(), items('x'), items('y', 'z')]).map((i) => i.id)).toEqual(['x', 'y', 'z'])
  })

  it('drops widened filter levels that are identical', () => {
    expect(suggestionTiers([{ programTypeId: 't', focusId: undefined }, { programTypeId: 't' }, {}])).toEqual([
      { programTypeId: 't', focusId: undefined },
      {},
    ])
  })
})
