import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@project/db'
import { buildTestApp, asAuth, validateResponse, testUserId, testOtherUserId, seedUser } from './helpers'
import { seedCatalog } from './helpers/fixtures'
import { contractCase } from './helpers/contract'

const app = buildTestApp()
let cat: Awaited<ReturnType<typeof seedCatalog>>
const carolId = '00000000-0000-4000-8000-0000000000c0'
beforeEach(async () => {
  cat = await seedCatalog()
})

const req = (method: string, url: string, payload?: unknown, userId = testUserId) =>
  app.inject({ method: method as any, url, headers: asAuth(userId), ...(payload !== undefined ? { payload: payload as any } : {}) })
let n = 0
const key = () => `k-${++n}-${Date.now()}`

/** Alice publishes a daily challenge with two activities and joins it herself. */
async function challenge(visibility = 'PUBLIC') {
  let ws = (await req('POST', '/programs', { programTypeId: cat.workout.id })).json().data
  ws = (await req('POST', `/programs/${ws.id}/draft/activities`, { activityIds: [cat.squats.activity.id, cat.legRaises.activity.id], expectedRevision: ws.draftRevision })).json().data
  ws = (await req('PATCH', `/programs/${ws.id}/draft`, { title: '30 Days', durationDays: 30, frequency: { kind: 'DAILY' }, expectedRevision: ws.draftRevision })).json().data
  const published = (await req('POST', `/programs/${ws.id}/publish`, { visibility, accessMode: 'OPEN', expectedRevision: ws.draftRevision })).json().data
  const versionId = published.latestPublishedVersionId
  await req('POST', `/programs/${ws.id}/enrollments`, { programVersionId: versionId, startLocalDate: '2026-11-09', timezone: 'America/Chicago', idempotencyKey: key() })
  return { programId: ws.id, versionId }
}

const dayOne = async (userId: string) =>
  (await req('GET', '/calendar/items?start=2026-11-09&end=2026-11-09', undefined, userId)).json().data as any[]

async function finish(userId: string, itemId: string) {
  const s = (await req('POST', '/sessions', { calendarItemId: itemId, idempotencyKey: key() }, userId)).json().data
  return (await req('POST', `/sessions/${s.id}/actions`, { action: 'FINISH', expectedRevision: s.revision }, userId)).json().data
}

