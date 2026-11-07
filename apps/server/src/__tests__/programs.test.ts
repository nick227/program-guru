import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@project/db'
import { buildTestApp, asAuth, validateResponse, testUserId, testOtherUserId } from './helpers'
import { seedCatalog } from './helpers/fixtures'
import { contractCase } from './helpers/contract'

const app = buildTestApp()
let cat: Awaited<ReturnType<typeof seedCatalog>>
beforeEach(async () => {
  cat = await seedCatalog()
})

const as = (userId: string) => ({
  get: (url: string) => app.inject({ method: 'GET', url, headers: asAuth(userId) }),
  post: (url: string, payload?: unknown) => app.inject({ method: 'POST', url, headers: asAuth(userId), payload: (payload ?? {}) as any }),
  patch: (url: string, payload: unknown) => app.inject({ method: 'PATCH', url, headers: asAuth(userId), payload: payload as any }),
  del: (url: string) => app.inject({ method: 'DELETE', url, headers: asAuth(userId) }),
})
const alice = as(testUserId)
const bob = as(testOtherUserId)

/** Alice builds a Strength Workout from seeded Squats plus her own customized copy of Leg Raises. */
async function buildProgram() {
  let ws = (await alice.post('/programs', { programTypeId: cat.workout.id, focusId: cat.strength.id })).json().data
  const myLegRaises = (await alice.post(`/activities/${cat.legRaises.activity.id}/copy`, { newTitle: 'Slow Leg Raises' })).json().data
  ws = (await alice.post(`/programs/${ws.id}/draft/activities`, { activityIds: [cat.squats.activity.id, myLegRaises.id], expectedRevision: ws.draftRevision })).json().data
  return { ws, myLegRaises }
}

async function publish(programId: string, visibility = 'PUBLIC', accessMode = 'OPEN') {
  const ws = (await alice.get(`/programs/${programId}/workspace`)).json().data
  return alice.post(`/programs/${programId}/publish`, { visibility, accessMode, expectedRevision: ws.draftRevision })
}

