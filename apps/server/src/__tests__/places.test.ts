// Places (08-ACTIVITIES §2a, 09-CALENDARS §2, 12-SOCIAL §5a): platform-curated catalog records, the
// suggested place on an Activity, and the scheduled place copied onto each Calendar Item.
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@project/db'
import { asAuth, buildTestApp, testOtherUserId, testUserId, validateResponse } from './helpers'
import { contractCase, World } from './helpers/contract'
import { seedAchievements, seedCatalog, seedPlace } from './helpers/fixtures'

const app = buildTestApp()
let cat: Awaited<ReturnType<typeof seedCatalog>>
beforeEach(async () => {
  cat = await seedCatalog()
  await seedAchievements()
})

const req = (method: string, url: string, payload?: unknown, userId = testUserId) =>
  app.inject({ method: method as any, url, headers: asAuth(userId), ...(payload !== undefined ? { payload: payload as any } : {}) })
let n = 0
const key = () => `place-key-${++n}-${Date.now()}`
const suggest = (activityId: string, placeId: string | null) => db.activity.update({ where: { id: activityId }, data: { placeId } })

describe('Place catalog', () => {
  it('lists active Places by city and reads one by slug or id; inactive Places are invisible', async () => {
    const barton = await seedPlace()
    await seedPlace('closed-pool', { isActive: false })
    await seedPlace('town-lake', { locality: 'Dallas' })

    const austin = await app.inject({ method: 'GET', url: '/catalog/places?locality=austin' })
    await validateResponse('listPlaces', 200, austin.json())
    expect(austin.json().data.map((p: { slug: string }) => p.slug)).toEqual(['barton-springs'])
    const all = await app.inject({ method: 'GET', url: '/catalog/places' })
    expect(all.json().data.map((p: { slug: string }) => p.slug).sort()).toEqual(['barton-springs', 'town-lake'])

    const bySlug = await app.inject({ method: 'GET', url: '/catalog/places/barton-springs' })
    await validateResponse('getPlace', 200, bySlug.json())
    expect(bySlug.json().data).toMatchObject({ id: barton.id, name: 'Barton Springs Pool', locality: 'Austin', accessNote: expect.any(String) })
    expect((await app.inject({ method: 'GET', url: `/catalog/places/${barton.id}` })).json().data.slug).toBe('barton-springs')
    expect((await app.inject({ method: 'GET', url: '/catalog/places/closed-pool' })).statusCode).toBe(404)
  })
})

describe('suggested place on an Activity', () => {
  it('is set, changed and cleared in the draft; inactive Places are rejected; existing items keep theirs', async () => {
    const barton = await seedPlace()
    const lake = await seedPlace('town-lake')
    const closed = await seedPlace('closed-pool', { isActive: false })

    const rejected = await req('POST', '/activities', { title: 'Evening Swim', categoryId: cat.fitness.id, placeId: closed.id })
    expect(rejected.statusCode).toBe(400)

    const created = await req('POST', '/activities', { title: 'Evening Swim', categoryId: cat.fitness.id, placeId: barton.id })
    expect(created.statusCode).toBe(201)
    await validateResponse('createActivity', 201, created.json())
    const activity = created.json().data
    expect(activity.place).toMatchObject({ id: barton.id, name: 'Barton Springs Pool' })

    const item = (await req('POST', '/calendar/items', { activityId: activity.id, localDate: '2026-11-20', idempotencyKey: key() })).json().data.item
    expect(item.place?.id).toBe(barton.id)

    const changed = await req('PATCH', `/activities/${activity.id}/draft`, { placeId: lake.id, expectedRevision: activity.draftRevision })
    expect(changed.statusCode).toBe(200)
    await validateResponse('updateActivityDraft', 200, changed.json())
    expect(changed.json().data.place.id).toBe(lake.id)
    const cleared = await req('PATCH', `/activities/${activity.id}/draft`, { placeId: null, expectedRevision: changed.json().data.draftRevision })
    expect(cleared.json().data.place).toBeNull()

    // A snapshot: the scheduled place never follows later Activity edits (09 §2).
    expect((await db.calendarItem.findUniqueOrThrow({ where: { id: item.id } })).placeId).toBe(barton.id)
  })
})

