// Late joiners, adherence, shared-media retention and withdrawal (10-COLLABORATION.md §3,
// 09-CALENDARS.md §4.11), over real HTTP against an ephemeral port.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type { AddressInfo } from 'net'
import { db } from '@project/db'
import { buildTestApp, seedUser, validateResponse, testUserId as alice, testOtherUserId as bob } from './helpers'
import { seedAchievements, seedCatalog } from './helpers/fixtures'
import { addDays, todayIn, toDbDate } from '../lib/time'
import { programStats } from '../worker/jobs'

const app = buildTestApp()
const carol = '00000000-0000-4000-8000-0000000000c2'
const TZ = 'America/Chicago'
let base = ''
let cat: Awaited<ReturnType<typeof seedCatalog>>
let n = 0
const key = () => `lj-${++n}-${Date.now()}`
const today = () => todayIn(TZ)

beforeAll(async () => {
  await app.instance.listen({ port: 0, host: '127.0.0.1' })
  base = `http://127.0.0.1:${(app.instance.server.address() as AddressInfo).port}`
})
beforeEach(async () => {
  cat = await seedCatalog()
  await seedAchievements()
  await seedUser(carol, 'carol')
})

async function http(userId: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(userId ? { authorization: `Bearer ${userId}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}
async function ok(userId: string | null, method: string, path: string, body?: unknown) {
  const res = await http(userId, method, path, body)
  if (res.status >= 300) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(res.body)}`)
  return res.body?.data
}

/**
 * Alice's daily Program that started `daysAgo` days ago, with a SYNC group on that start date. Alice
 * enrolled on the start date (simulated: her participation date and items are moved back).
 */
async function startedGroup(opts: { daysAgo: number; durationDays: number; activities?: string[] }) {
  const start = addDays(today(), -opts.daysAgo)
  let ws = await ok(alice, 'POST', '/programs', { programTypeId: cat.workout.id })
  ws = await ok(alice, 'POST', `/programs/${ws.id}/draft/activities`, { activityIds: opts.activities ?? [cat.squats.activity.id, cat.legRaises.activity.id], expectedRevision: ws.draftRevision })
  ws = await ok(alice, 'PATCH', `/programs/${ws.id}/draft`, { title: 'Daily', durationDays: opts.durationDays, frequency: { kind: 'DAILY' }, expectedRevision: ws.draftRevision })
  const versionId = (await ok(alice, 'POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision })).latestPublishedVersionId
  const mine = await ok(alice, 'POST', `/programs/${ws.id}/enrollments`, { programVersionId: versionId, startLocalDate: start, timezone: TZ, idempotencyKey: key() })
  await db.programEnrollment.update({ where: { id: mine.id }, data: { participationStartDate: toDbDate(start) } })
  await db.calendarItem.updateMany({ where: { enrollmentId: mine.id, status: 'NOT_PARTICIPATING' }, data: { status: 'PLANNED' } })
  const g = await ok(alice, 'POST', '/groups', { programVersionId: versionId, mode: 'SYNC' })
  return { programId: ws.id as string, versionId: versionId as string, groupId: g.id as string, start }
}
async function join(userId: string, groupId: string, handle: string) {
  const inv = await ok(alice, 'POST', `/groups/${groupId}/invitations`, { kind: 'USER', handle })
  return ok(userId, 'POST', `/users/me/group-invitations/${inv.id}/accept`, { enrollment: { timezone: TZ, idempotencyKey: key() } })
}
const itemsOf = (userId: string) => db.calendarItem.findMany({ where: { ownerId: userId, status: { not: 'CANCELLED' } }, orderBy: [{ localDate: 'asc' }, { activityId: 'asc' }] })
const itemOn = (userId: string, programDayIndex: number, activityId = cat.squats.activity.id) =>
  db.calendarItem.findFirstOrThrow({ where: { ownerId: userId, programDayIndex, activityId } })
async function finish(userId: string, itemId: string, reps = 10) {
  const s = await ok(userId, 'POST', '/sessions', { calendarItemId: itemId, idempotencyKey: key() })
  await ok(userId, 'POST', `/sessions/${s.id}/results`, { values: [{ metricDefinitionId: cat.reps.id, value: reps }] })
  await ok(userId, 'POST', `/sessions/${s.id}/actions`, { action: 'FINISH', expectedRevision: s.revision })
}

describe('late joiners keep the original schedule', () => {
  it('same dates and Program Days as the group; pre-join items read Not Participating, never Missed', async () => {
    const { groupId, start } = await startedGroup({ daysAgo: 5, durationDays: 10 })
    const joined = await join(bob, groupId, 'bob')
    expect(joined.myEnrollment).toMatchObject({ startLocalDate: start, startDateDiffers: false })
    const enrollment = await ok(bob, 'GET', `/enrollments/${joined.myEnrollment.enrollmentId}`)
    await validateResponse('getEnrollment', 200, { data: enrollment })
    expect(enrollment.participationStartDate).toBe(today())

    const [mine, hers] = [await itemsOf(bob), await itemsOf(alice)]
    expect(mine.map((i) => [i.localDate.toISOString(), i.programDayIndex, i.groupOccurrenceKey])).toEqual(hers.map((i) => [i.localDate.toISOString(), i.programDayIndex, i.groupOccurrenceKey]))
    const pre = mine.filter((i) => i.localDate < toDbDate(today()))
    expect(pre).toHaveLength(10) // 5 days × 2 Activities
    expect(pre.every((i) => i.status === 'NOT_PARTICIPATING')).toBe(true)
    expect(mine.filter((i) => i.localDate >= toDbDate(today())).every((i) => i.status === 'PLANNED')).toBe(true)
    // Over the API the week shows them as Not Participating.
    const week = await http(bob, 'GET', `/calendar/items?start=${start}&end=${addDays(start, 6)}`)
    await validateResponse('listCalendarItems', 200, week.body)
    expect(week.body.data.filter((i: any) => i.localDate < today()).map((i: any) => i.status)).toEqual(Array(10).fill('NOT_PARTICIPATING'))
    // Alice, who was there from day one, has ordinary items.
    expect(hers.some((i) => i.status === 'NOT_PARTICIPATING')).toBe(false)
  })

  it('the status is server-owned: restore, move, catch-up and undo re-derive it from the date', async () => {
    const { groupId } = await startedGroup({ daysAgo: 3, durationDays: 7 })
    await join(bob, groupId, 'bob')
    const day0 = await itemOn(bob, 0)
    const patch = (id: string, body: Record<string, unknown>) =>
      db.calendarItem.findUniqueOrThrow({ where: { id } }).then((i) => http(bob, 'PATCH', `/calendar-items/${id}`, { expectedUpdatedAt: i.updatedAt.toISOString(), ...body }))
    expect((await patch(day0.id, { status: 'NOT_PARTICIPATING' })).status).toBe(400)
    // Cancel then restore: back to Not Participating, not PLANNED (which would read Missed).
    expect((await patch(day0.id, { status: 'CANCELLED' })).status).toBe(200)
    expect((await patch(day0.id, { status: 'PLANNED' })).body.data.status).toBe('NOT_PARTICIPATING')
    // Moved onto a participating date it becomes an ordinary planned Activity.
    const moved = await patch(day0.id, { localDate: addDays(today(), 1) })
    expect(moved.body.data.status).toBe('PLANNED')

    // Catch-up on a pre-join date is allowed (personal log); undo returns it to Not Participating.
    const day1 = await itemOn(bob, 1)
    await finish(bob, day1.id)
    expect((await db.calendarItem.findUniqueOrThrow({ where: { id: day1.id } })).status).toBe('DONE')
    const undone = await ok(bob, 'POST', `/calendar-items/${day1.id}/undo-completion`)
    expect(undone.status).toBe('NOT_PARTICIPATING')
    // Results stay with Bob.
    expect(await db.resultEntry.count({ where: { session: { userId: bob, calendarItemId: day1.id } } })).toBe(1)
  })
})

describe('historical completion calculations exclude pre-join dates', () => {
  it('group row: a late joiner reads Not Participating and is left out of finished-of-total, even after a catch-up', async () => {
    const { groupId } = await startedGroup({ daysAgo: 3, durationDays: 7 })
    await join(bob, groupId, 'bob')
    await join(carol, groupId, 'carol')
    const aliceDay0 = await itemOn(alice, 0)
    await finish(alice, aliceDay0.id)
    const row = async () => (await ok(alice, 'GET', `/calendar-items/${aliceDay0.id}/occurrence`)).collaborators
    let c = await row()
    expect(Object.fromEntries(c.members.map((m: any) => [m.user.handle, m.status]))).toEqual({ alice: 'DONE', bob: 'NOT_PARTICIPATING', carol: 'NOT_PARTICIPATING' })
    expect([c.finishedCount, c.totalCount]).toEqual([1, 1])
    await finish(bob, (await itemOn(bob, 0)).id) // catch-up: real, shown, but not counted
    c = await row()
    expect(c.members.find((m: any) => m.user.handle === 'bob').status).toBe('DONE')
    expect([c.finishedCount, c.totalCount]).toEqual([1, 1])
    // Today everyone participates.
    const aliceToday = await itemOn(alice, 3)
    c = (await ok(alice, 'GET', `/calendar-items/${aliceToday.id}/occurrence`)).collaborators
    expect([c.finishedCount, c.totalCount]).toEqual([0, 3])
    expect(c.members.every((m: any) => m.status === 'PENDING')).toBe(true)
  })

  it('Program completion counts only participating dates', async () => {
    const { groupId } = await startedGroup({ daysAgo: 2, durationDays: 4, activities: [cat.squats.activity.id] })
    const joined = await join(bob, groupId, 'bob')
    // Bob joined on Program Day 2 of 4: finishing Days 2 and 3 completes the Program for him.
    await finish(bob, (await itemOn(bob, 2)).id)
    expect(await db.userAchievement.count({ where: { userId: bob, definition: { ruleKind: 'PROGRAM_COMPLETED' } } })).toBe(0)
    await finish(bob, (await itemOn(bob, 3)).id)
    expect(await db.userAchievement.count({ where: { userId: bob, definition: { ruleKind: 'PROGRAM_COMPLETED' }, revokedAt: null } })).toBe(1)
    expect((await db.programEnrollment.findUniqueOrThrow({ where: { id: joined.myEnrollment.enrollmentId } })).status).toBe('COMPLETED')
    // Alice, there from Day 0, has not completed: her Days 0–1 still count for her.
    expect(await db.userAchievement.count({ where: { userId: alice, definition: { ruleKind: 'PROGRAM_COMPLETED' } } })).toBe(0)
  })

  it('Program completion rate ignores pre-join dates, catch-ups included', async () => {
    const { programId, groupId } = await startedGroup({ daysAgo: 5, durationDays: 10 })
    await join(bob, groupId, 'bob')
    // Alice's 10 past items are due; she finished 5. Bob's 10 pre-join items are not due.
    const alicePast = (await itemsOf(alice)).filter((i) => i.localDate < toDbDate(today()))
    expect(alicePast).toHaveLength(10)
    for (const i of alicePast.slice(0, 5)) await finish(alice, i.id)
    await finish(bob, (await itemOn(bob, 0)).id) // a catch-up does not count either
    await finish(bob, (await itemOn(bob, 1)).id)
    await programStats()
    const stat = await db.programStat.findUniqueOrThrow({ where: { programId } })
    expect(Number(stat.completionRate)).toBeCloseTo(0.5)
  })
})

describe('shared media retention and withdrawal after leaving', () => {
  it('media stays visible to remaining members until its owner withdraws or deletes it', async () => {
    const { groupId } = await startedGroup({ daysAgo: 0, durationDays: 7 })
    await join(bob, groupId, 'bob')
    const occurrenceKey = (await itemOn(bob, 0)).groupOccurrenceKey
    const photo = (name: string) => db.mediaAsset.create({ data: { ownerId: bob, type: 'PHOTO', originalStorageKey: `u/${bob}/${name}`, mime: 'image/jpeg', byteSize: 10, state: 'READY' } })
    const [kept, deleted] = [await photo('kept'), await photo('deleted')]
    const pubKept = await ok(bob, 'POST', '/media-publications', { mediaId: kept.id, audience: 'GROUP', groupId, occurrenceKey })
    await ok(bob, 'POST', '/media-publications', { mediaId: deleted.id, audience: 'GROUP', groupId, occurrenceKey })
    await ok(alice, 'POST', `/media-publications/${pubKept.id}/comments`, { body: 'Nice', idempotencyKey: key() })

    await ok(bob, 'PATCH', `/groups/${groupId}/members/me`, { leave: true })
    expect((await http(bob, 'GET', `/groups/${groupId}/media`)).status).toBe(404) // Bob's group access ends
    const visible = async (who: string) => (await ok(who, 'GET', `/groups/${groupId}/media`)).map((m: any) => m.id).sort()
    expect(await visible(alice)).toEqual([kept.id, deleted.id].sort())
    expect((await http(alice, 'GET', `/media/${kept.id}/url`)).status).toBe(200)
    // A member who joins later sees it too, and comments still work.
    await join(carol, groupId, 'carol')
    expect(await visible(carol)).toEqual([kept.id, deleted.id].sort())
    expect((await http(carol, 'GET', `/media-publications/${pubKept.id}/comments`)).status).toBe(200)

    // The owner deletes one asset: gone for everyone.
    await ok(bob, 'DELETE', `/media/${deleted.id}`)
    expect(await visible(alice)).toEqual([kept.id])
    // The owner withdraws the other after leaving: gone for everyone, including issued access.
    await ok(bob, 'DELETE', `/media-publications/${pubKept.id}`)
    expect(await visible(alice)).toEqual([])
    expect((await http(alice, 'GET', `/media/${kept.id}/url`)).status).toBe(404)
    // Bob keeps his own media (history).
    expect((await ok(bob, 'GET', '/media/mine')).map((m: any) => m.id)).toContain(kept.id)
  })

  it('leaving withdraws completion shares; the personal calendar, results and completion stay', async () => {
    const { groupId } = await startedGroup({ daysAgo: 0, durationDays: 7 })
    await join(bob, groupId, 'bob')
    const bobToday = await itemOn(bob, 0)
    await finish(bob, bobToday.id, 33)
    const aliceToday = await itemOn(alice, 0)
    expect((await ok(alice, 'GET', `/groups/${groupId}/completions`)).map((c: any) => c.user.handle)).toEqual(['bob'])
    const before = { items: (await itemsOf(bob)).length, results: await db.resultEntry.count({ where: { session: { userId: bob } } }) }

    await ok(bob, 'PATCH', `/groups/${groupId}/members/me`, { leave: true })
    expect(await ok(alice, 'GET', `/groups/${groupId}/completions`)).toEqual([])
    expect(await db.completionShare.count({ where: { userId: bob, revokedAt: null } })).toBe(0)
    const row = (await ok(alice, 'GET', `/calendar-items/${aliceToday.id}/occurrence`)).collaborators
    expect(row.members.map((m: any) => m.user.handle)).toEqual(['alice'])
    // Bob's own record is untouched.
    expect({ items: (await itemsOf(bob)).length, results: await db.resultEntry.count({ where: { session: { userId: bob } } }) }).toEqual(before)
    const mine = await ok(bob, 'GET', `/calendar-items/${bobToday.id}/occurrence`)
    expect([mine.item?.status ?? (await db.calendarItem.findUniqueOrThrow({ where: { id: bobToday.id } })).status, mine.resultInputs[0].recorded]).toEqual(['DONE', 33])
    expect(mine.collaborators).toBeNull()
  })
})
