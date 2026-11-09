// Restarting a Program keeps the person's Program Group (10-COLLABORATION §3): a new personal run
// linked to the same membership, past results and shares kept as history, nothing duplicated, the
// group's start date and other members' calendars untouched. Also: a missing request body is a 400.
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@project/db'
import { buildTestApp, asAuth, seedUser, testUserId as alice } from './helpers'
import { seedCatalog } from './helpers/fixtures'
import { participationSummary } from '../domains/programs/participation.service'
import { addDays, todayIn } from '../lib/time'

const app = buildTestApp()
const TZ = 'America/Chicago'
const bob = '00000000-0000-4000-8000-000000000002'
const carol = '00000000-0000-4000-8000-000000002001'
const dave = '00000000-0000-4000-8000-000000002002'
let cat: Awaited<ReturnType<typeof seedCatalog>>
let n = 0
const key = () => `restart-${++n}-${Date.now()}`

beforeEach(async () => {
  cat = await seedCatalog()
  await seedUser(carol, 'carol')
  await seedUser(dave, 'dave')
})

async function call(userId: string | null, method: string, url: string, payload?: unknown) {
  const res = await app.inject({ method: method as any, url, headers: userId ? asAuth(userId) : {}, ...(payload !== undefined ? { payload: payload as any } : {}) })
  return { status: res.statusCode, body: res.body ? res.json() : null }
}
async function ok(userId: string | null, method: string, url: string, payload?: unknown) {
  const res = await call(userId, method, url, payload)
  if (res.status >= 300) throw new Error(`${method} ${url} → ${res.status} ${JSON.stringify(res.body)}`)
  return res.body?.data
}

