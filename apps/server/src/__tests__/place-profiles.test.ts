import { seedPlaces } from '../../../../packages/db/prisma/seed/writer'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@project/db'
import { asAuth, buildTestApp, rootAdminId, seedUser, testOtherUserId, testUserId, validateResponse } from './helpers'
import { seedAchievements, seedCatalog, seedPlace } from './helpers/fixtures'
import { contractCase } from './helpers/contract'

const app = buildTestApp()
let catalog: Awaited<ReturnType<typeof seedCatalog>>
let sequence = 0
const key = () => `location-test-${++sequence}`
const req = (method: string, url: string, payload?: unknown, who: string | null = testUserId) => app.inject({ method, url, ...(who ? { headers: asAuth(who) } : {}), ...(payload ? { payload } : {}) })
const input = () => ({ name: 'Alice Studio', addressLine: '123 Main Street', locality: 'Austin', region: 'TX', countryCode: 'US', idempotencyKey: key() })
const create = async (extra: Record<string, unknown> = {}, who = testUserId) => {
  const response = await req('POST', '/catalog/places', { ...input(), ...extra }, who)
  expect(response.statusCode, response.body).toBe(201)
  await validateResponse('createPlace', 201, response.json())
  return response.json().data
}
beforeEach(async () => { catalog = await seedCatalog(); await seedAchievements() })

