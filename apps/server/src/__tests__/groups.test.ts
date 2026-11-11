import { describe, it, expect, beforeEach, onTestFinished } from 'vitest'
import { db } from '@project/db'
import { buildTestApp, asAuth, validateResponse, testUserId, testOtherUserId, seedUser, pinToday, unpinToday } from './helpers'
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
    // Dates below assume today is the start date, 2026-11-09 (America/Chicago).
    pinToday('2026-11-09T18:00:00Z')
    onTestFinished(unpinToday)
    const { versionId } = await challenge()
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
    expect((await req('POST', `/group-invitations/${token}/accept`, { enrollment: { timezone: 'America/Chicago', idempotencyKey: key() } }, '00000000-0000-4000-8000-000000000003')).statusCode).toBe(404) // not the invitee
    // SYNC: Bob must start with the group; a mismatch fails without joining.
    const wrongDay = await req('POST', `/group-invitations/${token}/accept`, { enrollment: { startLocalDate: '2026-11-10', timezone: 'America/Chicago', idempotencyKey: key() } }, testOtherUserId)
    expect(wrongDay.statusCode).toBe(400)
    const accepted = await req('POST', `/group-invitations/${token}/accept`, { enrollment: { timezone: 'America/Chicago', idempotencyKey: key() } }, testOtherUserId)
    expect(accepted.statusCode).toBe(200)
    expect(accepted.json().data.memberCount).toBe(2)
    expect(accepted.json().data.myEnrollment).toMatchObject({ startLocalDate: '2026-11-09', startDateDiffers: false })

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
    const { versionId } = await challenge()
    const groupId = (await req('POST', '/groups', { programVersionId: versionId, mode: 'ASYNC' })).json().data.id
    const link = (await req('POST', `/groups/${groupId}/invitations`, { kind: 'LINK' })).json().data
    const token = link.joinUrl.split('/join/')[1]
    expect((await req('POST', `/group-invitations/${token}/accept`, { enrollment: { startLocalDate: '2026-11-12', timezone: 'America/Chicago', idempotencyKey: key() } }, testOtherUserId)).statusCode).toBe(200)
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
    const joined = await req('POST', `/group-invitations/${token}/accept`, { enrollment: { startLocalDate: '2026-11-09', timezone: 'America/Chicago', idempotencyKey: key() } }, testOtherUserId)
    expect(joined.statusCode).toBe(200)
    expect((await req('GET', `/programs/${programId}`, undefined, testOtherUserId)).statusCode).toBe(200)
    expect(joined.json().data.myEnrollment).not.toBeNull()
  })
})

describe('group media comments', () => {
  it('members comment on group-shared media; public media has no comments', async () => {
    const { versionId } = await challenge()
    const groupId = (await req('POST', '/groups', { programVersionId: versionId, mode: 'SYNC' })).json().data.id
    const token = (await req('POST', `/groups/${groupId}/invitations`, { kind: 'USER', handle: 'bob' })).json().data.joinUrl.split('/join/')[1]
    await req('POST', `/group-invitations/${token}/accept`, { enrollment: { timezone: 'America/Chicago', idempotencyKey: key() } }, testOtherUserId)
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

describe('listProgramGroups', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listProgramGroups')
  })
})

describe('getPublicGroupPreview', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'getPublicGroupPreview')
  })
})

describe('joinGroup', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'joinGroup')
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

describe('listMyGroupInvitations', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listMyGroupInvitations')
  })
})

describe('acceptMyGroupInvitation', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'acceptMyGroupInvitation')
  })
})

describe('declineMyGroupInvitation', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'declineMyGroupInvitation')
  })
})

describe('declineGroupInvitation', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'declineGroupInvitation')
  })
})

