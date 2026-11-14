import { describe, expect, it } from 'vitest'
import { groupAction, sessionActionLabel } from './joinEligibility'

describe('groupAction (12 §5a)', () => {
  it('never offers Join to a member, including the owner, or after joining in this session', () => {
    expect(groupAction({ viewerIsMember: true, joinPolicy: 'OPEN' })).toBe('open')
    expect(groupAction({ viewerIsMember: false, joinPolicy: 'OPEN' }, true)).toBe('open')
  })

  it('offers Join only for open groups; others can be viewed', () => {
    expect(groupAction({ viewerIsMember: false, joinPolicy: 'OPEN' })).toBe('join')
    expect(groupAction({ viewerIsMember: false, joinPolicy: 'INVITE_ONLY' })).toBe('view')
    expect(groupAction({ joinPolicy: null })).toBe('view')
  })

  it('labels each action', () => {
    expect(sessionActionLabel('join')).toBe('Join session')
    expect(sessionActionLabel('open')).toBe('Open session')
    expect(sessionActionLabel('view')).toBe('View session')
  })
})
