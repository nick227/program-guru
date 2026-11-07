import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@project/db'
import { buildTestApp, asAuth, validateResponse, testUserId, testOtherUserId } from './helpers'
import { seedCatalog } from './helpers/fixtures'

const app = buildTestApp()
let cat: Awaited<ReturnType<typeof seedCatalog>>
beforeEach(async () => {
  cat = await seedCatalog()
})

const create = (userId = testUserId, title = 'Morning Stretch') =>
  app.inject({ method: 'POST', url: '/activities', headers: asAuth(userId), payload: { title, categoryId: cat.fitness.id, focusIds: [cat.strength.id] } })

describe('listActivities', () => {
  it('lists seeded activities first with counts and filters by focus', async () => {
    await create()
    const res = await app.inject({ method: 'GET', url: `/activities?focusId=${cat.strength.id}`, headers: asAuth(testUserId) })
    expect(res.statusCode).toBe(200)
    await validateResponse('listActivities', 200, res.json())
    const titles = res.json().data.map((a: any) => a.title)
    expect(titles.slice(0, 2)).toEqual(['Leg Raises', 'Squats'])
    expect(titles).toContain('Morning Stretch')
    const squats = res.json().data.find((a: any) => a.title === 'Squats')
    expect(squats).toMatchObject({ isPlatform: true, instructionCount: 3, mediaCount: 1, metricLabels: ['Reps'] })
    expect(squats.thumbnailUrl).toContain(cat.illustration.id)
  })

  it('never shows another user’s private draft', async () => {
    await create(testOtherUserId, 'Bob Secret')
    const res = await app.inject({ method: 'GET', url: '/activities?q=Secret', headers: asAuth(testUserId) })
    expect(res.json().data).toHaveLength(0)
    expect((await app.inject({ method: 'GET', url: `/activities/${(await db.activity.findFirstOrThrow({ where: { title: 'Bob Secret' } })).id}`, headers: asAuth(testUserId) })).statusCode).toBe(404)
  })
})

