// Program discovery quality (12-SOCIAL §5c): Following means actual follows, FOR_YOU tiers with one
// truthful reason each, cold start, emerging creators, owned/enrolled exclusion, no platform-first bias.
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@project/db'
import { asAuth, buildTestApp, seedUser, testOtherUserId, testUserId, validateResponse } from './helpers'
import { seedCatalog } from './helpers/fixtures'

const app = buildTestApp()
const alice = testUserId // the viewer
const bob = testOtherUserId // an established creator
const carol = '00000000-0000-4000-8000-0000000000c1' // an emerging creator
const dave = '00000000-0000-4000-8000-0000000000d1' // another creator
let cat: Awaited<ReturnType<typeof seedCatalog>>
let arts: { id: string }
beforeEach(async () => {
  cat = await seedCatalog()
  await seedUser(carol, 'carol')
  await seedUser(dave, 'dave')
  arts = await db.category.create({ data: { slug: 'arts-creativity', label: 'Arts & Creativity', position: 7 } })
})

const DAY = 86_400_000
let n = 0
/** A published public Program with an optional rank score and age (days). */
async function program(creatorId: string | null, opts: { title?: string; categoryId?: string; focusId?: string | null; ageDays?: number; rank?: number } = {}) {
  const createdAt = new Date(Date.now() - (opts.ageDays ?? 200) * DAY)
  const title = opts.title ?? `Program ${++n}`
  const p = await db.program.create({
    data: {
      creatorId,
      title,
      categoryId: opts.categoryId ?? cat.fitness.id,
      programTypeId: cat.workout.id,
      focusId: opts.focusId ?? null,
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
      createdAt,
      policy: { create: { accessMode: 'OPEN' } },
    },
  })
  const v = await db.programVersion.create({ data: { programId: p.id, versionNumber: 1, title, programTypeId: cat.workout.id, frequency: { kind: 'DAILY' }, publishedAt: createdAt } })
  await db.program.update({ where: { id: p.id }, data: { latestPublishedVersionId: v.id } })
  if (opts.rank) await db.programStat.create({ data: { programId: p.id, enrollmentCount: 10, rankScore: opts.rank } })
  return { id: p.id, versionId: v.id, title }
}
const discover = async (qs: string, viewer: string | null = alice) => {
  const res = await app.inject({ method: 'GET', url: `/discover?kind=PROGRAM&limit=50&${qs}`, headers: viewer ? asAuth(viewer) : {} })
  expect(res.statusCode).toBe(200)
  await validateResponse('discover', 200, res.json())
  return res.json().data as { program: { id: string; title: string }; reason: { kind: string; label: string } | null }[]
}
const titles = (rows: Awaited<ReturnType<typeof discover>>) => rows.map((r) => r.program.title)
const completed = async (activityId: string) => {
  const item = (await app.inject({ method: 'POST', url: '/calendar/items', headers: asAuth(alice), payload: { activityId, localDate: '2026-11-10', idempotencyKey: `fy-${++n}-${Date.now()}` } })).json().data.item
  await db.calendarItem.update({ where: { id: item.id }, data: { status: 'DONE' } })
}

describe('Following means actual follows', () => {
  it('FOR_YOU leads with followed creators; creatorScope=FOLLOWING filters Programs and Creators; unfollow and block remove them', async () => {
    await program(bob, { title: 'Bob Strength', rank: 80 })
    await program(carol, { title: 'Carol Mobility', ageDays: 10 })
    await app.inject({ method: 'POST', url: `/follow-users/${carol}`, headers: asAuth(alice) })

    const forYou = await discover('sort=FOR_YOU')
    expect(forYou[0]).toMatchObject({ program: { title: 'Carol Mobility' }, reason: { kind: 'FOLLOWING', label: 'New from Carol, who you follow' } })
    expect(titles(await discover('creatorScope=FOLLOWING'))).toEqual(['Carol Mobility'])
    const creators = await app.inject({ method: 'GET', url: '/discover?kind=CREATOR&creatorScope=FOLLOWING', headers: asAuth(alice) })
    expect(creators.json().data.map((r: { creator: { handle: string } }) => r.creator.handle)).toEqual(['carol'])
    // Signed out, nobody is followed.
    expect(await discover('creatorScope=FOLLOWING', null)).toEqual([])

    await app.inject({ method: 'POST', url: `/blocked-users/${carol}`, headers: asAuth(alice) })
    expect(await discover('creatorScope=FOLLOWING')).toEqual([])
    expect(titles(await discover('sort=FOR_YOU'))).not.toContain('Carol Mobility')
  })
})

