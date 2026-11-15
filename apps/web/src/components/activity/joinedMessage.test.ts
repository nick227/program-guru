import { describe, expect, it } from 'vitest'
import { joinedMessage } from './ActivityGatherings'

describe('join confirmation (10 §9.11)', () => {
  it('says the Program day stayed on its own date when the join made a separate item', () => {
    expect(joinedMessage({ otherProgramItemDate: '2026-11-16' })).toBe('Joined as its own Calendar item. Your Program still has this on Mon, Nov 16.')
    expect(joinedMessage({ otherProgramItemDate: null })).toBe('Joined. It is on your Calendar.')
  })
})
