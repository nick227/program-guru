// Discovery associations and "Looking for" (10 §9.12): inherited and additional Categories in Community
// and Radar, the Activity's classification untouched, validation, and the note's visibility, reporting,
// moderation and publishing restriction. Joining is unchanged (gatherings.test.ts).
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@project/db'
import { asAuth, buildTestApp, seedUser, testAdminId, testOtherUserId, testUserId, validateResponse } from './helpers'
import { carolId } from './helpers/contract'
import { seedCatalog } from './helpers/fixtures'

const app = buildTestApp()
const alice = testUserId
const bob = testOtherUserId
const carol = carolId
let cat: Awaited<ReturnType<typeof seedCatalog>>
let arts: { id: string }
let theatre: { id: string }
let actScene: { id: string }
beforeEach(async () => {
  cat = await seedCatalog()
  if (!(await db.user.findUnique({ where: { id: carol } }))) await seedUser(carol, 'carol')
  arts = await db.category.create({ data: { slug: 'arts-creativity', label: 'Arts & Creativity', position: 7 } })
  theatre = await db.focus.create({ data: { categoryId: arts.id, slug: 'theatre', label: 'Theatre' } })
  actScene = await db.activity.create({
    data: { slug: 'act-in-scene', categoryId: arts.id, title: 'Perform in a Scene', status: 'PUBLISHED', visibility: 'PUBLIC', focuses: { create: { focusId: theatre.id } } },
  })
  const rev = await db.activityRevision.create({ data: { activityId: actScene.id, revisionNumber: 1, titleSnapshot: 'Perform in a Scene', publishedAt: new Date() } })
  await db.activity.update({ where: { id: actScene.id }, data: { latestPublishedRevisionId: rev.id } })
})

let n = 0
const key = () => `disc-key-${++n}-${Date.now()}`
const req = (userId: string | null, method: string, url: string, payload?: unknown) =>
  app.inject({ method: method as any, url, headers: userId ? asAuth(userId) : {}, ...(payload !== undefined ? { payload: payload as any } : {}) })
const ok = async (userId: string | null, method: string, url: string, payload?: unknown) => {
  const res = await req(userId, method, url, payload)
  if (res.statusCode >= 300) throw new Error(`${method} ${url} → ${res.statusCode}: ${res.body}`)
  return res.json().data
}
const create = async (owner: string, activityId: string, body: Record<string, unknown> = {}) =>
  ok(owner, 'POST', `/activities/${activityId}/gatherings`, { localDate: '2026-12-12', localTime: '18:00', listPublicly: true, idempotencyKey: key(), ...body })
const completed = async (userId: string, activityId: string) => {
  const item = (await ok(userId, 'POST', '/calendar/items', { activityId, localDate: '2026-11-10', idempotencyKey: key() })).item
  await db.calendarItem.update({ where: { id: item.id }, data: { status: 'DONE' } })
}
const listIds = async (qs: string) => {
  const res = await req(null, 'GET', `/gatherings?when=UPCOMING&${qs}`)
  await validateResponse('listGatherings', 200, res.json())
  return res.json().data.map((g: { id: string }) => g.id)
}

describe('Categories: inherited plus up to 3 additional', () => {
  it('reports inherited first; additional never change the Activity; Community matches both', async () => {
    const before = await db.activityFocus.findMany({ where: { activityId: cat.squats.activity.id } })
    const { gathering: g } = await create(bob, cat.squats.activity.id, { focusIds: [theatre.id], lookingFor: '  Looking for actors and lighting help  ' })
    expect(g.categories).toEqual([
      { id: cat.strength.id, label: 'Strength', inherited: true },
      { id: theatre.id, label: 'Theatre', inherited: false },
    ])
    expect(g.lookingFor).toBe('Looking for actors and lighting help')
    expect(await db.activityFocus.findMany({ where: { activityId: cat.squats.activity.id } })).toEqual(before)
    expect(await listIds(`focusId=${cat.strength.id}`)).toEqual([g.id]) // inherited
    expect(await listIds(`focusId=${theatre.id}`)).toEqual([g.id]) // additional
    expect(await listIds(`categoryId=${arts.id}`)).toEqual([g.id]) // Domain of an additional Category
    expect(await listIds(`categoryId=${cat.fitness.id}`)).toEqual([g.id]) // the Activity's Domain
    const other = await db.focus.create({ data: { categoryId: arts.id, slug: 'photography', label: 'Photography' } })
    expect(await listIds(`focusId=${other.id}`)).toEqual([])
  })

  it('rejects duplicates, inherited repeats, more than 3 and unknown Categories; the owner can replace them', async () => {
    const more = await Promise.all(['a', 'b', 'c'].map((s) => db.focus.create({ data: { categoryId: arts.id, slug: `extra-${s}`, label: `Extra ${s}` } })))
    const bad = async (focusIds: string[]) =>
      (await req(bob, 'POST', `/activities/${cat.squats.activity.id}/gatherings`, { localDate: '2026-12-12', focusIds, idempotencyKey: key() })).statusCode
    expect(await bad([theatre.id, theatre.id])).toBe(400)
    expect(await bad([cat.strength.id])).toBe(400)
    expect(await bad([theatre.id, ...more.map((f) => f.id)])).toBe(400)
    expect(await bad(['00000000-0000-4000-8000-000000000123'])).toBe(400)
    const { gathering: g } = await create(bob, cat.squats.activity.id, { focusIds: [theatre.id] })
    const updated = await ok(bob, 'PATCH', `/gatherings/${g.id}`, { focusIds: [more[0]!.id, more[1]!.id] })
    expect(updated.categories.filter((c: { inherited: boolean }) => !c.inherited).map((c: { id: string }) => c.id)).toEqual([more[0]!.id, more[1]!.id])
    expect((await req(alice, 'PATCH', `/gatherings/${g.id}`, { focusIds: [] })).statusCode).toBe(403)
  })
})

