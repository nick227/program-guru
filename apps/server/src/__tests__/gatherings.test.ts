// Standalone Activity gatherings (10-COLLABORATION §9): the complete two-person journey
// (create → discover → join → Calendar → participation → leave), repeat-safety and reuse,
// independence of personal scheduling, refusals, and changes after joining.
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@project/db'
import { asAuth, buildTestApp, seedUser, testOtherUserId, testUserId, validateResponse } from './helpers'
import { carolId, contractCase } from './helpers/contract'
import { seedAchievements, seedCatalog, seedPlace } from './helpers/fixtures'

const app = buildTestApp()
const alice = testUserId
const bob = testOtherUserId
const carol = carolId
let cat: Awaited<ReturnType<typeof seedCatalog>>
let barton: Awaited<ReturnType<typeof seedPlace>>
beforeEach(async () => {
  cat = await seedCatalog()
  await seedAchievements()
  await seedUser(carol, 'carol')
  barton = await seedPlace()
  await db.activity.update({ where: { id: cat.squats.activity.id }, data: { placeId: barton.id } })
  // Bob lives an hour ahead of Alice: the same gathering moment is 15:00 for him.
  await db.userPreference.update({ where: { userId: bob }, data: { timezone: 'America/New_York' } })
})

let n = 0
const key = () => `gathering-key-${++n}-${Date.now()}`
const req = (userId: string | null, method: string, url: string, payload?: unknown) =>
  app.inject({ method: method as any, url, headers: userId ? asAuth(userId) : {}, ...(payload !== undefined ? { payload: payload as any } : {}) })
const ok = async (userId: string | null, method: string, url: string, payload?: unknown) => {
  const res = await req(userId, method, url, payload)
  if (res.statusCode >= 300) throw new Error(`${method} ${url} → ${res.statusCode}: ${res.body}`)
  return res.json().data
}
const DATE = '2027-03-06'
const create = (userId: string, body: Record<string, unknown> = {}) =>
  ok(userId, 'POST', `/activities/${cat.squats.activity.id}/gatherings`, { localDate: DATE, localTime: '14:00', idempotencyKey: key(), ...body })
const occurrence = (userId: string, itemId: string) => ok(userId, 'GET', `/calendar-items/${itemId}/occurrence`)
const memberIds = (occ: { collaborators: { members: { user: { id: string } }[] } | null }) =>
  (occ.collaborators?.members ?? []).map((m) => m.user.id).sort()

