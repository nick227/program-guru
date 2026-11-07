import { describe, expect, it } from 'vitest'
import { mediaTarget, queryKeys, type MediaContext } from '@project/sdk'
describe('media contexts preserve the existing attachment model', () => {
  it.each([
    [
      { kind: 'Profile', userId: 'user' },
      { kind: 'PROFILE', id: 'user' },
    ],
    [
      { kind: 'Program', programId: 'program' },
      { kind: 'PROGRAM', id: 'program' },
    ],
    [
      { kind: 'Activity', revisionId: 'draft' },
      { kind: 'ACTIVITY_REVISION', id: 'draft' },
    ],
    [
      { kind: 'Activity', resultEntryId: 'entry' },
      { kind: 'RESULT_ENTRY', id: 'entry' },
    ],
    [
      { kind: 'Instruction', instructionId: 'instruction' },
      { kind: 'INSTRUCTION', id: 'instruction' },
    ],
  ])(
    'maps %j without inventing a canonical Activity target',
    (context, target) => {
      expect(mediaTarget(context as MediaContext)).toEqual(target)
    },
  )
  it('separates library projections and publication delivery authorization', () => {
    expect(queryKeys.mediaLibrary({ source: 'mine' })).not.toEqual(
      queryKeys.mediaLibrary({ source: 'platform' }),
    )
    expect(queryKeys.mediaUrl('asset', 'group-publication')).not.toEqual(
      queryKeys.mediaUrl('asset', 'public-publication'),
    )
  })
})
