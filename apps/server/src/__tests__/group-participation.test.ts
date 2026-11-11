// Group invitation → enrollment → participation (10-COLLABORATION.md §3–4), over real HTTP:
// the test app listens on an ephemeral port and every request goes through fetch.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

// Lets one test fail the enrollment transaction after its writes (EnrollmentCreated is enqueued last).
const failEnrollment = vi.hoisted(() => ({ on: false }))
vi.mock('../lib/outbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/outbox')>()
  return {
    ...actual,
    enqueue: (async (...args: Parameters<typeof actual.enqueue>) => {
      if (failEnrollment.on && args[1] === 'EnrollmentCreated') throw new Error('test: enrollment transaction fails')
      return actual.enqueue(...args)
    }) as typeof actual.enqueue,
  }
})
import type { AddressInfo } from 'net'
import { db } from '@project/db'
import { buildTestApp, seedUser, validateResponse, testUserId as alice, testOtherUserId as bob } from './helpers'
import { seedCatalog } from './helpers/fixtures'
import { expireInvitations } from '../domains/groups/group.service'

const app = buildTestApp()
const carol = '00000000-0000-4000-8000-0000000000c1'
const dave = '00000000-0000-4000-8000-0000000000d1'
const TZ = 'America/Chicago'
let base = ''
let cat: Awaited<ReturnType<typeof seedCatalog>>
let n = 0
const key = () => `gp-${++n}-${Date.now()}`