/** A published 7-day daily Program with Squats (and Leg Raises unless `squatsOnly`). */
async function publish(title: string, squatsOnly = false) {
  let ws = await ok(alice, 'POST', '/programs', { programTypeId: cat.workout.id })
  const activityIds = squatsOnly ? [cat.squats.activity.id] : [cat.squats.activity.id, cat.legRaises.activity.id]
  ws = await ok(alice, 'POST', `/programs/${ws.id}/draft/activities`, { activityIds, expectedRevision: ws.draftRevision })
  ws = await ok(alice, 'PATCH', `/programs/${ws.id}/draft`, { title, durationDays: 7, frequency: { kind: 'DAILY' }, expectedRevision: ws.draftRevision })
  const v = (await ok(alice, 'POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision })).latestPublishedVersionId as string
  return { programId: ws.id as string, v }
}
const join = (userId: string, programId: string, v: string, start = todayIn(TZ)) =>
  ok(userId, 'POST', `/programs/${programId}/enrollments`, { programVersionId: v, startLocalDate: start, timezone: TZ, idempotencyKey: key() })
async function finish(userId: string, itemId: string, reps = 10) {
  const s = await ok(userId, 'POST', '/sessions', { calendarItemId: itemId, idempotencyKey: key() })
  await ok(userId, 'POST', `/sessions/${s.id}/results`, { values: [{ metricDefinitionId: cat.reps.id, value: reps }] })
  await ok(userId, 'POST', `/sessions/${s.id}/actions`, { action: 'FINISH', expectedRevision: s.revision })
  return s.id as string
}
const item = (enrollmentId: string, day: number, activityId = cat.squats.activity.id) =>
  db.calendarItem.findFirstOrThrow({ where: { enrollmentId, programDayIndex: day, activityId, status: { not: 'CANCELLED' } } })
const restart = async (userId: string, programId: string, runId: string) => {
  await ok(userId, 'POST', `/me/program-library/${programId}`, { action: 'RESTART', expectedRunId: runId })
  return db.programEnrollment.findFirstOrThrow({ where: { userId, programId, status: 'ACTIVE' } })
}
const rowOf = async (userId: string, itemId: string) => {
  const occ = await ok(userId, 'GET', `/calendar-items/${itemId}/occurrence`)
  return { occ, status: Object.fromEntries(occ.collaborators.members.map((m: any) => [m.user.handle, m.status])) }
}
async function groupWith(owner: string, v: string, members: string[], mode: 'ASYNC' | 'SYNC') {
  const group = await ok(owner, 'POST', '/groups', { programVersionId: v, mode })
  const link = await ok(owner, 'POST', `/groups/${group.id}/invitations`, { kind: 'LINK' })
  const token = link.joinUrl.split('/join/')[1]
  for (const m of members) await ok(m, 'POST', `/group-invitations/${token}/accept`)
  return group.id as string
}

describe('restarting a Program keeps the group', () => {
  it('solo: a fresh run and schedule, past results kept, no group appears', async () => {
    const { programId, v } = await publish('Solo Squats')
    const first = await join(bob, programId, v)
    const done = await item(first.id, 0)
    const session = await finish(bob, done.id, 21)
    const next = await restart(bob, programId, first.id)
    expect(next.id).not.toBe(first.id)
    expect(next.groupId).toBeNull()
    expect((await db.programEnrollment.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('LEFT')
    expect((await db.calendarItem.findUniqueOrThrow({ where: { id: done.id } })).status).toBe('DONE')
    expect(await db.resultEntry.count({ where: { sessionId: session } })).toBe(1)
    const fresh = await db.calendarItem.findMany({ where: { enrollmentId: next.id } })
    expect(fresh).toHaveLength(14)
    expect(fresh.every((i) => i.status === 'PLANNED' && i.groupOccurrenceKey === null)).toBe(true)
    expect(await db.groupMember.count({ where: { userId: bob } })).toBe(0)
  })

  it('ASYNC group: same membership and sharing preference, new run linked, old completion is history', async () => {
    const { programId, v } = await publish('Async Squats')
    const runs = { bob: await join(bob, programId, v), carol: await join(carol, programId, v), dave: await join(dave, programId, v) }
    const groupId = await groupWith(bob, v, [carol, dave], 'ASYNC')
    await ok(dave, 'PATCH', `/groups/${groupId}/members/me`, { sharedCompletion: false })
    const bobDay0 = await item(runs.bob.id, 0)
    await finish(bob, bobDay0.id)
    const carolDay0 = await item(runs.carol.id, 0)
    expect((await rowOf(carol, carolDay0.id)).status.bob).toBe('DONE')
    const carolBefore = await db.calendarItem.findMany({ where: { ownerId: carol }, orderBy: { id: 'asc' } })
    const memberBefore = await db.groupMember.findMany({ where: { groupId }, orderBy: { userId: 'asc' } })

    const bobNext = await restart(bob, programId, runs.bob.id)
    const daveNext = await restart(dave, programId, runs.dave.id)
    // Linked to the same group, with group keys on the new schedule.
    expect([bobNext.groupId, daveNext.groupId]).toEqual([groupId, groupId])
    const bobNewDay0 = await item(bobNext.id, 0)
    expect(bobNewDay0.groupOccurrenceKey).toBe(carolDay0.groupOccurrenceKey)
    // Memberships unchanged: no duplicates, roles and sharing preferences preserved.
    expect(await db.groupMember.findMany({ where: { groupId }, orderBy: { userId: 'asc' } })).toEqual(memberBefore)
    expect((await db.groupMember.findUniqueOrThrow({ where: { groupId_userId: { groupId, userId: dave } } })).sharedCompletionEnabled).toBe(false)
    // Other members' calendars untouched.
    expect(await db.calendarItem.findMany({ where: { ownerId: carol }, orderBy: { id: 'asc' } })).toEqual(carolBefore)

    // The ended run's completion stays in the group feed, but bob's current Day 0 is not done.
    const feed = await ok(carol, 'GET', `/groups/${groupId}/completions`)
    expect(feed.map((c: any) => c.user.handle)).toContain('bob')
    const row = await rowOf(carol, carolDay0.id)
    expect(row.status).toMatchObject({ bob: 'PENDING', carol: 'PENDING', dave: 'UNKNOWN' })
    expect(row.occ.collaborators).toMatchObject({ finishedCount: 0, totalCount: 3 })
    const tile = (await ok(carol, 'GET', `/calendar/items?start=${todayIn(TZ)}&end=${todayIn(TZ)}`)).find((i: any) => i.id === carolDay0.id)
    expect(tile.sharedCompletionCount).toBe(0)
    // bob still sees his old finished item with his own completion (history).
    expect((await rowOf(bob, bobDay0.id)).status.bob).toBe('DONE')
    // Finishing on the new run counts again.
    await finish(bob, bobNewDay0.id)
    expect((await rowOf(carol, carolDay0.id)).occ.collaborators.finishedCount).toBe(1)
    // Still a participating friend (dave turned sharing off, so he is not listed).
    expect((await participationSummary(carol, programId)).friends.map((f) => f.handle)).toEqual(['bob'])

    // Leaving the group stays a separate action; a later restart then is solo.
    await ok(bob, 'PATCH', `/groups/${groupId}/members/me`, { leave: true })
    const solo = await restart(bob, programId, bobNext.id)
    expect(solo.groupId).toBeNull()
    expect((await db.groupMember.findUniqueOrThrow({ where: { groupId_userId: { groupId, userId: bob } } })).status).toBe('LEFT')
  })

  it('SYNC group: the group start date and the others’ dates stay; the restarter is compared by Program Day', async () => {
    const { programId, v } = await publish('Sync Squats')
    const start = addDays(todayIn(TZ), -2)
    const runs = { bob: await join(bob, programId, v, start), carol: await join(carol, programId, v, start) }
    const groupId = await groupWith(bob, v, [carol], 'SYNC')
    const groupBefore = await db.programGroup.findUniqueOrThrow({ where: { id: groupId } })
    expect(groupBefore.startLocalDate?.toISOString().slice(0, 10)).toBe(start)
    const bobBefore = await db.calendarItem.findMany({ where: { ownerId: bob }, orderBy: { id: 'asc' } })

    const carolNext = await restart(carol, programId, runs.carol.id)
    expect(carolNext.groupId).toBe(groupId)
    expect(carolNext.startLocalDate.toISOString().slice(0, 10)).toBe(todayIn(TZ))
    const groupAfter = await db.programGroup.findUniqueOrThrow({ where: { id: groupId } })
    expect([groupAfter.startLocalDate, groupAfter.timezone, groupAfter.mode]).toEqual([groupBefore.startLocalDate, groupBefore.timezone, 'SYNC'])
    expect(await db.calendarItem.findMany({ where: { ownerId: bob }, orderBy: { id: 'asc' } })).toEqual(bobBefore)
    expect(await db.groupMember.count({ where: { groupId, userId: carol } })).toBe(1)
    // Program Day 2 is today for bob and two days ahead for carol: the same occurrence by Program Day.
    const carolDay2 = await item(carolNext.id, 2)
    const bobDay2 = await item(runs.bob.id, 2)
    expect(bobDay2.localDate.toISOString().slice(0, 10)).toBe(todayIn(TZ))
    expect(carolDay2.groupOccurrenceKey).toBe(bobDay2.groupOccurrenceKey)
    await finish(carol, carolDay2.id)
    expect((await rowOf(bob, bobDay2.id)).status).toMatchObject({ carol: 'DONE', bob: 'PENDING' })
    expect((await ok(bob, 'GET', `/groups/${groupId}`)).memberCount).toBe(2)
  })

  it('mixed versions: a v2 member who restarts stays in the v1 group and keeps v2', async () => {
    const { programId, v } = await publish('Mixed Squats')
    const runs = { bob: await join(bob, programId, v), carol: await join(carol, programId, v) }
    const groupId = await groupWith(bob, v, [carol], 'ASYNC')
    // v2 drops Leg Raises; carol accepts, bob stays on v1.
    let ws = await ok(alice, 'GET', `/programs/${programId}/workspace`)
    ws = await ok(alice, 'DELETE', `/programs/${programId}/draft/activities/${cat.legRaises.activity.id}?expectedRevision=${ws.draftRevision}`)
    const v2 = (await ok(alice, 'POST', `/programs/${programId}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision })).latestPublishedVersionId
    await ok(carol, 'POST', `/enrollments/${runs.carol.id}/accept-update`)
    const carolNext = await restart(carol, programId, runs.carol.id)
    expect([carolNext.programVersionId, carolNext.groupId]).toEqual([v2, groupId])
    expect(await db.groupMember.count({ where: { groupId, userId: carol } })).toBe(1)
    // Squats is compatible across versions; Leg Raises (v1 only) leaves carol out rather than missing.
    await finish(carol, (await item(carolNext.id, 1)).id)
    expect((await rowOf(bob, (await item(runs.bob.id, 1)).id)).status).toMatchObject({ carol: 'DONE', bob: 'PENDING' })
    const legs = await rowOf(bob, (await item(runs.bob.id, 1, cat.legRaises.activity.id)).id)
    expect(Object.keys(legs.status)).toEqual(['bob'])
  })
})

describe('missing request body', () => {
  it('leaving a Program without a body is a controlled 400, not a 500', async () => {
    const { programId, v } = await publish('Body Squats', true)
    const run = await join(bob, programId, v)
    const res = await call(bob, 'POST', `/enrollments/${run.id}/leave`)
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', fieldErrors: { futureItems: expect.any(String) } })
    expect((await db.programEnrollment.findUniqueOrThrow({ where: { id: run.id } })).status).toBe('ACTIVE')
    // With a body it still works.
    expect((await call(bob, 'POST', `/enrollments/${run.id}/leave`, { futureItems: 'REMOVE' })).status).toBe(200)
  })

  it('routes whose body is all optional still accept no body', async () => {
    const { programId, v } = await publish('Optional Squats', true)
    await join(bob, programId, v)
    const group = await ok(bob, 'POST', '/groups', { programVersionId: v, mode: 'ASYNC' })
    const link = await ok(bob, 'POST', `/groups/${group.id}/invitations`, { kind: 'LINK' })
    await join(carol, programId, v)
    expect((await call(carol, 'POST', `/group-invitations/${link.joinUrl.split('/join/')[1]}/accept`)).status).toBe(200)
  })
})
