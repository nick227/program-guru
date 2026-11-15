// Completion opens on the day (09 §3, 10 §9): a future item cannot be completed; a gathering cannot be
// completed before its scheduled time. Start opens on the item's day.
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@project/db'
import { asAuth, buildTestApp, testOtherUserId, testUserId } from './helpers'
import { World } from './helpers/contract'
import { addDays, localToUtc, todayIn } from '../lib/time'

const app = buildTestApp()
const alice = testUserId
const bob = testOtherUserId
let world: World
beforeEach(() => {
  world = new World(app)
})

let n = 0
const key = () => `cw-key-${++n}-${Date.now()}`
const req = (userId: string, method: string, url: string, payload?: unknown) =>
  app.inject({ method: method as any, url, headers: asAuth(userId), ...(payload !== undefined ? { payload: payload as any } : {}) })
const ok = async (userId: string, method: string, url: string, payload?: unknown) => {
  const res = await req(userId, method, url, payload)
  if (res.statusCode >= 300) throw new Error(`${method} ${url} → ${res.statusCode}: ${res.body}`)
  return res.json().data
}
const tzOf = async (userId: string) => (await db.userPreference.findUnique({ where: { userId } }))?.timezone ?? 'UTC'
const session = (userId: string, itemId: string) => ok(userId, 'POST', '/sessions', { calendarItemId: itemId, idempotencyKey: key() })
const act = (userId: string, s: { id: string; revision: number }, action: string) =>
  req(userId, 'POST', `/sessions/${s.id}/actions`, { action, expectedRevision: s.revision })

describe('personal items complete on their day', () => {
  it('refuses Start and Finish before the day, exposes completionOpensAt, and accepts on the day', async () => {
    const c = await world.cat()
    const tz = await tzOf(alice)
    const today = todayIn(tz)
    const future = (await ok(alice, 'POST', '/calendar/items', { activityId: c.squats.activity.id, localDate: addDays(today, 2), idempotencyKey: key() })).item
    expect(future.completionOpensAt).toBe(localToUtc(addDays(today, 2), '00:00', tz).toISOString())

    const s = await session(alice, future.id)
    const start = await act(alice, s, 'START')
    expect(start.statusCode).toBe(400)
    expect(start.json()).toMatchObject({ code: 'VALIDATION_ERROR', message: 'You can start this Activity on its day' })
    const finish = await act(alice, s, 'FINISH')
    expect(finish.statusCode).toBe(400)
    expect(finish.json().message).toBe('You can complete this Activity on its day')
    // Nothing changed: the session is still READY and the item still PLANNED.
    expect(await db.activitySession.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({ status: 'READY', revision: s.revision })
    expect(await db.calendarItem.findUniqueOrThrow({ where: { id: future.id } })).toMatchObject({ status: 'PLANNED' })

    const now = (await ok(alice, 'POST', '/calendar/items', { activityId: c.squats.activity.id, localDate: today, idempotencyKey: key() })).item
    const s2 = await session(alice, now.id)
    expect((await act(alice, s2, 'FINISH')).statusCode).toBe(200)
    expect(await db.calendarItem.findUniqueOrThrow({ where: { id: now.id } })).toMatchObject({ status: 'DONE' })
  })
})

describe('gatherings complete once they have started (10 §9)', () => {
  it('a gathering later today can be started but not completed until its time', async () => {
    const c = await world.cat()
    const tz = await tzOf(bob)
    const today = todayIn(tz)
    const created = await ok(bob, 'POST', `/activities/${c.squats.activity.id}/gatherings`, { localDate: addDays(today, 1), localTime: '18:00', idempotencyKey: key() })
    // Move it to later today (23:59), as if the gathering's day has come but not its time.
    await db.programGroup.update({ where: { id: created.gathering.id }, data: { startLocalDate: new Date(`${today}T00:00:00Z`), startLocalTime: '23:59', timezone: tz } })
    await db.calendarItem.update({ where: { id: created.calendarItemId }, data: { localDate: new Date(`${today}T00:00:00Z`), localTime: '23:59' } })
    const item = (await ok(bob, 'GET', `/calendar-items/${created.calendarItemId}/occurrence`)).item
    const opens = localToUtc(today, '23:59', tz)
    expect(item.completionOpensAt).toBe(opens.toISOString())
    if (Date.now() >= opens.getTime()) return // the test ran in the last minute of the day

    const s = await session(bob, created.calendarItemId)
    const started = await act(bob, s, 'START')
    expect(started.statusCode).toBe(200)
    const finish = await act(bob, started.json().data.session, 'FINISH')
    expect(finish.statusCode).toBe(400)
    expect(finish.json().message).toBe('You can complete this once the gathering has started')

    // Once its time has passed, completion opens.
    await db.programGroup.update({ where: { id: created.gathering.id }, data: { startLocalTime: '00:00' } })
    const done = await act(bob, started.json().data.session, 'FINISH')
    expect(done.statusCode).toBe(200)
    const g = await ok(bob, 'GET', `/gatherings/${created.gathering.id}`)
    expect(g.completedCount).toBe(1)
  })

  it('a future gathering never reports anyone as finished', async () => {
    const c = await world.cat()
    const today = todayIn(await tzOf(bob))
    const created = await ok(bob, 'POST', `/activities/${c.squats.activity.id}/gatherings`, { localDate: addDays(today, 3), localTime: '10:00', idempotencyKey: key() })
    const s = await session(bob, created.calendarItemId)
    expect((await act(bob, s, 'FINISH')).statusCode).toBe(400)
    expect((await ok(bob, 'GET', `/gatherings/${created.gathering.id}`)).completedCount).toBe(0)
  })
})
