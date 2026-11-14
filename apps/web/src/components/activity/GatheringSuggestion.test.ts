import { describe, expect, it } from 'vitest'
import { canSuggestGathering } from './GatheringSuggestion'

const base = { status: 'PLANNED' as const, gatheringId: null, groupName: null, locked: false }

describe('canSuggestGathering (10 §9.11)', () => {
  it('suggests for planned personal and solo-Program items only', () => {
    expect(canSuggestGathering(base)).toBe(true)
    expect(canSuggestGathering({ ...base, status: 'DONE' })).toBe(false)
    expect(canSuggestGathering({ ...base, gatheringId: 'g1' })).toBe(false)
    // A Program-group item keeps its own shared occurrence: never suggested.
    expect(canSuggestGathering({ ...base, groupName: 'Morning crew' })).toBe(false)
    expect(canSuggestGathering({ ...base, locked: true })).toBe(false)
  })
})
