// Opportunity Radar (12-SOCIAL §5b): every reason, the deterministic tiers, eligibility, privacy and
// blocking boundaries, real Calendar conflicts, and the separate needs-people prompt.
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@project/db'
import { asAuth, buildTestApp, seedUser, testOtherUserId, testUserId, validateResponse } from './helpers'
import { carolId, contractCase, World } from './helpers/contract'
import { seedAchievements, seedCatalog } from './helpers/fixtures'

const app = buildTestApp()
const alice = testUserId
const bob = testOtherUserId
const carol = carolId
let cat: Awaited<ReturnType<typeof seedCatalog>>
beforeEach(async () => {
  cat = await seedCatalog()
  await seedAchievements()
  if (!(await db.user.findUnique({ where: { id: carol } }))) await seedUser(carol, 'carol')
})

let n = 0
const key = () => `radar-key-${++n}-${Date.now()}`
const req = (userId: string | null, method: string, url: string, payload?: unknown) =>
  app.inject({ method: method as any, url, headers: userId ? asAuth(userId) : {}, ...(payload !== undefined ? { payload: payload as any } : {}) })
const ok = async (userId: string, method: string, url: string, payload?: unknown) => {
  const res = await req(userId, method, url, payload)
  if (res.statusCode >= 300) throw new Error(`${method} ${url} → ${res.statusCode}: ${res.body}`)
  return res.json().data
}
const D = '2026-12-12'
const gathering = async (owner: string, activityId: string, body: Record<string, unknown> = {}) =>
  (await ok(owner, 'POST', `/activities/${activityId}/gatherings`, { localDate: D, localTime: '18:00', listPublicly: true, idempotencyKey: key(), ...body })).gathering as { id: string }
const radar = async (userId = alice, qs = '') => {
  const res = await req(userId, 'GET', `/me/opportunities${qs}`)
  expect(res.statusCode).toBe(200)
  await validateResponse('listMyOpportunities', 200, res.json())
  return res.json().data as {
    recommendations: { gathering: { id: string }; reasons: { kind: string; label: string }[]; calendarItemId: string | null; fitsSchedule: boolean }[]
    needsPeople: { gathering: { id: string }; openSpots: number }[]
  }
}
const ids = (r: Awaited<ReturnType<typeof radar>>) => r.recommendations.map((x) => x.gathering.id)

describe('each reason is truthful and tiered', () => {
  it('ON_YOUR_CALENDAR: a planned item of that Activity that day, reused by Join', async () => {
    const mine = (await ok(alice, 'POST', '/calendar/items', { activityId: cat.squats.activity.id, localDate: D, idempotencyKey: key() })).item
    const g = await gathering(bob, cat.squats.activity.id)
    const r = await radar()
    expect(r.recommendations).toHaveLength(1)
    expect(r.recommendations[0]).toMatchObject({ gathering: { id: g.id }, calendarItemId: mine.id, fitsSchedule: true })
    expect(r.recommendations[0]!.reasons[0]).toEqual({ kind: 'ON_YOUR_CALENDAR', label: 'You have Squats on Sat, Dec 12; 1 person is doing it at 6:00 PM' })
    // Joining with the suggested item reuses it.
    const joined = await ok(alice, 'POST', `/gatherings/${g.id}/join`, { calendarItemId: mine.id, idempotencyKey: key() })
    expect(joined.calendarItemId).toBe(mine.id)
    expect(ids(await radar())).toEqual([])
  })

  it('IN_YOUR_PROGRAM: the Activity is in an active enrollment', async () => {
    await new World(app).program() // Alice follows her own Program with Squats and Leg Raises
    const g = await gathering(bob, cat.legRaises.activity.id, { localDate: '2027-01-30' })
    const r = await radar()
    const rec = r.recommendations.find((x) => x.gathering.id === g.id)!
    expect(rec.reasons.map((x) => x.kind)).toContain('IN_YOUR_PROGRAM')
    expect(rec.reasons.find((x) => x.kind === 'IN_YOUR_PROGRAM')!.label).toMatch(/^Part of /)
  })

  it('PEOPLE_YOU_KNOW: someone from an earlier gathering; blocking removes it', async () => {
    const earlier = await gathering(carol, cat.squats.activity.id, { localDate: '2026-12-01' })
    await ok(alice, 'POST', `/gatherings/${earlier.id}/join`, { idempotencyKey: key() })
    const next = await gathering(carol, cat.legRaises.activity.id)
    const rec = (await radar()).recommendations.find((x) => x.gathering.id === next.id)!
    expect(rec.reasons).toEqual([{ kind: 'PEOPLE_YOU_KNOW', label: 'Carol, from an earlier gathering, is organizing' }])
    await ok(alice, 'POST', `/blocked-users/${carol}`)
    expect(ids(await radar())).not.toContain(next.id)
  })

  it('YOUR_INTERESTS: Categories of Activities completed', async () => {
    const done = (await ok(alice, 'POST', '/calendar/items', { activityId: cat.squats.activity.id, localDate: '2026-11-10', idempotencyKey: key() })).item
    await db.calendarItem.update({ where: { id: done.id }, data: { status: 'DONE' } })
    const g = await gathering(bob, cat.legRaises.activity.id)
    const rec = (await radar()).recommendations.find((x) => x.gathering.id === g.id)!
    // Squats and Leg Raises share the Strength Category, so the Category-level reason applies (10 §9.12).
    expect(rec.reasons).toEqual([{ kind: 'YOUR_INTERESTS', label: "Related to your interest in Strength: you've done 1 Strength Activity" }])
  })

  it('no reason, no recommendation; tiers order results; limit bounds them', async () => {
    const stranger = await gathering(bob, cat.legRaises.activity.id)
    expect(ids(await radar())).toEqual([])
    // Interest (tier 4) on an earlier date, Calendar (tier 1) later: tier wins over date.
    const done = (await ok(alice, 'POST', '/calendar/items', { activityId: cat.squats.activity.id, localDate: '2026-11-10', idempotencyKey: key() })).item
    await db.calendarItem.update({ where: { id: done.id }, data: { status: 'DONE' } })
    await ok(alice, 'POST', '/calendar/items', { activityId: cat.squats.activity.id, localDate: '2026-12-20', idempotencyKey: key() })
    const later = await gathering(carol, cat.squats.activity.id, { localDate: '2026-12-20' })
    const r = await radar()
    expect(ids(r)).toEqual([later.id, stranger.id])
    expect(new Set(ids(r)).size).toBe(ids(r).length)
    expect(ids(await radar(alice, '?limit=1'))).toEqual([later.id])
  })
})

