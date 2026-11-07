import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@project/db'
import { buildTestApp, asAuth, validateResponse, testUserId, testOtherUserId, testAdminId } from './helpers'
import { makeMedia, seedCatalog } from './helpers/fixtures'
import { drain } from '../worker/outbox'
import { contractCase } from './helpers/contract'

const app = buildTestApp()
let cat: Awaited<ReturnType<typeof seedCatalog>>
beforeEach(async () => {
  cat = await seedCatalog()
})

const PNG = makeMedia('png')
const req = (method: string, url: string, payload?: unknown, userId = testUserId) =>
  app.inject({ method: method as any, url, headers: asAuth(userId), ...(payload !== undefined ? { payload: payload as any } : {}) })
const path = (u: string) => u.replace(/^https?:\/\/[^/]+/, '')

async function upload(bytes = PNG, mime = 'image/png', userId = testUserId) {
  const ticket = await req('POST', '/media/uploads', { filename: 'photo.png', mime, sizeBytes: bytes.length, alt: 'My squat form' }, userId)
  expect(ticket.statusCode).toBe(201)
  await validateResponse('createMediaUpload', 201, ticket.json())
  const t = ticket.json().data
  const put = await app.inject({ method: 'PUT', url: path(t.uploadUrl), headers: { 'content-type': 'application/octet-stream' }, payload: bytes })
  expect(put.statusCode).toBe(200)
  return t
}

describe('upload, verify, deliver', () => {
  it('uploads through the local provider, verifies content, and serves it through a signed URL', async () => {
    const t = await upload()
    const done = await req('POST', `/media/uploads/${t.uploadId}/complete`)
    expect(done.statusCode).toBe(200)
    await validateResponse('completeMediaUpload', 200, done.json())
    expect(done.json().data).toMatchObject({ state: 'PROCESSING', byteSize: PNG.length, isOwner: true })
    expect(await db.outboxEvent.count({ where: { type: 'MediaUploaded' } })).toBe(1)
    // Not served before processing: the raw upload may carry metadata.
    expect((await req('GET', `/media/${t.mediaId}/url`)).statusCode).toBe(400)
    await drain()
    expect((await db.mediaAsset.findUniqueOrThrow({ where: { id: t.mediaId } })).state).toBe('READY')
    const url = await req('GET', `/media/${t.mediaId}/url`)
    expect(url.statusCode).toBe(200)
    await validateResponse('getMediaUrl', 200, url.json())
    const file = await app.inject({ method: 'GET', url: path(url.json().data.url) })
    expect(file.statusCode).toBe(200)
    expect(file.headers['content-type']).toBe('image/jpeg') // the re-encoded, metadata-free rendition
    expect(file.rawPayload.equals(PNG)).toBe(false)
    expect(file.headers['x-content-type-options']).toBe('nosniff')
    // Tampered signature and other users are refused.
    expect((await app.inject({ method: 'GET', url: path(url.json().data.url).replace(/sig=[^&]+/, 'sig=forged') })).statusCode).toBe(404)
    expect((await req('GET', `/media/${t.mediaId}/url`, undefined, testOtherUserId)).statusCode).toBe(404)
  })

  it('rejects content that does not match its declared type, oversized files, and unknown types', async () => {
    const t = await upload(Buffer.from('<html>not an image</html>'), 'image/png')
    const res = await req('POST', `/media/uploads/${t.uploadId}/complete`)
    expect(res.statusCode).toBe(400)
    expect((await db.mediaAsset.findUniqueOrThrow({ where: { id: t.mediaId } })).state).toBe('FAILED')
    expect((await req('POST', '/media/uploads', { filename: 'x.exe', mime: 'application/x-msdownload', sizeBytes: 10 })).statusCode).toBe(400)
    expect((await req('POST', '/media/uploads', { filename: 'x.png', mime: 'image/png', sizeBytes: 10 * 1024 * 1024 * 1024 })).statusCode).toBe(400)
  })

  it('refuses an upload with a bad token', async () => {
    const ticket = (await req('POST', '/media/uploads', { filename: 'a.png', mime: 'image/png', sizeBytes: PNG.length })).json().data
    const res = await app.inject({ method: 'PUT', url: `/media/uploads/${ticket.uploadId}/content?token=1.forged`, headers: { 'content-type': 'application/octet-stream' }, payload: PNG })
    expect(res.statusCode).toBe(404)
  })
})

