import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@project/db'
import { buildTestApp, asAuth, validateResponse, testUserId, testOtherUserId } from './helpers'
import { seedAchievements, seedCatalog } from './helpers/fixtures'
import { contractCase } from './helpers/contract'

const app = buildTestApp()
let cat: Awaited<ReturnType<typeof seedCatalog>>
beforeEach(async () => {
  cat = await seedCatalog()
  await seedAchievements()
})

const req = (method: string, url: string, payload?: unknown, userId = testUserId) =>
  app.inject({ method: method as any, url, headers: asAuth(userId), ...(payload !== undefined ? { payload: payload as any } : {}) })
let n = 0
const key = () => `test-key-${++n}-${Date.now()}`

const addOnce = (localDate: string, localTime: string | null = null, activityId = cat.squats.activity.id) =>
  req('POST', '/calendar/items', { activityId, localDate, localTime, idempotencyKey: key() })

describe('standalone and recurring entries (P1)', () => {
  it('adds a one-off activity and lists the week', async () => {
    const res = await addOnce('2026-11-10', '07:00')
    expect(res.statusCode).toBe(201)
    await validateResponse('addCalendarItem', 201, res.json())
    const week = await req('GET', '/calendar/items?start=2026-11-09&end=2026-11-15')
    expect(week.statusCode).toBe(200)
    await validateResponse('listCalendarItems', 200, week.json())
    expect(week.json().data).toEqual([expect.objectContaining({ title: 'Squats', localDate: '2026-11-10', localTime: '07:00', status: 'PLANNED', programTitle: null })])
  })

  it('a weekly Tuesday entry: move one, cancel this-and-future, keep the past', async () => {
    const body = { activityId: cat.squats.activity.id, localDate: '2026-11-10', localTime: '18:00', recurrence: { kind: 'WEEKLY', weekdays: [2] }, idempotencyKey: 'weekly-tue' }
    const res = await req('POST', '/calendar/items', body)
    expect(res.statusCode).toBe(201)
    const created = res.json().data
    expect(created.recurrence).toMatchObject({ rule: { kind: 'WEEKLY', weekdays: [2] }, status: 'ACTIVE' })
    expect(created.createdCount).toBeGreaterThanOrEqual(12)
    const replay = await req('POST', '/calendar/items', body)
    expect(replay.json().data.item.id).toBe(created.item.id)
    const total = await db.calendarItem.count({ where: { ownerId: testUserId } })
    expect(total).toBe(created.createdCount)

    const items = (await req('GET', '/calendar/items?start=2026-11-09&end=2026-12-06')).json().data
    expect(items.map((i: any) => i.localDate)).toEqual(['2026-11-10', '2026-11-17', '2026-11-24', '2026-12-01'])
    const moved = await req('PATCH', `/calendar-items/${items[1].id}`, { localDate: '2026-11-18', expectedUpdatedAt: items[1].updatedAt })
    expect(moved.statusCode).toBe(200)
    expect(moved.json().data.localDate).toBe('2026-11-18')
    const stale = await req('PATCH', `/calendar-items/${items[1].id}`, { localTime: '19:00', expectedUpdatedAt: items[1].updatedAt })
    expect(stale.statusCode).toBe(409)

    // Finish the first one, then cancel from Nov 24 onward.
    const s = (await req('POST', '/sessions', { calendarItemId: items[0].id, idempotencyKey: key() })).json().data
    await req('POST', `/sessions/${s.id}/actions`, { action: 'FINISH', expectedRevision: 0 })
    await req('DELETE', `/calendar-items/${items[2].id}?scope=THIS_AND_FUTURE`)
    const after = (await req('GET', '/calendar/items?start=2026-11-09&end=2026-12-31')).json().data
    expect(after.map((i: any) => [i.localDate, i.status])).toEqual([
      ['2026-11-10', 'DONE'],
      ['2026-11-18', 'PLANNED'], // the moved one is the user's own adjustment and survives
    ])
    const recurrences = await req('GET', '/calendar/recurrences')
    await validateResponse('listCalendarRecurrences', 200, recurrences.json())
    expect(recurrences.json().data[0].untilDate).toBe('2026-11-23')
  })

  it('flags overlapping timed items and moves one to the next open slot', async () => {
    await addOnce('2026-11-10', '07:00')
    const second = (await addOnce('2026-11-10', '07:00', cat.legRaises.activity.id)).json().data.item
    const week = (await req('GET', '/calendar/items?start=2026-11-10&end=2026-11-10')).json().data
    expect(week.every((i: any) => i.conflict)).toBe(true)
    const moved = await req('POST', `/calendar-items/${second.id}/move-to-open-slot`)
    expect(moved.json().data).toMatchObject({ localDate: '2026-11-10', localTime: '07:30', conflict: false })
  })

  it('caps the range and requires auth', async () => {
    expect((await req('GET', '/calendar/items?start=2026-01-01&end=2026-06-01')).statusCode).toBe(400)
    expect((await app.inject({ method: 'GET', url: '/calendar/items?start=2026-01-01&end=2026-01-07' })).statusCode).toBe(401)
  })

  it('never shows or touches another user’s items', async () => {
    const mine = (await addOnce('2026-11-10')).json().data.item
    expect((await req('GET', `/calendar-items/${mine.id}/occurrence`, undefined, testOtherUserId)).statusCode).toBe(404)
    expect((await req('DELETE', `/calendar-items/${mine.id}`, undefined, testOtherUserId)).statusCode).toBe(404)
  })
})