describe('two-person journey (10 §9.9)', () => {
  it('create → private discovery → link → join → Calendar → room → session → public → leave', async () => {
    // Create a time: private and invite-only by default, on Alice's Calendar at the Activity's Place.
    const created = await create(alice)
    await validateResponse('createGathering', 201, { data: created })
    const g = created.gathering
    expect(g).toMatchObject({ visibility: 'PRIVATE', joinPolicy: 'INVITE_ONLY', localDate: DATE, localTime: '14:00', timezone: 'America/Chicago', memberCount: 1, viewerIsOwner: true, viewerCalendarItemId: created.calendarItemId })
    expect(g.place.id).toBe(barton.id)
    const aliceItem = await db.calendarItem.findUniqueOrThrow({ where: { id: created.calendarItemId } })
    expect(aliceItem).toMatchObject({ gatheringId: g.id, groupOccurrenceKey: `gathering:${g.id}`, localTime: '14:00', placeId: barton.id, enrollmentId: null })

    // Private: invisible without the link.
    expect((await req(bob, 'GET', `/gatherings/${g.id}`)).statusCode).toBe(404)
    expect(await ok(bob, 'GET', `/activities/${cat.squats.activity.id}/gatherings`)).toEqual([])
    expect((await ok(alice, 'GET', `/activities/${cat.squats.activity.id}/gatherings`)).map((x: { id: string }) => x.id)).toEqual([g.id])
    expect((await req(bob, 'POST', `/gatherings/${g.id}/join`, { idempotencyKey: key() })).statusCode).toBe(404)

    // Share link for this exact occurrence; Bob opens it and joins in one operation.
    const link = await ok(alice, 'POST', `/gatherings/${g.id}/link`)
    const invite = new URL(link.url).searchParams.get('invite')!
    expect(new URL(link.url).pathname).toBe(`/gatherings/${g.id}`)
    expect((await ok(bob, 'GET', `/gatherings/${g.id}?invite=${encodeURIComponent(invite)}`)).viewerIsMember).toBe(false)
    const joinKey = key()
    const joined = await ok(bob, 'POST', `/gatherings/${g.id}/join`, { invite, idempotencyKey: joinKey })
    await validateResponse('joinGathering', 200, { data: joined })
    expect(joined.gathering).toMatchObject({ memberCount: 2, viewerIsMember: true, viewerCalendarItemId: joined.calendarItemId })
    // Same moment in Bob's timezone, same Place.
    const bobItem = await db.calendarItem.findUniqueOrThrow({ where: { id: joined.calendarItemId } })
    expect(bobItem).toMatchObject({ gatheringId: g.id, localTime: '15:00', placeId: barton.id })
    expect(bobItem.scheduledAtUtc?.toISOString()).toBe(aliceItem.scheduledAtUtc?.toISOString())

    // Repeat-safe: a replay returns the same item; the same key with another payload is a conflict.
    expect((await ok(bob, 'POST', `/gatherings/${g.id}/join`, { invite, idempotencyKey: joinKey })).calendarItemId).toBe(joined.calendarItemId)
    expect((await req(bob, 'POST', `/gatherings/${g.id}/join`, { idempotencyKey: joinKey })).statusCode).toBe(409)
    expect(await db.calendarItem.count({ where: { ownerId: bob, activityId: cat.squats.activity.id } })).toBe(1)

    // The existing occurrence room shows both members for both of them.
    expect(memberIds(await occurrence(alice, aliceItem.id))).toEqual([alice, bob].sort())
    expect(memberIds(await occurrence(bob, bobItem.id))).toEqual([alice, bob].sort())
    const tiles = await ok(bob, 'GET', '/calendar/items?start=2027-03-06&end=2027-03-06')
    expect(tiles[0]).toMatchObject({ gatheringId: g.id, groupName: 'Squats gathering', place: { id: barton.id } })

    // Bob starts: Alice sees him active (session records, not presence). Finishing shares completion.
    const s = await ok(bob, 'POST', '/sessions', { calendarItemId: bobItem.id, idempotencyKey: key() })
    const started = await ok(bob, 'POST', `/sessions/${s.id}/actions`, { action: 'START', expectedRevision: s.revision })
    expect((await ok(alice, 'GET', `/gatherings/${g.id}`)).activeCount).toBe(1)
    await ok(bob, 'POST', `/sessions/${s.id}/actions`, { action: 'FINISH', expectedRevision: (started.session ?? started).revision })
    const shares = await db.completionShare.findMany({ where: { groupId: g.id, revokedAt: null } })
    expect(shares).toMatchObject([{ userId: bob, occurrenceKey: `gathering:${g.id}`, calendarItemId: bobItem.id }])
    const aliceRoom = await occurrence(alice, aliceItem.id)
    expect(aliceRoom.collaborators.members.find((m: { user: { id: string } }) => m.user.id === bob).status).toBe('DONE')
    expect((await ok(alice, 'GET', `/gatherings/${g.id}`)).completedCount).toBe(1)

    // Listing publicly makes it discoverable: Activity list, With others, upcoming and Happening Now.
    await ok(alice, 'PATCH', `/gatherings/${g.id}`, { listPublicly: true })
    expect((await ok(null, 'GET', `/activities/${cat.squats.activity.id}/gatherings`)).map((x: { id: string }) => x.id)).toEqual([g.id])
    const withOthers = await ok(null, 'GET', '/discover?kind=ACTIVITY&hasOpenGathering=true')
    expect(withOthers.map((r: { activity: { id: string } }) => r.activity.id)).toEqual([cat.squats.activity.id])
    expect((await ok(null, 'GET', '/gatherings?when=UPCOMING&locality=Austin')).map((x: { id: string }) => x.id)).toEqual([g.id])
    expect(await ok(null, 'GET', '/gatherings?when=NOW')).toEqual([])
    const as = await ok(alice, 'POST', '/sessions', { calendarItemId: aliceItem.id, idempotencyKey: key() })
    await ok(alice, 'POST', `/sessions/${as.id}/actions`, { action: 'START', expectedRevision: as.revision })
    expect((await ok(null, 'GET', '/gatherings?when=NOW')).map((x: { id: string; activeCount: number }) => [x.id, x.activeCount])).toEqual([[g.id, 1]])

    // Leave: Bob's item stays on his Calendar as a personal occurrence; the room shows one member.
    const left = await ok(bob, 'POST', `/gatherings/${g.id}/leave`)
    expect(left.calendarItemId).toBe(bobItem.id)
    expect(await db.calendarItem.findUniqueOrThrow({ where: { id: bobItem.id } })).toMatchObject({ gatheringId: null, groupOccurrenceKey: null, status: 'DONE' })
    expect(memberIds(await occurrence(alice, aliceItem.id))).toEqual([alice])
    expect((await occurrence(bob, bobItem.id)).collaborators).toBeNull()
  }, 30000)
})

