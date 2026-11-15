import { describe, expect, it } from 'vitest'
import { lookingForText } from './lookingFor'

describe('lookingForText', () => {
  it('adds the prefix only when the note lacks it', () => {
    expect(lookingForText('Looking for actors and a sound recordist')).toBe('Looking for actors and a sound recordist')
    expect(lookingForText('looking for a spotter')).toBe('looking for a spotter')
    expect(lookingForText('Actors and lighting help')).toBe('Looking for: Actors and lighting help')
  })
})