describe('Program authoring (01 §6 required test 2)', () => {
  it('builds from seeded and customized activities with an automatic schedule, and never modifies the originals', async () => {
    const created = await alice.post('/programs', { programTypeId: cat.workout.id, focusId: cat.strength.id })
    expect(created.statusCode).toBe(201)
    await validateResponse('createProgram', 201, created.json())
    expect(created.json().data).toMatchObject({ title: 'My Strength Workout', status: 'DRAFT', durationDays: 28, frequencyLabel: '3 days/week', activityCount: 0 })

    const { ws, myLegRaises } = await buildProgram()
    await validateResponse('addProgramActivities', 200, { data: ws })
    // 4 weeks × 3 days = 12 program days; every activity on every day = 24 placements.
    expect(ws).toMatchObject({ programDays: 12, placements: 24, activityCount: 2 })
    expect(ws.activities.map((a: any) => [a.title, a.instructionCount, a.placementCount])).toEqual([
      ['Squats', 3, 12],
      ['Slow Leg Raises', 2, 12],
    ])

    const pub = await publish(ws.id)
    expect(pub.statusCode).toBe(200)
    await validateResponse('publishProgram', 200, pub.json())
    expect(pub.json().data.status).toBe('PUBLISHED')
    // The seeded original is untouched; Alice's copy is published as a pinned snapshot but stays private.
    const squats = await db.activity.findUniqueOrThrow({ where: { id: cat.squats.activity.id } })
    expect(squats.latestPublishedRevisionId).toBe(cat.squats.revision.id)
    const copy = await db.activity.findUniqueOrThrow({ where: { id: myLegRaises.id } })
    expect(copy).toMatchObject({ status: 'PUBLISHED', visibility: 'PRIVATE' })
    expect((await bob.get(`/activities/${myLegRaises.id}`)).statusCode).toBe(404)
  })

  it('switches duration, frequency, and mode; regeneration keeps manual placements', async () => {
    const { ws } = await buildProgram()
    let next = (await alice.patch(`/programs/${ws.id}/draft`, { durationDays: 7, frequency: { kind: 'DAILY' }, generationMode: 'ROTATE', expectedRevision: ws.draftRevision })).json().data
    expect(next).toMatchObject({ programDays: 7, placements: 7, frequencyLabel: 'Daily', generationMode: 'ROTATE' })
    const manual = await alice.post(`/programs/${ws.id}/draft/placements`, { activityId: cat.squats.activity.id, relativeDay: 1, localTime: '07:00', expectedRevision: next.draftRevision })
    expect(manual.statusCode).toBe(201)
    await validateResponse('addProgramPlacement', 201, manual.json())
    next = (await alice.get(`/programs/${ws.id}/workspace`)).json().data
    const regen = await alice.post(`/programs/${ws.id}/draft/schedule/regenerate`, { generationMode: 'ALL_EACH_DAY', expectedRevision: next.draftRevision })
    expect(regen.statusCode).toBe(200)
    const placements = regen.json().data
    expect(placements.filter((p: any) => p.isManual)).toHaveLength(1)
    // Day 1 Squats is the manual one; the generated duplicate for that slot is skipped.
    expect(placements.filter((p: any) => p.relativeDay === 1 && p.activityId === cat.squats.activity.id)).toHaveLength(1)
    expect(placements).toHaveLength(14)
  })

  it('rejects a stale draft revision', async () => {
    const { ws } = await buildProgram()
    const res = await alice.patch(`/programs/${ws.id}/draft`, { title: 'X', expectedRevision: ws.draftRevision - 1 })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('VERSION_CONFLICT')
  })

  it('reports precise publish issues', async () => {
    const empty = (await alice.post('/programs', { programTypeId: cat.workout.id })).json().data
    const check = await alice.get(`/programs/${empty.id}/publish-check`)
    await validateResponse('getProgramPublishCheck', 200, check.json())
    expect(check.json().data.canPublish).toBe(false)
    expect(check.json().data.issues.map((i: any) => i.code)).toContain('NO_ACTIVITIES')
    await db.user.update({ where: { id: testUserId }, data: { emailVerifiedAt: null } })
    const { ws } = await buildProgram()
    const res = await publish(ws.id)
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toMatch(/Verify your email/)
  })
})

