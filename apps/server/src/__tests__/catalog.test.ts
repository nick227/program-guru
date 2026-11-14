import { describe, it, expect, beforeEach } from 'vitest'
import { bootstrapDatabase, checkDatabaseConsistency, db, deterministicUuid, seedDatabase } from '@project/db'
import { STARTER_CATALOG_PROGRAMS } from '@project/db/prisma/seed'
import { assertLocalResetAllowed } from '@project/db/prisma/seed/bootstrap'
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
  it('deterministically and idempotently seeds taxonomy, 39 curated activities, 20 starter programs, 7 achievements, and rights-cleared media', async () => {
    const first = await seedDatabase(db)
    expect(first).toMatchObject({
      categories: 13,
      focuses: 39,
      programTypes: 24,
      tags: 10,
      metrics: 11,
      tools: 6,
      achievements: 7,
      activities: 39,
      starterPrograms: 20,
    })
    expect(first.platformMediaFiles).toBe(108) // (39 illustrations + 15 Program covers) × (original + thumbnail)
    // Running a second time is a no-op: same row counts, and no file is uploaded again.
    const second = await seedDatabase(db)
    expect(second).toEqual({ ...first, retiredPrograms: 0, retiredActivities: 0, platformMediaUploaded: 0 })
    expect(await db.activity.count({ where: { creatorId: null, status: 'PUBLISHED' } })).toBe(39)
    expect(await db.program.count({ where: { creatorId: null, status: 'PUBLISHED' } })).toBe(20)
    expect(await db.achievementDefinition.count()).toBe(7)
    expect(await db.mediaAsset.count({ where: { ownerId: null, license: null } })).toBe(0)
    // Activities receive durationMinutes and default frequency snapshots; ProgramStats start neutral (no fake counts).
    const plank = await db.activity.findUniqueOrThrow({ where: { slug: 'plank' }, include: { latestPublished: true } })
    expect(plank.durationMinutes).toBe(5)
    expect(plank.latestPublished?.durationMinutesSnapshot).toBe(5)
    expect(plank.latestPublished?.frequencySnapshot).toEqual({ kind: 'N_PER_WEEK', n: 3 })
    const core = await db.program.findFirstOrThrow({
      where: { slug: 'build-your-core', creatorId: null },
      include: {
        tags: { include: { tag: true }, orderBy: { position: 'asc' } },
        latestPublished: { include: { items: { orderBy: [{ relativeDay: 'asc' }, { position: 'asc' }] } } },
      },
    })
    expect(core.level).toBe('BEGINNER')
    expect(core.sessionMinutes).toBe(20)
    expect(core.sessionPresentation).toBe('GROUPED')
    expect(core.latestPublished?.sessionPresentation).toBe('GROUPED')
    const day1Items = core.latestPublished!.items.filter((i) => i.relativeDay === 1)
    expect(day1Items).toHaveLength(4)
    const day1Revs = await db.activityRevision.findMany({ where: { id: { in: day1Items.map((i) => i.activityRevisionId) } } })
    const revById = new Map(day1Revs.map((r) => [r.id, r]))
    expect(day1Items.reduce((sum, i) => sum + (revById.get(i.activityRevisionId)?.durationMinutesSnapshot ?? 0), 0)).toBe(20)
    expect(day1Items.find((i) => i.position === 0)?.targetOverrides).toEqual({ duration: 30 })
    const week4Plank = core.latestPublished!.items.find((i) => i.relativeDay === 22 && i.position === 0)
    expect(week4Plank?.targetOverrides).toEqual({ duration: 60 })
    expect(core.tags.map((t) => t.tag.slug)).toEqual(['no-equipment', 'at-home', 'guided'])
    const water = await db.program.findFirstOrThrow({
      where: { slug: 'drink-one-glass-of-water', creatorId: null },
      include: { latestPublished: true },
    })
    expect(water.sessionPresentation).toBe('SEPARATE')
    expect(water.latestPublished?.durationDays).toBeNull()
    expect(water.latestPublished?.cycleDays).toBe(7)
    const budget = await db.program.findFirstOrThrow({
      where: { slug: 'balance-monthly-budget', creatorId: null },
      include: { latestPublished: true },
    })
    expect(budget.latestPublished?.durationDays).toBeNull()
    expect(budget.latestPublished?.cycleDays).toBeNull()
    expect(budget.latestPublished?.frequency).toEqual({ kind: 'MONTHLY' })
    const tagsRes = await app.inject({ method: 'GET', url: '/catalog/tags' })
    expect(tagsRes.statusCode).toBe(200)
    await validateResponse('listTags', 200, tagsRes.json())
    expect(tagsRes.json().data).toHaveLength(10)
    const stats = await db.programStat.findMany({ where: { program: { creatorId: null } } })
    expect(stats.every((s) => s.enrollmentCount === 0 && Number(s.rankScore) === 0)).toBe(true)
    // The original starter Programs show curated CC0 photographs; starter-catalog Programs use their first
    // Activity's CC0 title card, never a photograph of a real Place (08 §9a).
    const programs = await db.program.findMany({ where: { creatorId: null }, include: { coverMedia: true } })
    expect(programs.every((p) => p.coverMedia?.license === 'CC0-1.0')).toBe(true)
    const catalogSlugs = new Set(STARTER_CATALOG_PROGRAMS.map((p) => p.slug.replace(/^starter-/, '')))
    for (const p of programs) {
      if (catalogSlugs.has(p.slug!)) expect(p.coverMedia?.attribution, p.slug!).not.toContain('commons.wikimedia.org')
      else expect(p.coverMedia?.attribution, p.slug!).toContain('commons.wikimedia.org')
    }
  }, 30000)

  it('maps the starter catalog onto existing records without scheduling anything (01 §11, 08 §9a)', async () => {
    const before = await db.category.findMany({ where: { slug: { in: ['fitness', 'wellness', 'finance', 'relationships', 'education', 'custom'] } } })
    await seedDatabase(db)
    // Existing Domains keep their IDs and slugs; only labels change.
    const after = await db.category.findMany({ where: { slug: { in: ['fitness', 'wellness', 'finance', 'relationships', 'education', 'custom'] } } })
    const afterIds = new Map(after.map((c) => [c.slug, c.id]))
    for (const c of before) expect(afterIds.get(c.slug), c.slug).toBe(c.id)
    expect(Object.fromEntries(after.map((c) => [c.slug, c.label]))).toMatchObject({
      fitness: 'Fitness & Sports', wellness: 'Health & Wellness', finance: 'Work & Finance', relationships: 'Social', education: 'Learning',
    })
    // Every new Domain has exactly one generated, non-featured general Program Type offering all its Categories.
    for (const slug of ['arts-creativity', 'music', 'games', 'entertainment', 'outdoors-nature', 'food-cooking', 'home-community']) {
      const domain = await db.category.findUniqueOrThrow({ where: { slug }, include: { programTypes: { include: { focuses: true } }, focuses: true } })
      expect(domain.programTypes, slug).toHaveLength(1)
      expect(domain.programTypes[0]).toMatchObject({ slug: `${slug}-program`, isFeatured: false })
      expect(domain.programTypes[0]!.focuses).toHaveLength(domain.focuses.length)
    }
    // Existing Education → Music stays; new music content lives under the Music Domain.
    const education = after.find((c) => c.slug === 'education')!
    expect(await db.focus.findUnique({ where: { categoryId_slug: { categoryId: education.id, slug: 'music' } } })).not.toBeNull()
    const guitar = await db.activity.findUniqueOrThrow({ where: { slug: 'twenty-minute-guitar-practice' }, include: { category: true, focuses: { include: { focus: true } } } })
    expect(guitar.category.slug).toBe('music')
    expect(guitar.focuses.map((f) => f.focus.slug)).toEqual(['guitar'])
    expect(guitar.id).toBe(deterministicUuid('activity:twenty-minute-guitar-practice'))
    // Zero-instruction Activities are valid; suggested recurrence maps only when it is a real frequency.
    const swim = await db.activity.findUniqueOrThrow({ where: { slug: 'swim-at-barton-springs' }, include: { latestPublished: { include: { instructions: true } } } })
    expect(swim.latestPublished?.instructions).toHaveLength(0)
    expect(swim.frequency).toBeNull()
    expect((await db.activity.findUniqueOrThrow({ where: { slug: 'twenty-minute-guitar-practice' } })).frequency).toEqual({ kind: 'DAILY' })
    // Dependencies become relative-day order only.
    const film = await db.program.findFirstOrThrow({
      where: { slug: 'short-film', creatorId: null },
      include: { latestPublished: { include: { items: { include: { activity: true }, orderBy: [{ relativeDay: 'asc' }, { position: 'asc' }] } } } },
    })
    expect(film.latestPublished!.items.map((i) => `${i.relativeDay}:${i.activity.slug}`)).toEqual([
      '1:write-short-film-script', '2:create-film-shot-list', '3:direct-film-scene', '3:camera-operator-scene',
      '3:record-sound-scene', '3:act-in-scene', '4:edit-short-film',
    ])
    // Seeded Activities are opportunities, not events.
    expect(await db.calendarItem.count()).toBe(0)
    expect(await db.calendarRecurrence.count()).toBe(0)
    expect(await db.programEnrollment.count()).toBe(0)
    expect(await db.programGroup.count()).toBe(0)
    expect(await db.activitySession.count()).toBe(0)
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
    expect(summary.retiredActivities).toBeGreaterThanOrEqual(1)
    expect((await db.program.findUniqueOrThrow({ where: { id: obsoleteProg.id } })).status).toBe('ARCHIVED')
    expect((await db.activity.findUniqueOrThrow({ where: { id: obsoleteAct.id } })).status).toBe('ARCHIVED')
    expect(await db.programEnrollment.count({ where: { programId: obsoleteProg.id, userId: testUserId } })).toBe(1)
  }, 30000)

  it('unified bootstrapDatabase is idempotent with opt-in demo fixtures and read-only check mode', async () => {
    const first = await bootstrapDatabase({ prisma: db, mode: 'sync', fixtures: 'demo', skipMigrate: true })
    if (first.mode === 'check') throw new Error('expected sync result')
    expect(first.catalog).toMatchObject({ categories: 13, activities: 39, starterPrograms: 20 })
    expect(first.fixtures).toMatchObject({ demoUsers: 2, groups: 1, enrollments: 2 })
    expect(first.counts).toMatchObject({
      managedProgramsActive: 20,
      managedActivitiesActive: 39,
      groups: 1,
      enrollments: 2,
    })

    // Second run produces zero duplicates and uploads zero media files.
    const second = await bootstrapDatabase({ prisma: db, mode: 'sync', fixtures: 'demo', skipMigrate: true })
    if (second.mode === 'check') throw new Error('expected sync result')
    expect(second.catalog.platformMediaUploaded).toBe(0)
    expect(second.counts).toEqual(first.counts)

    // Read-only check mode passes without mutations.
    const checked = await checkDatabaseConsistency(db)
    expect(checked.ok).toBe(true)
    expect(checked.problems).toEqual([])

    // Reset guard refuses production, Railway, and non-local hosts.
    expect(() => assertLocalResetAllowed({ NODE_ENV: 'production', DATABASE_URL: 'mysql://u:p@127.0.0.1:3307/db' })).toThrow()
    expect(() => assertLocalResetAllowed({ RAILWAY_ENVIRONMENT: 'production', DATABASE_URL: 'mysql://u:p@127.0.0.1:3307/db' })).toThrow()
    expect(() => assertLocalResetAllowed({ DATABASE_URL: 'mysql://u:p@db.internal:3306/db' })).toThrow()
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