describe('publications', () => {
  it('a public contribution waits for moderation; approval makes it visible to everyone', async () => {
    const t = await upload()
    await req('POST', `/media/uploads/${t.uploadId}/complete`)
    await drain()
    expect((await req('POST', '/media-publications', { mediaId: t.mediaId, audience: 'PUBLIC', activityId: cat.squats.activity.id })).statusCode).toBe(400) // license required
    const pub = await req('POST', '/media-publications', { mediaId: t.mediaId, audience: 'PUBLIC', activityId: cat.squats.activity.id, license: 'CC-BY-4.0', caption: 'Form check' })
    expect(pub.statusCode).toBe(201)
    await validateResponse('createMediaPublication', 201, pub.json())
    expect(pub.json().data.status).toBe('PENDING')
    expect((await app.inject({ method: 'GET', url: `/media-publications/${pub.json().data.id}` })).statusCode).toBe(404)
    expect((await req('GET', '/moderation/publications', undefined, testOtherUserId)).statusCode).toBe(403)
    const queue = await req('GET', '/moderation/publications', undefined, testAdminId)
    await validateResponse('listPendingPublications', 200, queue.json())
    const approved = await req('POST', `/moderation/publications/${pub.json().data.id}`, { decision: 'APPROVE' }, testAdminId)
    expect(approved.json().data.status).toBe('APPROVED')
    expect((await app.inject({ method: 'GET', url: `/media-publications/${pub.json().data.id}` })).statusCode).toBe(200)
    expect((await req('GET', `/media/${t.mediaId}/url`, undefined, testOtherUserId)).statusCode).toBe(200)
  })

  it('attaches only to your own drafts, with your own or platform media', async () => {
    const mine = (await req('POST', '/activities', { title: 'Mine', categoryId: cat.fitness.id })).json().data
    const ok = await req('POST', '/media-attachments', { mediaId: cat.illustration.id, target: { kind: 'ACTIVITY_REVISION', id: mine.revisionId }, purpose: 'ILLUSTRATION' })
    expect(ok.statusCode).toBe(201)
    await validateResponse('createMediaAttachment', 201, ok.json())
    const notMine = await req('POST', '/media-attachments', { mediaId: cat.illustration.id, target: { kind: 'ACTIVITY_REVISION', id: cat.squats.revision.id }, purpose: 'ILLUSTRATION' })
    expect(notMine.statusCode).toBe(404)
    const t = await upload(PNG, 'image/png', testOtherUserId)
    const othersMedia = await req('POST', '/media-attachments', { mediaId: t.mediaId, target: { kind: 'ACTIVITY_REVISION', id: mine.revisionId }, purpose: 'ILLUSTRATION' })
    expect(othersMedia.statusCode).toBe(400)
  })

  it('does not expose private media merely attached to PROFILE unless set as avatar or cover', async () => {
    const t = await upload()
    await req('POST', `/media/uploads/${t.uploadId}/complete`)
    await db.mediaAsset.update({ where: { id: t.mediaId }, data: { state: 'READY' } })
    const att = await req('POST', '/media-attachments', { mediaId: t.mediaId, target: { kind: 'PROFILE', id: testUserId }, purpose: 'COVER' })
    expect(att.statusCode).toBe(201)
    // Another user cannot fetch a signed URL just because a PROFILE attachment exists.
    expect((await req('GET', `/media/${t.mediaId}/url`, undefined, testOtherUserId)).statusCode).toBe(404)
    // Once set as the user's profile avatar, it becomes viewable.
    await req('PATCH', '/users/me/profile', { avatarMediaId: t.mediaId })
    expect((await req('GET', `/media/${t.mediaId}/url`, undefined, testOtherUserId)).statusCode).toBe(200)
  })
})