describe('personal scheduling stays independent; joining reuses compatible items', () => {
  it('two people scheduling the same Activity at the same time are never linked', async () => {
    const a = (await ok(alice, 'POST', '/calendar/items', { activityId: cat.squats.activity.id, localDate: DATE, localTime: '14:00', idempotencyKey: key() })).item
    const c = (await ok(carol, 'POST', '/calendar/items', { activityId: cat.squats.activity.id, localDate: DATE, localTime: '14:00', idempotencyKey: key() })).item
    expect(a.gatheringId).toBeNull()
    expect((await occurrence(alice, a.id)).collaborators).toBeNull()
    expect((await occurrence(carol, c.id)).collaborators).toBeNull()
  })

  it('joining links a compatible personal item instead of adding a second; leaving keeps it PLANNED', async () => {
    const { gathering } = await create(alice, { listPublicly: true })
    const mine = (await ok(carol, 'POST', '/calendar/items', { activityId: cat.squats.activity.id, localDate: DATE, idempotencyKey: key() })).item
    const joined = await ok(carol, 'POST', `/gatherings/${gathering.id}/join`, { idempotencyKey: key() })
    expect(joined.calendarItemId).toBe(mine.id)
    expect(await db.calendarItem.count({ where: { ownerId: carol } })).toBe(1)
    expect(await db.calendarItem.findUniqueOrThrow({ where: { id: mine.id } })).toMatchObject({ gatheringId: gathering.id, localTime: '14:00' })
    await ok(carol, 'POST', `/gatherings/${gathering.id}/leave`)
    expect(await db.calendarItem.findUniqueOrThrow({ where: { id: mine.id } })).toMatchObject({ gatheringId: null, status: 'PLANNED' })
  })

  it('create can turn the creator’s own item into the gathering', async () => {
    const mine = (await ok(alice, 'POST', '/calendar/items', { activityId: cat.squats.activity.id, localDate: '2027-03-01', idempotencyKey: key() })).item
    const created = await create(alice, { calendarItemId: mine.id })
    expect(created.calendarItemId).toBe(mine.id)
    expect(await db.calendarItem.findUniqueOrThrow({ where: { id: mine.id } })).toMatchObject({ gatheringId: created.gathering.id, localTime: '14:00' })
    const bobs = (await ok(bob, 'POST', '/calendar/items', { activityId: cat.squats.activity.id, localDate: '2027-03-01', idempotencyKey: key() })).item
    expect((await req(alice, 'POST', `/activities/${cat.squats.activity.id}/gatherings`, { localDate: DATE, calendarItemId: bobs.id, idempotencyKey: key() })).statusCode).toBe(400)
  })
})