describe('sessions: each Activity runs independently (decision 21)', () => {
  it('start, pause, resume, finish; paused time is excluded; the other activity that day is untouched', async () => {
    const squats = (await addOnce('2026-11-10')).json().data.item
    const legs = (await addOnce('2026-11-10', null, cat.legRaises.activity.id)).json().data.item
    const created = await req('POST', '/sessions', { calendarItemId: squats.id, idempotencyKey: key() })
    expect(created.statusCode).toBe(201)
    let s = created.json().data
    s = (await req('POST', `/sessions/${s.id}/actions`, { action: 'START', expectedRevision: s.revision })).json().data.session
    // Simulate 40s active, then a pause.
    await db.activitySession.update({ where: { id: s.id }, data: { lastResumedAt: new Date(Date.now() - 40_000) } })
    s = (await req('POST', `/sessions/${s.id}/actions`, { action: 'PAUSE', expectedRevision: s.revision })).json().data.session
    expect(s.activeSeconds).toBeGreaterThanOrEqual(40)
    const doubleTap = await req('POST', `/sessions/${s.id}/actions`, { action: 'RESUME', expectedRevision: s.revision - 1 })
    expect(doubleTap.statusCode).toBe(409)
    s = (await req('POST', `/sessions/${s.id}/actions`, { action: 'RESUME', expectedRevision: s.revision })).json().data.session
    const finished = await req('POST', `/sessions/${s.id}/actions`, { action: 'FINISH', expectedRevision: s.revision })
    expect(finished.statusCode).toBe(200)
    await validateResponse('applySessionAction', 200, finished.json())
    expect(finished.json().data.session.status).toBe('FINISHED')
    expect(finished.json().data.session.activeSeconds).toBeLessThan(45)
    expect(finished.json().data.item.status).toBe('DONE')
    expect((await db.calendarItem.findUniqueOrThrow({ where: { id: legs.id } })).status).toBe('PLANNED')
    expect(await db.activitySession.count({ where: { calendarItemId: legs.id } })).toBe(0)
    const bad = await req('POST', `/sessions/${s.id}/actions`, { action: 'PAUSE', expectedRevision: finished.json().data.session.revision })
    expect(bad.statusCode).toBe(409)
  })

  it('records typed results, keeps targets separate from recorded values, and computes personal stats', async () => {
    const item = (await addOnce('2026-11-10')).json().data.item
    let occ = (await req('GET', `/calendar-items/${item.id}/occurrence`)).json().data
    expect(occ.resultInputs[0]).toMatchObject({ key: 'repetitions', target: 10, recorded: null, previous: null })
    expect(occ.collaborators).toBeNull()
    expect(occ.sharedMedia).toEqual([])
    const s = (await req('POST', '/sessions', { calendarItemId: item.id, idempotencyKey: key() })).json().data
    expect((await req('POST', `/sessions/${s.id}/results`, { values: [{ metricDefinitionId: cat.reps.id, value: 2.5 }] })).statusCode).toBe(400)
    expect((await req('POST', `/sessions/${s.id}/results`, { values: [{ metricDefinitionId: cat.duration.id, value: 60 }] })).statusCode).toBe(400) // not bound to Squats
    const saved = await req('POST', `/sessions/${s.id}/results`, { values: [{ metricDefinitionId: cat.reps.id, value: 12 }], notes: 'felt good' })
    expect(saved.statusCode).toBe(201)
    await validateResponse('saveSessionResult', 201, saved.json())
    await req('POST', `/sessions/${s.id}/actions`, { action: 'FINISH', expectedRevision: 0 })
    occ = (await req('GET', `/calendar-items/${item.id}/occurrence`)).json().data
    await validateResponse('getActivityOccurrence', 200, { data: occ })
    expect(occ.resultInputs[0]).toMatchObject({ target: 10, recorded: 12 })
    expect(occ.instructions).toHaveLength(3)
    expect(occ.personalStats.map((p: any) => [p.key, p.value])).toEqual([
      ['last', '12 reps'],
      ['best', '12 reps'],
      ['completed', '1'],
    ])
    const detail = await req('GET', `/sessions/${s.id}`)
    await validateResponse('getSession', 200, detail.json())
    expect(detail.json().data.entries[0].values[0]).toMatchObject({ key: 'repetitions', value: 12 })
  })

  it('quick finish from READY records a manual completion with unknown measured time', async () => {
    const item = (await addOnce('2026-11-10')).json().data.item
    const s = (await req('POST', '/sessions', { calendarItemId: item.id, idempotencyKey: key() })).json().data
    const res = (await req('POST', `/sessions/${s.id}/actions`, { action: 'FINISH', expectedRevision: 0 })).json().data
    expect(res.session).toMatchObject({ status: 'FINISHED', isManualCompletion: true, activeSeconds: 0 })
  })
})

