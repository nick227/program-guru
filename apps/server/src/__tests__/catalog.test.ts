import { describe, it, expect, beforeEach } from 'vitest'
import { db, deterministicUuid, seedDatabase } from '@project/db'
import { buildTestApp, asAuth, validateResponse, testUserId, testOtherUserId } from './helpers'
import { seedCatalog } from './helpers/fixtures'
import { contractCase } from './helpers/contract'

const app = buildTestApp()
let fitnessId = ''

beforeEach(async () => {
  fitnessId = (await seedCatalog()).fitness.id
})

describe('listProgramTypes', () => {
  it('lists featured types with their focus ids', async () => {
    const res = await app.inject({ method: 'GET', url: '/catalog/program-types' })
    expect(res.statusCode).toBe(200)
    await validateResponse('listProgramTypes', 200, res.json())
    expect(res.json().data[0]).toMatchObject({ slug: 'workout', isFeatured: true })
    expect(res.json().data[0].focusIds).toHaveLength(1)
  })
})

describe('createCustomFocus', () => {
  it('is private to its author and reused rather than duplicated', async () => {
    const first = await app.inject({ method: 'POST', url: '/catalog/focuses', headers: asAuth(testUserId), payload: { categoryId: fitnessId, label: ' Kettlebell  Flow ' } })
    expect(first.statusCode).toBe(201)
    await validateResponse('createCustomFocus', 201, first.json())
    const again = await app.inject({ method: 'POST', url: '/catalog/focuses', headers: asAuth(testUserId), payload: { categoryId: fitnessId, label: 'Kettlebell Flow' } })
    expect(again.json().data.id).toBe(first.json().data.id)
    const mine = await app.inject({ method: 'GET', url: `/catalog/focuses?categoryId=${fitnessId}`, headers: asAuth(testUserId) })
    const theirs = await app.inject({ method: 'GET', url: `/catalog/focuses?categoryId=${fitnessId}`, headers: asAuth(testOtherUserId) })
    expect(mine.json().data.map((f: any) => f.label)).toContain('Kettlebell Flow')
    expect(theirs.json().data.map((f: any) => f.label)).not.toContain('Kettlebell Flow')
  })
})

describe('listMetricDefinitions', () => {
  it('searches platform metrics', async () => {
    const res = await app.inject({ method: 'GET', url: '/catalog/metrics?q=rep' })
    await validateResponse('listMetricDefinitions', 200, res.json())
    expect(res.json().data[0].key).toBe('repetitions')
  })
})

describe('seedDatabase (08 §12, 07 §8, 09 §9a)', () => {
  it('deterministically and idempotently seeds taxonomy, 25 curated activities, 5 starter programs, 7 achievements, and rights-cleared media', async () => {
    const first = await seedDatabase(db)
    expect(first).toMatchObject({
      categories: 6,
      focuses: 20,
      programTypes: 17,
      tags: 10,
      metrics: 11,
      tools: 6,
      achievements: 7,
      activities: 25,
      starterPrograms: 5,
    })
    expect(first.platformMediaFiles).toBe(58) // (24 illustrations + 5 Program covers) × (original + thumbnail)
    // Running a second time is a no-op: same row counts, and no file is uploaded again.
    const second = await seedDatabase(db)
    expect(second).toEqual({ ...first, retiredPrograms: 0, retiredActivities: 0, platformMediaUploaded: 0 })
    expect(await db.activity.count({ where: { creatorId: null, status: 'PUBLISHED' } })).toBe(25)
    expect(await db.program.count({ where: { creatorId: null, status: 'PUBLISHED' } })).toBe(5)
    expect(await db.achievementDefinition.count()).toBe(7)
    expect(await db.mediaAsset.count({ where: { ownerId: null, license: null } })).toBe(0)
    // Activities receive durationMinutes and default frequency snapshots; ProgramStats start neutral (no fake counts).
    const squats = await db.activity.findUniqueOrThrow({ where: { slug: 'squats' }, include: { latestPublished: true } })
    expect(squats.durationMinutes).toBe(8)
    expect(squats.latestPublished?.durationMinutesSnapshot).toBe(8)
    expect(squats.latestPublished?.frequencySnapshot).toEqual({ kind: 'N_PER_WEEK', n: 3 })
    const stats = await db.programStat.findMany({ where: { program: { creatorId: null } } })
    expect(stats.every((s) => s.enrollmentCount === 0 && Number(s.rankScore) === 0)).toBe(true)
    // Every starter Program shows its own curated CC0 cover, not a copied Activity image.
    const programs = await db.program.findMany({ where: { creatorId: null }, include: { coverMedia: true } })
    expect(programs.every((p) => p.coverMedia?.license === 'CC0-1.0' && p.coverMedia.attribution?.includes('commons.wikimedia.org'))).toBe(true)
  }, 30000)

  it('safely archives obsolete platform seeds without removing user enrollments or history', async () => {
    const cat = await db.category.findUniqueOrThrow({ where: { slug: 'fitness' } })
    const pt = await db.programType.findFirstOrThrow({ where: { categoryId: cat.id, slug: 'workout' } })
    const obsoleteAct = await db.activity.create({
      data: {
        id: deterministicUuid('activity:brisk-walk'),
        slug: 'brisk-walk',
        creatorId: null,
        categoryId: cat.id,
        title: 'Brisk Walk',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
      },
    })
    const obsoleteProgId = deterministicUuid('program:starter-hiit-aerobic-conditioning')
    const obsoleteProg = await db.program.create({
      data: {
        id: obsoleteProgId,
        slug: 'hiit-aerobic-conditioning',
        creatorId: null,
        categoryId: cat.id,
        programTypeId: pt.id,
        title: 'HIIT Cardio & Stamina',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
      },
    })
    const version = await db.programVersion.create({
      data: {
        programId: obsoleteProg.id,
        versionNumber: 1,
        title: obsoleteProg.title,
        programTypeId: pt.id,
        frequency: { kind: 'N_PER_WEEK', n: 3 },
        publishedAt: new Date(),
      },
    })
    await db.programEnrollment.create({
      data: {
        userId: testUserId,
        programId: obsoleteProg.id,
        programVersionId: version.id,
        startLocalDate: new Date('2026-11-01'),
        timezone: 'UTC',
        status: 'ACTIVE',
      },
    })

    const summary = await seedDatabase(db)
    expect(summary.retiredPrograms).toBe(1)
    expect(summary.retiredActivities).toBe(1)
    expect((await db.program.findUniqueOrThrow({ where: { id: obsoleteProg.id } })).status).toBe('ARCHIVED')
    expect((await db.activity.findUniqueOrThrow({ where: { id: obsoleteAct.id } })).status).toBe('ARCHIVED')
    expect(await db.programEnrollment.count({ where: { programId: obsoleteProg.id, userId: testUserId } })).toBe(1)
  }, 30000)
})

// ── Contract: one block per operationId (pnpm test:generate recognizes these) ──

describe('listCategories', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listCategories')
  })
})

describe('createCustomProgramType', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'createCustomProgramType')
  })
})

describe('listFocuses', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listFocuses')
  })
})

describe('listToolDefinitions', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listToolDefinitions')
  })
})