describe('activity authoring', () => {
  it('edits a draft with instructions, activity and instruction metrics, and tools', async () => {
    const created = (await create()).json().data
    expect(created).toMatchObject({ status: 'DRAFT', visibility: 'PRIVATE', canEdit: true, draftRevision: 0 })
    let res = await app.inject({
      method: 'PUT', url: `/activities/${created.id}/draft/instructions`, headers: asAuth(testUserId),
      payload: { expectedRevision: 0, instructions: [{ title: 'Warm up', body: 'Loosen up' }, { title: 'Hold', body: 'Hold each stretch' }] },
    })
    expect(res.statusCode).toBe(200)
    await validateResponse('putActivityInstructions', 200, res.json())
    const [warm, hold] = res.json().data.instructions
    res = await app.inject({
      method: 'PUT', url: `/activities/${created.id}/draft/metrics`, headers: asAuth(testUserId),
      payload: { expectedRevision: 1, metrics: [
        { metricDefinitionId: cat.duration.id, defaults: { target: 600 } },
        { metricDefinitionId: cat.duration.id, instructionKey: hold.instructionKey, rollupToMetricKey: 'duration' },
      ] },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.metrics[0]).toMatchObject({ key: 'duration', defaultTarget: 600 })
    expect(res.json().data.instructions[1].metrics[0].key).toBe('duration')
    res = await app.inject({
      method: 'PUT', url: `/activities/${created.id}/draft/tools`, headers: asAuth(testUserId),
      payload: { expectedRevision: 2, tools: [{ toolDefinitionId: cat.timer.id, instructionKey: hold.instructionKey, config: { seconds: 30 } }] },
    })
    expect(res.json().data.instructions[1].tools[0]).toMatchObject({ key: 'TIMER', config: { seconds: 30 } })
    // Reorder and drop one; instructionKey is preserved for the survivor.
    res = await app.inject({
      method: 'PUT', url: `/activities/${created.id}/draft/instructions`, headers: asAuth(testUserId),
      payload: { expectedRevision: 3, instructions: [{ instructionKey: hold.instructionKey, title: 'Hold' }] },
    })
    expect(res.json().data.instructions.map((i: any) => i.instructionKey)).toEqual([hold.instructionKey])
    expect(warm.instructionKey).not.toBe(hold.instructionKey)
  })

  it('rejects a stale expectedRevision and a roll-up to an incompatible metric', async () => {
    const created = (await create()).json().data
    const stale = await app.inject({ method: 'PATCH', url: `/activities/${created.id}/draft`, headers: asAuth(testUserId), payload: { title: 'X', expectedRevision: 5 } })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().code).toBe('VERSION_CONFLICT')
    const ins = (await app.inject({ method: 'PUT', url: `/activities/${created.id}/draft/instructions`, headers: asAuth(testUserId), payload: { expectedRevision: 0, instructions: [{ title: 'A' }] } })).json().data.instructions[0]
    const bad = await app.inject({
      method: 'PUT', url: `/activities/${created.id}/draft/metrics`, headers: asAuth(testUserId),
      payload: { expectedRevision: 1, metrics: [{ metricDefinitionId: cat.reps.id }, { metricDefinitionId: cat.duration.id, instructionKey: ins.instructionKey, rollupToMetricKey: 'repetitions' }] },
    })
    expect(bad.statusCode).toBe(400)
  })

  it('publishes, then editing starts a new draft revision while the published one stays fixed', async () => {
    const created = (await create()).json().data
    const pub = await app.inject({ method: 'POST', url: `/activities/${created.id}/publish`, headers: asAuth(testUserId), payload: { visibility: 'PUBLIC', expectedRevision: 0 } })
    expect(pub.statusCode).toBe(200)
    await validateResponse('publishActivity', 200, pub.json())
    const publishedRev = pub.json().data.revisionId
    await app.inject({ method: 'PATCH', url: `/activities/${created.id}/draft`, headers: asAuth(testUserId), payload: { title: 'Evening Stretch', expectedRevision: 1 } })
    const asOwner = await app.inject({ method: 'GET', url: `/activities/${created.id}`, headers: asAuth(testUserId) })
    const asOther = await app.inject({ method: 'GET', url: `/activities/${created.id}`, headers: asAuth(testOtherUserId) })
    expect(asOwner.json().data.title).toBe('Evening Stretch')
    expect(asOwner.json().data.revisionId).not.toBe(publishedRev)
    expect(asOther.json().data).toMatchObject({ title: 'Morning Stretch', revisionId: publishedRev, canEdit: false, canCopy: true })
  })
})

describe('copyActivity', () => {
  it('creates a private personal copy with attribution and never changes the source', async () => {
    const res = await app.inject({ method: 'POST', url: `/activities/${cat.squats.activity.id}/copy`, headers: asAuth(testUserId), payload: { newTitle: 'My Squats' } })
    expect(res.statusCode).toBe(201)
    await validateResponse('copyActivity', 201, res.json())
    expect(res.json().data).toMatchObject({ title: 'My Squats', visibility: 'PRIVATE', isCopy: true, instructionCount: 3, mediaCount: 1 })
    expect(res.json().data.sourceActivity.id).toBe(cat.squats.activity.id)
    const copy = await db.activity.findUniqueOrThrow({ where: { id: res.json().data.id } })
    expect(copy.canonicalActivityId).toBe(cat.squats.activity.id)
    const src = await db.activityRevision.findUniqueOrThrow({ where: { id: cat.squats.revision.id }, include: { instructions: true } })
    expect(src.instructions).toHaveLength(3)
    const edit = await app.inject({ method: 'PATCH', url: `/activities/${cat.squats.activity.id}/draft`, headers: asAuth(testUserId), payload: { title: 'Hijack', expectedRevision: 0 } })
    expect(edit.statusCode).toBe(404)
  })
})