describe('contextual participation links', () => {
  it('private link → personal Calendar → scoped completion/reaction/media → removal and revocation', async () => {
    const { programId, versionId } = await challenge('PRIVATE')
    const groupId = (await req('POST', '/groups', { programVersionId: versionId, mode: 'ASYNC' })).json().data.id
    const issue = async (userId = testUserId, rotate = false) => req('POST', `/groups/${groupId}/invitations`, { kind: 'LINK', rotate }, userId)
    const tokenOf = (response: any) => response.json().data.joinUrl.split('/join/')[1]
    const first = await issue()
    expect(first.statusCode).toBe(201)
    const token = tokenOf(first)
    const anonymous = await app.inject({ method: 'GET', url: `/group-invitations/${token}` })
    expect(anonymous.json().data.join.status).toBe('SIGN_IN_REQUIRED')
    expect((await req('GET', `/group-invitations/${token}`, undefined, testOtherUserId)).json().data.join.status).toBe('SELECT_SCHEDULE')
    expect((await req('POST', `/group-invitations/${token}/accept`, { enrollment: { startLocalDate: '2026-11-09', timezone: 'America/Chicago', idempotencyKey: key() } }, testOtherUserId)).statusCode).toBe(200)
    expect((await db.program.findUniqueOrThrow({ where: { id: programId } })).visibility).toBe('PRIVATE')
    expect((await req('GET', `/programs/${programId}/workspace`, undefined, testOtherUserId)).statusCode).toBe(404)
    expect((await issue(testOtherUserId)).statusCode).toBe(403)
    expect((await req('PATCH', `/groups/${groupId}`, { memberLinkSharingEnabled: true }, testOtherUserId)).statusCode).toBe(403)
    const permission = await req('PATCH', `/groups/${groupId}`, { memberLinkSharingEnabled: true })
    expect(permission.json().data.memberLinkSharingEnabled).toBe(true)
    const memberLink = await issue(testOtherUserId)
    expect(memberLink.statusCode).toBe(201)
    expect((await issue(testOtherUserId, true)).statusCode).toBe(403)
    // Raw tokens are returned once, never in list responses, stored invitations, or events.
    expect((await req('GET', `/groups/${groupId}/invitations`, undefined, testOtherUserId)).json().data.every((i: any) => i.joinUrl === null)).toBe(true)
    const persisted = JSON.stringify(await db.groupInvitation.findMany({ where: { groupId } }))
    expect(persisted).not.toContain(token)
    expect(JSON.stringify(await db.outboxEvent.findMany())).not.toContain(tokenOf(memberLink))

    const bobItems = await dayOne(testOtherUserId)
    const aliceItems = await dayOne(testUserId)
    const bob = bobItems.find((i) => i.title === 'Squats')
    const alice = aliceItems.find((i) => i.title === 'Squats')
    expect(bob.id).not.toBe(alice.id)
    await finish(testOtherUserId, bob.id)
    const occurrence = (await req('GET', `/calendar-items/${alice.id}/occurrence`)).json().data
    const occurrenceKey = occurrence.collaborators.occurrenceKey
    const feed = (await req('GET', `/groups/${groupId}/completions?occurrenceKey=${encodeURIComponent(occurrenceKey)}`)).json().data
    expect(feed).toHaveLength(1)
    expect((await req('POST', `/completion-shares/${feed[0].id}/reactions`, { emoji: '👏' })).statusCode).toBe(200)
    const media = await db.mediaAsset.create({ data: { ownerId: testUserId, type: 'PHOTO', originalStorageKey: `u/${testUserId}/social`, mime: 'image/png', byteSize: 10, state: 'READY' } })
    const publication = await req('POST', '/media-publications', { mediaId: media.id, audience: 'GROUP', groupId, occurrenceKey })
    expect(publication.statusCode).toBe(201)
    const publicationId = publication.json().data.id
    const mediaUrl = `/media/${media.id}/url?publicationId=${publicationId}`
    const shared = (await req('GET', `/groups/${groupId}/media?occurrenceKey=${encodeURIComponent(occurrenceKey)}`, undefined, testOtherUserId)).json().data
    expect(shared).toEqual([expect.objectContaining({ publicationId, owner: expect.objectContaining({ id: testUserId }) })])
    const bobOccurrence = (await req('GET', `/calendar-items/${bob.id}/occurrence`, undefined, testOtherUserId)).json().data
    expect(bobOccurrence.sharedMedia[0].publicationId).toBe(publicationId)
    const legs = bobItems.find((i) => i.title === 'Leg Raises')
    expect((await req('GET', `/calendar-items/${legs.id}/occurrence`, undefined, testOtherUserId)).json().data.sharedMedia).toEqual([])
    expect((await req('GET', mediaUrl, undefined, testOtherUserId)).statusCode).toBe(200)

    const replacement = await issue(testUserId, true)
    expect(replacement.statusCode).toBe(201)
    for (const old of [token, tokenOf(memberLink)]) expect((await req('GET', `/group-invitations/${old}`)).statusCode).toBe(404)
    expect((await req('GET', `/groups/${groupId}`, undefined, testOtherUserId)).statusCode).toBe(200)
    const newMemberLink = await issue(testOtherUserId)
    await req('PATCH', `/groups/${groupId}`, { memberLinkSharingEnabled: false })
    expect((await req('GET', `/group-invitations/${tokenOf(newMemberLink)}`)).statusCode).toBe(404)
    expect((await issue(testOtherUserId)).statusCode).toBe(403)
    expect((await req('GET', `/group-invitations/${tokenOf(replacement)}`)).statusCode).toBe(200)
    expect((await req('DELETE', `/groups/${groupId}/members/${testOtherUserId}`)).statusCode).toBe(200)
    expect((await req('GET', `/groups/${groupId}/media`, undefined, testOtherUserId)).statusCode).toBe(404)
    expect((await req('GET', mediaUrl, undefined, testOtherUserId)).statusCode).toBe(404)
    expect((await req('POST', `/completion-shares/${feed[0].id}/reactions`, { emoji: '🔥' }, testOtherUserId)).statusCode).toBe(404)
    expect((await req('GET', `/calendar-items/${bob.id}/occurrence`, undefined, testOtherUserId)).json().data).toMatchObject({ collaborators: null, sharedMedia: [] })
    expect((await dayOne(testOtherUserId)).find((i) => i.id === bob.id)).toBeDefined()
    expect((await req('POST', `/group-invitations/${tokenOf(replacement)}/accept`, {}, testOtherUserId)).statusCode).toBe(404)
    await req('PATCH', `/groups/${groupId}`, { joinLinkEnabled: false })
    expect((await req('GET', `/group-invitations/${tokenOf(replacement)}`)).statusCode).toBe(404)
  })
})

