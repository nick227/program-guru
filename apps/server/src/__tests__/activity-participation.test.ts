// Activity participation (03-UX §2b, 12 §10a): who counts, how the count is disclosed, whose avatars
// may be shown, the viewer's own status facts, and one request for many Activities.
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@project/db'
import { asAuth, buildTestApp, seedUser, testOtherUserId, testUserId, validateResponse } from './helpers'
import { carolId, contractCase } from './helpers/contract'
import { seedAchievements, seedCatalog } from './helpers/fixtures'
import { participantBand } from '../domains/activities/participation.service'

const app = buildTestApp()
const alice = testUserId
const bob = testOtherUserId
const carol = carolId
const extra = ['00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000e3']
let cat: Awaited<ReturnType<typeof seedCatalog>>
beforeEach(async () => {
  cat = await seedCatalog()
  await seedAchievements()
  await seedUser(carol, 'carol')
  for (const [i, id] of extra.entries()) await seedUser(id, `extra${i}`)
})

let n = 0
const key = () => `participation-key-${++n}-${Date.now()}`
const req = (userId: string | null, url: string, method = 'GET', payload?: unknown) =>
  app.inject({ method: method as any, url, headers: userId ? asAuth(userId) : {}, ...(payload !== undefined ? { payload: payload as any } : {}) })
const add = async (userId: string, body: Record<string, unknown> = {}) => {
  const res = await req(userId, '/calendar/items', 'POST', { activityId: cat.squats.activity.id, localDate: '2027-03-01', idempotencyKey: key(), ...body })
  expect(res.statusCode).toBe(201)
  return res.json().data
}
const get = async (userId: string | null, ids = [cat.squats.activity.id]) => {
  const res = await req(userId, `/activities/participation?ids=${ids.join(',')}`)
  expect(res.statusCode).toBe(200)
  await validateResponse('listActivityParticipation', 200, res.json())
  return res.json().data as any[]
}

describe('participant band (12 §10a)', () => {
  it('shows 0 exactly, withholds 1–4, and shows 5+', () => {
    expect([0, 1, 4, 5, 12].map(participantBand)).toEqual([
      { band: 'NONE', count: 0 },
      { band: 'FEW', count: null },
      { band: 'FEW', count: null },
      { band: 'COUNT', count: 5 },
      { band: 'COUNT', count: 12 },
    ])
  })
})