describe('scheduled place on Calendar Items (09 §2)', () => {
  it('copies the Activity place by default; explicit id and null override it; one user never affects another', async () => {
    const barton = await seedPlace()
    const lake = await seedPlace('town-lake')
    await suggest(cat.squats.activity.id, barton.id)

    const copied = await req('POST', '/calendar/items', { activityId: cat.squats.activity.id, localDate: '2026-11-20', idempotencyKey: key() })
    await validateResponse('addCalendarItem', 201, copied.json())
    expect(copied.json().data.item.place).toMatchObject({ id: barton.id, locality: 'Austin' })

    const explicit = await req('POST', '/calendar/items', { activityId: cat.squats.activity.id, localDate: '2026-11-21', placeId: lake.id, idempotencyKey: key() })
    expect(explicit.json().data.item.place.id).toBe(lake.id)
    const none = await req('POST', '/calendar/items', { activityId: cat.squats.activity.id, localDate: '2026-11-22', placeId: null, idempotencyKey: key() })
    expect(none.json().data.item.place).toBeNull()
    const bad = await req('POST', '/calendar/items', { activityId: cat.squats.activity.id, localDate: '2026-11-22', placeId: '00000000-0000-4000-8000-000000000999', idempotencyKey: key() })
    expect(bad.statusCode).toBe(400)

    const bobs = (await req('POST', '/calendar/items', { activityId: cat.squats.activity.id, localDate: '2026-11-20', idempotencyKey: key() }, testOtherUserId)).json().data.item

    // Change and clear on one item only.
    const item = copied.json().data.item
    const moved = await req('PATCH', `/calendar-items/${item.id}`, { placeId: lake.id, expectedUpdatedAt: item.updatedAt })
    expect(moved.statusCode).toBe(200)
    await validateResponse('updateCalendarItem', 200, moved.json())
    expect(moved.json().data).toMatchObject({ place: { id: lake.id }, localDate: '2026-11-20', status: 'PLANNED' })
    const cleared = await req('PATCH', `/calendar-items/${item.id}`, { placeId: null, expectedUpdatedAt: moved.json().data.updatedAt })
    expect(cleared.json().data.place).toBeNull()
    expect((await db.calendarItem.findUniqueOrThrow({ where: { id: bobs.id } })).placeId).toBe(barton.id)

    // Changing the Activity's suggested place later rewrites no existing item.
    await suggest(cat.squats.activity.id, lake.id)
    expect((await db.calendarItem.findUniqueOrThrow({ where: { id: bobs.id } })).placeId).toBe(barton.id)
  })

  it('a recurrence carries its place to generated items; updating it applies from the effective date', async () => {
    const barton = await seedPlace()
    const lake = await seedPlace('town-lake')
    await suggest(cat.squats.activity.id, barton.id)

    const added = await req('POST', '/calendar/items', { activityId: cat.squats.activity.id, localDate: '2026-11-16', recurrence: { kind: 'DAILY' }, untilDate: '2026-11-22', idempotencyKey: key() })
    expect(added.statusCode).toBe(201)
    const recurrenceId = added.json().data.recurrence.id
    const items = await db.calendarItem.findMany({ where: { recurrenceId }, orderBy: { localDate: 'asc' } })
    expect(items).toHaveLength(7)
    expect(items.every((i) => i.placeId === barton.id)).toBe(true)

    const updated = await req('PATCH', `/calendar/recurrences/${recurrenceId}`, { placeId: lake.id, effectiveFromDate: '2026-11-19' })
    expect(updated.statusCode).toBe(200)
    await validateResponse('updateCalendarRecurrence', 200, updated.json())
    const open = await db.calendarItem.findMany({ where: { ownerId: testUserId, status: 'PLANNED' }, orderBy: { localDate: 'asc' } })
    expect(open.map((i) => [i.localDate.toISOString().slice(0, 10), i.placeId === lake.id ? 'lake' : 'barton'])).toEqual([
      ['2026-11-16', 'barton'], ['2026-11-17', 'barton'], ['2026-11-18', 'barton'],
      ['2026-11-19', 'lake'], ['2026-11-20', 'lake'], ['2026-11-21', 'lake'], ['2026-11-22', 'lake'],
    ])
  })

  it('Program enrollment copies each Activity place onto its items', async () => {
    const barton = await seedPlace()
    await suggest(cat.squats.activity.id, barton.id)
    await new World(app).program()
    const items = await db.calendarItem.findMany({ where: { ownerId: testUserId, enrollmentId: { not: null } }, select: { activityId: true, placeId: true } })
    expect(items.length).toBeGreaterThan(0)
    for (const i of items) expect(i.placeId).toBe(i.activityId === cat.squats.activity.id ? barton.id : null)
  })
})

describe('city discovery (12 §5a)', () => {
  it('filters Activities by Place and by city; inactive Places never match', async () => {
    const barton = await seedPlace()
    const dallas = await seedPlace('town-lake', { locality: 'Dallas' })
    await suggest(cat.squats.activity.id, barton.id)
    await suggest(cat.legRaises.activity.id, dallas.id)

    const slugs = async (qs: string) => {
      const res = await app.inject({ method: 'GET', url: `/discover?kind=ACTIVITY&${qs}` })
      await validateResponse('discover', 200, res.json())
      return res.json().data.map((r: { activity: { id: string } }) => r.activity.id)
    }
    expect(await slugs('locality=Austin')).toEqual([cat.squats.activity.id])
    expect(await slugs(`placeId=${dallas.id}`)).toEqual([cat.legRaises.activity.id])
    expect((await slugs('')).length).toBe(2)

    expect((await slugs('hasPlace=true')).sort()).toEqual([cat.squats.activity.id, cat.legRaises.activity.id].sort())

    await db.place.update({ where: { id: barton.id }, data: { isActive: false } })
    expect(await slugs('locality=Austin')).toEqual([])
    expect(await slugs('hasPlace=true')).toEqual([cat.legRaises.activity.id])
  })
})

describe('listPlaces', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listPlaces')
  })
})

describe('getPlace', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'getPlace')
  })
})