describe('achievements derived from actual completions', () => {
  it('earns on the first real completion, emits AchievementEarned outbox event, revokes on undo, and is private until shared', async () => {
    const item = (await addOnce('2026-11-10')).json().data.item
    const s = (await req('POST', '/sessions', { calendarItemId: item.id, idempotencyKey: key() })).json().data
    const fin = (await req('POST', `/sessions/${s.id}/actions`, { action: 'FINISH', expectedRevision: 0 })).json().data
    expect(fin.achievementsEarned.map((a: any) => a.key)).toEqual(['first-completion'])
    const earnedEvents = await db.outboxEvent.findMany({ where: { type: 'AchievementEarned' } })
    expect(earnedEvents).toHaveLength(1)
    expect(earnedEvents[0]!.payload).toMatchObject({
      userId: testUserId,
      key: 'first-completion',
      sourceCalendarItemId: item.id,
    })
    const mine = await req('GET', '/achievements/me')
    await validateResponse('listMyAchievements', 200, mine.json())
    expect((await app.inject({ method: 'GET', url: '/users/alice/achievements' })).json().data).toEqual([])
    const shared = await req('PATCH', `/achievements/${mine.json().data[0].id}`, { isShared: true })
    expect(shared.json().data.isShared).toBe(true)
    expect((await app.inject({ method: 'GET', url: '/users/alice/achievements' })).json().data).toHaveLength(1)

    const undone = await req('POST', `/calendar-items/${item.id}/undo-completion`)
    expect(undone.json().data.status).toBe('PLANNED')
    expect((await req('GET', '/achievements/me')).json().data).toEqual([])
    expect(await db.activitySession.count({ where: { calendarItemId: item.id, status: 'FINISHED' } })).toBe(1) // history kept
  })

  it('an abandoned attempt is not a completion', async () => {
    const item = (await addOnce('2026-11-10')).json().data.item
    const s = (await req('POST', '/sessions', { calendarItemId: item.id, idempotencyKey: key() })).json().data
    const res = (await req('POST', `/sessions/${s.id}/actions`, { action: 'ABANDON', expectedRevision: 0 })).json().data
    expect(res.achievementsEarned).toEqual([])
    expect(res.item.status).toBe('PLANNED')
  })
})