describe('listActivityParticipation', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listActivityParticipation')
  })

  it('zero participants: an explicit 0, no avatars, never added', async () => {
    const [p] = await get(alice)
    expect(p).toMatchObject({
      participants: { band: 'NONE', count: 0, includesViewer: false },
      avatars: [],
      shared: { activeNow: 0, going: 0, nextGathering: null },
      viewer: { everAdded: false, lastAddedAt: null, completedCount: 0, inProgressItemId: null, upcoming: [] },
    })
  })

  it('one solo participant: withheld to others, never as an avatar; the participant sees themself', async () => {
    await add(alice)
    const [toBob] = await get(bob)
    expect(toBob.participants).toEqual({ band: 'FEW', count: null, includesViewer: false })
    expect(toBob.avatars).toEqual([])
    const [toAlice] = await get(alice)
    expect(toAlice.participants).toEqual({ band: 'FEW', count: null, includesViewer: true })
    expect(toAlice.avatars.map((a: { id: string }) => a.id)).toEqual([alice])
    const [anon] = await get(null)
    expect(anon).toMatchObject({ participants: { band: 'FEW', count: null }, avatars: [], viewer: null })
  })

  it('counts people, not occurrences: a weekly recurrence and a one-off are one person', async () => {
    const weekly = await add(alice, { recurrence: { kind: 'WEEKLY' } })
    expect(weekly.createdCount).toBeGreaterThan(1)
    await add(alice, { localDate: '2027-03-03' })
    for (const id of [bob, carol, extra[0]!]) await add(id)
    // 4 people however many items: still withheld.
    expect((await get(null))[0].participants).toEqual({ band: 'FEW', count: null, includesViewer: false })
    await add(extra[1]!)
    expect((await get(null))[0].participants).toEqual({ band: 'COUNT', count: 5, includesViewer: false })
    // A cancelled item is not participation.
    const last = await add(extra[2]!)
    await req(extra[2]!, `/calendar-items/${last.item.id}`, 'DELETE')
    expect((await get(null))[0].participants.count).toBe(5)
  })

  it("the viewer's facts: upcoming with recurrence, completions, in progress, last added", async () => {
    const weekly = await add(alice, { recurrence: { kind: 'WEEKLY', weekdays: [1] }, localTime: '07:30' })
    const [p] = await get(alice)
    expect(p.viewer.everAdded).toBe(true)
    expect(p.viewer.lastAddedAt).toEqual(expect.any(String))
    expect(p.viewer.upcoming).toHaveLength(3)
    expect(p.viewer.upcoming[0]).toMatchObject({ localTime: '07:30', recurrenceId: weekly.recurrence.id, recurrence: { rule: { kind: 'WEEKLY', weekdays: [1] }, untilDate: null } })

    // Completed in the past and a running session both show up, independently.
    const once = await add(alice, { localDate: '2026-01-05' })
    await db.calendarItem.update({ where: { id: once.item.id }, data: { status: 'DONE' } })
    const first = p.viewer.upcoming[0]
    await db.activitySession.create({
      data: {
        calendarItemId: first.id,
        userId: alice,
        status: 'ACTIVE',
        activityRevisionId: (await db.calendarItem.findUniqueOrThrow({ where: { id: first.id } })).activityRevisionId,
      },
    })
    const [after] = await get(alice)
    expect(after.viewer).toMatchObject({ completedCount: 1, lastCompletedDate: '2026-01-05', inProgressItemId: first.id })
  })

  it('shared activity: avatars of a public gathering, and nothing from a private one', async () => {
    const pub = await req(carol, `/activities/${cat.squats.activity.id}/gatherings`, 'POST', { localDate: '2027-03-06', localTime: '09:00', listPublicly: true, idempotencyKey: key() })
    expect(pub.statusCode).toBe(201)
    const [toBob] = await get(bob)
    expect(toBob.avatars.map((a: { id: string }) => a.id)).toEqual([carol])
    expect(toBob.shared).toMatchObject({ activeNow: 0, going: 1, nextGathering: { id: pub.json().data.gathering.id, memberCount: 1 } })

    // A private gathering stays private: no avatars, no going count for others.
    await db.programGroup.update({ where: { id: pub.json().data.gathering.id }, data: { visibility: 'PRIVATE', joinPolicy: 'INVITE_ONLY' } })
    const [hidden] = await get(bob)
    expect(hidden.avatars).toEqual([])
    expect(hidden.shared).toEqual({ activeNow: 0, going: 0, nextGathering: null })
    // ...but Carol, the member, still sees her own gathering.
    expect((await get(carol))[0].shared.going).toBe(1)
  })

  it("omits Activities the viewer may not see, and refuses bad ids", async () => {
    const own = await req(alice, '/activities', 'POST', { title: 'Private notes', categoryId: cat.squats.activity.categoryId, idempotencyKey: key() })
    const privateId = own.statusCode < 300 ? own.json().data.id : null
    if (privateId) {
      expect((await get(alice, [privateId])).map((p) => p.activityId)).toEqual([privateId])
      expect(await get(bob, [privateId])).toEqual([])
    }
    expect(await get(null, ['00000000-0000-4000-8000-00000000ffff'])).toEqual([])
    expect((await req(null, '/activities/participation?ids=not-a-uuid')).statusCode).toBe(400)
    const many = Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
    expect((await req(null, `/activities/participation?ids=${many.join(',')}`)).statusCode).toBe(400)
  })

  it('answers many Activities in one request, each separately', async () => {
    await add(alice)
    const ids = [cat.squats.activity.id, cat.legRaises.activity.id]
    const list = await get(alice, ids)
    expect(list.map((p) => [p.activityId, p.viewer.everAdded])).toEqual([
      [cat.squats.activity.id, true],
      [cat.legRaises.activity.id, false],
    ])
  })
})