describe('public group discovery, join policies, Starting Soon, and direct joining', () => {
  it('preserves private groups, enforces visibility/joinPolicy permissions, and hides member details from public endpoints', async () => {
    pinToday('2026-11-09T18:00:00Z')
    onTestFinished(unpinToday)

    const { programId, versionId } = await challenge()
    // Default group is PRIVATE + INVITE_ONLY and never exposed in discovery.
    const priv = await req('POST', '/groups', { programVersionId: versionId, name: 'Secret Crew', mode: 'SYNC' })
    expect(priv.statusCode).toBe(201)
    expect(priv.json().data).toMatchObject({ visibility: 'PRIVATE', joinPolicy: 'INVITE_ONLY' })
    expect((await app.inject({ method: 'GET', url: `/programs/${programId}/groups` })).json().data).toEqual([])
    expect((await app.inject({ method: 'GET', url: `/groups/${priv.json().data.id}/preview` })).statusCode).toBe(404)

    // PRIVATE + OPEN is rejected; non-owner cannot update visibility/joinPolicy.
    expect((await req('POST', '/groups', { programVersionId: versionId, mode: 'ASYNC', visibility: 'PRIVATE', joinPolicy: 'OPEN' })).statusCode).toBe(400)
    await seedUser(carolId, 'carol')
    expect((await req('PATCH', `/groups/${priv.json().data.id}`, { visibility: 'PUBLIC' }, carolId)).statusCode).toBe(404)

    // Private program cannot host a PUBLIC group.
    const privProg = await challenge('PRIVATE')
    expect((await req('POST', '/groups', { programVersionId: privProg.versionId, mode: 'ASYNC', visibility: 'PUBLIC', joinPolicy: 'OPEN' })).statusCode).toBe(400)

    // Update Alice's group to PUBLIC + INVITE_ONLY -> visible in discovery, direct join blocked (403), invite still works.
    const updated = await req('PATCH', `/groups/${priv.json().data.id}`, { visibility: 'PUBLIC', joinPolicy: 'INVITE_ONLY' })
    expect(updated.statusCode).toBe(200)
    const listRes = await app.inject({ method: 'GET', url: `/programs/${programId}/groups` })
    expect(listRes.statusCode).toBe(200)
    await validateResponse('listProgramGroups', 200, listRes.json())
    expect(listRes.json().data).toEqual([
      expect.objectContaining({
        id: priv.json().data.id,
        name: 'Secret Crew',
        visibility: 'PUBLIC',
        joinPolicy: 'INVITE_ONLY',
        memberCount: 1,
        startLocalDate: '2026-11-09',
        startingSoon: true,
        viewerIsMember: false,
      }),
    ])
    // Never exposes members or emails in public list or preview.
    expect(JSON.stringify(listRes.json().data)).not.toContain('alice')
    const previewRes = await req('GET', `/groups/${priv.json().data.id}/preview`, undefined, testOtherUserId)
    expect(previewRes.statusCode).toBe(200)
    await validateResponse('getPublicGroupPreview', 200, previewRes.json())
    expect(previewRes.json().data).toMatchObject({ canJoin: false, join: { status: 'UNAVAILABLE' } })
    expect(JSON.stringify(previewRes.json().data)).not.toContain('alice@test.local')
    expect((await req('POST', `/groups/${priv.json().data.id}/join`, {}, testOtherUserId)).statusCode).toBe(403)
  })

  it('paginates discoverable groups, surfaces featuredGroup in /discover, and filters Starting Soon vs Happening Now', async () => {
    pinToday('2026-11-09T18:00:00Z')
    onTestFinished(unpinToday)

    // Program 1: Alice hosts a PUBLIC OPEN SYNC group starting in 3 days (Starting Soon) + Carol hosts a PUBLIC OPEN ASYNC group (no scheduled start).
    let ws1 = (await req('POST', '/programs', { programTypeId: cat.workout.id })).json().data
    ws1 = (await req('POST', `/programs/${ws1.id}/draft/activities`, { activityIds: [cat.squats.activity.id], expectedRevision: ws1.draftRevision })).json().data
    ws1 = (await req('PATCH', `/programs/${ws1.id}/draft`, { title: 'Strength Starting Soon', durationDays: 14, frequency: { kind: 'DAILY' }, expectedRevision: ws1.draftRevision })).json().data
    const pub1 = (await req('POST', `/programs/${ws1.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws1.draftRevision })).json().data
    const v1 = pub1.latestPublishedVersionId

    const gSoon = await req('POST', '/groups', { programVersionId: v1, name: 'Nov 12 Cohort', mode: 'SYNC', visibility: 'PUBLIC', joinPolicy: 'OPEN', startLocalDate: '2026-11-12', timezone: 'America/Chicago' })
    expect(gSoon.statusCode).toBe(201)

    await seedUser(carolId, 'carol')
    await req('POST', `/programs/${ws1.id}/enrollments`, { programVersionId: v1, startLocalDate: '2026-11-09', timezone: 'America/Chicago', idempotencyKey: key() }, carolId)
    const gAsync = await req('POST', '/groups', { programVersionId: v1, name: 'Anytime Crew', mode: 'ASYNC', visibility: 'PUBLIC', joinPolicy: 'OPEN' }, carolId)
    expect(gAsync.statusCode).toBe(201)

    // Program 2: Bob hosts only an ASYNC public group (no scheduled start -> excluded from Starting Soon).
    let ws2 = (await req('POST', '/programs', { programTypeId: cat.workout.id }, testOtherUserId)).json().data
    ws2 = (await req('POST', `/programs/${ws2.id}/draft/activities`, { activityIds: [cat.legRaises.activity.id], expectedRevision: ws2.draftRevision }, testOtherUserId)).json().data
    ws2 = (await req('PATCH', `/programs/${ws2.id}/draft`, { title: 'Flex Only Plan', durationDays: 7, frequency: { kind: 'DAILY' }, expectedRevision: ws2.draftRevision }, testOtherUserId)).json().data
    const pub2 = (await req('POST', `/programs/${ws2.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws2.draftRevision }, testOtherUserId)).json().data
    await req('POST', `/programs/${ws2.id}/enrollments`, { programVersionId: pub2.latestPublishedVersionId, startLocalDate: '2026-11-09', timezone: 'America/Chicago', idempotencyKey: key() }, testOtherUserId)
    await req('POST', '/groups', { programVersionId: pub2.latestPublishedVersionId, name: 'Flex Group', mode: 'ASYNC', visibility: 'PUBLIC', joinPolicy: 'OPEN' }, testOtherUserId)

    // Paginated GET /programs/:id/groups (limit=1)
    const page1 = await app.inject({ method: 'GET', url: `/programs/${ws1.id}/groups?limit=1` })
    expect(page1.statusCode).toBe(200)
    await validateResponse('listProgramGroups', 200, page1.json())
    expect(page1.json().data).toHaveLength(1)
    expect(page1.json().data[0].name).toBe('Nov 12 Cohort')
    expect(page1.json().meta.hasMore).toBe(true)
    const page2 = await app.inject({ method: 'GET', url: `/programs/${ws1.id}/groups?limit=1&cursor=${encodeURIComponent(page1.json().meta.nextCursor)}` })
    expect(page2.json().data).toHaveLength(1)
    expect(page2.json().data[0].name).toBe('Anytime Crew')
    expect(page2.json().meta.hasMore).toBe(false)

    // /discover?kind=PROGRAM includes featuredGroup; STARTING_SOON filters to programs with an upcoming scheduled group.
    const allDiscover = await app.inject({ method: 'GET', url: '/discover?kind=PROGRAM' })
    expect(allDiscover.statusCode).toBe(200)
    await validateResponse('discover', 200, allDiscover.json())
    expect(allDiscover.json().data).toHaveLength(2)
    expect(allDiscover.json().data.find((d: any) => d.program.id === ws1.id).featuredGroup).toMatchObject({
      id: gSoon.json().data.id,
      name: 'Nov 12 Cohort',
      startLocalDate: '2026-11-12',
      startingSoon: true,
    })

    const soonDiscover = await app.inject({ method: 'GET', url: '/discover?kind=PROGRAM&timing=STARTING_SOON' })
    expect(soonDiscover.statusCode).toBe(200)
    expect(soonDiscover.json().data.map((d: any) => d.program.id)).toEqual([ws1.id])

    // HAPPENING_NOW does not fabricate live activity from active enrollments.
    const liveDiscover = await app.inject({ method: 'GET', url: '/discover?kind=PROGRAM&timing=HAPPENING_NOW' })
    expect(liveDiscover.statusCode).toBe(200)
    expect(liveDiscover.json().data).toEqual([])
  })

  it('direct joining open groups never duplicates enrollments or calendar items, and repeat runs keep group membership', async () => {
    pinToday('2026-11-09T18:00:00Z')
    onTestFinished(unpinToday)

    const { programId, versionId } = await challenge()
    const g = (await req('POST', '/groups', { programVersionId: versionId, name: 'Open Sync', mode: 'SYNC', visibility: 'PUBLIC', joinPolicy: 'OPEN' })).json().data

    // 1. Unauthenticated preview still loads public summary with SIGN_IN_REQUIRED; Carol joins directly with schedule confirmation -> 1 enrollment, 1 calendar schedule, replay safe.
    const previewAnon = await req('GET', `/groups/${g.id}/preview`, undefined, carolId)
    expect(previewAnon.statusCode).toBe(200)
    expect(previewAnon.json().data.join.status).toBe('SIGN_IN_REQUIRED')
    await seedUser(carolId, 'carol')
    const carolPreview = await req('GET', `/groups/${g.id}/preview`, undefined, carolId)
    expect(carolPreview.json().data.join.status).toBe('CONFIRM_ENROLLMENT')
    const joinKey = key()
    const join1 = await req('POST', `/groups/${g.id}/join`, { enrollment: { timezone: 'America/Chicago', idempotencyKey: joinKey } }, carolId)
    expect(join1.statusCode).toBe(200)
    await validateResponse('joinGroup', 200, join1.json())
    expect(join1.json().data.memberCount).toBe(2)
    const carolItemsAfterJoin = await db.calendarItem.count({ where: { ownerId: carolId } })
    expect(carolItemsAfterJoin).toBeGreaterThan(0)
    // Replay does not duplicate enrollment or calendar items.
    const joinReplay = await req('POST', `/groups/${g.id}/join`, { enrollment: { timezone: 'America/Chicago', idempotencyKey: joinKey } }, carolId)
    expect(joinReplay.statusCode).toBe(200)
    expect(await db.programEnrollment.count({ where: { userId: carolId, programId } })).toBe(1)
    expect(await db.calendarItem.count({ where: { ownerId: carolId } })).toBe(carolItemsAfterJoin)

    // 2. Bob is already enrolled independently -> joining links existing enrollment without duplicating enrollments or calendar entries.
    await req('POST', `/programs/${programId}/enrollments`, { programVersionId: versionId, startLocalDate: '2026-11-11', timezone: 'America/Chicago', idempotencyKey: key() }, testOtherUserId)
    const bobItemsBefore = await db.calendarItem.findMany({ where: { ownerId: testOtherUserId }, orderBy: { id: 'asc' } })
    const bobPreview = await req('GET', `/groups/${g.id}/preview`, undefined, testOtherUserId)
    expect(bobPreview.json().data.join).toMatchObject({ status: 'READY_TO_JOIN', startDateDiffers: true })
    const bobJoin = await req('POST', `/groups/${g.id}/join`, {}, testOtherUserId)
    expect(bobJoin.statusCode).toBe(200)
    expect(await db.programEnrollment.count({ where: { userId: testOtherUserId, programId } })).toBe(1)
    const bobItemsAfter = await db.calendarItem.findMany({ where: { ownerId: testOtherUserId }, orderBy: { id: 'asc' } })
    expect(bobItemsAfter.map((i) => [i.id, i.localDate.toISOString()])).toEqual(bobItemsBefore.map((i) => [i.id, i.localDate.toISOString()]))
    expect(bobItemsAfter.every((i) => i.groupOccurrenceKey !== null)).toBe(true)

    // 3. Repeat Program run via "Run It Again" (POST /programs/:id/enrollments without groupId) preserves Group membership without creating a second GroupMember.
    const repeatRun = await req('POST', `/programs/${programId}/enrollments`, { programVersionId: versionId, startLocalDate: '2026-11-09', timezone: 'America/Chicago', idempotencyKey: key() }, carolId)
    expect(repeatRun.statusCode).toBe(201)
    expect(repeatRun.json().data.groupId).toBe(g.id)
    expect(await db.groupMember.count({ where: { groupId: g.id, userId: carolId } })).toBe(1)

    // 4. Removed member cannot rejoin directly via open public join (must be invited by owner).
    await req('DELETE', `/groups/${g.id}/members/${testOtherUserId}`)
    expect((await req('GET', `/groups/${g.id}/preview`, undefined, testOtherUserId)).json().data.join.status).toBe('UNAVAILABLE')
    expect((await req('POST', `/groups/${g.id}/join`, {}, testOtherUserId)).statusCode).toBe(404)
  })
})

