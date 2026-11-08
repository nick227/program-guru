import { describe, expect, it } from 'vitest'
import { pickVisual } from '../../domains/activities/mapper'

const a = (id: string, purpose: string, position = 0, state = 'READY') => ({ id, purpose, position, media: { state } })

describe('pickVisual', () => {
  it('prefers COVER over earlier illustration or demonstration attachments', () => {
    const rev = [a('demo', 'DEMONSTRATION'), a('ill', 'ILLUSTRATION'), a('cover', 'COVER', 3)]
    expect(pickVisual(rev, rev)?.id).toBe('cover')
  })
  it('falls back ILLUSTRATION then DEMONSTRATION by position, skipping unready media', () => {
    const rev = [a('demo', 'DEMONSTRATION'), a('ill-2', 'ILLUSTRATION', 2), a('ill-1', 'ILLUSTRATION', 1), a('cover', 'COVER', 0, 'PROCESSING')]
    expect(pickVisual(rev, rev)?.id).toBe('ill-1')
    expect(pickVisual([rev[0]!], [rev[0]!])?.id).toBe('demo')
  })
  it('uses any READY attachment, including instruction media, when no identity purpose exists', () => {
    const instruction = a('inst', 'OTHER')
    expect(pickVisual([a('journal', 'JOURNAL', 0, 'FAILED')], [instruction])?.id).toBe('inst')
    expect(pickVisual([], [])).toBeUndefined()
  })
})