describe('location directory and profile associations', () => {
  it('business A creates, B searches and schedules, and the activity/occurrence link resolves A’s business profile', async () => {
    const profile = await req('PATCH', '/users/me/profile', { businessPhone: '+1 512 555 0100', businessWebsite: 'https://studio.example' })
    expect(profile.statusCode).toBe(200)
    const place = await create({ linkToMyBusiness: true })
    expect(place.businessProfile).toMatchObject({ handle: 'alice', profileUrl: '/@alice' })
    const search = await req('GET', '/catalog/places?q=123%20Main', undefined, testOtherUserId)
    expect(search.json().data.map((p: any) => p.id)).toContain(place.id)
    expect(search.json().data[0].canManage).toBe(false)
    const scheduled = await req('POST', '/calendar/items', { activityId: catalog.squats.activity.id, localDate: '2026-11-20', placeId: place.id, idempotencyKey: key() }, testOtherUserId)
    expect(scheduled.statusCode).toBe(201)
    expect(scheduled.json().data.item.place.businessProfile.profileUrl).toBe('/@alice')
    await db.activity.update({ where: { id: catalog.squats.activity.id }, data: { placeId: place.id } })
    const activity = await req('GET', `/activities/${catalog.squats.activity.id}`, undefined, testOtherUserId)
    expect(activity.json().data.place.businessProfile.handle).toBe('alice')
    const publicProfile = await req('GET', '/users/alice', undefined, testOtherUserId)
    expect(publicProfile.json().data).toMatchObject({ businessPhone: '+1 512 555 0100', businessWebsite: 'https://studio.example/', locations: [{ id: place.id }] })
    await validateResponse('getUserByHandle', 200, publicProfile.json())
    expect((await req('GET', '/auth/me')).json().data.profile.locations).toHaveLength(1)
  })

  it('creation is repeat-safe; duplicates prompt reuse and selecting never claims ownership', async () => {
    const body = input()
    const first = await req('POST', '/catalog/places', body)
    const again = await req('POST', '/catalog/places', body)
    expect(again.json().data.id).toBe(first.json().data.id)
    expect(await db.place.count()).toBe(1)
    expect((await req('POST', '/catalog/places', { ...body, idempotencyKey: key(), linkToMyBusiness: true }, testOtherUserId)).statusCode).toBe(409)
    const p = first.json().data
    expect(p.businessProfile).toBeNull()
    expect((await req('PATCH', `/catalog/places/${p.id}`, { name: 'Stolen', expectedUpdatedAt: p.updatedAt }, testOtherUserId)).statusCode).toBe(403)
    expect((await req('PATCH', `/catalog/places/${p.id}`, { businessProfileUserId: testOtherUserId, expectedUpdatedAt: p.updatedAt }, testOtherUserId)).statusCode).toBe(400)
    const seeded = await seedPlace()
    expect((await req('POST', '/catalog/places', { name: seeded.name, addressLine: seeded.addressLine, locality: seeded.locality, region: seeded.region, countryCode: seeded.countryCode, idempotencyKey: key() })).statusCode).toBe(409)
  })

  it('private addresses are selectable only by their submitter and cannot become public activity/gathering locations', async () => {
    const p = await create({ visibility: 'PRIVATE' })
    for (const who of [null, testOtherUserId]) {
      expect((await req('GET', '/catalog/places?q=Alice', undefined, who)).json().data).toEqual([])
      expect((await req('GET', `/catalog/places/${p.id}`, undefined, who)).statusCode).toBe(404)
    }
    expect((await req('GET', '/catalog/places?publicOnly=true')).json().data).toEqual([])
    const body = { activityId: catalog.squats.activity.id, localDate: '2026-11-20', placeId: p.id, idempotencyKey: key() }
    expect((await req('POST', '/calendar/items', body)).json().data.item.place.id).toBe(p.id)
    expect((await req('POST', '/calendar/items', { ...body, idempotencyKey: key() }, testOtherUserId)).statusCode).toBe(400)
    expect((await req('POST', '/activities', { title: 'Private leak', categoryId: catalog.fitness.id, placeId: p.id })).statusCode).toBe(400)
    expect((await req('POST', `/activities/${catalog.squats.activity.id}/gatherings`, { localDate: '2027-03-06', placeId: p.id, idempotencyKey: key() })).statusCode).toBe(400)
    expect((await req('PATCH', `/catalog/places/${p.id}`, { visibility: 'PUBLIC', expectedUpdatedAt: p.updatedAt })).statusCode).toBe(400)
    // Defensive projection even if a legacy/bad write referenced a private address.
    await db.activity.update({ where: { id: catalog.squats.activity.id }, data: { placeId: p.id } })
    expect((await req('GET', `/activities/${catalog.squats.activity.id}`, undefined, null)).json().data.place).toBeNull()
  })

  it('private profiles, blocks and inactive business accounts do not leak contact details or links', async () => {
    const p = await create({ linkToMyBusiness: true })
    await req('PATCH', '/users/me/profile', { visibility: 'PRIVATE', businessPhone: '555-0100', businessWebsite: 'https://studio.example' })
    const profile = (await req('GET', '/users/alice', undefined, testOtherUserId)).json().data
    expect(profile.businessPhone).toBeNull(); expect(profile.businessWebsite).toBeNull(); expect(profile.locations).toEqual([])
    expect((await req('GET', `/catalog/places/${p.id}`, undefined, testOtherUserId)).json().data.businessProfile).toBeNull()
    await req('PATCH', '/users/me/profile', { visibility: 'PUBLIC', handle: 'alice-new' })
    expect((await req('GET', `/catalog/places/${p.id}`, undefined, null)).json().data.businessProfile.profileUrl).toBe('/@alice-new')
    await db.userBlock.create({ data: { blockerId: testOtherUserId, blockedId: testUserId } })
    expect((await req('GET', `/catalog/places/${p.id}`, undefined, testOtherUserId)).json().data.businessProfile).toBeNull()
    await db.user.update({ where: { id: testUserId }, data: { status: 'SUSPENDED' } })
    expect((await req('GET', `/catalog/places/${p.id}`, undefined, null)).json().data.businessProfile).toBeNull()
  })

  it('admin association, ownership transfer and unlink preserve place identity and existing activity references', async () => {
    await seedUser(rootAdminId, 'root', { role: 'ADMIN' })
    let p = await create()
    await db.activity.update({ where: { id: catalog.squats.activity.id }, data: { placeId: p.id } })
    const associate = (who: string, profileId: string | null) => req('PATCH', `/admin/places/${p.id}/business`, { businessProfileUserId: profileId, expectedUpdatedAt: p.updatedAt }, who)
    expect((await associate(testUserId, testUserId)).statusCode).toBe(403)
    let result = await associate(rootAdminId, testOtherUserId)
    expect(result.statusCode, result.body).toBe(200)
    await validateResponse('associatePlaceBusiness', 200, result.json())
    p = result.json().data
    expect(p.businessProfile.handle).toBe('bob')
    result = await req('PATCH', `/catalog/places/${p.id}`, { unlinkBusiness: true, expectedUpdatedAt: p.updatedAt }, testOtherUserId)
    expect(result.statusCode).toBe(200)
    expect(result.json().data.businessProfile).toBeNull()
    expect((await db.activity.findUniqueOrThrow({ where: { id: catalog.squats.activity.id } })).placeId).toBe(p.id)
    expect(await db.placeAssociationAudit.count({ where: { placeId: p.id, actorId: rootAdminId } })).toBe(1)
  })

  it('management is versioned, deactivation hides search results, and profile deletion keeps the place', async () => {
    let p = await create({ linkToMyBusiness: true })
    const edited = await req('PATCH', `/catalog/places/${p.id}`, { addressLine: '999 New Road', expectedUpdatedAt: p.updatedAt })
    expect(edited.statusCode).toBe(200)
    await validateResponse('updatePlace', 200, edited.json())
    expect((await req('PATCH', `/catalog/places/${p.id}`, { name: 'Stale', expectedUpdatedAt: p.updatedAt })).statusCode).toBe(409)
    p = edited.json().data
    const inactive = await req('PATCH', `/catalog/places/${p.id}`, { isActive: false, expectedUpdatedAt: p.updatedAt })
    expect(inactive.statusCode).toBe(200)
    expect((await req('GET', '/catalog/places', undefined, null)).json().data).toEqual([])
    await db.userProfile.delete({ where: { userId: testUserId } })
    const retained = await db.place.findUniqueOrThrow({ where: { id: p.id } })
    expect(retained.businessProfileUserId).toBeNull(); expect(retained.name).toBe('Alice Studio')
  })

  it('deployment bootstrap preserves edited/deactivated seeded locations after a business is unlinked', async () => {
    const ids = await seedPlaces(db)
    const id = [...ids.values()][0]!
    await db.place.update({ where: { id }, data: { name: 'Owner corrected name', addressLine: '999 Corrected Road', isActive: false, businessProfileUserId: testUserId } })
    await db.place.update({ where: { id }, data: { businessProfileUserId: null } })
    await seedPlaces(db)
    expect(await db.place.findUniqueOrThrow({ where: { id } })).toMatchObject({ name: 'Owner corrected name', addressLine: '999 Corrected Road', isActive: false, businessProfileUserId: null })
    expect(await db.place.count()).toBe(ids.size)
  })

  it('search pages public results without leaking private matches and rejects unsafe websites and blank names', async () => {
    for (let i = 0; i < 13; i++) await create({ name: `Studio ${i.toString().padStart(2, '0')}`, addressLine: `${i} Main St`, visibility: i === 0 ? 'PRIVATE' : 'PUBLIC' })
    const first = (await req('GET', '/catalog/places?q=Studio&limit=10', undefined, null)).json()
    expect(first.data).toHaveLength(10); expect(first.meta.hasMore).toBe(true)
    const next = (await req('GET', `/catalog/places?q=Studio&limit=10&cursor=${first.meta.nextCursor}`, undefined, null)).json()
    expect(next.data).toHaveLength(2)
    expect(new Set([...first.data, ...next.data].map(p => p.id)).size).toBe(12)
    expect((await req('POST', '/catalog/places', { ...input(), name: '   ' })).statusCode).toBe(400)
    expect((await req('POST', '/catalog/places', { ...input(), sourceUrl: 'javascript:alert(1)' })).statusCode).toBe(400)
    expect((await req('PATCH', '/users/me/profile', { businessWebsite: 'javascript:alert(1)' })).statusCode).toBe(400)
  })
})

for (const operation of ['createPlace', 'updatePlace', 'associatePlaceBusiness']) describe(operation, () => {
  it('matches the contract', async () => { await contractCase(app, operation) })
})