describe('FOR_YOU tiers and truthful reasons', () => {
  it('cold start: varied established and new Programs across Domains, labelled Explore or New', async () => {
    await program(bob, { title: 'Bob Strength', rank: 80 })
    await program(bob, { title: 'Bob Cardio', rank: 60 })
    await program(dave, { title: 'Dave Sketching', categoryId: arts.id, ageDays: 5 })
    const rows = await discover('sort=FOR_YOU')
    expect(rows.map((r) => r.reason?.kind)).toEqual(['EXPLORE', 'EXPLORE', 'EXPLORE'])
    // Domains alternate: the second item is from another Domain than the first.
    expect(titles(rows).slice(0, 2)).toEqual(['Bob Strength', 'Dave Sketching'])
    expect(rows.find((r) => r.program.title === 'Bob Strength')!.reason!.label).toBe('Explore Fitness')
    expect(rows.find((r) => r.program.title === 'Dave Sketching')!.reason!.label).toBe('New in Arts & Creativity')
    // A Domain picked in the Agent or in Community filters is a truthful interest reason.
    const picked = await discover(`sort=FOR_YOU&categoryId=${arts.id}`)
    expect(picked.map((r) => r.reason)).toEqual([{ kind: 'YOUR_INTERESTS', label: 'In Arts & Creativity, which you picked' }])
  })

  it('completed Activities: Category first, then Domain; interest tier precedes Explore', async () => {
    await completed(cat.squats.activity.id) // Fitness / Strength
    await program(dave, { title: 'Dave Sketching', categoryId: arts.id, rank: 90 })
    await program(bob, { title: 'Bob Strength', focusId: cat.strength.id, rank: 20 })
    await program(bob, { title: 'Bob Fitness', rank: 10 })
    const rows = await discover('sort=FOR_YOU')
    expect(rows.map((r) => [r.program.title, r.reason?.label])).toEqual([
      ['Bob Strength', 'Matches your Strength Activities'],
      ['Bob Fitness', 'Matches your Fitness Activities'],
      ['Dave Sketching', 'Explore Arts & Creativity'],
    ])
  })

  it('emerging creators are interleaved within a tier they qualify for, never ahead of relevance', async () => {
    await completed(cat.squats.activity.id)
    for (const r of [90, 80, 70]) await program(bob, { title: `Bob ${r}`, rank: r })
    await program(carol, { title: 'Carol Fitness' }) // unranked: emerging
    await program(carol, { title: 'Carol Sketching', categoryId: arts.id }) // emerging but no interest
    const order = titles(await discover('sort=FOR_YOU'))
    expect(order.indexOf('Carol Fitness')).toBe(2) // at most two established before it
    expect(order.indexOf('Carol Sketching')).toBe(order.length - 1) // Explore, after every interest match
  })

  it('owned and previously enrolled Programs stay out of FOR_YOU but remain in normal browsing', async () => {
    const enrolled = await program(bob, { title: 'Bob Enrolled', rank: 90 })
    await db.programEnrollment.create({ data: { userId: alice, programId: enrolled.id, programVersionId: enrolled.versionId, startLocalDate: new Date('2026-10-01T00:00:00Z'), timezone: 'America/Chicago', status: 'COMPLETED' } })
    await program(alice, { title: 'Alice Own', rank: 95 })
    await program(bob, { title: 'Bob Other', rank: 10 })
    expect(titles(await discover('sort=FOR_YOU'))).toEqual(['Bob Other'])
    expect(titles(await discover('sort=RELEVANT'))).toEqual(['Alice Own', 'Bob Enrolled', 'Bob Other'])
  })

  it('every FOR_YOU item has exactly one reason; other sorts and signed-out requests have none', async () => {
    await program(bob, { rank: 50 })
    await program(dave, { categoryId: arts.id })
    expect((await discover('sort=FOR_YOU')).every((r) => r.reason && r.reason.label.length > 0)).toBe(true)
    expect((await discover('sort=RELEVANT')).every((r) => r.reason === null)).toBe(true)
    expect((await discover('sort=FOR_YOU', null)).every((r) => r.reason === null)).toBe(true)
  })

  it('eligibility: private, moderated and deleted Programs never appear', async () => {
    const priv = await program(bob, { title: 'Private' })
    await db.program.update({ where: { id: priv.id }, data: { visibility: 'PRIVATE' } })
    const mod = await program(bob, { title: 'Moderated' })
    await db.program.update({ where: { id: mod.id }, data: { moderatedAt: new Date() } })
    const del = await program(bob, { title: 'Deleted' })
    await db.program.update({ where: { id: del.id }, data: { deletedAt: new Date() } })
    await program(bob, { title: 'Visible' })
    expect(titles(await discover('sort=FOR_YOU'))).toEqual(['Visible'])
  })
})

describe('no unconditional platform-first ranking', () => {
  it('RELEVANT orders by rank score, then newest, whoever made the Program', async () => {
    await program(null, { title: 'Platform 10', rank: 10 })
    await program(bob, { title: 'Creator 50', rank: 50 })
    expect(titles(await discover('sort=RELEVANT'))).toEqual(['Creator 50', 'Platform 10'])
    await program(null, { title: 'Platform 90', rank: 90 })
    expect(titles(await discover('sort=RELEVANT'))[0]).toBe('Platform 90')
    await program(dave, { title: 'Newer unranked', ageDays: 1 })
    await program(carol, { title: 'Older unranked', ageDays: 100 })
    const order = titles(await discover('sort=RELEVANT'))
    expect(order.indexOf('Newer unranked')).toBeLessThan(order.indexOf('Older unranked'))
  })
})
