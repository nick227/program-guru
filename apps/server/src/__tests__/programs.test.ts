import { describe, it, expect, beforeEach, onTestFinished } from 'vitest'
import { db } from '@project/db'
import { buildTestApp, asAuth, validateResponse, testUserId, testOtherUserId, testAdminId, pinToday, unpinToday } from './helpers'
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

  it('distributes each individual activity across program duration using its own frequency', async () => {
    const ws0 = (await alice.post('/programs', { programTypeId: cat.workout.id, focusId: cat.strength.id })).json().data
    const dailyStretch = (await alice.post('/activities', {
      title: 'Daily Stretch',
      durationMinutes: 10,
      frequency: { kind: 'DAILY' },
      categoryId: cat.fitness.id,
    })).json().data
    const twiceWeeklyRun = (await alice.post('/activities', {
      title: 'Easy Run',
      durationMinutes: 30,
      frequency: { kind: 'N_PER_WEEK', n: 2 },
      categoryId: cat.fitness.id,
    })).json().data

    // Add both activities to the 28-day program: Daily Stretch gets 28 placements, Easy Run gets 8.
    const added = (await alice.post(`/programs/${ws0.id}/draft/activities`, {
      activityIds: [dailyStretch.id, twiceWeeklyRun.id],
      frequencies: {
        [dailyStretch.id]: { kind: 'DAILY' },
        [twiceWeeklyRun.id]: { kind: 'N_PER_WEEK', n: 2 },
      },
      expectedRevision: ws0.draftRevision,
    })).json().data
    expect(added).toMatchObject({ durationDays: 28, programDays: 28, placements: 36 })
    expect(added.activities.map((a: any) => [a.title, a.durationMinutes, a.frequencyLabel, a.placementCount])).toEqual([
      ['Daily Stretch', 10, 'Daily', 28],
      ['Easy Run', 30, '2 days/week', 8],
    ])

    // Update Easy Run's frequency individually -> 4 days/week across 28 days = 16 placements; Daily Stretch stays 28.
    const updated = await alice.patch(`/programs/${ws0.id}/draft/activities/${twiceWeeklyRun.id}`, {
      frequency: { kind: 'N_PER_WEEK', n: 4 },
      expectedRevision: added.draftRevision,
    })
    expect(updated.statusCode).toBe(200)
    await validateResponse('updateProgramActivity', 200, updated.json())
    expect(updated.json().data.activities.map((a: any) => [a.title, a.frequencyLabel, a.placementCount])).toEqual([
      ['Daily Stretch', 'Daily', 28],
      ['Easy Run', '4 days/week', 16],
    ])

    // Changing program duration to 2 weeks (14 days) redistributes each activity by its own frequency.
    const shortened = (await alice.patch(`/programs/${ws0.id}/draft`, {
      durationDays: 14,
      expectedRevision: updated.json().data.draftRevision,
    })).json().data
    expect(shortened.activities.map((a: any) => [a.title, a.frequencyLabel, a.placementCount])).toEqual([
      ['Daily Stretch', 'Daily', 14],
      ['Easy Run', '4 days/week', 8],
    ])
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
  })

  it('publishes to others without a verified email', async () => {
    await db.user.update({ where: { id: testUserId }, data: { emailVerifiedAt: null } })
    const { ws } = await buildProgram()
    const res = await publish(ws.id)
    expect(res.statusCode).toBe(200)
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
    expect(await db.calendarItem.count({ where: { ownerId: testOtherUserId } })).toBe(24)

    // Runs (07): a later, intentional start with a new key is another run; the first run is kept as is.
    const reviewed = (await bob.get(`/programs/${ws.id}`)).json().data
    expect(reviewed).toMatchObject({ canJoin: true, myEnrollmentId: joined.json().data.id })
    const again = await bob.post(`/programs/${ws.id}/enrollments`, { ...body, startLocalDate: '2026-11-16', idempotencyKey: 'join-key-2' })
    expect(again.statusCode).toBe(201)
    expect(again.json().data.id).not.toBe(joined.json().data.id)
    expect(await db.programEnrollment.findUniqueOrThrow({ where: { id: joined.json().data.id } })).toMatchObject({ status: 'ACTIVE' })
    expect(await db.calendarItem.count({ where: { enrollmentId: joined.json().data.id, status: { not: 'CANCELLED' } } })).toBe(24)
    expect(await db.calendarItem.count({ where: { ownerId: testOtherUserId } })).toBe(48)
    expect((await bob.get(`/programs/${ws.id}`)).json().data.myEnrollmentId).toBe(again.json().data.id)

    // Entitled now: full content including Alice's private copy, read through the Program.
    const full = await bob.get(`/program-versions/${pv.latestVersionId}`)
    expect(full.statusCode).toBe(200)
    await validateResponse('getProgramVersion', 200, full.json())
    expect(full.json().data.activities.map((a: any) => a.title)).toEqual(['Squats', 'Slow Leg Raises'])
  })

  it('keeps participants on their version until they accept an update', async () => {
    // Dates below assume today is the start date, 2026-11-09 (America/Chicago).
    pinToday('2026-11-09T18:00:00Z')
    onTestFinished(unpinToday)
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

describe('updateProgramActivity', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'updateProgramActivity')
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

describe('Personal Program library', () => {
  it('separates ownership, copies and participation, and rejects cross-user management', async () => {
    const { ws } = await buildProgram()
    const pub = (await publish(ws.id)).json().data
    const mine = await alice.get('/me/program-library')
    expect(mine.statusCode).toBe(200)
    await validateResponse('getPersonalProgramLibrary', 200, mine.json())
    expect(mine.json().data[0]).toMatchObject({ owned: true, status: 'Not Started', current: null })
    expect((await bob.get('/me/program-library')).json().data).toEqual([])
    expect((await bob.post(`/me/program-library/${ws.id}`, { action: 'ARCHIVE' })).statusCode).toBe(404)
    const copied = (await bob.post(`/programs/${ws.id}/copy`)).json().data
    const copyRow = (await bob.get('/me/program-library')).json().data.find((r: any) => r.program.id === copied.id)
    expect(copyRow.owned).toBe(true)
    expect(copyRow.sourceVersionId).toBe(pub.latestPublishedVersionId)
    expect(copyRow.program.visibility).toBe('PRIVATE')
    const archived = await alice.post(`/me/program-library/${ws.id}`, { action: 'ARCHIVE' })
    expect(archived.json().data.status).toBe('Archived')
    expect((await db.program.findUniqueOrThrow({ where: { id: ws.id } })).status).toBe('PUBLISHED')
    expect((await alice.post(`/me/program-library/${ws.id}`, { action: 'RESTORE' })).json().data.status).toBe('Not Started')
  })

  it('pauses and restores future placements, retains results, and restarts independently', async () => {
    const { ws } = await buildProgram()
    const pub = (await publish(ws.id)).json().data
    const { todayIn, addDays } = await import('../lib/time')
    const start = todayIn('America/Chicago')
    const e = (await bob.post(`/programs/${ws.id}/enrollments`, { programVersionId: pub.latestPublishedVersionId, startLocalDate: start, timezone: 'America/Chicago', idempotencyKey: 'library-run' })).json().data
    const items = await db.calendarItem.findMany({ where: { enrollmentId: e.id }, orderBy: { localDate: 'asc' } })
    await db.calendarItem.update({ where: { id: items[0]!.id }, data: { status: 'DONE' } })
    await db.activitySession.create({ data: { calendarItemId: items[0]!.id, activityRevisionId: items[0]!.activityRevisionId, userId: testOtherUserId, status: 'FINISHED', startedAt: new Date(), endedAt: new Date(), activeSeconds: 125 } })
    await db.calendarItem.update({ where: { id: items[1]!.id }, data: { isUserAdjusted: true, localTime: '09:15' } })
    expect((await alice.patch(`/enrollments/${e.id}`, { status: 'PAUSED' })).statusCode).toBe(404)
    const before = (await bob.get('/me/program-library')).json().data[0]
    expect(before).toMatchObject({ owned: false, status: 'Active', current: { completed: 1, activeSeconds: 125, customizedCount: 1 } })
    // Program Detail opens the participant's own next occurrence per Activity (03-UX §3); a DONE one is skipped.
    const fresh = await db.calendarItem.findMany({ where: { enrollmentId: e.id }, orderBy: [{ localDate: 'asc' }, { localTime: 'asc' }] })
    const expected = [...new Set(fresh.map((i) => i.activityId))].map((activityId) => ({
      activityId,
      calendarItemId: (fresh.find((i) => i.activityId === activityId && i.status === 'PLANNED') ?? fresh.filter((i) => i.activityId === activityId).at(-1))!.id,
    }))
    expect(before.current.nextByActivity).toHaveLength(expected.length)
    expect(before.current.nextByActivity).toEqual(expect.arrayContaining(expected))
    expect(before.current.nextByActivity.map((n: any) => n.calendarItemId)).not.toContain(items[0]!.id)
    expect((await bob.patch(`/enrollments/${e.id}`, { status: 'PAUSED' })).statusCode).toBe(200)
    const paused = (await bob.get('/me/program-library')).json().data[0]
    expect(paused.status).toBe('Paused')
    expect(paused.current.planned).toBe(before.current.planned)
    expect(paused.current.upcoming).toEqual([])
    expect((await bob.patch(`/enrollments/${e.id}`, { status: 'ACTIVE' })).statusCode).toBe(200)
    expect(await db.calendarItem.findUnique({ where: { id: items[1]!.id } })).toMatchObject({ status: 'PLANNED', localTime: '09:15', isUserAdjusted: true })
    expect((await bob.post(`/me/program-library/${ws.id}`, { action: 'ARCHIVE' })).json().data.status).toBe('Archived')
    expect((await db.program.findUniqueOrThrow({ where: { id: ws.id } })).status).toBe('PUBLISHED')
    expect((await bob.post(`/me/program-library/${ws.id}`, { action: 'RESTORE' })).json().data.status).toBe('Paused')
    expect((await bob.patch(`/enrollments/${e.id}`, { status: 'ACTIVE' })).statusCode).toBe(200)
    const restarted = await bob.post(`/me/program-library/${ws.id}`, { action: 'RESTART', expectedRunId: e.id })
    expect(restarted.statusCode).toBe(200)
    await validateResponse('managePersonalProgram', 200, restarted.json())
    expect(restarted.json().data.runs).toHaveLength(2)
    expect((await bob.post(`/me/program-library/${ws.id}`, { action: 'RESTART', expectedRunId: e.id })).statusCode).toBe(400)
    expect(restarted.json().data.current.id).not.toBe(e.id)
    expect(await db.calendarItem.findUnique({ where: { id: items[0]!.id } })).toMatchObject({ status: 'DONE' })
    expect(await db.activitySession.count({ where: { calendarItemId: items[0]!.id } })).toBe(1)
    const current = restarted.json().data.current
    const partial = await db.calendarItem.findFirstOrThrow({ where: { enrollmentId: current.id } })
    await db.calendarItem.update({ where: { id: partial.id }, data: { status: 'DONE' } })
    expect((await bob.post(`/enrollments/${current.id}/leave`, { futureItems: 'REMOVE' })).statusCode).toBe(200)
    expect(await db.calendarItem.count({ where: { enrollmentId: current.id, status: 'PLANNED' } })).toBe(0)
    expect((await bob.get('/me/program-library')).json().data[0].status).toBe('Not Started')
    // Future enrollment is distinct from an already active run, without invented participation.
    const future = (await bob.post(`/programs/${ws.id}/enrollments`, { programVersionId: pub.latestPublishedVersionId, startLocalDate: addDays(start, 7), timezone: 'America/Chicago', idempotencyKey: 'future-run' })).json().data
    expect((await bob.get('/me/program-library')).json().data[0]).toMatchObject({ status: 'Not Started', current: { id: future.id, completed: 0, activeSeconds: null, lastParticipation: null } })
    await db.calendarItem.updateMany({ where: { enrollmentId: future.id }, data: { status: 'DONE' } })
    expect((await bob.get('/me/program-library')).json().data[0].status).toBe('Completed')
  })

  it('enforces required removal semantics across owned, joined, paused and completed Programs with multiple participants', async () => {
    const { ws } = await buildProgram()
    const pub = (await publish(ws.id)).json().data
    const { todayIn } = await import('../lib/time')
    const start = todayIn('America/Chicago')
    const carol = as(testAdminId)

    // 1. Two participants join the same published Program: Bob and Carol
    const bobEnrollment = (await bob.post(`/programs/${ws.id}/enrollments`, {
      programVersionId: pub.latestPublishedVersionId,
      startLocalDate: start,
      timezone: 'America/Chicago',
      idempotencyKey: 'bob-library-removal-test',
    })).json().data

    const carolEnrollment = (await carol.post(`/programs/${ws.id}/enrollments`, {
      programVersionId: pub.latestPublishedVersionId,
      startLocalDate: start,
      timezone: 'America/Chicago',
      idempotencyKey: 'carol-library-removal-test',
    })).json().data

    // Bob completes occurrence 0 and records activity session / metrics
    const bobItems = await db.calendarItem.findMany({ where: { enrollmentId: bobEnrollment.id }, orderBy: { localDate: 'asc' } })
    await db.calendarItem.update({ where: { id: bobItems[0]!.id }, data: { status: 'DONE' } })
    await db.activitySession.create({
      data: {
        calendarItemId: bobItems[0]!.id,
        activityRevisionId: bobItems[0]!.activityRevisionId,
        userId: testOtherUserId,
        status: 'FINISHED',
        startedAt: new Date(),
        endedAt: new Date(),
        activeSeconds: 240,
      },
    })

    // Carol has planned occurrences
    const carolItemsBefore = await db.calendarItem.findMany({ where: { enrollmentId: carolEnrollment.id }, orderBy: { localDate: 'asc' } })
    expect(carolItemsBefore.length).toBeGreaterThan(0)

    // 2. Bob removes the Program (leaves run and archives personal library state)
    expect((await bob.post(`/enrollments/${bobEnrollment.id}/leave`, { futureItems: 'REMOVE' })).statusCode).toBe(200)
    expect((await bob.post(`/me/program-library/${ws.id}`, { action: 'ARCHIVE' })).statusCode).toBe(200)

    // Semantics verified for Bob:
    // - Future planned activities removed from Bob's calendar
    expect(await db.calendarItem.count({ where: { enrollmentId: bobEnrollment.id, status: 'PLANNED' } })).toBe(0)
    // - Completed Activity results and session history are preserved
    expect(await db.calendarItem.findUnique({ where: { id: bobItems[0]!.id } })).toMatchObject({ status: 'DONE' })
    expect(await db.activitySession.count({ where: { calendarItemId: bobItems[0]!.id } })).toBe(1)
    // - Bob's library state is marked Archived (excluded from active library in client)
    const bobLib = (await bob.get('/me/program-library')).json().data.find((r: any) => r.program.id === ws.id)
    expect(bobLib.status).toBe('Archived')

    // Semantics verified for Carol & canonical Program:
    // - Carol's enrollment and calendar items are COMPLETELY UNAFFECTED
    const carolItemsAfter = await db.calendarItem.findMany({ where: { enrollmentId: carolEnrollment.id, status: 'PLANNED' } })
    expect(carolItemsAfter.length).toBe(carolItemsBefore.length)
    const carolLib = (await carol.get('/me/program-library')).json().data.find((r: any) => r.program.id === ws.id)
    expect(carolLib.status).toBe('Active')
    // - Canonical Program definition is NOT deleted and remains published
    const canonical = await db.program.findUniqueOrThrow({ where: { id: ws.id } })
    expect(canonical.status).toBe('PUBLISHED')
    expect(canonical.creatorId).toBe(testUserId) // Alice remains owner

    // 3. Paused Program removal: Carol pauses, then removes
    expect((await carol.patch(`/enrollments/${carolEnrollment.id}`, { status: 'PAUSED' })).statusCode).toBe(200)
    expect((await carol.post(`/enrollments/${carolEnrollment.id}/leave`, { futureItems: 'REMOVE' })).statusCode).toBe(200)
    expect((await carol.post(`/me/program-library/${ws.id}`, { action: 'ARCHIVE' })).statusCode).toBe(200)
    expect(await db.calendarItem.count({ where: { enrollmentId: carolEnrollment.id, status: 'PLANNED' } })).toBe(0)

    // 4. Start again as a fresh new run: Bob can restart the Program from scratch
    const bobNewRun = (await bob.post(`/programs/${ws.id}/enrollments`, {
      programVersionId: pub.latestPublishedVersionId,
      startLocalDate: todayIn('America/Chicago'),
      timezone: 'America/Chicago',
      idempotencyKey: 'bob-fresh-new-run',
    })).json().data
    expect(bobNewRun.id).not.toBe(bobEnrollment.id)
    expect(await db.calendarItem.count({ where: { enrollmentId: bobNewRun.id, status: 'PLANNED' } })).toBeGreaterThan(0)

    // 5. Owned never-started Program removal: Alice removes her own program from her library
    const { ws: aliceDraft } = await buildProgram()
    expect((await alice.post(`/me/program-library/${aliceDraft.id}`, { action: 'ARCHIVE' })).statusCode).toBe(200)
    // Canonical program definition is preserved; Alice can still edit or republish it
    const draftInDb = await db.program.findUniqueOrThrow({ where: { id: aliceDraft.id } })
    expect(draftInDb.creatorId).toBe(testUserId)
    expect(draftInDb.status).toBe('DRAFT')
  })
})