beforeAll(async () => {
  await app.instance.listen({ port: 0, host: '127.0.0.1' })
  base = `http://127.0.0.1:${(app.instance.server.address() as AddressInfo).port}`
})
beforeEach(async () => {
  cat = await seedCatalog()
  await seedUser(carol, 'carol')
  await seedUser(dave, 'dave')
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

/** Alice publishes a 30-day program with two Activities a day; optionally follows it herself. */
async function program(opts: { accessMode?: 'OPEN' | 'APPROVAL'; aliceJoins?: boolean } = {}) {
  let ws = await ok(alice, 'POST', '/programs', { programTypeId: cat.workout.id })
  ws = await ok(alice, 'POST', `/programs/${ws.id}/draft/activities`, { activityIds: [cat.squats.activity.id, cat.legRaises.activity.id], expectedRevision: ws.draftRevision })
  ws = await ok(alice, 'PATCH', `/programs/${ws.id}/draft`, { title: '30 Days', durationDays: 30, frequency: { kind: 'DAILY' }, expectedRevision: ws.draftRevision })
  const published = await ok(alice, 'POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: opts.accessMode ?? 'OPEN', expectedRevision: ws.draftRevision })
  if (opts.aliceJoins !== false) await ok(alice, 'POST', `/programs/${ws.id}/enrollments`, { programVersionId: published.latestPublishedVersionId, startLocalDate: '2026-11-09', timezone: TZ, idempotencyKey: key() })
  return { programId: ws.id as string, versionId: published.latestPublishedVersionId as string }
}
const group = (versionId: string, mode: 'SYNC' | 'ASYNC' = 'SYNC', startLocalDate?: string) =>
  ok(alice, 'POST', '/groups', { programVersionId: versionId, mode, name: 'Crew', ...(startLocalDate ? { startLocalDate } : {}) })
const inviteHandle = async (groupId: string, handle: string, by = alice) => ok(by, 'POST', `/groups/${groupId}/invitations`, { kind: 'USER', handle })
const tokenOf = (inv: { joinUrl: string }) => inv.joinUrl.split('/join/')[1]!
const enrollment = (extra: Record<string, unknown> = {}) => ({ enrollment: { timezone: TZ, idempotencyKey: key(), ...extra } })
const items = (userId: string) => db.calendarItem.findMany({ where: { ownerId: userId, status: { not: 'CANCELLED' } }, orderBy: [{ localDate: 'asc' }, { id: 'asc' }] })
async function nothingFor(userId: string, groupId: string, programId: string) {
  expect(await db.groupMember.count({ where: { groupId, userId } })).toBe(0)
  expect(await db.programEnrollment.count({ where: { userId, programId } })).toBe(0)
  expect(await db.calendarItem.count({ where: { ownerId: userId } })).toBe(0)
}

describe('creator → invitation → acceptance → enrollment → personal calendar', () => {
  it('a handle invitee finds it in the app, confirms the shared start date, and gets their own calendar in one step', async () => {
    const { programId, versionId } = await program()
    const g = await group(versionId)
    const inv = await inviteHandle(g.id, 'bob')

    const received = await http(bob, 'GET', '/users/me/group-invitations')
    expect(received.status).toBe(200)
    await validateResponse('listMyGroupInvitations', 200, received.body)
    expect(received.body.data).toHaveLength(1)
    expect(received.body.data[0]).toMatchObject({ id: inv.id, kind: 'USER', groupId: g.id, preview: { canAccept: true, join: { status: 'CONFIRM_ENROLLMENT', startLocalDate: '2026-11-09', enrollmentId: null } } })
    expect((await http(carol, 'GET', '/users/me/group-invitations')).body.data).toEqual([])

    // No silent calendar: accepting without the schedule confirmation changes nothing.
    const unconfirmed = await http(bob, 'POST', `/users/me/group-invitations/${inv.id}/accept`)
    expect(unconfirmed.status).toBe(400)
    expect(unconfirmed.body.fieldErrors).toEqual({ enrollment: 'confirm the group start date' })
    await nothingFor(bob, g.id, programId)

    const body = enrollment()
    const accepted = await http(bob, 'POST', `/users/me/group-invitations/${inv.id}/accept`, body)
    expect(accepted.status).toBe(200)
    await validateResponse('acceptMyGroupInvitation', 200, accepted.body)
    expect(accepted.body.data).toMatchObject({ memberCount: 2, myRole: 'MEMBER', myEnrollment: { startLocalDate: '2026-11-09', startDateDiffers: false } })

    // Independent personal calendars sharing occurrence keys.
    const [aliceItems, bobItems] = [await items(alice), await items(bob)]
    expect(bobItems.length).toBe(aliceItems.length)
    expect(bobItems.every((i) => i.enrollmentId === accepted.body.data.myEnrollment.enrollmentId && i.groupOccurrenceKey)).toBe(true)
    expect(new Set(bobItems.map((i) => i.groupOccurrenceKey))).toEqual(new Set(aliceItems.map((i) => i.groupOccurrenceKey)))
    expect(bobItems.some((b) => aliceItems.some((a) => a.id === b.id))).toBe(false)
    const day = await http(bob, 'GET', '/calendar/items?start=2026-11-09&end=2026-11-09')
    expect(day.body.data.map((i: any) => i.title).sort()).toEqual(['Leg Raises', 'Squats'])

    // Replay is safe: same result, one enrollment, invitation consumed.
    const replay = await http(bob, 'POST', `/users/me/group-invitations/${inv.id}/accept`, body)
    expect([replay.status, replay.body?.data?.myEnrollment?.enrollmentId]).toEqual([200, accepted.body.data.myEnrollment.enrollmentId])
    expect(await db.programEnrollment.count({ where: { userId: bob, programId } })).toBe(1)
    expect((await db.groupInvitation.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe('ACCEPTED')
    expect((await http(bob, 'GET', '/users/me/group-invitations')).body.data).toEqual([])
    expect((await http(bob, 'POST', `/group-invitations/${tokenOf(inv)}/accept`, enrollment())).status).toBe(404) // single-use
  })

  it('ASYNC: the invitee chooses a start date; Program Days align, dates differ', async () => {
    const { versionId } = await program()
    const g = await group(versionId, 'ASYNC')
    const inv = await inviteHandle(g.id, 'bob')
    const preview = await http(bob, 'GET', `/group-invitations/${tokenOf(inv)}`)
    await validateResponse('getGroupInvitation', 200, preview.body)
    expect(preview.body.data.join).toMatchObject({ status: 'SELECT_SCHEDULE', startLocalDate: null })
    expect((await http(bob, 'POST', `/group-invitations/${tokenOf(inv)}/accept`, enrollment())).body.fieldErrors).toEqual({ 'enrollment.startLocalDate': 'is required' })
    const joined = await ok(bob, 'POST', `/group-invitations/${tokenOf(inv)}/accept`, enrollment({ startLocalDate: '2026-11-12' }))
    expect(joined.myEnrollment).toMatchObject({ startLocalDate: '2026-11-12', startDateDiffers: false })
    const a = await db.calendarItem.findFirstOrThrow({ where: { ownerId: alice, programDayIndex: 0, activityId: cat.squats.activity.id } })
    const b = await db.calendarItem.findFirstOrThrow({ where: { ownerId: bob, programDayIndex: 0, activityId: cat.squats.activity.id } })
    expect(a.groupOccurrenceKey).toBe(b.groupOccurrenceKey)
    expect(a.localDate).not.toEqual(b.localDate)
  })
})

describe('an existing participant joining a group', () => {
  it('links the existing enrollment without changing the calendar; a differing SYNC start date is flagged', async () => {
    const { programId, versionId } = await program()
    await ok(bob, 'POST', `/programs/${programId}/enrollments`, { programVersionId: versionId, startLocalDate: '2026-11-11', timezone: TZ, idempotencyKey: key() })
    const before = await items(bob)
    expect(before.every((i) => i.groupOccurrenceKey === null)).toBe(true)
    const g = await group(versionId)
    const inv = await inviteHandle(g.id, 'bob')
    const preview = (await ok(bob, 'GET', `/group-invitations/${tokenOf(inv)}`)).join
    expect(preview).toMatchObject({ status: 'READY_TO_JOIN', startLocalDate: '2026-11-11', startDateDiffers: true })
    // An enrollment body is ignored: the existing schedule is never replaced.
    const joined = await ok(bob, 'POST', `/group-invitations/${tokenOf(inv)}/accept`, enrollment({ startLocalDate: '2026-11-09' }))
    expect(joined.myEnrollment).toMatchObject({ enrollmentId: preview.enrollmentId, startLocalDate: '2026-11-11', startDateDiffers: true })
    const after = await items(bob)
    expect(after.map((i) => [i.id, i.localDate.toISOString()])).toEqual(before.map((i) => [i.id, i.localDate.toISOString()]))
    expect(after.every((i) => i.groupOccurrenceKey)).toBe(true)
    expect(await db.programEnrollment.count({ where: { userId: bob, programId } })).toBe(1)
  })

  it('refuses to silently move an enrollment from another group, whatever its version', async () => {
    const { programId, versionId } = await program()
    const first = await group(versionId)
    await ok(bob, 'POST', `/group-invitations/${tokenOf(await inviteHandle(first.id, 'bob'))}/accept`, enrollment())
    // Carol owns a second group on the same version and invites Bob.
    await ok(carol, 'POST', `/programs/${programId}/enrollments`, { programVersionId: versionId, startLocalDate: '2026-11-09', timezone: TZ, idempotencyKey: key() })
    const second = await ok(carol, 'POST', '/groups', { programVersionId: versionId, mode: 'ASYNC' })
    const inv = await inviteHandle(second.id, 'bob', carol)
    expect((await ok(bob, 'GET', `/group-invitations/${tokenOf(inv)}`)).join.status).toBe('LEAVE_OTHER_GROUP')
    const refused = await http(bob, 'POST', `/group-invitations/${tokenOf(inv)}/accept`, enrollment())
    expect([refused.status, refused.body.code]).toEqual([409, 'CONFLICT'])
    expect(await db.groupMember.count({ where: { groupId: second.id, userId: bob } })).toBe(0)
    expect((await db.programEnrollment.findFirstOrThrow({ where: { userId: bob, programId, status: 'ACTIVE' } })).groupId).toBe(first.id)

    // A group created on a newer version: versions no longer matter, the other group still does.
    let ws = await ok(alice, 'GET', `/programs/${programId}/workspace`)
    ws = await ok(alice, 'PATCH', `/programs/${programId}/draft`, { title: '30 Days v2', expectedRevision: ws.draftRevision })
    const v2 = (await ok(alice, 'POST', `/programs/${programId}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision })).latestPublishedVersionId
    expect(v2).not.toBe(versionId)
    await ok(dave, 'POST', `/programs/${programId}/enrollments`, { programVersionId: v2, startLocalDate: '2026-11-16', timezone: TZ, idempotencyKey: key() })
    const newer = await ok(dave, 'POST', '/groups', { programVersionId: v2, mode: 'SYNC', startLocalDate: '2026-11-16' })
    const inv2 = await inviteHandle(newer.id, 'bob', dave)
    expect((await ok(bob, 'GET', `/group-invitations/${tokenOf(inv2)}`)).join.status).toBe('LEAVE_OTHER_GROUP')
    expect((await http(bob, 'POST', `/group-invitations/${tokenOf(inv2)}/accept`, enrollment())).status).toBe(409)
    expect(await db.groupMember.count({ where: { groupId: newer.id, userId: bob } })).toBe(0)
  })
})

describe('two participants keep independent results and calendars', () => {
  it('each sees the other’s permitted completion, never their reps, notes, sessions or calendar', async () => {
    const { versionId } = await program()
    const g = await group(versionId)
    await ok(bob, 'POST', `/group-invitations/${tokenOf(await inviteHandle(g.id, 'bob'))}/accept`, enrollment())
    const aliceSquats = await db.calendarItem.findFirstOrThrow({ where: { ownerId: alice, programDayIndex: 0, activityId: cat.squats.activity.id } })
    const bobSquats = await db.calendarItem.findFirstOrThrow({ where: { ownerId: bob, programDayIndex: 0, activityId: cat.squats.activity.id } })

    const record = async (userId: string, itemId: string, reps: number, notes: string) => {
      const s = await ok(userId, 'POST', '/sessions', { calendarItemId: itemId, idempotencyKey: key() })
      await ok(userId, 'POST', `/sessions/${s.id}/results`, { values: [{ metricDefinitionId: cat.reps.id, value: reps }], notes })
      await ok(userId, 'POST', `/sessions/${s.id}/actions`, { action: 'FINISH', expectedRevision: s.revision })
      return s.id as string
    }
    const aliceSession = await record(alice, aliceSquats.id, 41, 'alice private note')
    const bobSession = await record(bob, bobSquats.id, 17, 'bob private note')

    const bobView = await ok(bob, 'GET', `/calendar-items/${bobSquats.id}/occurrence`)
    expect(bobView.collaborators.members.find((m: any) => m.user.handle === 'alice').status).toBe('DONE')
    expect(JSON.stringify(bobView)).not.toContain('alice private note')
    expect(JSON.stringify(bobView)).not.toContain(aliceSession)
    expect(bobView.resultInputs[0].recorded).toBe(17)
    const aliceView = await ok(alice, 'GET', `/calendar-items/${aliceSquats.id}/occurrence`)
    expect(aliceView.resultInputs[0].recorded).toBe(41)
    expect(JSON.stringify(aliceView)).not.toContain('bob private note')

    expect((await http(bob, 'GET', `/sessions/${aliceSession}`)).status).toBe(404)
    expect((await http(alice, 'GET', `/sessions/${bobSession}`)).status).toBe(404)
    expect((await http(bob, 'GET', `/calendar-items/${aliceSquats.id}/occurrence`)).status).toBe(404)
    const completions = await ok(bob, 'GET', `/groups/${g.id}/completions`)
    expect(completions.map((c: any) => c.user.handle).sort()).toEqual(['alice', 'bob'])
    expect(JSON.stringify(completions)).not.toContain('private note')
    expect(completions.every((c: any) => !('values' in c) && !('notes' in c) && !('sessionId' in c))).toBe(true)
  })
})

describe('invitation lifecycle and authorization', () => {
  it('expired invitations cannot be previewed, accepted, declined or listed; the sweep marks them EXPIRED', async () => {
    const { programId, versionId } = await program()
    const g = await group(versionId)
    const inv = await inviteHandle(g.id, 'bob')
    await db.groupInvitation.update({ where: { id: inv.id }, data: { expiresAt: new Date(Date.now() - 1000) } })
    expect((await http(bob, 'GET', `/group-invitations/${tokenOf(inv)}`)).status).toBe(404)
    expect((await http(bob, 'POST', `/group-invitations/${tokenOf(inv)}/accept`, enrollment())).status).toBe(404)
    expect((await http(bob, 'POST', `/users/me/group-invitations/${inv.id}/accept`, enrollment())).status).toBe(404)
    expect((await http(bob, 'POST', `/users/me/group-invitations/${inv.id}/decline`)).status).toBe(404)
    expect((await ok(bob, 'GET', '/users/me/group-invitations'))).toEqual([])
    expect((await ok(alice, 'GET', `/groups/${g.id}/invitations`))[0].status).toBe('EXPIRED')
    expect(await expireInvitations()).toBe(1)
    expect((await db.groupInvitation.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe('EXPIRED')
    await nothingFor(bob, g.id, programId)
    // Once expired, a fresh invitation is allowed.
    expect((await http(alice, 'POST', `/groups/${g.id}/invitations`, { kind: 'USER', handle: 'bob' })).status).toBe(201)
  })

  it('revocation, decline, duplicates, and who may do what', async () => {
    const { programId, versionId } = await program()
    const g = await group(versionId)
    const inv = await inviteHandle(g.id, 'bob')
    // Duplicate pending invitations are refused, by handle and by email.
    expect((await http(alice, 'POST', `/groups/${g.id}/invitations`, { kind: 'USER', handle: 'bob' })).status).toBe(409)
    expect((await http(alice, 'POST', `/groups/${g.id}/invitations`, { kind: 'EMAIL', email: 'carol@test.local' })).status).toBe(201)
    expect((await http(alice, 'POST', `/groups/${g.id}/invitations`, { kind: 'EMAIL', email: 'Carol@Test.local' })).status).toBe(409)
    // Carol's verified address finds the email invitation in the app.
    const forCarol = await ok(carol, 'GET', '/users/me/group-invitations')
    expect(forCarol.map((i: any) => i.kind)).toEqual(['EMAIL'])

    // Not addressed, not a member, anonymous.
    expect((await http(carol, 'POST', `/users/me/group-invitations/${inv.id}/accept`, enrollment())).status).toBe(404)
    expect((await http(carol, 'POST', `/group-invitations/${tokenOf(inv)}/accept`, enrollment())).status).toBe(404)
    expect((await ok(carol, 'GET', `/group-invitations/${tokenOf(inv)}`)).join.status).toBe('UNAVAILABLE')
    expect((await ok(null, 'GET', `/group-invitations/${tokenOf(inv)}`)).join.status).toBe('SIGN_IN_REQUIRED')
    expect((await http(null, 'POST', `/group-invitations/${tokenOf(inv)}/accept`, enrollment())).status).toBe(401)
    expect((await http(carol, 'GET', `/groups/${g.id}/invitations`)).status).toBe(404)
    expect((await http(carol, 'POST', `/groups/${g.id}/invitations`, { kind: 'USER', handle: 'dave' })).status).toBe(404)
    expect((await http(carol, 'DELETE', `/groups/${g.id}/invitations/${inv.id}`)).status).toBe(404)

    // Decline: single-use invitations only; afterwards it cannot be accepted.
    await ok(bob, 'POST', `/users/me/group-invitations/${inv.id}/decline`)
    expect((await db.groupInvitation.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe('DECLINED')
    expect((await http(bob, 'POST', `/group-invitations/${tokenOf(inv)}/accept`, enrollment())).status).toBe(404)
    const link = await ok(alice, 'POST', `/groups/${g.id}/invitations`, { kind: 'LINK' })
    expect((await http(bob, 'POST', `/group-invitations/${tokenOf(link)}/decline`)).status).toBe(400)

    // Bob joins by link; as a member he cannot create links or revoke Alice's invitations.
    await ok(bob, 'POST', `/group-invitations/${tokenOf(link)}/accept`, enrollment())
    expect((await http(bob, 'POST', `/groups/${g.id}/invitations`, { kind: 'LINK' })).status).toBe(403)
    const forDave = await inviteHandle(g.id, 'dave')
    expect((await http(bob, 'DELETE', `/groups/${g.id}/invitations/${forDave.id}`)).status).toBe(403)
    // Revoked by the owner: dead everywhere.
    await ok(alice, 'DELETE', `/groups/${g.id}/invitations/${forDave.id}`)
    expect((await http(dave, 'GET', `/group-invitations/${tokenOf(forDave)}`)).status).toBe(404)
    expect((await http(dave, 'POST', `/users/me/group-invitations/${forDave.id}/accept`, enrollment())).status).toBe(404)
    await nothingFor(dave, g.id, programId)
    // Accepting twice is harmless: already a member.
    expect((await ok(bob, 'GET', `/group-invitations/${tokenOf(link)}`)).join.status).toBe('ALREADY_MEMBER')
    expect((await ok(bob, 'POST', `/group-invitations/${tokenOf(link)}/accept`)).memberCount).toBe(2)
    // Disabling the join link revokes it.
    await ok(alice, 'PATCH', `/groups/${g.id}`, { joinLinkEnabled: false })
    expect((await http(carol, 'GET', `/group-invitations/${tokenOf(link)}`)).status).toBe(404)
  })

  it('locked, archived and closed: no entitlement bypass and no new joins', async () => {
    const { programId, versionId } = await program({ accessMode: 'APPROVAL', aliceJoins: false })
    const g = await group(versionId, 'SYNC', '2026-11-09')
    const inv = await inviteHandle(g.id, 'bob')
    expect((await ok(bob, 'GET', `/group-invitations/${tokenOf(inv)}`)).join.status).toBe('ACCESS_REQUIRED')
    const locked = await http(bob, 'POST', `/group-invitations/${tokenOf(inv)}/accept`, enrollment())
    expect([locked.status, locked.body.code]).toEqual([403, 'ACCESS_REQUIRED'])
    await nothingFor(bob, g.id, programId)
    // After approval the same invitation works.
    const request = await ok(bob, 'POST', `/programs/${programId}/access-requests`)
    await ok(alice, 'POST', `/access-requests/${request.id}/approve`)
    expect((await ok(bob, 'GET', `/group-invitations/${tokenOf(inv)}`)).join.status).toBe('CONFIRM_ENROLLMENT')
    await ok(bob, 'POST', `/group-invitations/${tokenOf(inv)}/accept`, enrollment())

    // Archived Program: existing members keep the group; new joins and new invitations stop.
    const forCarol = await inviteHandle(g.id, 'carol')
    await ok(alice, 'POST', `/programs/${programId}/archive`)
    expect((await http(bob, 'GET', `/groups/${g.id}`)).status).toBe(200)
    expect((await ok(carol, 'GET', `/group-invitations/${tokenOf(forCarol)}`)).join.status).toBe('UNAVAILABLE')
    expect((await http(carol, 'POST', `/group-invitations/${tokenOf(forCarol)}/accept`, enrollment())).status).toBe(404)
    expect((await http(alice, 'POST', `/groups/${g.id}/invitations`, { kind: 'USER', handle: 'dave' })).status).toBe(400)

    // Closed group: invitations are dead.
    const open = await program()
    const g2 = await group(open.versionId)
    const forDave = await inviteHandle(g2.id, 'dave')
    await ok(alice, 'PATCH', `/groups/${g2.id}`, { closed: true })
    expect((await http(dave, 'POST', `/group-invitations/${tokenOf(forDave)}/accept`, enrollment())).status).toBe(404)
  })
})

describe('leaving and removal', () => {
  it('removal revokes group access immediately; personal history stays; a link cannot undo it', async () => {
    const { programId, versionId } = await program()
    const g = await group(versionId)
    await ok(bob, 'POST', `/group-invitations/${tokenOf(await inviteHandle(g.id, 'bob'))}/accept`, enrollment())
    const bobSquats = await db.calendarItem.findFirstOrThrow({ where: { ownerId: bob, programDayIndex: 0, activityId: cat.squats.activity.id } })
    const s = await ok(bob, 'POST', '/sessions', { calendarItemId: bobSquats.id, idempotencyKey: key() })
    await ok(bob, 'POST', `/sessions/${s.id}/results`, { values: [{ metricDefinitionId: cat.reps.id, value: 20 }] })
    await ok(bob, 'POST', `/sessions/${s.id}/actions`, { action: 'FINISH', expectedRevision: s.revision })
    const aliceItem = await db.calendarItem.findFirstOrThrow({ where: { ownerId: alice, programDayIndex: 0, activityId: cat.squats.activity.id } })
    const media = await db.mediaAsset.create({ data: { ownerId: alice, type: 'PHOTO', originalStorageKey: `u/${alice}/group-photo`, mime: 'image/jpeg', byteSize: 10, state: 'READY' } })
    const pub = await ok(alice, 'POST', '/media-publications', { mediaId: media.id, audience: 'GROUP', groupId: g.id, occurrenceKey: aliceItem.groupOccurrenceKey })
    const signed = (await ok(bob, 'GET', `/groups/${g.id}/media`))[0].thumbnailUrl as string
    const pendingByBob = await inviteHandle(g.id, 'dave', bob)
    const link = await ok(alice, 'POST', `/groups/${g.id}/invitations`, { kind: 'LINK' })
    const historyBefore = { items: (await items(bob)).length, sessions: await db.activitySession.count({ where: { userId: bob } }), results: await db.resultEntry.count({ where: { session: { userId: bob } } }) }

    // Only the owner removes.
    expect((await http(carol, 'DELETE', `/groups/${g.id}/members/${bob}`)).status).toBe(404)
    await ok(alice, 'DELETE', `/groups/${g.id}/members/${bob}`)

    for (const path of [`/groups/${g.id}`, `/groups/${g.id}/completions`, `/groups/${g.id}/media`, `/groups/${g.id}/invitations`, `/media-publications/${pub.id}/comments`]) {
      expect((await http(bob, 'GET', path)).status, path).toBe(404)
    }
    expect((await http(bob, 'POST', `/media-publications/${pub.id}/comments`, { body: 'hi', idempotencyKey: key() })).status).toBe(404)
    expect((await fetch(signed.replace(/^https?:\/\/[^/]+/, base))).status).toBe(404) // already-issued URL
    const occurrence = await ok(bob, 'GET', `/calendar-items/${bobSquats.id}/occurrence`)
    expect([occurrence.collaborators, occurrence.sharedMedia]).toEqual([null, []])
    // History intact, group links cleared, shares and Bob's invitations revoked.
    expect({ items: (await items(bob)).length, sessions: await db.activitySession.count({ where: { userId: bob } }), results: await db.resultEntry.count({ where: { session: { userId: bob } } }) }).toEqual(historyBefore)
    expect(occurrence.resultInputs[0].recorded).toBe(20)
    expect(await db.calendarItem.count({ where: { ownerId: bob, groupOccurrenceKey: { not: null } } })).toBe(0)
    expect((await ok(alice, 'GET', `/groups/${g.id}/completions`)).map((c: any) => c.user.handle)).not.toContain('bob')
    expect((await db.groupInvitation.findUniqueOrThrow({ where: { id: pendingByBob.id } })).status).toBe('REVOKED')

    // The reusable link cannot bring him back; a member cannot re-invite him; the owner can.
    expect((await ok(bob, 'GET', `/group-invitations/${tokenOf(link)}`)).join.status).toBe('UNAVAILABLE')
    expect((await http(bob, 'POST', `/group-invitations/${tokenOf(link)}/accept`)).status).toBe(404)
    await ok(carol, 'POST', `/group-invitations/${tokenOf(link)}/accept`, enrollment())
    expect((await http(carol, 'POST', `/groups/${g.id}/invitations`, { kind: 'USER', handle: 'bob' })).status).toBe(403)
    const back = await inviteHandle(g.id, 'bob')
    expect((await ok(bob, 'GET', `/group-invitations/${tokenOf(back)}`)).join.status).toBe('READY_TO_JOIN')
    const rejoined = await ok(bob, 'POST', `/group-invitations/${tokenOf(back)}/accept`)
    expect(rejoined.myEnrollment).not.toBeNull()
    expect(await db.programEnrollment.count({ where: { userId: bob, programId } })).toBe(1)
  })

  it('leaving ends access at once and keeps the calendar and results', async () => {
    const { versionId } = await program()
    const g = await group(versionId)
    await ok(bob, 'POST', `/group-invitations/${tokenOf(await inviteHandle(g.id, 'bob'))}/accept`, enrollment())
    const count = (await items(bob)).length
    await ok(bob, 'PATCH', `/groups/${g.id}/members/me`, { leave: true })
    expect((await http(bob, 'GET', `/groups/${g.id}`)).status).toBe(404)
    expect((await http(bob, 'GET', `/groups/${g.id}/completions`)).status).toBe(404)
    expect((await items(bob)).length).toBe(count)
    expect((await ok(alice, 'GET', `/groups/${g.id}`)).memberCount).toBe(1)
  })
})

describe('enrollment and schedule failures leave no partial membership', () => {
  it('invalid timezone, wrong SYNC date, missing ASYNC date', async () => {
    const { programId, versionId } = await program()
    const sync = await group(versionId)
    const inv = await inviteHandle(sync.id, 'bob')
    expect((await http(bob, 'POST', `/group-invitations/${tokenOf(inv)}/accept`, enrollment({ timezone: 'Mars/Olympus' }))).status).toBe(400)
    expect((await http(bob, 'POST', `/group-invitations/${tokenOf(inv)}/accept`, enrollment({ startLocalDate: '2026-11-10' }))).status).toBe(400)
    await nothingFor(bob, sync.id, programId)
    expect((await db.groupInvitation.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe('PENDING')
  })

  it('a failure inside the enrollment transaction rolls back membership, grant, invitation and calendar', async () => {
    const { programId, versionId } = await program()
    const g = await group(versionId)
    const inv = await inviteHandle(g.id, 'bob')
    // Enrollments are no longer unique per Program (07 Runs); fail the transaction after its writes instead.
    failEnrollment.on = true
    expect((await ok(bob, 'GET', `/group-invitations/${tokenOf(inv)}`)).join.status).toBe('CONFIRM_ENROLLMENT')
    const body = enrollment()
    const failed = await http(bob, 'POST', `/group-invitations/${tokenOf(inv)}/accept`, body).finally(() => {
      failEnrollment.on = false
    })
    expect(failed.status).toBeGreaterThanOrEqual(400)
    expect(await db.groupMember.count({ where: { groupId: g.id, userId: bob } })).toBe(0)
    expect(await db.programAccessGrant.count({ where: { userId: bob, programId } })).toBe(0)
    expect(await db.calendarItem.count({ where: { ownerId: bob } })).toBe(0)
    expect((await db.groupInvitation.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe('PENDING')
    expect(await db.outboxEvent.count({ where: { type: 'GroupMemberJoined', payload: { path: '$.userId', equals: bob } } })).toBe(0)
    // The failed attempt released its idempotency key: once the cause is gone, the same request succeeds.
    const retried = await http(bob, 'POST', `/group-invitations/${tokenOf(inv)}/accept`, body)
    expect(retried.status).toBe(200)
    expect(retried.body.data.myEnrollment).not.toBeNull()
    expect(await db.calendarItem.count({ where: { ownerId: bob } })).toBeGreaterThan(0)
  })
})