describe('Adopting a Program (01 §6 required test 1)', () => {
  it('a new user previews, joins, and gets every placement on their calendar without scheduling by hand', async () => {
    const { ws } = await buildProgram()
    await publish(ws.id)
    const preview = await bob.get(`/programs/${ws.id}`)
    expect(preview.statusCode).toBe(200)
    await validateResponse('getProgramPreview', 200, preview.json())
    const pv = preview.json().data
    expect(pv).toMatchObject({ canJoin: true, viewerAccess: 'PREVIEW', programDays: 12, placements: 24 })
    expect(pv.safeActivityOutline.map((o: any) => o.title)).toEqual(['Squats', 'Slow Leg Raises'])

    const body = { programVersionId: pv.latestVersionId, startLocalDate: '2026-11-09', timezone: 'America/Chicago' }
    const pre = await bob.post(`/programs/${ws.id}/enrollments/preview`, body)
    await validateResponse('previewEnrollment', 200, pre.json())
    expect(pre.json().data.items.slice(0, 2).map((i: any) => [i.localDate, i.title])).toEqual([
      ['2026-11-09', 'Squats'],
      ['2026-11-09', 'Slow Leg Raises'],
    ])

    const joined = await bob.post(`/programs/${ws.id}/enrollments`, { ...body, idempotencyKey: 'join-key-1' })
    expect(joined.statusCode).toBe(201)
    await validateResponse('joinProgram', 201, joined.json())
    expect(joined.json().data).toMatchObject({ status: 'ACTIVE', calendarItemCount: 24 })
    const items = await db.calendarItem.findMany({ where: { ownerId: testOtherUserId }, orderBy: [{ localDate: 'asc' }] })
    expect(items).toHaveLength(24)
    // Each placement is its own item with independent status: two on day 1, not one combined day.
    expect(items.filter((i) => i.programDayIndex === 0)).toHaveLength(2)
    expect(items.at(-1)!.localDate.toISOString().slice(0, 10)).toBe('2026-12-04')

    // Idempotent replay returns the same enrollment; reusing the key for another request conflicts.
    const replay = await bob.post(`/programs/${ws.id}/enrollments`, { ...body, idempotencyKey: 'join-key-1' })
    expect(replay.json().data.id).toBe(joined.json().data.id)
    const misuse = await bob.post(`/programs/${ws.id}/enrollments`, { ...body, startLocalDate: '2026-11-10', idempotencyKey: 'join-key-1' })
    expect(misuse.statusCode).toBe(409)
    const again = await bob.post(`/programs/${ws.id}/enrollments`, { ...body, idempotencyKey: 'join-key-2' })
    expect(again.statusCode).toBe(409)
    expect(await db.calendarItem.count({ where: { ownerId: testOtherUserId } })).toBe(24)

    // Entitled now: full content including Alice's private copy, read through the Program.
    const full = await bob.get(`/program-versions/${pv.latestVersionId}`)
    expect(full.statusCode).toBe(200)
    await validateResponse('getProgramVersion', 200, full.json())
    expect(full.json().data.activities.map((a: any) => a.title)).toEqual(['Squats', 'Slow Leg Raises'])
  })

  it('keeps participants on their version until they accept an update', async () => {
    const { ws } = await buildProgram()
    const v1 = (await publish(ws.id)).json().data.latestPublishedVersionId
    const joined = (await bob.post(`/programs/${ws.id}/enrollments`, { programVersionId: v1, startLocalDate: '2026-11-09', timezone: 'America/Chicago', idempotencyKey: 'join-update' })).json().data
    const draft = (await alice.get(`/programs/${ws.id}/workspace`)).json().data
    await alice.del(`/programs/${ws.id}/draft/activities/${cat.squats.activity.id}?expectedRevision=${draft.draftRevision}`)
    const v2 = (await publish(ws.id)).json().data.latestPublishedVersionId
    expect(v2).not.toBe(v1)
    const pending = (await bob.get(`/enrollments/${joined.id}`)).json().data
    expect(pending).toMatchObject({ programVersionId: v1, pendingVersionId: v2 })
    expect(await db.calendarItem.count({ where: { ownerId: testOtherUserId, status: 'PLANNED' } })).toBe(24)
    const accepted = await bob.post(`/enrollments/${joined.id}/accept-update`)
    expect(accepted.statusCode).toBe(200)
    await validateResponse('acceptEnrollmentUpdate', 200, accepted.json())
    expect(accepted.json().data).toMatchObject({ programVersionId: v2, pendingVersionId: null })
  })

  it('approval programs need an approved request before joining', async () => {
    const { ws } = await buildProgram()
    const v = (await publish(ws.id, 'PUBLIC', 'APPROVAL')).json().data.latestPublishedVersionId
    const body = { programVersionId: v, startLocalDate: '2026-11-09', timezone: 'America/Chicago', idempotencyKey: 'join-approval' }
    const denied = await bob.post(`/programs/${ws.id}/enrollments`, body)
    expect(denied.statusCode).toBe(403)
    expect(denied.json().code).toBe('ACCESS_REQUIRED')
    const req = await bob.post(`/programs/${ws.id}/access-requests`)
    expect(req.statusCode).toBe(201)
    const list = await alice.get(`/programs/${ws.id}/access-requests`)
    await validateResponse('listProgramAccessRequests', 200, list.json())
    expect((await bob.post(`/access-requests/${req.json().data.id}/approve`)).statusCode).toBe(404)
    expect((await alice.post(`/access-requests/${req.json().data.id}/approve`)).json().data.status).toBe('APPROVED')
    expect((await bob.post(`/programs/${ws.id}/enrollments`, { ...body, idempotencyKey: 'join-approval-2' })).statusCode).toBe(201)
  })

  it('hides private programs and their content from others', async () => {
    const { ws } = await buildProgram()
    const v = (await publish(ws.id, 'PRIVATE')).json().data.latestPublishedVersionId
    expect((await bob.get(`/programs/${ws.id}`)).statusCode).toBe(404)
    expect((await bob.get(`/program-versions/${v}`)).statusCode).toBe(404)
    expect((await bob.post(`/programs/${ws.id}/copy`)).statusCode).toBe(404)
  })
})