describe('createCheckIns', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'createCheckIns')
  })
})

describe('listCompletionComments', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listCompletionComments')
  })
})

describe('addCompletionComment', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'addCompletionComment')
  })
})

describe('deleteCompletionComment', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'deleteCompletionComment')
  })
})

describe('Check-in centered Groups, multi-group sharing, media, comments, and Stage themes', () => {
  it('enforces real Activity completion, shares one check-in to multiple groups without duplicate completions, and protects private check-in discussion', async () => {
    await seedUser(carolId, 'carol')
    const { programId, versionId } = await challenge()
    const { activityId } = await db.programScheduleItem.findFirstOrThrow({
      where: { programVersionId: versionId },
      select: { activityId: true },
    })

    // Two groups Alice belongs to (Alice hosts one public group on program 1 and one on program 2)
    const g1 = (await req('POST', '/groups', { programVersionId: versionId, name: 'Crew One', mode: 'ASYNC', visibility: 'PUBLIC', joinPolicy: 'OPEN' })).json().data
    const cat = await req('GET', '/catalog/program-types')
    const p2 = (await req('POST', '/programs', { programTypeId: cat.json().data[0].id })).json().data
    await req('POST', `/programs/${p2.id}/draft/activities`, { activityIds: [activityId], expectedRevision: p2.draftRevision })
    const p2Pub = (await req('POST', `/programs/${p2.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: p2.draftRevision + 1 })).json().data
    const g2 = (await req('POST', '/groups', { programVersionId: p2Pub.latestPublishedVersionId, name: 'Crew Two', mode: 'ASYNC', visibility: 'PRIVATE', joinPolicy: 'INVITE_ONLY' })).json().data

    // Carol joins open group g1 in one click without creating a Program run
    const carolJoin = await req('POST', `/groups/${g1.id}/join`, {}, carolId)
    expect(carolJoin.statusCode).toBe(200)
    expect(await db.programEnrollment.count({ where: { userId: carolId, programId } })).toBe(0)

    // Cannot check in before completing the Activity (no arbitrary status posts)
    const uncompletedAttempt = await req('POST', '/check-ins', {
      activityId,
      groupIds: [g1.id],
      note: 'Fake post',
    })
    expect(uncompletedAttempt.statusCode).toBe(400)

    // Alice enrolls & completes the Activity once on her personal Calendar
    const en = (await req('POST', `/programs/${programId}/enrollments`, {
      programVersionId: versionId,
      startLocalDate: '2026-11-09',
      timezone: 'America/Chicago',
      idempotencyKey: key(),
    })).json().data
    const calItem = await db.calendarItem.findFirstOrThrow({ where: { enrollmentId: en.id, activityId } })
    const sess = (await req('POST', '/sessions', { calendarItemId: calItem.id, idempotencyKey: key() })).json().data
    await req('POST', `/sessions/${sess.id}/actions`, { action: 'FINISH', expectedRevision: sess.revision })

    const itemsBeforeCheckIn = await db.calendarItem.count({ where: { ownerId: testUserId } })
    // Share one check-in across BOTH groups (g1 & g2) with a note (zero duplicate calendar items)
    const multi = await req('POST', '/check-ins', {
      activityId,
      groupIds: [g1.id, g2.id],
      calendarItemId: calItem.id,
      note: 'Morning jog felt steady!',
    })
    expect(multi.statusCode).toBe(201)
    expect(multi.json().data).toHaveLength(2)
    expect(await db.calendarItem.count({ where: { ownerId: testUserId } })).toBe(itemsBeforeCheckIn)

    // Standalone/repeat check-in without calendarItemId also supported once Activity has been completed
    const repeatCheckIn = await req('POST', '/check-ins', {
      activityId,
      groupIds: [g1.id],
      note: 'Second round!',
    })
    expect(repeatCheckIn.statusCode).toBe(201)

    // Check-ins & comments respect Group privacy: Carol (in g1 only) sees g1 share, can comment on g1, CANNOT access private g2 share or comments
    const g1Feed = await req('GET', `/groups/${g1.id}/completions`, undefined, carolId)
    expect(g1Feed.statusCode).toBe(200)
    expect(g1Feed.json().data.some((s: any) => s.note === 'Morning jog felt steady!')).toBe(true)
    const g1ShareId = g1Feed.json().data[0].id
    const g2ShareId = multi.json().data.find((s: any) => s.groupId === g2.id).id

    const cAdd = await req('POST', `/completion-shares/${g1ShareId}/comments`, { body: 'Way to go!', idempotencyKey: key() }, carolId)
    expect(cAdd.statusCode).toBe(201)
    expect((await req('GET', `/completion-shares/${g2ShareId}/comments`, undefined, carolId)).statusCode).toBe(404)
    expect((await req('POST', `/completion-shares/${g2ShareId}/comments`, { body: 'Snooping' }, carolId)).statusCode).toBe(404)

    // Theme persists & recentCheckInCount is reported accurately in preview & discovery
    const themed = await req('PATCH', `/groups/${g1.id}`, { stageTheme: 'sprout' })
    expect(themed.statusCode).toBe(200)
    expect(themed.json().data.stageTheme).toBe('sprout')
    const preview = await req('GET', `/groups/${g1.id}/preview`, undefined, carolId)
    expect(preview.json().data.recentCheckInCount).toBeGreaterThanOrEqual(1)
  })
})
