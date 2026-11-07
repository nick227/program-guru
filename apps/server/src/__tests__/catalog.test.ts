import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@project/db'
import { buildTestApp, asAuth, validateResponse, testUserId, testOtherUserId } from './helpers'

const app = buildTestApp()
let fitnessId = ''

beforeEach(async () => {
  const fitness = await db.category.create({ data: { slug: 'fitness', label: 'Fitness', position: 1 } })
  fitnessId = fitness.id
  const strength = await db.focus.create({ data: { categoryId: fitness.id, slug: 'strength', label: 'Strength' } })
  await db.programType.create({
    data: { categoryId: fitness.id, slug: 'workout', label: 'Workout', isFeatured: true, focuses: { create: { focusId: strength.id } } },
  })
  await db.metricDefinition.create({ data: { key: 'repetitions', label: 'Reps', valueType: 'INTEGER', unit: 'reps', aggregation: 'SUM' } })
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
