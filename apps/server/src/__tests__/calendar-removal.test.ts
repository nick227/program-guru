import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@project/db'
import { buildTestApp, asAuth, testUserId, testOtherUserId } from './helpers'
import { seedCatalog } from './helpers/fixtures'

// 09 §4.6: the Calendar is the current schedule. Removing a Program hides all of its items,
// whatever their date or status, while every row, session and result is retained.
const app = buildTestApp()
let cat: Awaited<ReturnType<typeof seedCatalog>>
beforeEach(async () => {
  cat = await seedCatalog()
})

const req = (method: string, url: string, payload?: unknown, userId = testOtherUserId) =>
  app.inject({ method: method as any, url, headers: asAuth(userId), ...(payload === undefined ? {} : { payload: payload as any }) })

const today = new Date().toISOString().slice(0, 10)
const shift = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
const calendar = async () =>
  (await req('GET', `/calendar/items?start=${shift(-7)}&end=${shift(14)}`)).json().data.map((i: any) => i.id).sort() as string[]

/** Alice publishes a 7-day daily Program; Bob joins it starting `start`. */
async function joined(key: string, start = today) {
  let ws = (await req('POST', '/programs', { programTypeId: cat.workout.id }, testUserId)).json().data
  ws = (await req('POST', `/programs/${ws.id}/draft/activities`, { activityIds: [cat.squats.activity.id], expectedRevision: ws.draftRevision }, testUserId)).json().data
  ws = (await req('PATCH', `/programs/${ws.id}/draft`, { durationDays: 7, frequency: { kind: 'DAILY' }, expectedRevision: ws.draftRevision }, testUserId)).json().data
  const v = (await req('POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision }, testUserId)).json().data.latestPublishedVersionId
  const e = (await req('POST', `/programs/${ws.id}/enrollments`, { programVersionId: v, startLocalDate: start, timezone: 'UTC', idempotencyKey: `join-${key}` })).json().data
  const items = await db.calendarItem.findMany({ where: { enrollmentId: e.id }, orderBy: { localDate: 'asc' } })
  return { programId: ws.id as string, enrollmentId: e.id as string, items }
}

async function finish(itemId: string, key: string) {
  const s = (await req('POST', '/sessions', { calendarItemId: itemId, idempotencyKey: `finish-${key}` })).json().data
  expect((await req('POST', `/sessions/${s.id}/actions`, { action: 'FINISH', expectedRevision: s.revision })).statusCode).toBe(200)
}

/** What "Remove from Programs" does in the web app: leave, then archive in the library. */
async function removeFromPrograms(p: { programId: string; enrollmentId: string }) {
  expect((await req('POST', `/enrollments/${p.enrollmentId}/leave`, { futureItems: 'REMOVE' })).statusCode).toBe(200)
  expect((await req('POST', `/me/program-library/${p.programId}`, { action: 'ARCHIVE' })).statusCode).toBe(200)
}

describe('removing a Program from the Calendar (09 §4.6)', () => {
  it('hides past and future completed items and undone completions, keeps standalone and active items, retains history', async () => {
    const removed = await joined('removed', shift(-3))
    const active = await joined('active')
    const standalone = (await req('POST', '/calendar/items', { activityId: cat.squats.activity.id, localDate: shift(2), idempotencyKey: 'standalone-item' })).json().data.item
    const [pastDone, , undone] = removed.items
    const futureDone = removed.items.at(-1)!
    await finish(pastDone!.id, 'past')
    await finish(futureDone.id, 'future')
    await finish(undone!.id, 'undone')
    expect((await req('POST', `/calendar-items/${undone!.id}/undo-completion`)).statusCode).toBe(200)
    expect(await calendar()).toEqual(expect.arrayContaining([pastDone!.id, futureDone.id, undone!.id]))

    await removeFromPrograms(removed)
    expect(await calendar()).toEqual([standalone.id, ...active.items.map((i) => i.id)].sort())
    // Nothing historical is deleted.
    expect(await db.calendarItem.count({ where: { enrollmentId: removed.enrollmentId } })).toBe(removed.items.length)
    expect(await db.calendarItem.count({ where: { enrollmentId: removed.enrollmentId, status: 'DONE' } })).toBe(2)
    expect(await db.activitySession.count({ where: { calendarItemId: { in: removed.items.map((i) => i.id) }, status: 'FINISHED' } })).toBe(3)
  })

  it('hides a run archived in the library and shows it again on restore', async () => {
    const p = await joined('archive-only')
    await finish(p.items[0]!.id, 'archive-only')
    expect((await req('POST', `/me/program-library/${p.programId}`, { action: 'ARCHIVE' })).statusCode).toBe(200)
    expect(await calendar()).toEqual([])
    expect((await req('POST', `/me/program-library/${p.programId}`, { action: 'RESTORE' })).statusCode).toBe(200)
    expect(await calendar()).toEqual([p.items[0]!.id])
  })

  it('a restart or re-enrollment shows only the new run', async () => {
    const p = await joined('restart')
    await finish(p.items[0]!.id, 'restart')
    const restarted = (await req('POST', `/me/program-library/${p.programId}`, { action: 'RESTART', expectedRunId: p.enrollmentId })).json().data
    const newRun = await db.calendarItem.findMany({ where: { enrollmentId: restarted.current.id } })
    expect(restarted.current.id).not.toBe(p.enrollmentId)
    expect(await calendar()).toEqual(newRun.map((i) => i.id).sort())

    await removeFromPrograms({ programId: p.programId, enrollmentId: restarted.current.id })
    expect(await calendar()).toEqual([])
    const v = (await db.programEnrollment.findUniqueOrThrow({ where: { id: p.enrollmentId } })).programVersionId
    const again = (await req('POST', `/programs/${p.programId}/enrollments`, { programVersionId: v, startLocalDate: today, timezone: 'UTC', idempotencyKey: 'join-again' })).json().data
    const againItems = await db.calendarItem.findMany({ where: { enrollmentId: again.id } })
    expect(againItems.length).toBeGreaterThan(0)
    expect(await calendar()).toEqual(againItems.map((i) => i.id).sort())
  })
})