describe('copyProgram', () => {
  it('copies a public program into a private draft with provenance, leaving another author’s private snapshot behind', async () => {
    const { ws } = await buildProgram()
    await publish(ws.id)
    const res = await bob.post(`/programs/${ws.id}/copy`)
    expect(res.statusCode).toBe(201)
    await validateResponse('copyProgram', 201, res.json())
    expect(res.json().data).toMatchObject({ status: 'DRAFT', visibility: 'PRIVATE' })
    expect(res.json().data.activities.map((a: any) => a.title)).toEqual(['Squats'])
    expect(await db.programSource.count({ where: { programId: res.json().data.id } })).toBe(1)
  })
})

describe('setProgramPrices', () => {
  it('keeps one active price per kind and retires replaced rows', async () => {
    const { ws } = await buildProgram()
    const first = await app.inject({ method: 'PUT', url: `/programs/${ws.id}/prices`, headers: asAuth(testUserId), payload: { prices: [{ kind: 'ONE_TIME', amountMinor: 1900 }, { kind: 'MONTHLY', amountMinor: 500 }] } })
    expect(first.statusCode).toBe(200)
    await validateResponse('setProgramPrices', 200, first.json())
    const second = await app.inject({ method: 'PUT', url: `/programs/${ws.id}/prices`, headers: asAuth(testUserId), payload: { prices: [{ kind: 'MONTHLY', amountMinor: 700 }] } })
    expect(second.json().data).toEqual([expect.objectContaining({ kind: 'MONTHLY', amountMinor: 700 })])
    expect(await db.programPrice.count({ where: { programId: ws.id } })).toBe(3)
  })
})

// ── Contract: one block per operationId (pnpm test:generate recognizes these) ──

describe('listMyPrograms', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listMyPrograms')
  })
})

describe('createProgram', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'createProgram')
  })
})

describe('getProgramPreview', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'getProgramPreview')
  })
})

describe('getProgramWorkspace', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'getProgramWorkspace')
  })
})

describe('updateProgramDraft', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'updateProgramDraft')
  })
})

describe('addProgramActivities', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'addProgramActivities')
  })
})

describe('removeProgramActivity', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'removeProgramActivity')
  })
})

describe('listProgramPlacements', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listProgramPlacements')
  })
})

describe('addProgramPlacement', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'addProgramPlacement')
  })
})

describe('updateProgramPlacement', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'updateProgramPlacement')
  })
})

describe('deleteProgramPlacement', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'deleteProgramPlacement')
  })
})

describe('regenerateProgramSchedule', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'regenerateProgramSchedule')
  })
})

describe('getProgramPublishCheck', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'getProgramPublishCheck')
  })
})

describe('publishProgram', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'publishProgram')
  })
})

describe('archiveProgram', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'archiveProgram')
  })
})

describe('getProgramVersion', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'getProgramVersion')
  })
})

describe('previewEnrollment', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'previewEnrollment')
  })
})

describe('joinProgram', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'joinProgram')
  })
})

describe('listMyEnrollments', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listMyEnrollments')
  })
})

describe('getEnrollment', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'getEnrollment')
  })
})

describe('updateEnrollment', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'updateEnrollment')
  })
})

describe('leaveEnrollment', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'leaveEnrollment')
  })
})

describe('acceptEnrollmentUpdate', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'acceptEnrollmentUpdate')
  })
})

describe('dismissEnrollmentUpdate', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'dismissEnrollmentUpdate')
  })
})

describe('createProgramAccessRequest', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'createProgramAccessRequest')
  })
})

describe('listProgramAccessRequests', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listProgramAccessRequests')
  })
})

describe('approveProgramAccessRequest', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'approveProgramAccessRequest')
  })
})

describe('declineProgramAccessRequest', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'declineProgramAccessRequest')
  })
})