describe('Radar interest reason uses inherited and additional Categories (12 §5b)', () => {
  it('an additional Category matches a completed Activity of that Category', async () => {
    await completed(alice, actScene.id) // Alice performs (Theatre, Arts)
    const plain = (await create(bob, cat.squats.activity.id)).gathering
    const tagged = (await create(bob, cat.squats.activity.id, { localDate: '2026-12-13', focusIds: [theatre.id] })).gathering
    const r = await ok(alice, 'GET', '/me/opportunities')
    const ids = r.recommendations.map((x: { gathering: { id: string } }) => x.gathering.id)
    expect(ids).not.toContain(plain.id) // Fitness/Strength only: no reason for Alice
    expect(r.recommendations.find((x: { gathering: { id: string } }) => x.gathering.id === tagged.id).reasons).toEqual([
      { kind: 'YOUR_INTERESTS', label: "Related to your interest in Theatre: you've done 1 Theatre Activity" },
    ])
  })

  it('falls back to the Domain when no Category matches', async () => {
    const stretch = await db.activity.create({ data: { slug: 'stretch', categoryId: cat.fitness.id, title: 'Stretch', status: 'PUBLISHED', visibility: 'PUBLIC' } })
    const rev = await db.activityRevision.create({ data: { activityId: stretch.id, revisionNumber: 1, titleSnapshot: 'Stretch', publishedAt: new Date() } })
    await db.activity.update({ where: { id: stretch.id }, data: { latestPublishedRevisionId: rev.id } })
    await completed(alice, stretch.id) // Fitness, no Category
    const g = (await create(bob, cat.squats.activity.id)).gathering
    const rec = (await ok(alice, 'GET', '/me/opportunities')).recommendations.find((x: { gathering: { id: string } }) => x.gathering.id === g.id)
    expect(rec.reasons).toEqual([{ kind: 'YOUR_INTERESTS', label: "You've done 1 Fitness Activity" }])
  })
})

describe('Looking for: visibility, reporting, moderation, restriction', () => {
  it('follows visibility, is reportable, hides on moderation and restores', async () => {
    const priv = (await create(bob, cat.squats.activity.id, { listPublicly: false, lookingFor: 'Need a spotter' })).gathering
    expect((await req(alice, 'GET', `/gatherings/${priv.id}`)).statusCode).toBe(404)

    const pub = (await create(bob, cat.squats.activity.id, { lookingFor: 'Looking for actors' })).gathering
    expect((await ok(null, 'GET', `/gatherings/${pub.id}`)).lookingFor).toBe('Looking for actors')
    const report = await ok(alice, 'POST', '/reports', { target: { type: 'GATHERING', id: pub.id }, reason: 'MISLEADING' })
    await ok(testAdminId, 'POST', `/moderation/reports/${report.id}/resolve`, { status: 'RESOLVED', action: 'HIDE', reason: 'Spam note' })
    expect((await ok(null, 'GET', `/gatherings/${pub.id}`)).lookingFor).toBeNull()
    // Hidden even after the owner edits it, until a moderator restores it; the gathering itself stays.
    await ok(bob, 'PATCH', `/gatherings/${pub.id}`, { lookingFor: 'Looking for actors, again' })
    expect((await ok(null, 'GET', `/gatherings/${pub.id}`)).lookingFor).toBeNull()
    await ok(testAdminId, 'POST', `/moderation/reports/${report.id}/resolve`, { status: 'RESOLVED', action: 'RESTORE', reason: 'Appeal accepted' })
    expect((await ok(null, 'GET', `/gatherings/${pub.id}`)).lookingFor).toBe('Looking for actors, again')
    expect((await req(alice, 'POST', '/reports', { target: { type: 'GATHERING', id: cat.squats.activity.id }, reason: 'MISLEADING' })).statusCode).toBe(404)
  })

  it('length, clearing, restricted publishers, and Do It Again copies Categories and note', async () => {
    expect((await req(bob, 'POST', `/activities/${cat.squats.activity.id}/gatherings`, { localDate: '2026-12-12', lookingFor: 'x'.repeat(141), idempotencyKey: key() })).statusCode).toBe(400)
    const { gathering: g } = await create(bob, cat.squats.activity.id, { focusIds: [theatre.id], lookingFor: 'Bring a mat' })
    const again = await ok(bob, 'POST', `/gatherings/${g.id}/repeat`, { localDate: '2026-12-19', idempotencyKey: key() })
    expect(again.gathering).toMatchObject({ lookingFor: 'Bring a mat' })
    expect(again.gathering.categories.map((c: { id: string }) => c.id)).toEqual([cat.strength.id, theatre.id])
    expect((await ok(bob, 'PATCH', `/gatherings/${g.id}`, { lookingFor: '   ' })).lookingFor).toBeNull()
    await db.moderationAction.create({ data: { moderatorId: testAdminId, targetType: 'USER', targetId: bob, action: 'RESTRICT_PUBLISHING', reason: 'test' } })
    expect((await req(bob, 'PATCH', `/gatherings/${g.id}`, { lookingFor: 'New note' })).statusCode).toBe(403)
    expect((await req(bob, 'PATCH', `/gatherings/${g.id}`, { lookingFor: null })).statusCode).toBe(200)
  })
})
