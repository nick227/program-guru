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

it('sends only upload-ticket headers and never credentials to the binary destination', async () => {
  const { putUploadContent } = await import('@project/sdk')
  const { vi } = await import('vitest')
  const fetch = vi.fn().mockResolvedValue(new Response('', { status: 200 }))
  vi.stubGlobal('fetch', fetch)
  try {
    await putUploadContent(
      {
        uploadId: 'upload',
        mediaId: 'asset',
        method: 'PUT',
        uploadUrl: '/signed-upload',
        expiresAt: '2099-01-01',
        maxBytes: 100,
        headers: { 'content-type': 'video/webm', 'x-upload-token': 'ticket' },
      },
      new Blob(['bytes']),
    )
    const options = fetch.mock.calls[0]![1] as RequestInit
    expect(options.credentials).toBe('omit')
    expect(Object.fromEntries(new Headers(options.headers))).toEqual({
      'content-type': 'video/webm',
      'x-upload-token': 'ticket',
    })
  } finally {
    vi.unstubAllGlobals()
  }
})

it('attachment caches identify actual targets across UI contexts and session caches remain separate', () => {
  expect(
    queryKeys.mediaAttachments({ kind: 'Activity', resultEntryId: 'result-a' }),
  ).not.toEqual(
    queryKeys.mediaAttachments({ kind: 'Activity', resultEntryId: 'result-b' }),
  )
  expect(
    queryKeys.mediaAttachments({ kind: 'Activity', revisionId: 'same-id' }),
  ).not.toEqual(
    queryKeys.mediaAttachments({
      kind: 'Instruction',
      instructionId: 'same-id',
    }),
  )
  expect(queryKeys.session('a')).not.toEqual(queryKeys.session('b'))
})