describe('two friends follow the same Program (01 §6 required test 3)', () => {
  it('invite by handle, independent calendars, permitted progress, reactions; private results stay private', async () => {
    const { programId, versionId } = await challenge()
    const group = await req('POST', '/groups', { programVersionId: versionId, name: 'Morning crew', mode: 'SYNC' })
    expect(group.statusCode).toBe(201)
    await validateResponse('createGroup', 201, group.json())
    expect(group.json().data).toMatchObject({ mode: 'SYNC', startLocalDate: '2026-11-09', memberCount: 1, myRole: 'OWNER' })
    const groupId = group.json().data.id

    const inv = await req('POST', `/groups/${groupId}/invitations`, { kind: 'USER', handle: 'Bob' })
    expect(inv.statusCode).toBe(201)
    const token = inv.json().data.joinUrl.split('/join/')[1]
    const preview = await app.inject({ method: 'GET', url: `/group-invitations/${token}` })
    await validateResponse('getGroupInvitation', 200, preview.json())
    expect((await req('POST', `/group-invitations/${token}/accept`, undefined, '00000000-0000-4000-8000-000000000003')).statusCode).toBe(404) // not the invitee
    const accepted = await req('POST', `/group-invitations/${token}/accept`, undefined, testOtherUserId)
    expect(accepted.statusCode).toBe(200)
    expect(accepted.json().data.memberCount).toBe(2)

    // SYNC: Bob must start with the group.
    const wrongDay = await req('POST', `/programs/${programId}/enrollments`, { programVersionId: versionId, startLocalDate: '2026-11-10', timezone: 'America/Chicago', groupId, idempotencyKey: key() }, testOtherUserId)
    expect(wrongDay.statusCode).toBe(400)
    const joined = await req('POST', `/programs/${programId}/enrollments`, { programVersionId: versionId, startLocalDate: '2026-11-09', timezone: 'America/Chicago', groupId, idempotencyKey: key() }, testOtherUserId)
    expect(joined.statusCode).toBe(201)

    const aliceDay = await dayOne(testUserId)
    const bobDay = await dayOne(testOtherUserId)
    expect(aliceDay).toHaveLength(2)
    expect(bobDay).toHaveLength(2)
    expect(aliceDay[0].id).not.toBe(bobDay[0].id) // independent calendars

    // Bob finishes Squats only, with a private measurement.
    const bobSquats = bobDay.find((i) => i.title === 'Squats')
    const s = (await req('POST', '/sessions', { calendarItemId: bobSquats.id, idempotencyKey: key() }, testOtherUserId)).json().data
    await req('POST', `/sessions/${s.id}/results`, { values: [{ metricDefinitionId: cat.reps.id, value: 42 }] }, testOtherUserId)
    await req('POST', `/sessions/${s.id}/actions`, { action: 'FINISH', expectedRevision: 0 }, testOtherUserId)

    const aliceSquats = aliceDay.find((i) => i.title === 'Squats')
    const occ = (await req('GET', `/calendar-items/${aliceSquats.id}/occurrence`)).json().data
    expect(occ.collaborators).toMatchObject({ groupId, finishedCount: 1, totalCount: 2 })
    const bobRow = occ.collaborators.members.find((m: any) => m.user.handle === 'bob')
    expect(bobRow.status).toBe('DONE')
    // Bob's 42 reps never reach Alice: not as recorded, previous, target, or in any stat.
    expect(occ.resultInputs[0]).toMatchObject({ recorded: null, previous: null, target: 10 })
    const numbers = JSON.stringify(occ).match(/"[^"]+":\s*42\b/g)
    expect(numbers).toBeNull()
    // Leg Raises on the same day is a separate occurrence: Bob has not done it.
    const legs = (await req('GET', `/calendar-items/${aliceDay.find((i) => i.title === 'Leg Raises').id}/occurrence`)).json().data
    expect(legs.collaborators.members.find((m: any) => m.user.handle === 'bob').status).toBe('PENDING')

    const reacted = await req('POST', `/completion-shares/${bobRow.completionShareId}/reactions`, { emoji: '🔥', idempotencyKey: 'react-fire-1' })
    expect(reacted.statusCode).toBe(200)
    await validateResponse('addCompletionReaction', 200, reacted.json())
    expect(reacted.json().data).toEqual([{ emoji: '🔥', count: 1, reactedByMe: true }])
    // Replaying the same idempotencyKey returns the same result without duplicating reactions or events.
    const replayedReaction = await req('POST', `/completion-shares/${bobRow.completionShareId}/reactions`, { emoji: '🔥', idempotencyKey: 'react-fire-1' })
    expect(replayedReaction.statusCode).toBe(200)
    expect(replayedReaction.json().data).toEqual([{ emoji: '🔥', count: 1, reactedByMe: true }])
    // Reusing the same idempotencyKey with a different emoji conflicts (409).
    const conflictingReaction = await req('POST', `/completion-shares/${bobRow.completionShareId}/reactions`, { emoji: '👏', idempotencyKey: 'react-fire-1' })
    expect(conflictingReaction.statusCode).toBe(409)
    expect((await req('POST', `/completion-shares/${bobRow.completionShareId}/reactions`, { emoji: '💩' })).statusCode).toBe(400)
    expect(await db.outboxEvent.count({ where: { type: 'CompletionShared' } })).toBe(1)
    expect(await db.outboxEvent.count({ where: { type: 'CompletionReacted' } })).toBe(1)
    const feed = await req('GET', `/groups/${groupId}/completions`)
    await validateResponse('listGroupCompletions', 200, feed.json())
    expect(feed.json().data).toHaveLength(1)

    // An outsider sees nothing.
    await seedUser(carolId, 'carol')
    expect((await req('GET', `/groups/${groupId}`, undefined, carolId)).statusCode).toBe(404)
    expect((await req('POST', `/completion-shares/${bobRow.completionShareId}/reactions`, { emoji: '👏' }, carolId)).statusCode).toBe(404)
  })

  it('turning sharing off hides completions; leaving unlinks the calendar', async () => {
    const { programId, versionId } = await challenge()
    const groupId = (await req('POST', '/groups', { programVersionId: versionId, mode: 'ASYNC' })).json().data.id
    const link = (await req('POST', `/groups/${groupId}/invitations`, { kind: 'LINK' })).json().data
    const token = link.joinUrl.split('/join/')[1]
    await req('POST', `/group-invitations/${token}/accept`, undefined, testOtherUserId)
    await req('POST', `/programs/${programId}/enrollments`, { programVersionId: versionId, startLocalDate: '2026-11-12', timezone: 'America/Chicago', groupId, idempotencyKey: key() }, testOtherUserId)
    // ASYNC: different start dates still map to the same occurrence key by Program Day.
    const aliceFirst = await db.calendarItem.findFirstOrThrow({ where: { ownerId: testUserId, programDayIndex: 0, activityId: cat.squats.activity.id } })
    const bobFirst = await db.calendarItem.findFirstOrThrow({ where: { ownerId: testOtherUserId, programDayIndex: 0, activityId: cat.squats.activity.id } })
    expect(aliceFirst.groupOccurrenceKey).toBe(bobFirst.groupOccurrenceKey)
    expect(aliceFirst.localDate).not.toEqual(bobFirst.localDate)

    await req('PATCH', `/groups/${groupId}/members/me`, { sharedCompletion: false }, testOtherUserId)
    await finish(testOtherUserId, bobFirst.id)
    expect(await db.completionShare.count({ where: { userId: testOtherUserId, revokedAt: null } })).toBe(0)
    const left = await req('PATCH', `/groups/${groupId}/members/me`, { leave: true }, testOtherUserId)
    expect(left.statusCode).toBe(200)
    expect(await db.calendarItem.count({ where: { ownerId: testOtherUserId, groupOccurrenceKey: { not: null } } })).toBe(0)
  })

  it('a private program invitation authorizes the invitee', async () => {
    const { programId, versionId } = await challenge('PRIVATE')
    const groupId = (await req('POST', '/groups', { programVersionId: versionId, mode: 'ASYNC' })).json().data.id
    expect((await req('GET', `/programs/${programId}`, undefined, testOtherUserId)).statusCode).toBe(404)
    const token = (await req('POST', `/groups/${groupId}/invitations`, { kind: 'USER', handle: 'bob' })).json().data.joinUrl.split('/join/')[1]
    await req('POST', `/group-invitations/${token}/accept`, undefined, testOtherUserId)
    expect((await req('GET', `/programs/${programId}`, undefined, testOtherUserId)).statusCode).toBe(200)
    const joined = await req('POST', `/programs/${programId}/enrollments`, { programVersionId: versionId, startLocalDate: '2026-11-09', timezone: 'America/Chicago', groupId, idempotencyKey: key() }, testOtherUserId)
    expect(joined.statusCode).toBe(201)
  })
})