describe('eligibility and privacy', () => {
  async function interestedAlice() {
    const done = (await ok(alice, 'POST', '/calendar/items', { activityId: cat.squats.activity.id, localDate: '2026-11-10', idempotencyKey: key() })).item
    await db.calendarItem.update({ where: { id: done.id }, data: { status: 'DONE' } })
  }

  it('excludes full, past, closed, private-uninvited and already-joined gatherings', async () => {
    await interestedAlice()
    const full = await gathering(bob, cat.legRaises.activity.id, { capacity: 1 })
    const past = await gathering(bob, cat.legRaises.activity.id)
    await db.programGroup.update({ where: { id: past.id }, data: { startLocalDate: new Date('2026-11-01T00:00:00Z') } })
    const closed = await gathering(bob, cat.legRaises.activity.id)
    await ok(bob, 'PATCH', `/gatherings/${closed.id}`, { close: true })
    const priv = await gathering(bob, cat.legRaises.activity.id, { listPublicly: false })
    const joined = await gathering(bob, cat.legRaises.activity.id, { localDate: '2026-12-13' })
    await ok(alice, 'POST', `/gatherings/${joined.id}/join`, { idempotencyKey: key() })
    const visible = ids(await radar())
    for (const g of [full, past, closed, priv, joined]) expect(visible).not.toContain(g.id)
  })

  it('a private gathering appears only with a personal invitation (Do It Again)', async () => {
    await interestedAlice()
    const first = await gathering(bob, cat.legRaises.activity.id, { listPublicly: false })
    const link = await ok(bob, 'POST', `/gatherings/${first.id}/link`)
    await ok(carol, 'POST', `/gatherings/${first.id}/join`, { invite: new URL(link.url).searchParams.get('invite'), idempotencyKey: key() })
    // Carol repeats it and invites prior members; Alice was never one, so she sees nothing.
    const again = await ok(carol, 'POST', `/gatherings/${first.id}/repeat`, { localDate: '2026-12-19', inviteParticipants: true, idempotencyKey: key() })
    expect(ids(await radar())).not.toContain(again.gathering.id)
    // Bob was invited and shared the original with Carol: a true reason, so he sees the private repeat.
    const forBob = (await radar(bob)).recommendations.find((x) => x.gathering.id === again.gathering.id)!
    expect(forBob.reasons).toEqual([{ kind: 'PEOPLE_YOU_KNOW', label: 'Carol, from an earlier gathering, is organizing' }])
    await db.groupInvitation.create({ data: { groupId: again.gathering.id, kind: 'USER', invitedUserId: alice, createdById: carol, tokenHash: `t-${key()}`, expiresAt: new Date(Date.now() + 86_400_000) } })
    expect(ids(await radar())).toContain(again.gathering.id)
  })

  it('a real Calendar conflict within an hour excludes it; date-only never conflicts', async () => {
    await interestedAlice()
    await ok(alice, 'POST', '/calendar/items', { activityId: cat.squats.activity.id, localDate: D, localTime: '18:30', idempotencyKey: key() })
    const clash = await gathering(bob, cat.legRaises.activity.id)
    const fine = await gathering(bob, cat.legRaises.activity.id, { localTime: '20:00' })
    const dateOnly = await gathering(bob, cat.legRaises.activity.id, { localTime: null })
    const r = await radar()
    expect(ids(r)).not.toContain(clash.id)
    expect(r.recommendations.find((x) => x.gathering.id === fine.id)?.fitsSchedule).toBe(true)
    expect(r.recommendations.find((x) => x.gathering.id === dateOnly.id)?.fitsSchedule).toBe(false)
  })
})

describe('needs people: a separate prompt for gatherings I joined', () => {
  it('lists open spots for joined gatherings with a capacity, never as a recommendation', async () => {
    const mine = await gathering(bob, cat.squats.activity.id, { capacity: 3 })
    await ok(alice, 'POST', `/gatherings/${mine.id}/join`, { idempotencyKey: key() })
    const full = await gathering(bob, cat.legRaises.activity.id, { capacity: 2 })
    await ok(alice, 'POST', `/gatherings/${full.id}/join`, { idempotencyKey: key() })
    const r = await radar()
    expect(r.needsPeople).toEqual([expect.objectContaining({ gathering: expect.objectContaining({ id: mine.id }), openSpots: 1 })])
    expect(ids(r)).not.toContain(mine.id)
    await ok(alice, 'POST', `/gatherings/${mine.id}/leave`)
    expect((await radar()).needsPeople).toEqual([])
  })
})

describe('listMyOpportunities', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listMyOpportunities')
  })
})
