import { describe, it, expect, beforeEach } from 'vitest'
import { Readable } from 'stream'
import { db } from '@project/db'
import { buildTestApp, asAuth, validateResponse, testUserId, testOtherUserId, testAdminId } from './helpers'
import { makeMedia, seedCatalog } from './helpers/fixtures'
import { drain } from '../worker/outbox'
import { contractCase } from './helpers/contract'
import { mediaUrl } from '../domains/media/urls'
import { storage } from '../infrastructure/storage'

const app = buildTestApp()
let cat: Awaited<ReturnType<typeof seedCatalog>>
beforeEach(async () => {
  cat = await seedCatalog()
})

const PNG = makeMedia('png')
const MP4 = makeMedia('mp4-with-gps')
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

async function uploadWithTarget(
  bytes = PNG,
  mime = 'image/png',
  userId = testUserId,
  target?: { kind: string; id: string },
  purpose?: string,
) {
  const ticket = await req(
    'POST',
    '/media/uploads',
    {
      filename: mime.startsWith('video/') ? 'video.mp4' : 'photo.png',
      mime,
      sizeBytes: bytes.length,
      alt: 'Test media',
      ...(target ? { target } : {}),
      ...(purpose ? { purpose } : {}),
    },
    userId,
  )
  expect(ticket.statusCode).toBe(201)
  const t = ticket.json().data
  const put = await app.inject({
    method: 'PUT',
    url: path(t.uploadUrl),
    headers: { 'content-type': 'application/octet-stream' },
    payload: bytes,
  })
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
    await req('POST', `/group-invitations/${token}/accept`, { enrollment: { timezone: 'America/Chicago', idempotencyKey: 'bob-enrolls' } }, testOtherUserId)

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

describe('durable attachment intent & inbound reliability', () => {
  it('1. Program cover upload -> navigate away -> READY -> cover appears', async () => {
    let ws = (await req('POST', '/programs', { programTypeId: cat.workout.id })).json().data
    expect(ws.coverUrl).toBeNull()

    // Client initiates upload with target PROGRAM and purpose COVER
    const t = await uploadWithTarget(PNG, 'image/png', testUserId, { kind: 'PROGRAM', id: ws.id }, 'COVER')
    const completed = await req('POST', `/media/uploads/${t.uploadId}/complete`)
    expect(completed.statusCode).toBe(200)
    expect(completed.json().data.state).toBe('PROCESSING')

    // Program cover is not yet set while still processing
    let currentWs = (await req('GET', `/programs/${ws.id}/workspace`)).json().data
    expect(currentWs.coverUrl).toBeNull()

    // Client navigates away (no further requests). Worker runs in background:
    await drain()

    // Asset reaches READY and worker finalized the intent:
    expect((await db.mediaAsset.findUniqueOrThrow({ where: { id: t.mediaId } })).state).toBe('READY')
    const updatedProgram = await db.program.findUniqueOrThrow({ where: { id: ws.id } })
    expect(updatedProgram.coverMediaId).toBe(t.mediaId)

    // Workspace now returns the cover
    currentWs = (await req('GET', `/programs/${ws.id}/workspace`)).json().data
    expect(currentWs.coverUrl).not.toBeNull()
  })

  it('2. Replace a pending cover -> previous upload completes late -> replacement remains', async () => {
    const ws = (await req('POST', '/programs', { programTypeId: cat.workout.id })).json().data

    // User uploads Cover A with intent
    const coverA = await uploadWithTarget(PNG, 'image/png', testUserId, { kind: 'PROGRAM', id: ws.id }, 'COVER')
    await req('POST', `/media/uploads/${coverA.uploadId}/complete`)

    // User replaces with Cover B before Cover A finishes processing
    const PNG_B = makeMedia('png')
    const coverB = await uploadWithTarget(PNG_B, 'image/png', testUserId, { kind: 'PROGRAM', id: ws.id }, 'COVER')
    await req('POST', `/media/uploads/${coverB.uploadId}/complete`)

    // Cover A intent was marked SUPERSEDED
    const intentA = await db.mediaAttachmentIntent.findUniqueOrThrow({ where: { mediaId: coverA.mediaId } })
    expect(intentA.status).toBe('SUPERSEDED')

    // Worker drains and processes both
    await drain()

    // Program cover is Cover B, NOT Cover A
    const program = await db.program.findUniqueOrThrow({ where: { id: ws.id } })
    expect(program.coverMediaId).toBe(coverB.mediaId)
  })

  it('3. Activity demonstration video -> processing -> durable attachment', async () => {
    const act = (await req('POST', `/activities/${cat.squats.activity.id}/copy`, { newTitle: 'Custom Squats' })).json().data
    const revId = act.revisionId!

    // Client initiates video upload with target ACTIVITY_REVISION and purpose DEMONSTRATION
    const t = await uploadWithTarget(MP4, 'video/mp4', testUserId, { kind: 'ACTIVITY_REVISION', id: revId }, 'DEMONSTRATION')
    const done = await req('POST', `/media/uploads/${t.uploadId}/complete`)
    expect(done.statusCode).toBe(200)

    // listAttachments surfaces pending intent as PROCESSING
    const pendingList = (await req('GET', `/media-attachments?targetKind=ACTIVITY_REVISION&targetId=${revId}`)).json().data
    expect(pendingList.some((a: any) => a.mediaId === t.mediaId && a.mediaState === 'PROCESSING')).toBe(true)

    // Background worker runs
    await drain()

    expect((await db.mediaAsset.findUniqueOrThrow({ where: { id: t.mediaId } })).state).toBe('READY')
    const attachment = await db.mediaAttachment.findFirstOrThrow({
      where: { mediaId: t.mediaId, activityRevisionId: revId, purpose: 'DEMONSTRATION' },
    })
    expect(attachment.position).toBeGreaterThanOrEqual(0)

    // listAttachments now returns READY attachment
    const readyList = (await req('GET', `/media-attachments?targetKind=ACTIVITY_REVISION&targetId=${revId}`)).json().data
    expect(readyList.some((a: any) => a.mediaId === t.mediaId && a.mediaState === 'READY')).toBe(true)
  })

  it('4. Media Library upload -> processing -> selectable READY asset', async () => {
    // Untargeted library upload
    const t = await upload(PNG, 'image/png')
    await req('POST', `/media/uploads/${t.uploadId}/complete`)
    await drain()

    const mine = (await req('GET', '/media/mine')).json().data
    const asset = mine.find((m: any) => m.id === t.mediaId)
    expect(asset).toMatchObject({ state: 'READY', isOwner: true })
    expect(asset.thumbnailUrl).not.toBeNull()
  })

  it('5. Session capture -> Finish Activity before processing completes -> video attaches to original ResultEntry', async () => {
    let ws = (await req('POST', '/programs', { programTypeId: cat.workout.id })).json().data
    ws = (await req('POST', `/programs/${ws.id}/draft/activities`, { activityIds: [cat.squats.activity.id], expectedRevision: ws.draftRevision })).json().data
    const versionId = (await req('POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision })).json().data.latestPublishedVersionId
    await req('POST', `/programs/${ws.id}/enrollments`, { programVersionId: versionId, startLocalDate: '2026-11-09', timezone: 'America/Chicago', idempotencyKey: 'session-cap-key' })

    const item = await db.calendarItem.findFirstOrThrow({ where: { ownerId: testUserId, programDayIndex: 0 } })
    const session = (await req('POST', '/sessions', { calendarItemId: item.id, idempotencyKey: 'session-cap-sess' })).json().data
    const entry = (await req('POST', `/sessions/${session.id}/results`, { values: [{ metricDefinitionId: cat.reps.id, value: 15 }] })).json().data

    // User captures video during session with target RESULT_ENTRY
    const t = await uploadWithTarget(MP4, 'video/mp4', testUserId, { kind: 'RESULT_ENTRY', id: entry.id }, 'JOURNAL')
    await req('POST', `/media/uploads/${t.uploadId}/complete`)

    // User immediately finishes activity before worker processing completes
    await req('POST', `/sessions/${session.id}/actions`, { action: 'FINISH', expectedRevision: session.revision })
    expect((await db.activitySession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe('FINISHED')

    // Worker drains and processes video
    await drain()

    // Video is attached to original ResultEntry
    const att = await db.mediaAttachment.findFirstOrThrow({ where: { mediaId: t.mediaId, resultEntryId: entry.id, purpose: 'JOURNAL' } })
    expect(att).toBeDefined()

    // Occurrence history shows the attachment on the finished session
    const occ = (await req('GET', `/calendar-items/${item.id}/occurrence`)).json().data
    expect(occ.myMedia.map((m: any) => m.id)).toContain(t.mediaId)
  })

  it('6. Processing failure -> visible failure state and retry/recovery', async () => {
    const ws = (await req('POST', '/programs', { programTypeId: cat.workout.id })).json().data
    // Upload invalid content declaring video/mp4 but containing corrupt bytes
    const badBytes = Buffer.from('ftypisom' + 'corrupt-not-valid-video-data-at-all-000000000000')
    const t = await uploadWithTarget(badBytes, 'video/mp4', testUserId, { kind: 'PROGRAM', id: ws.id }, 'DEMONSTRATION')
    await req('POST', `/media/uploads/${t.uploadId}/complete`)

    // Worker fails processing
    await drain()

    // State is FAILED in DB and API
    const asset = (await req('GET', `/media/${t.mediaId}`)).json().data
    expect(asset.state).toBe('FAILED')

    const intent = await db.mediaAttachmentIntent.findUniqueOrThrow({ where: { mediaId: t.mediaId } })
    expect(intent.status).toBe('FAILED')

    // User can recover by uploading a valid file
    const valid = await uploadWithTarget(PNG, 'image/png', testUserId, { kind: 'PROGRAM', id: ws.id }, 'COVER')
    await req('POST', `/media/uploads/${valid.uploadId}/complete`)
    await drain()
    expect((await db.mediaAsset.findUniqueOrThrow({ where: { id: valid.mediaId } })).state).toBe('READY')
  })

  it('7. Two concurrent uploads competing for the remaining quota', async () => {
    // Quota is 5GB. We create a user asset that consumes almost all quota:
    const QUOTA = 5 * 1024 * 1024 * 1024
    const existingBytes = QUOTA - 15 * 1024 * 1024 // 15 MB remaining
    await db.mediaAsset.create({
      data: {
        id: crypto.randomUUID(),
        ownerId: testUserId,
        type: 'VIDEO',
        originalStorageKey: `u/${testUserId}/huge/original`,
        mime: 'video/mp4',
        byteSize: BigInt(existingBytes),
        state: 'READY',
      },
    })

    // Two parallel uploads each requesting 10 MB (10 MB + 10 MB = 20 MB > 15 MB remaining)
    const req1 = req('POST', '/media/uploads', { filename: 'p1.png', mime: 'image/png', sizeBytes: 10 * 1024 * 1024 })
    const req2 = req('POST', '/media/uploads', { filename: 'p2.png', mime: 'image/png', sizeBytes: 10 * 1024 * 1024 })
    const [res1, res2] = await Promise.all([req1, req2])

    const statuses = [res1.statusCode, res2.statusCode].sort()
    expect(statuses).toEqual([201, 400])
    const failedRes = res1.statusCode === 400 ? res1 : res2
    expect(failedRes.json()).toMatchObject({ code: 'VALIDATION_ERROR', message: 'Your media storage is full' })
  })

  it('8. Declared file size smaller than actual bytes', async () => {
    // User declares 10 bytes to bypass quota, but streams PNG (which is > 100 bytes)
    const ticket = (await req('POST', '/media/uploads', { filename: 'photo.png', mime: 'image/png', sizeBytes: 10 })).json().data
    const put = await app.inject({ method: 'PUT', url: path(ticket.uploadUrl), headers: { 'content-type': 'application/octet-stream' }, payload: PNG })
    expect(put.statusCode).toBe(200)

    // completeUpload verifies actual byte size and reconciles
    const done = await req('POST', `/media/uploads/${ticket.uploadId}/complete`)
    expect(done.statusCode).toBe(200)
    expect(done.json().data.byteSize).toBe(PNG.length)

    // Now test where actual bytes would exceed total quota:
    await db.mediaAsset.deleteMany({ where: { ownerId: testUserId } })
    const QUOTA = 5 * 1024 * 1024 * 1024
    const nearLimitBytes = QUOTA - 5000 // only 5000 bytes left
    await db.mediaAsset.create({
      data: {
        id: crypto.randomUUID(),
        ownerId: testUserId,
        type: 'VIDEO',
        originalStorageKey: `u/${testUserId}/huge2/original`,
        mime: 'video/mp4',
        byteSize: BigInt(nearLimitBytes),
        state: 'READY',
      },
    })
    // Declares 50 bytes (which fits in 5000), but uploads MP4 (which is > 5000 bytes)
    const sneakyRes = await req('POST', '/media/uploads', { filename: 'video.mp4', mime: 'video/mp4', sizeBytes: 50 })
    expect(sneakyRes.statusCode).toBe(201)
    const sneaky = sneakyRes.json().data
    await app.inject({ method: 'PUT', url: path(sneaky.uploadUrl), headers: { 'content-type': 'application/octet-stream' }, payload: MP4 })
    const rejected = await req('POST', `/media/uploads/${sneaky.uploadId}/complete`)
    expect(rejected.statusCode).toBe(400)
    expect(rejected.json().message).toBe('Your media storage is full')
    expect((await db.mediaAsset.findUniqueOrThrow({ where: { id: sneaky.uploadId } })).state).toBe('FAILED')
  })

  it('9. Cross-user attachment and target authorization', async () => {
    // Alice builds a program
    const aliceProgram = (await req('POST', '/programs', { programTypeId: cat.workout.id }, testUserId)).json().data

    // Bob tries to initiate an upload targeting Alice's program
    const unauthorized = await req('POST', '/media/uploads', {
      filename: 'bob-cover.png',
      mime: 'image/png',
      sizeBytes: PNG.length,
      target: { kind: 'PROGRAM', id: aliceProgram.id },
      purpose: 'COVER',
    }, testOtherUserId)
    expect(unauthorized.statusCode).toBe(404)

    // Bob tries to attach Alice's media or target Alice's draft
    const aliceMedia = await upload(PNG, 'image/png', testUserId)
    const attachBob = await req('POST', '/media-attachments', {
      mediaId: aliceMedia.mediaId,
      target: { kind: 'PROGRAM', id: aliceProgram.id },
      purpose: 'COVER',
    }, testOtherUserId)
    expect([400, 404]).toContain(attachBob.statusCode)
  })

  it('10. Worker restart between upload and processing completion', async () => {
    const ws = (await req('POST', '/programs', { programTypeId: cat.workout.id })).json().data
    const t = await uploadWithTarget(PNG, 'image/png', testUserId, { kind: 'PROGRAM', id: ws.id }, 'COVER')
    await req('POST', `/media/uploads/${t.uploadId}/complete`)

    // Verify outbox event exists with status PENDING
    const outbox = await db.outboxEvent.findFirstOrThrow({ where: { type: 'MediaUploaded' } })
    expect(outbox.status).toBe('PENDING')

    // Simulate worker process restart by running drain() fresh
    const delivered = await drain()
    expect(delivered).toBeGreaterThanOrEqual(1)

    // Processing successfully completed and cover attached
    expect((await db.mediaAsset.findUniqueOrThrow({ where: { id: t.mediaId } })).state).toBe('READY')
    expect((await db.program.findUniqueOrThrow({ where: { id: ws.id } })).coverMediaId).toBe(t.mediaId)
  })
})

describe('signed file delivery resilience', () => {
  async function platformWithThumb(keys: { original: string; thumb: string }, writeThumb?: Buffer) {
    const m = await db.mediaAsset.create({
      data: {
        type: 'PHOTO',
        originalStorageKey: keys.original,
        mime: 'image/png',
        byteSize: 32,
        state: 'READY',
        ownerId: null,
        license: 'CC0',
        attribution: 'Platform',
        alt: 'fixture',
      },
    })
    await db.mediaVariant.create({
      data: {
        mediaId: m.id,
        kind: 'THUMB',
        storageKey: keys.thumb,
        mime: 'image/webp',
        byteSize: writeThumb?.length ?? 16,
        width: 48,
        height: 48,
      },
    })
    if (writeThumb) await storage().write(keys.thumb, Readable.from(writeThumb), writeThumb.length)
    return m
  }

  it('returns a controlled 404 when the thumb object is missing, and keeps serving', async () => {
    const m = await platformWithThumb({
      original: 'platform/missing-original.png',
      thumb: 'platform/missing-thumb.webp',
    })
    const res = await app.inject({ method: 'GET', url: path(mediaUrl(m.id, 'thumb')!) })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toMatchObject({ code: 'NOT_FOUND' })
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200)
    // A second miss must not crash either (the original defect killed the process on retry).
    expect((await app.inject({ method: 'GET', url: path(mediaUrl(m.id, 'thumb')!) })).statusCode).toBe(404)
  })

  it('serves a valid thumbnail with the declared content type', async () => {
    const bytes = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64')
    const m = await platformWithThumb(
      { original: 'platform/ok-original.png', thumb: 'platform/ok-thumb.webp' },
      bytes,
    )
    const res = await app.inject({ method: 'GET', url: path(mediaUrl(m.id, 'thumb')!) })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toMatch(/image\/webp/)
    expect(res.rawPayload.equals(bytes)).toBe(true)
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })

  it('returns 404 for an invalid storage key without leaking the path', async () => {
    const m = await platformWithThumb({
      original: 'platform/ok.png',
      thumb: '../etc/passwd',
    })
    const res = await app.inject({ method: 'GET', url: path(mediaUrl(m.id, 'thumb')!) })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toMatchObject({ code: 'NOT_FOUND' })
    expect(JSON.stringify(res.json())).not.toMatch(/etc\/passwd|EINVAL/)
  })

  it('serves concurrent thumbnail requests without error', async () => {
    const bytes = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00])
    const m = await platformWithThumb(
      { original: 'platform/concurrent.png', thumb: 'platform/concurrent-thumb.webp' },
      bytes,
    )
    const url = path(mediaUrl(m.id, 'thumb')!)
    const results = await Promise.all(Array.from({ length: 20 }, () => app.inject({ method: 'GET', url })))
    expect(results.every((r) => r.statusCode === 200)).toBe(true)
    expect(results.every((r) => r.rawPayload.equals(bytes))).toBe(true)
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200)
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

describe('listMediaAttachments', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listMediaAttachments')
  })
})
