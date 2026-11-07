import { describe, it, expect, beforeEach } from 'vitest'
import { db, seedDatabase } from '@project/db'
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
  it('deterministically and idempotently seeds 81 activities, 5 starter programs, 7 achievements, and rights-cleared media', async () => {
    const first = await seedDatabase(db)
    expect(first).toEqual({
      categories: 6,
      focuses: 20,
      programTypes: 17,
      metrics: 11,
      tools: 6,
      achievements: 7,
      activities: 81,
      starterPrograms: 5,
    })
    // Running a second time is a no-op and produces the exact same row counts.
    const second = await seedDatabase(db)
    expect(second).toEqual(first)
    expect(await db.activity.count({ where: { creatorId: null, status: 'PUBLISHED' } })).toBe(81)
    expect(await db.program.count({ where: { creatorId: null, status: 'PUBLISHED' } })).toBe(5)
    expect(await db.achievementDefinition.count()).toBe(7)
    expect(await db.mediaAsset.count({ where: { ownerId: null, license: null } })).toBe(0)
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