describe('refusals', () => {
  it('full, past, closed, blocked owner, private Activity and public listing of a non-public Activity', async () => {
    const small = (await create(alice, { listPublicly: true, capacity: 1 })).gathering
    expect((await req(bob, 'POST', `/gatherings/${small.id}/join`, { idempotencyKey: key() })).statusCode).toBe(409)
    expect((await ok(bob, 'GET', `/gatherings/${small.id}`)).isFull).toBe(true)

    expect((await req(alice, 'POST', `/activities/${cat.squats.activity.id}/gatherings`, { localDate: '2020-01-01', idempotencyKey: key() })).statusCode).toBe(400)

    const open = (await create(alice, { listPublicly: true })).gathering
    await ok(alice, 'PATCH', `/gatherings/${open.id}`, { close: true })
    expect((await req(bob, 'POST', `/gatherings/${open.id}/join`, { idempotencyKey: key() })).statusCode).toBe(404)

    const blockedOne = (await create(alice, { listPublicly: true })).gathering
    await ok(alice, 'POST', `/blocked-users/${carol}`)
    expect((await req(carol, 'GET', `/gatherings/${blockedOne.id}`)).statusCode).toBe(404)
    expect((await req(carol, 'POST', `/gatherings/${blockedOne.id}/join`, { idempotencyKey: key() })).statusCode).toBe(404)

    await db.activity.update({ where: { id: cat.legRaises.activity.id }, data: { visibility: 'PRIVATE' } })
    expect((await req(alice, 'POST', `/activities/${cat.legRaises.activity.id}/gatherings`, { localDate: DATE, idempotencyKey: key() })).statusCode).toBe(400)
    await db.activity.update({ where: { id: cat.legRaises.activity.id }, data: { visibility: 'UNLISTED' } })
    expect((await req(alice, 'POST', `/activities/${cat.legRaises.activity.id}/gatherings`, { localDate: DATE, listPublicly: true, idempotencyKey: key() })).statusCode).toBe(400)
    expect((await req(alice, 'POST', `/activities/${cat.legRaises.activity.id}/gatherings`, { localDate: DATE, idempotencyKey: key() })).statusCode).toBe(201)

    // Only the owner changes it; capacity below the member count is refused.
    const two = (await create(alice, { listPublicly: true })).gathering
    await ok(bob, 'POST', `/gatherings/${two.id}/join`, { idempotencyKey: key() })
    expect((await req(bob, 'PATCH', `/gatherings/${two.id}`, { localTime: '09:00' })).statusCode).toBe(403)
    expect((await req(alice, 'PATCH', `/gatherings/${two.id}`, { capacity: 1 })).statusCode).toBe(400)
  })
})

describe('changes after joining never silently claim participation (10 §9.6)', () => {
  it('a member moving their item leaves; the owner moving the gathering moves linked items; closing keeps them', async () => {
    const { gathering: g } = await create(alice, { listPublicly: true })
    const bobJoin = await ok(bob, 'POST', `/gatherings/${g.id}/join`, { idempotencyKey: key() })
    const carolJoin = await ok(carol, 'POST', `/gatherings/${g.id}/join`, { idempotencyKey: key() })

    // Bob re-times his own item: he leaves the gathering, keeps his item at his new time.
    const bobItem = await db.calendarItem.findUniqueOrThrow({ where: { id: bobJoin.calendarItemId } })
    await ok(bob, 'PATCH', `/calendar-items/${bobItem.id}`, { localTime: '18:00', expectedUpdatedAt: bobItem.updatedAt.toISOString() })
    expect(await db.calendarItem.findUniqueOrThrow({ where: { id: bobItem.id } })).toMatchObject({ gatheringId: null, localTime: '18:00' })
    expect((await db.groupMember.findUniqueOrThrow({ where: { groupId_userId: { groupId: g.id, userId: bob } } })).status).toBe('LEFT')

    // Alice moves the gathering: Carol's still-linked item moves with it; Bob's personal item does not.
    await ok(alice, 'PATCH', `/gatherings/${g.id}`, { localTime: '16:30', placeId: null })
    expect(await db.calendarItem.findUniqueOrThrow({ where: { id: carolJoin.calendarItemId } })).toMatchObject({ localTime: '16:30', placeId: null, gatheringId: g.id })
    expect((await db.calendarItem.findUniqueOrThrow({ where: { id: bobItem.id } })).localTime).toBe('18:00')

    // Cancelling one's own item also leaves.
    await ok(carol, 'DELETE', `/calendar-items/${carolJoin.calendarItemId}`)
    expect((await db.groupMember.findUniqueOrThrow({ where: { groupId_userId: { groupId: g.id, userId: carol } } })).status).toBe('LEFT')

    // Closing keeps the owner's item as a personal occurrence.
    const owner = await ok(alice, 'GET', `/gatherings/${g.id}`)
    await ok(alice, 'PATCH', `/gatherings/${g.id}`, { close: true })
    expect(await db.calendarItem.findUniqueOrThrow({ where: { id: owner.viewerCalendarItemId } })).toMatchObject({ gatheringId: null, status: 'PLANNED' })
  })
})

describe('contract cases', () => {
  for (const op of ['listActivityGatherings', 'createGathering', 'listGatherings', 'getGathering', 'updateGathering', 'joinGathering', 'leaveGathering', 'createGatheringLink']) {
    it(`${op} matches the contract`, async () => {
      await contractCase(app, op)
    })
  }
})
