// Community discovery shortcuts resolve to /discover filters (12 §5a): planned duration, default
// frequency (daily habits), and search that also matches the suggested Place's name and city.
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@project/db'
import { buildTestApp, validateResponse } from './helpers'
import { seedCatalog, seedPlace } from './helpers/fixtures'

const app = buildTestApp()
let cat: Awaited<ReturnType<typeof seedCatalog>>
beforeEach(async () => {
  cat = await seedCatalog()
})

const ids = async (qs: string) => {
  const res = await app.inject({ method: 'GET', url: `/discover?kind=ACTIVITY&${qs}` })
  expect(res.statusCode).toBe(200)
  await validateResponse('discover', 200, res.json())
  return res.json().data.map((r: { activity: { id: string } }) => r.activity.id).sort()
}

describe('ACTIVITY discover filters', () => {
  it('filters by planned minutes on the published snapshot, using the Community buckets', async () => {
    await db.activityRevision.update({ where: { id: cat.squats.revision.id }, data: { durationMinutesSnapshot: 10 } })
    await db.activityRevision.update({ where: { id: cat.legRaises.revision.id }, data: { durationMinutesSnapshot: 25 } })
    expect(await ids('duration=SHORT')).toEqual([cat.squats.activity.id])
    expect(await ids('duration=MEDIUM')).toEqual([cat.legRaises.activity.id])
    expect(await ids('duration=LONG')).toEqual([])
    // ONGOING is a Program bucket; it does not restrict Activities.
    expect((await ids('duration=ONGOING')).length).toBe(2)
  })

  it('filters daily habits by the published default frequency, not a draft edit', async () => {
    await db.activityRevision.update({ where: { id: cat.squats.revision.id }, data: { frequencySnapshot: { kind: 'DAILY' } } })
    await db.activityRevision.update({ where: { id: cat.legRaises.revision.id }, data: { frequencySnapshot: { kind: 'N_PER_WEEK', n: 3 } } })
    // An unpublished draft value on the Activity row never leaks into the filter.
    await db.activity.update({ where: { id: cat.legRaises.activity.id }, data: { frequency: { kind: 'DAILY' } } })
    expect(await ids('frequency=DAILY')).toEqual([cat.squats.activity.id])
    expect(await ids('frequency=N_PER_WEEK')).toEqual([cat.legRaises.activity.id])
  })

  it('search matches the suggested Place name and city, but never an inactive Place', async () => {
    const barton = await seedPlace()
    await db.activity.update({ where: { id: cat.squats.activity.id }, data: { placeId: barton.id } })
    expect(await ids('q=Barton')).toEqual([cat.squats.activity.id])
    expect(await ids('q=austin')).toEqual([cat.squats.activity.id])
    expect(await ids('q=raises')).toEqual([cat.legRaises.activity.id])
    await db.place.update({ where: { id: barton.id }, data: { isActive: false } })
    expect(await ids('q=Barton')).toEqual([])
  })
})