describe('group media comments', () => {
  it('members comment on group-shared media; public media has no comments', async () => {
    const { programId, versionId } = await challenge()
    const groupId = (await req('POST', '/groups', { programVersionId: versionId, mode: 'SYNC' })).json().data.id
    const token = (await req('POST', `/groups/${groupId}/invitations`, { kind: 'USER', handle: 'bob' })).json().data.joinUrl.split('/join/')[1]
    await req('POST', `/group-invitations/${token}/accept`, undefined, testOtherUserId)
    await req('POST', `/programs/${programId}/enrollments`, { programVersionId: versionId, startLocalDate: '2026-11-09', timezone: 'America/Chicago', groupId, idempotencyKey: key() }, testOtherUserId)
    const item = await db.calendarItem.findFirstOrThrow({ where: { ownerId: testUserId, programDayIndex: 0 } })
    const media = await db.mediaAsset.create({ data: { ownerId: testUserId, type: 'PHOTO', originalStorageKey: `u/${testUserId}/x`, mime: 'image/png', byteSize: 10, state: 'READY' } })
    const pub = await req('POST', '/media-publications', { mediaId: media.id, audience: 'GROUP', groupId, occurrenceKey: item.groupOccurrenceKey })
    expect(pub.json().data.status).toBe('APPROVED')
    const comment = await req('POST', `/media-publications/${pub.json().data.id}/comments`, { body: 'Great form!', idempotencyKey: 'comment-idem-1' }, testOtherUserId)
    expect(comment.statusCode).toBe(201)
    await validateResponse('addMediaPublicationComment', 201, comment.json())
    // Replaying the same idempotencyKey returns the stored comment without incrementing commentCount twice.
    const commentReplay = await req('POST', `/media-publications/${pub.json().data.id}/comments`, { body: 'Great form!', idempotencyKey: 'comment-idem-1' }, testOtherUserId)
    expect(commentReplay.statusCode).toBe(201)
    expect(commentReplay.json().data.id).toBe(comment.json().data.id)
    // Reusing the same idempotencyKey with a different comment body fails with 409 CONFLICT.
    const commentConflict = await req('POST', `/media-publications/${pub.json().data.id}/comments`, { body: 'Different comment', idempotencyKey: 'comment-idem-1' }, testOtherUserId)
    expect(commentConflict.statusCode).toBe(409)
    const list = await req('GET', `/media-publications/${pub.json().data.id}/comments`)
    await validateResponse('listMediaPublicationComments', 200, list.json())
    expect(list.json().data).toHaveLength(1)
    expect(list.json().data[0]).toMatchObject({ body: 'Great form!', canDelete: true }) // the media owner may remove it
    const bobsOcc = await db.calendarItem.findFirstOrThrow({ where: { ownerId: testOtherUserId, groupOccurrenceKey: item.groupOccurrenceKey } })
    const occ = (await req('GET', `/calendar-items/${bobsOcc.id}/occurrence`, undefined, testOtherUserId)).json().data
    expect(occ.sharedMedia).toEqual([expect.objectContaining({ publicationId: pub.json().data.id, commentCount: 1 })])
    await seedUser(carolId, 'carol')
    expect((await req('GET', `/media-publications/${pub.json().data.id}/comments`, undefined, carolId)).statusCode).toBe(404)

    const pubPublic = await db.mediaPublication.create({ data: { mediaId: media.id, publishedById: testUserId, audience: 'PUBLIC', status: 'APPROVED', license: 'CC0' } })
    expect((await req('POST', `/media-publications/${pubPublic.id}/comments`, { body: 'hi' }, testOtherUserId)).statusCode).toBe(400)
  })
})

// ── Contract: one block per operationId (pnpm test:generate recognizes these) ──

describe('listMyGroups', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listMyGroups')
  })
})

describe('createGroup', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'createGroup')
  })
})

describe('getGroup', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'getGroup')
  })
})

describe('updateGroup', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'updateGroup')
  })
})

describe('updateMyGroupMembership', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'updateMyGroupMembership')
  })
})

describe('removeGroupMember', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'removeGroupMember')
  })
})

describe('listGroupInvitations', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listGroupInvitations')
  })
})

describe('createGroupInvitation', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'createGroupInvitation')
  })
})

describe('revokeGroupInvitation', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'revokeGroupInvitation')
  })
})

describe('getGroupInvitation', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'getGroupInvitation')
  })
})

describe('acceptGroupInvitation', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'acceptGroupInvitation')
  })
})

describe('listGroupCompletions', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listGroupCompletions')
  })
})

describe('addCompletionReaction', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'addCompletionReaction')
  })
})

describe('removeCompletionReaction', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'removeCompletionReaction')
  })
})

describe('listGroupMedia', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listGroupMedia')
  })
})
