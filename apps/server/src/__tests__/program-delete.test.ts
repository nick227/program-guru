import { describe, it, expect, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { db } from '@project/db'
import { buildTestApp, asAuth, validateResponse, testUserId, testOtherUserId } from './helpers'
import { seedCatalog } from './helpers/fixtures'
import { contractCase } from './helpers/contract'

// 07-PROGRAMS.md §6: Delete is permanent for the owner; other people's records stay.
const app = buildTestApp()
let cat: Awaited<ReturnType<typeof seedCatalog>>
beforeEach(async () => {
  cat = await seedCatalog()
})

const ALICE = testUserId
const BOB = testOtherUserId
const req = (method: string, url: string, payload?: unknown, userId: string | null = ALICE) =>
  app.inject({ method: method as any, url, headers: userId ? asAuth(userId) : {}, ...(payload === undefined ? {} : { payload: payload as any }) })
const today = new Date().toISOString().slice(0, 10)
const shift = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
const calendar = async (userId: string) =>
  (await req('GET', `/calendar/items?start=${shift(-7)}&end=${shift(14)}`, undefined, userId)).json().data.map((i: any) => i.id).sort() as string[]

/** Alice publishes a public 7-day daily Program. */
async function publish() {
  let ws = (await req('POST', '/programs', { programTypeId: cat.workout.id })).json().data
  ws = (await req('POST', `/programs/${ws.id}/draft/activities`, { activityIds: [cat.squats.activity.id], expectedRevision: ws.draftRevision })).json().data
  ws = (await req('PATCH', `/programs/${ws.id}/draft`, { durationDays: 7, frequency: { kind: 'DAILY' }, expectedRevision: ws.draftRevision })).json().data
  const versionId = (await req('POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision })).json().data.latestPublishedVersionId
  return { programId: ws.id as string, versionId: versionId as string }
}

async function join(userId: string, p: { programId: string; versionId: string }) {
  const e = (await req('POST', `/programs/${p.programId}/enrollments`, { programVersionId: p.versionId, startLocalDate: today, timezone: 'UTC', idempotencyKey: `join-${randomUUID()}` }, userId)).json().data
  return { enrollmentId: e.id as string, items: await db.calendarItem.findMany({ where: { enrollmentId: e.id }, orderBy: { localDate: 'asc' } }) }
}

/** Finishes an item with a recorded result and an attached journal photo. */
async function finishWithResult(userId: string, itemId: string) {
  const s = (await req('POST', '/sessions', { calendarItemId: itemId, idempotencyKey: `session-${randomUUID()}` }, userId)).json().data
  const entry = (await req('POST', `/sessions/${s.id}/results`, { values: [{ metricDefinitionId: cat.reps.id, value: 12 }] }, userId)).json().data
  const photo = await db.mediaAsset.create({ data: { ownerId: userId, type: 'PHOTO', originalStorageKey: `users/${userId}/${randomUUID()}`, mime: 'image/jpeg', byteSize: 10n, state: 'READY' } })
  expect((await req('POST', '/media-attachments', { mediaId: photo.id, target: { kind: 'RESULT_ENTRY', id: entry.id }, purpose: 'JOURNAL' }, userId)).statusCode).toBe(201)
  const fresh = await db.activitySession.findUniqueOrThrow({ where: { id: s.id } })
  const done = await req('POST', `/sessions/${s.id}/actions`, { action: 'FINISH', expectedRevision: fresh.revision }, userId)
  expect(done.statusCode, done.body).toBe(200)
  return { sessionId: s.id as string, mediaId: photo.id }
}

const standaloneCount = (userId: string) => db.calendarItem.count({ where: { ownerId: userId, enrollmentId: null } })
const studio = async (userId = ALICE) => (await req('GET', '/programs', undefined, userId)).json().data.map((p: any) => p.id) as string[]
const library = async (userId = ALICE) => (await req('GET', '/me/program-library', undefined, userId)).json().data.map((e: any) => e.program.id) as string[]
const discoverable = async () => (await req('GET', '/discover?kind=PROGRAM', undefined, null)).json().data.map((d: any) => d.program.id) as string[]

describe('deleteProgram', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'deleteProgram')
  })

  it('fully deletes a Program only the owner used, with their runs, results and items, leaving no standalone orphans', async () => {
    const p = await publish()
    const standalone = (await req('POST', '/calendar/items', { activityId: cat.squats.activity.id, localDate: shift(1), idempotencyKey: 'keep-standalone' })).json().data.item
    const first = await join(ALICE, p)
    const result = await finishWithResult(ALICE, first.items[0]!.id)
    // An earlier, removed run must go too.
    const restarted = (await req('POST', `/me/program-library/${p.programId}`, { action: 'RESTART', expectedRunId: first.enrollmentId })).json().data
    expect(restarted.current.id).not.toBe(first.enrollmentId)
    const before = await standaloneCount(ALICE)

    const res = await req('DELETE', `/programs/${p.programId}`)
    expect(res.statusCode).toBe(200)
    await validateResponse('deleteProgram', 200, res.json())
    expect(res.json().data).toEqual({ programId: p.programId, retainedForParticipants: false })

    expect(await db.program.findUnique({ where: { id: p.programId } })).toBeNull()
    expect(await db.programVersion.count({ where: { programId: p.programId } })).toBe(0)
    expect(await db.programEnrollment.count({ where: { programId: p.programId } })).toBe(0)
    expect(await db.activitySession.findUnique({ where: { id: result.sessionId } })).toBeNull()
    expect(await db.mediaAttachment.count({ where: { mediaId: result.mediaId } })).toBe(0)
    expect(await db.mediaAsset.findUnique({ where: { id: result.mediaId } })).not.toBeNull() // the asset stays in her library
    expect(await standaloneCount(ALICE)).toBe(before) // nothing detached into standalone entries
    expect(await calendar(ALICE)).toEqual([standalone.id])
    expect(await studio()).not.toContain(p.programId)
    expect(await library()).not.toContain(p.programId)
    expect(await discoverable()).not.toContain(p.programId)
    expect((await req('GET', `/programs/${p.programId}`)).statusCode).toBe(404)
    expect((await req('DELETE', `/programs/${p.programId}`)).statusCode).toBe(404)
  })

  it('deletes a never-published draft', async () => {
    const ws = (await req('POST', '/programs', { programTypeId: cat.workout.id })).json().data
    expect((await req('DELETE', `/programs/${ws.id}`)).json().data.retainedForParticipants).toBe(false)
    expect(await studio()).not.toContain(ws.id)
    expect((await req('GET', `/programs/${ws.id}/workspace`)).statusCode).toBe(404)
  })

  it('tombstones a Program another participant uses: gone for the owner, unchanged for the participant', async () => {
    const p = await publish()
    const alice = await join(ALICE, p)
    await finishWithResult(ALICE, alice.items[0]!.id)
    const bob = await join(BOB, p)
    const bobResult = await finishWithResult(BOB, bob.items[0]!.id)
    const bobCalendar = await calendar(BOB)
    const aliceStandalone = await standaloneCount(ALICE)

    const res = await req('DELETE', `/programs/${p.programId}`)
    expect(res.json().data).toEqual({ programId: p.programId, retainedForParticipants: true })

    // Owner: gone everywhere, own runs deleted rather than detached.
    expect(await db.programEnrollment.count({ where: { programId: p.programId, userId: ALICE } })).toBe(0)
    expect(await db.calendarItem.count({ where: { id: { in: alice.items.map((i) => i.id) } } })).toBe(0)
    expect(await standaloneCount(ALICE)).toBe(aliceStandalone)
    expect(await calendar(ALICE)).toEqual([])
    expect(await studio()).not.toContain(p.programId)
    expect(await library()).not.toContain(p.programId)
    expect((await req('GET', `/programs/${p.programId}/workspace`)).statusCode).toBe(404)
    expect((await req('POST', `/programs/${p.programId}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: 0 })).statusCode).toBe(404)
    expect((await req('DELETE', `/programs/${p.programId}`)).statusCode).toBe(404)

    // Everyone else: no discovery, preview, joins or copies for people without a tie.
    expect(await discoverable()).not.toContain(p.programId)
    expect((await req('GET', `/programs/${p.programId}`, undefined, null)).statusCode).toBe(404)
    expect((await req('POST', `/programs/${p.programId}/enrollments`, { programVersionId: p.versionId, startLocalDate: today, timezone: 'UTC', idempotencyKey: 'late-joiner' }, ALICE)).statusCode).toBe(404)

    // Participant: run, Calendar, results and media untouched; still readable to them.
    expect(await calendar(BOB)).toEqual(bobCalendar)
    expect(await db.activitySession.findUnique({ where: { id: bobResult.sessionId } })).not.toBeNull()
    expect(await db.mediaAttachment.count({ where: { mediaId: bobResult.mediaId } })).toBe(1)
    expect((await req('GET', `/programs/${p.programId}`, undefined, BOB)).statusCode).toBe(200)
    expect(await library(BOB)).toContain(p.programId)
    expect((await req('POST', `/programs/${p.programId}/copy`, undefined, BOB)).statusCode).toBe(404)
  })

  it('is owner-only', async () => {
    const p = await publish()
    expect((await req('DELETE', `/programs/${p.programId}`, undefined, BOB)).statusCode).toBe(404)
    expect(await db.program.findUnique({ where: { id: p.programId } })).not.toBeNull()
  })
})