describe('private media on results (01 §6 required test 4)', () => {
  it('records results, saves a private photo, returns to the calendar; nobody else can see the photo', async () => {
    // Alice and Bob are in a group following the same program, so "private" is tested against a collaborator.
    let ws = (await req('POST', '/programs', { programTypeId: cat.workout.id })).json().data
    ws = (await req('POST', `/programs/${ws.id}/draft/activities`, { activityIds: [cat.squats.activity.id], expectedRevision: ws.draftRevision })).json().data
    const versionId = (await req('POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision })).json().data.latestPublishedVersionId
    const enroll = (userId: string, key: string, groupId?: string) =>
      req('POST', `/programs/${ws.id}/enrollments`, { programVersionId: versionId, startLocalDate: '2026-11-09', timezone: 'America/Chicago', idempotencyKey: key, ...(groupId ? { groupId } : {}) }, userId)
    await enroll(testUserId, 'alice-enrolls')
    const groupId = (await req('POST', '/groups', { programVersionId: versionId, mode: 'SYNC' })).json().data.id
    const token = (await req('POST', `/groups/${groupId}/invitations`, { kind: 'USER', handle: 'bob' })).json().data.joinUrl.split('/join/')[1]
    await req('POST', `/group-invitations/${token}/accept`, undefined, testOtherUserId)
    await enroll(testOtherUserId, 'bob-enrolls', groupId)

    const item = await db.calendarItem.findFirstOrThrow({ where: { ownerId: testUserId, programDayIndex: 0 } })
    const s = (await req('POST', '/sessions', { calendarItemId: item.id, idempotencyKey: 'private-media-session' })).json().data
    const entry = (await req('POST', `/sessions/${s.id}/results`, { values: [{ metricDefinitionId: cat.reps.id, value: 20 }], notes: 'knee felt fine' })).json().data
    const t = await upload()
    await req('POST', `/media/uploads/${t.uploadId}/complete`)
    await drain()
    const attached = await req('POST', '/media-attachments', { mediaId: t.mediaId, target: { kind: 'RESULT_ENTRY', id: entry.id }, purpose: 'JOURNAL' })
    expect(attached.statusCode).toBe(201)
    const finished = (await req('POST', `/sessions/${s.id}/actions`, { action: 'FINISH', expectedRevision: s.revision })).json().data
    // Back on the calendar: the item is done, on the same date.
    expect(finished.item).toMatchObject({ status: 'DONE', localDate: '2026-11-09' })

    const mine = (await req('GET', `/calendar-items/${item.id}/occurrence`)).json().data
    expect(mine.myMedia.map((m: any) => m.id)).toEqual([t.mediaId])
    expect(mine.resultInputs[0].recorded).toBe(20)

    // Bob, a group member, sees Alice's completion but never her photo, note, or reps.
    const bobsItem = await db.calendarItem.findFirstOrThrow({ where: { ownerId: testOtherUserId, groupOccurrenceKey: item.groupOccurrenceKey } })
    const bobs = (await req('GET', `/calendar-items/${bobsItem.id}/occurrence`, undefined, testOtherUserId)).json().data
    expect(bobs.collaborators.members.find((m: any) => m.user.handle === 'alice').status).toBe('DONE')
    expect(bobs.sharedMedia).toEqual([])
    expect(bobs.myMedia).toEqual([])
    expect(JSON.stringify(bobs)).not.toContain(t.mediaId)
    expect(JSON.stringify(bobs)).not.toContain('knee felt fine')
    expect((await req('GET', `/media/${t.mediaId}/url`, undefined, testOtherUserId)).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: `/media/${t.mediaId}/url` })).statusCode).toBe(404)
    expect((await req('GET', `/sessions/${s.id}`, undefined, testOtherUserId)).statusCode).toBe(404)

    // Sharing is a deliberate act: only after publishing to the group does Bob see it.
    await req('POST', '/media-publications', { mediaId: t.mediaId, audience: 'GROUP', groupId, occurrenceKey: item.groupOccurrenceKey })
    const after = (await req('GET', `/calendar-items/${bobsItem.id}/occurrence`, undefined, testOtherUserId)).json().data
    expect(after.sharedMedia.map((m: any) => m.id)).toEqual([t.mediaId])
    expect((await req('GET', `/media/${t.mediaId}/url`, undefined, testOtherUserId)).statusCode).toBe(200)
  })
})

// ── Contract: one block per operationId (pnpm test:generate recognizes these) ──

describe('listMyMedia', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listMyMedia')
  })
})

describe('listPlatformMedia', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listPlatformMedia')
  })
})

describe('createMediaUpload', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'createMediaUpload')
  })
})

describe('completeMediaUpload', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'completeMediaUpload')
  })
})

describe('uploadMediaContent', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'uploadMediaContent')
  })
})

describe('getMediaFile', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'getMediaFile')
  })
})

describe('getMedia', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'getMedia')
  })
})

describe('updateMedia', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'updateMedia')
  })
})

describe('deleteMedia', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'deleteMedia')
  })
})

describe('getMediaUrl', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'getMediaUrl')
  })
})

describe('createMediaAttachment', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'createMediaAttachment')
  })
})

describe('deleteMediaAttachment', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'deleteMediaAttachment')
  })
})

describe('createMediaPublication', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'createMediaPublication')
  })
})

describe('revokeMediaPublication', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'revokeMediaPublication')
  })
})