describe('locked Program occurrences withhold instructional content while preserving personal logs', () => {
  it('withholds instructions, tools, and private revision access after entitlement is revoked', async () => {
    // Alice creates a private activity with instructions, tools, and metrics, inside an APPROVAL program.
    const act = (await req('POST', '/activities', { title: 'Secret Drill', categoryId: cat.fitness.id })).json().data
    await req('PUT', `/activities/${act.id}/draft/instructions`, {
      expectedRevision: 0,
      instructions: [{ title: 'Step 1', body: 'Secret technique cue' }],
    })
    await req('PUT', `/activities/${act.id}/draft/metrics`, {
      expectedRevision: 1,
      metrics: [{ metricDefinitionId: cat.reps.id, required: true, defaults: { target: 15 } }],
    })
    await req('PUT', `/activities/${act.id}/draft/tools`, {
      expectedRevision: 2,
      tools: [{ toolDefinitionId: cat.timer.id }],
    })
    await req('POST', `/activities/${act.id}/publish`, { visibility: 'PRIVATE', expectedRevision: 3 })

    let ws = (await req('POST', '/programs', { programTypeId: cat.workout.id })).json().data
    ws = (await req('POST', `/programs/${ws.id}/draft/activities`, { activityIds: [act.id], expectedRevision: ws.draftRevision })).json().data
    ws = (await req('PATCH', `/programs/${ws.id}/draft`, { title: 'Members Coaching', durationDays: 7, frequency: { kind: 'DAILY' }, expectedRevision: ws.draftRevision })).json().data
    const pub = (await req('POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'APPROVAL', expectedRevision: ws.draftRevision })).json().data

    // Bob requests access and Alice approves; Bob enrolls and logs a result on Day 1.
    const accessReq = (await req('POST', `/programs/${ws.id}/access-requests`, undefined, testOtherUserId)).json().data
    await req('POST', `/access-requests/${accessReq.id}/approve`)
    await req(
      'POST',
      `/programs/${ws.id}/enrollments`,
      { programVersionId: pub.latestPublishedVersionId, startLocalDate: '2026-11-10', timezone: 'UTC', idempotencyKey: key() },
      testOtherUserId,
    )
    const bobItems = (await req('GET', '/calendar/items?start=2026-11-10&end=2026-11-10', undefined, testOtherUserId)).json().data
    expect(bobItems[0].locked).toBe(false)

    const unlockedOcc = (await req('GET', `/calendar-items/${bobItems[0].id}/occurrence`, undefined, testOtherUserId)).json().data
    expect(unlockedOcc.instructions).toHaveLength(1)
    expect(unlockedOcc.tools).toHaveLength(1)

    const s = (await req('POST', '/sessions', { calendarItemId: bobItems[0].id, idempotencyKey: key() }, testOtherUserId)).json().data
    await req('POST', `/sessions/${s.id}/results`, { values: [{ metricDefinitionId: cat.reps.id, value: 18 }] }, testOtherUserId)
    await req('POST', `/sessions/${s.id}/actions`, { action: 'FINISH', expectedRevision: 0 }, testOtherUserId)

    // Bob's access grant is revoked.
    await db.programAccessGrant.updateMany({ where: { userId: testOtherUserId, programId: ws.id }, data: { revokedAt: new Date() } })

    // Bob's occurrence is now locked: instructions and tools are withheld, private activity endpoint is denied,
    // but Bob's personal session, recorded result, and personal stats remain accessible.
    const lockedOccRes = await req('GET', `/calendar-items/${bobItems[0].id}/occurrence`, undefined, testOtherUserId)
    expect(lockedOccRes.statusCode).toBe(200)
    await validateResponse('getActivityOccurrence', 200, lockedOccRes.json())
    const lockedOcc = lockedOccRes.json().data
    expect(lockedOcc.item.locked).toBe(true)
    expect(lockedOcc.instructions).toEqual([])
    expect(lockedOcc.tools).toEqual([])
    expect(lockedOcc.session.status).toBe('FINISHED')
    expect(lockedOcc.resultInputs[0]).toMatchObject({ key: 'repetitions', recorded: 18 })
    expect(lockedOcc.personalStats).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'completed', value: '1' })]))

    expect((await req('GET', `/activities/${act.id}`, undefined, testOtherUserId)).statusCode).toBe(404)
  })
})

// ── Contract: one block per operationId (pnpm test:generate recognizes these) ──

describe('listCalendarItems', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listCalendarItems')
  })
})

describe('addCalendarItem', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'addCalendarItem')
  })
})

describe('getActivityOccurrence', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'getActivityOccurrence')
  })
})

describe('updateCalendarItem', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'updateCalendarItem')
  })
})

describe('cancelCalendarItem', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'cancelCalendarItem')
  })
})

describe('moveCalendarItemToOpenSlot', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'moveCalendarItemToOpenSlot')
  })
})

describe('undoCalendarItemCompletion', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'undoCalendarItemCompletion')
  })
})

describe('listCalendarRecurrences', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listCalendarRecurrences')
  })
})

describe('updateCalendarRecurrence', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'updateCalendarRecurrence')
  })
})

describe('endCalendarRecurrence', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'endCalendarRecurrence')
  })
})
