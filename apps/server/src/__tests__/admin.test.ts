// Platform administration (12-SOCIAL §7a): contract cases plus the core admin journeys.
import { describe, it, expect } from 'vitest'
import { db } from '@project/db'
import { buildTestApp, asAuth, rootAdminId, seedUser, testAdminId, testOtherUserId, testUserId } from './helpers'
import { contractCase } from './helpers/contract'
import { existingCatalog, seedCatalog } from './helpers/fixtures'
import { setAdminByEmail } from '../domains/admin/users.service'

const app = buildTestApp()

// ── Contract: one block per operationId (pnpm test:generate recognizes these) ──

describe('listAdminContent', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listAdminContent')
  })
})

describe('importAdminContent', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'importAdminContent')
  })
})

describe('moderateAdminContent', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'moderateAdminContent')
  })
})

describe('listAdminAudit', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listAdminAudit')
  })
})

describe('listAdminUsers', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listAdminUsers')
  })
})

describe('getAdminUser', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'getAdminUser')
  })
})

describe('updateAdminUser', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'updateAdminUser')
  })
})

describe('listAdminPrices', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listAdminPrices')
  })
})

describe('listAdminPurchases', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listAdminPurchases')
  })
})

describe('listAdminSubscriptions', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listAdminSubscriptions')
  })
})

describe('listAdminGrants', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listAdminGrants')
  })
})

// ── Journeys ──

const call = (as: string, method: string, url: string, payload?: unknown) => app.inject({ method: method as any, url, headers: asAuth(as), ...(payload !== undefined ? { payload: payload as any } : {}) })
const data = async (res: Promise<any>) => {
  const r = await res
  if (r.statusCode >= 300) throw new Error(`${r.statusCode}: ${r.body}`)
  return r.json().data
}
const admin = () => seedUser(rootAdminId, 'root', { role: 'ADMIN' })
const catalog = async () => (await existingCatalog()) ?? seedCatalog()

describe('admin authorization', () => {
  it('admits only an active ADMIN to /admin operations; a MODERATOR and a USER get 403', async () => {
    await admin()
    const routes: [string, string, unknown?][] = [
      ['GET', '/admin/content'],
      ['GET', '/admin/users'],
      ['GET', `/admin/users/${testUserId}`],
      ['PATCH', `/admin/users/${testUserId}`, { role: 'ADMIN', reason: 'escalate' }],
      ['GET', '/admin/membership/grants'],
      ['GET', '/admin/audit'],
      ['POST', '/admin/content/import', { dryRun: true, programs: [{ title: 'X', programType: 'workout', activities: [{ ref: 'squats' }] }] }],
    ]
    for (const who of [testUserId, testAdminId]) {
      for (const [method, url, payload] of routes) {
        const res = await call(who, method, url, payload)
        expect(res.statusCode, `${method} ${url}`).toBe(403)
      }
    }
    expect((await db.user.findUniqueOrThrow({ where: { id: testUserId } })).role).toBe('USER')
    expect((await call(rootAdminId, 'GET', '/admin/users')).statusCode).toBe(200)
  })

  it('refuses PLATFORM ownership to non-admins', async () => {
    const c = await catalog()
    expect((await call(testUserId, 'POST', '/programs', { programTypeId: c.workout.id, owner: 'PLATFORM' })).statusCode).toBe(403)
    expect((await call(testAdminId, 'POST', '/activities', { title: 'X', categoryId: c.fitness.id, owner: 'PLATFORM' })).statusCode).toBe(403)
  })
})

describe('platform content authoring', () => {
  it('admins author platform Programs and nested Activities through the ordinary operations', async () => {
    await admin()
    const c = await catalog()
    let ws = await data(call(rootAdminId, 'POST', '/programs', { programTypeId: c.workout.id, focusId: c.strength.id, owner: 'PLATFORM' }))
    expect(ws.creator).toBeNull()
    expect(ws.isPlatform).toBe(true)
    // A new platform Activity, edited with instructions, then nested in the Program.
    const act = await data(call(rootAdminId, 'POST', '/activities', { title: 'Wall Sit', categoryId: c.fitness.id, owner: 'PLATFORM' }))
    expect(act.canEdit).toBe(true)
    await data(call(rootAdminId, 'PUT', `/activities/${act.id}/draft/instructions`, { instructions: [{ title: 'Back flat' }], expectedRevision: act.draftRevision }))
    ws = await data(call(rootAdminId, 'POST', `/programs/${ws.id}/draft/activities`, { activityIds: [act.id, c.squats.activity.id], expectedRevision: ws.draftRevision }))
    expect(ws.activities.map((a: any) => a.canEdit)).toEqual([true, true])
    ws = await data(call(rootAdminId, 'PATCH', `/programs/${ws.id}/draft`, { title: 'Strength Basics', durationDays: 14, expectedRevision: ws.draftRevision }))

    // Another admin may edit platform content; a regular user cannot even see the draft.
    expect((await call(testUserId, 'GET', `/programs/${ws.id}/workspace`)).statusCode).toBe(404)
    // Platform Programs are never sold.
    const check = await data(call(rootAdminId, 'GET', `/programs/${ws.id}/publish-check`))
    expect(check.canPublish).toBe(true)

    ws = await data(call(rootAdminId, 'POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision }))
    expect(ws.status).toBe('PUBLISHED')
    const platformAct = await db.activity.findUniqueOrThrow({ where: { id: act.id } })
    expect(platformAct).toMatchObject({ creatorId: null, status: 'PUBLISHED' })
    const version = await db.programVersion.findFirstOrThrow({ where: { programId: ws.id } })
    expect(version.createdById).toBe(rootAdminId)

    // Unpublish (archive), then restore by publishing again (07 §6).
    ws = await data(call(rootAdminId, 'POST', `/programs/${ws.id}/archive`))
    expect(ws.status).toBe('ARCHIVED')
    expect((await data(call(rootAdminId, 'GET', `/programs/${ws.id}/publish-check`))).canPublish).toBe(true)
    ws = await data(call(rootAdminId, 'POST', `/programs/${ws.id}/publish`, { visibility: 'UNLISTED', accessMode: 'OPEN', expectedRevision: ws.draftRevision }))
    expect(ws).toMatchObject({ status: 'PUBLISHED', visibility: 'UNLISTED' })

    const paid = await data(call(rootAdminId, 'POST', '/programs', { programTypeId: c.workout.id, owner: 'PLATFORM' }))
    await data(call(rootAdminId, 'POST', `/programs/${paid.id}/draft/activities`, { activityIds: [c.squats.activity.id], expectedRevision: paid.draftRevision }))
    const sale = await call(rootAdminId, 'POST', `/programs/${paid.id}/publish`, { visibility: 'PUBLIC', accessMode: 'PAID', expectedRevision: paid.draftRevision + 1 })
    expect(sale.statusCode).toBe(400)
    expect(sale.json().fieldErrors.accessMode).toBeDefined()

    // A participant joins; deleting the platform Program then keeps it for them (tombstone).
    await data(call(testOtherUserId, 'POST', `/programs/${ws.id}/enrollments`, { programVersionId: ws.latestPublishedVersionId, startLocalDate: '2026-11-16', timezone: 'America/Chicago', idempotencyKey: 'join-platform-1' }))
    const deleted = await data(call(rootAdminId, 'DELETE', `/programs/${ws.id}`))
    expect(deleted.retainedForParticipants).toBe(true)
    expect(await db.programEnrollment.count({ where: { programId: ws.id, userId: testOtherUserId } })).toBe(1)

    const actions = (await db.moderationAction.findMany({ where: { targetId: ws.id }, orderBy: { createdAt: 'asc' } })).map((a) => a.action)
    expect(actions).toEqual(['PUBLISH', 'ARCHIVE', 'PUBLISH', 'DELETE'])
    expect(await db.moderationAction.count({ where: { targetId: act.id, action: 'PUBLISH' } })).toBe(1)
  })

  it('keeps user-owned content moderation-only, preserving attribution', async () => {
    await admin()
    const c = await catalog()
    let ws = await data(call(testUserId, 'POST', '/programs', { programTypeId: c.workout.id }))
    ws = await data(call(testUserId, 'POST', `/programs/${ws.id}/draft/activities`, { activityIds: [c.squats.activity.id], expectedRevision: ws.draftRevision }))
    ws = await data(call(testUserId, 'POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision }))

    expect((await call(rootAdminId, 'PATCH', `/programs/${ws.id}/draft`, { title: 'Hijacked', expectedRevision: ws.draftRevision })).statusCode).toBe(404)
    expect((await call(rootAdminId, 'DELETE', `/programs/${ws.id}`)).statusCode).toBe(404)
    const hidden = await data(call(rootAdminId, 'POST', `/admin/content/PROGRAM/${ws.id}/moderation`, { action: 'HIDE', reason: 'Unsafe guidance' }))
    expect(hidden).toMatchObject({ moderated: true, isPlatform: false, creator: { id: testUserId } })
    expect((await call(testOtherUserId, 'GET', `/programs/${ws.id}`)).statusCode).toBe(404)
    await data(call(rootAdminId, 'POST', `/admin/content/PROGRAM/${ws.id}/moderation`, { action: 'RESTORE', reason: 'Reviewed' }))
    expect((await db.program.findUniqueOrThrow({ where: { id: ws.id } })).creatorId).toBe(testUserId)

    const list = await data(call(rootAdminId, 'GET', `/admin/content?owner=USERS&creatorId=${testUserId}`))
    expect(list.map((r: any) => r.id)).toEqual([ws.id])
    const audit = await data(call(rootAdminId, 'GET', `/admin/audit?targetId=${ws.id}`))
    expect(audit.map((a: any) => a.action)).toEqual(['RESTORE', 'HIDE'])
    expect(audit[0].actor.id).toBe(rootAdminId)
  })

  it('lists Programs and Activities together with type and ownership filters', async () => {
    await admin()
    const c = await catalog()
    const p = await data(call(rootAdminId, 'POST', '/programs', { programTypeId: c.workout.id, owner: 'PLATFORM' }))
    const all = await data(call(rootAdminId, 'GET', '/admin/content?owner=PLATFORM&limit=100'))
    expect(new Set(all.map((r: any) => r.kind))).toEqual(new Set(['PROGRAM', 'ACTIVITY']))
    expect(all[0].id).toBe(p.id)
    const programs = await data(call(rootAdminId, 'GET', '/admin/content?kind=PROGRAM&status=DRAFT'))
    expect(programs.map((r: any) => r.id)).toEqual([p.id])
    const found = await data(call(rootAdminId, 'GET', '/admin/content?kind=ACTIVITY&q=squat'))
    expect(found.map((r: any) => r.title)).toEqual(['Squats'])
    // Offset pages do not repeat or skip across the merged kinds.
    const page1 = await app.inject({ method: 'GET', url: '/admin/content?limit=1', headers: asAuth(rootAdminId) })
    const page2 = await data(call(rootAdminId, 'GET', `/admin/content?limit=100&cursor=${page1.json().meta.nextCursor}`))
    expect(page2.map((r: any) => r.id)).toEqual((await data(call(rootAdminId, 'GET', '/admin/content?limit=100'))).slice(1).map((r: any) => r.id))
  })
})

describe('content import', () => {
  const batch = (c: any, extra: Record<string, unknown> = {}) => ({
    programs: [
      {
        title: 'Mobility Starter',
        description: 'Ten minutes a day.',
        programType: c.workout.slug,
        focus: c.strength.slug,
        level: 'BEGINNER',
        sessionMinutes: 15,
        tags: ['no-equipment'],
        durationDays: 14,
        frequency: { kind: 'DAILY' },
        activities: [
          { ref: 'squats' },
          { title: 'Cat Cow', summary: 'Spine mobility', focuses: ['strength'], instructions: [{ title: 'Inhale', body: 'Arch' }, { title: 'Exhale', body: 'Round' }], metrics: [{ metric: 'repetitions', required: true }], tools: [{ tool: 'TIMER' }] },
        ],
      },
      { title: 'Second', programType: c.workout.id, activities: [{ title: 'Plank' }] },
    ],
    ...extra,
  })

  it('reports every issue in a dry run and writes nothing', async () => {
    await admin()
    const c = await catalog()
    const before = await db.program.count()
    const res = await data(
      call(rootAdminId, 'POST', '/admin/content/import', {
        dryRun: true,
        programs: [{ title: 'Bad', programType: 'nope', focus: 'strength', activities: [{ ref: 'missing' }, { ref: 'squats', title: 'both' }, { title: 'X', metrics: [{ metric: 'nope' }], tools: [{ tool: 'nope' }] }] }],
      }),
    )
    expect(res.valid).toBe(false)
    expect(res.issues.map((i: any) => i.path)).toEqual([
      'programs.0.programType',
      'programs.0.activities.0.ref',
      'programs.0.activities.1',
      'programs.0.activities.2.metrics.0.metric',
      'programs.0.activities.2.tools.0.tool',
    ])
    expect(await db.program.count()).toBe(before)
    // Shape errors come from the OpenAPI schema, keyed by path as well.
    const shape = await call(rootAdminId, 'POST', '/admin/content/import', { dryRun: true, programs: [{ title: '', programType: c.workout.slug, activities: [] }] })
    expect(shape.statusCode).toBe(400)
    expect(Object.keys(shape.json().fieldErrors).join(' ')).toMatch(/programs\.0\./)
  })

  it('imports drafts with nested Activities in one transaction, replay-safe, then publishes after review', async () => {
    await admin()
    const c = await catalog()
    await db.tag.create({ data: { slug: 'no-equipment', label: 'No Equipment', group: 'equipment', position: 1 } })
    const preview = await data(call(rootAdminId, 'POST', '/admin/content/import', { ...batch(c), dryRun: true }))
    expect(preview).toMatchObject({ valid: true, dryRun: true })
    expect(preview.programs.map((p: any) => [p.id, p.activityCount, p.newActivityCount])).toEqual([[null, 2, 1], [null, 1, 1]])
    expect(await db.program.count({ where: { creatorId: null } })).toBe(0)

    expect((await call(rootAdminId, 'POST', '/admin/content/import', batch(c))).json().fieldErrors.idempotencyKey).toBeDefined()
    const first = await data(call(rootAdminId, 'POST', '/admin/content/import', batch(c, { idempotencyKey: 'import-batch-1' })))
    const ids = first.programs.map((p: any) => p.id)
    expect(ids).toHaveLength(2)
    const programs = await db.program.findMany({ where: { id: { in: ids } }, include: { versions: { include: { items: true } } } })
    for (const p of programs) expect(p).toMatchObject({ creatorId: null, status: 'DRAFT' })
    const mobility = programs.find((p) => p.title === 'Mobility Starter')!
    expect(mobility.versions[0]).toMatchObject({ durationDays: 14, level: 'BEGINNER', sessionMinutes: 15, createdById: rootAdminId })
    expect(mobility.versions[0]!.items.length).toBe(28) // 2 Activities × 14 days, DAILY
    const catCow = await db.activity.findFirstOrThrow({ where: { title: 'Cat Cow' }, include: { revisions: { include: { instructions: true, metrics: true, tools: true } }, focuses: true } })
    expect(catCow).toMatchObject({ creatorId: null, status: 'DRAFT' })
    expect(catCow.revisions[0]!.instructions.map((i) => i.title)).toEqual(['Inhale', 'Exhale'])
    expect(catCow.revisions[0]!.metrics).toHaveLength(1)
    expect(catCow.revisions[0]!.tools).toHaveLength(1)
    expect(catCow.focuses).toHaveLength(1)

    // A retry returns the same Programs and creates nothing; a different payload under the key is a conflict.
    const replay = await data(call(rootAdminId, 'POST', '/admin/content/import', batch(c, { idempotencyKey: 'import-batch-1' })))
    expect(replay.programs.map((p: any) => p.id)).toEqual(ids)
    expect(await db.program.count({ where: { creatorId: null } })).toBe(2)
    const changed = batch(c, { idempotencyKey: 'import-batch-1' })
    changed.programs[1]!.title = 'Changed'
    expect((await call(rootAdminId, 'POST', '/admin/content/import', changed)).statusCode).toBe(409)

    // Invalid without dryRun: 400, and nothing at all is written.
    const bad = batch(c, { idempotencyKey: 'import-batch-2' })
    bad.programs[1]!.activities = [{ ref: 'missing' }]
    const refused = await call(rootAdminId, 'POST', '/admin/content/import', bad)
    expect(refused.statusCode).toBe(400)
    expect(refused.json().fieldErrors['programs.1.activities.0.ref']).toBeDefined()
    expect(await db.program.count({ where: { creatorId: null } })).toBe(2)

    // Review, then publish through the ordinary operation.
    const ws = await data(call(rootAdminId, 'GET', `/programs/${mobility.id}/workspace`))
    expect(ws.activities.map((a: any) => a.title)).toEqual(['Squats', 'Cat Cow'])
    const published = await data(call(rootAdminId, 'POST', `/programs/${mobility.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision }))
    expect(published.status).toBe('PUBLISHED')
    expect((await db.activity.findUniqueOrThrow({ where: { id: catCow.id } })).status).toBe('PUBLISHED')
  })
})

describe('accounts and the last admin', () => {
  it('changes roles and suspends with an audit trail; suspension signs the account out', async () => {
    await admin()
    await db.session.create({ data: { userId: testOtherUserId, tokenHash: 'x'.repeat(64), expiresAt: new Date(Date.now() + 86_400_000) } })
    const promoted = await data(call(rootAdminId, 'PATCH', `/admin/users/${testOtherUserId}`, { role: 'MODERATOR', reason: 'Trusted' }))
    expect(promoted.role).toBe('MODERATOR')
    const suspended = await data(call(rootAdminId, 'PATCH', `/admin/users/${testOtherUserId}`, { status: 'SUSPENDED', reason: 'Spam' }))
    expect(suspended.status).toBe('SUSPENDED')
    expect(await db.session.count({ where: { userId: testOtherUserId } })).toBe(0)
    await data(call(rootAdminId, 'PATCH', `/admin/users/${testOtherUserId}`, { status: 'ACTIVE', reason: 'Appeal' }))
    const audit = await data(call(rootAdminId, 'GET', `/admin/audit?targetId=${testOtherUserId}`))
    expect(audit.map((a: any) => a.action)).toEqual(['RESTORE', 'SUSPEND_USER', 'ROLE_CHANGE'])
    expect(audit[2].reason).toBe('USER → MODERATOR: Trusted')
    const found = await data(call(rootAdminId, 'GET', '/admin/users?q=bob&role=MODERATOR'))
    expect(found.map((u: any) => u.id)).toEqual([testOtherUserId])
    const detail = await data(call(rootAdminId, 'GET', `/admin/users/${testUserId}`))
    expect(detail.counts).toMatchObject({ programs: 0, grants: 0 })
  })

  it('never removes the last active admin, by any path', async () => {
    await admin()
    const lastAdmin = await call(rootAdminId, 'PATCH', `/admin/users/${rootAdminId}`, { role: 'USER', reason: 'Stepping down' })
    expect(lastAdmin.statusCode).toBe(409)
    expect((await call(rootAdminId, 'PATCH', `/admin/users/${rootAdminId}`, { status: 'SUSPENDED', reason: 'x' })).statusCode).toBe(400)
    expect((await call(rootAdminId, 'POST', '/users/me/deactivate')).statusCode).toBe(409)
    await expect(setAdminByEmail('root@test.local', false)).rejects.toThrow(/last active admin/)

    // A moderator cannot suspend an admin through a report.
    const report = await data(call(testUserId, 'POST', '/reports', { target: { type: 'USER', id: rootAdminId }, reason: 'HARASSMENT' }))
    expect((await call(testAdminId, 'POST', `/moderation/reports/${report.id}/resolve`, { status: 'RESOLVED', action: 'SUSPEND_USER', reason: 'x' })).statusCode).toBe(403)
    expect((await db.user.findUniqueOrThrow({ where: { id: rootAdminId } })).status).toBe('ACTIVE')

    // Two admins demoting each other at once: exactly one succeeds.
    await db.user.update({ where: { id: testUserId }, data: { role: 'ADMIN' } })
    const [a, b] = await Promise.all([
      call(rootAdminId, 'PATCH', `/admin/users/${testUserId}`, { role: 'USER', reason: 'race' }),
      call(testUserId, 'PATCH', `/admin/users/${rootAdminId}`, { role: 'USER', reason: 'race' }),
    ])
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409])
    expect(await db.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } })).toBe(1)
  })

  it('bootstraps initial admins from existing accounts, idempotently and audited', async () => {
    expect(await setAdminByEmail(' Alice@Test.Local ', true)).toEqual({ email: 'alice@test.local', role: 'ADMIN', changed: true })
    expect(await setAdminByEmail('alice@test.local', true)).toEqual({ email: 'alice@test.local', role: 'ADMIN', changed: false })
    await expect(setAdminByEmail('nobody@test.local', true)).rejects.toThrow(/not found/)
    const audit = await db.moderationAction.findMany({ where: { targetId: testUserId } })
    expect(audit).toEqual([expect.objectContaining({ moderatorId: null, action: 'ROLE_CHANGE' })])
    expect(await db.user.count()).toBe(3)
  })
})

describe('membership', () => {
  it('shows grants and lets admins grant and revoke through the existing audited operations', async () => {
    await admin()
    const c = await catalog()
    let ws = await data(call(testUserId, 'POST', '/programs', { programTypeId: c.workout.id }))
    ws = await data(call(testUserId, 'POST', `/programs/${ws.id}/draft/activities`, { activityIds: [c.squats.activity.id], expectedRevision: ws.draftRevision }))
    await data(call(testUserId, 'POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'APPROVAL', expectedRevision: ws.draftRevision }))
    const grant = await data(call(rootAdminId, 'POST', `/moderation/programs/${ws.id}/grants`, { userId: testOtherUserId, reason: 'Support' }))
    let grants = await data(call(rootAdminId, 'GET', `/admin/membership/grants?userId=${testOtherUserId}`))
    expect(grants).toEqual([expect.objectContaining({ id: grant.id, source: 'ADMIN', active: true, program: expect.objectContaining({ id: ws.id }), user: expect.objectContaining({ handle: 'bob' }) })])
    await data(call(rootAdminId, 'DELETE', `/moderation/grants/${grant.id}`))
    grants = await data(call(rootAdminId, 'GET', `/admin/membership/grants?programId=${ws.id}&active=false`))
    expect(grants[0]).toMatchObject({ id: grant.id, active: false })
    expect(await data(call(rootAdminId, 'GET', `/admin/membership/grants?active=true`))).toEqual([])
  })
})

describe('platform media and moderation queues', () => {
  const asset = (ownerId: string, key: string) =>
    db.mediaAsset.create({ data: { ownerId, type: 'PHOTO', originalStorageKey: `test/${key}.png`, mime: 'image/png', byteSize: 1, state: 'READY' } })

  it('refuses to delete an admin-owned file while platform content uses it', async () => {
    await admin()
    const c = await catalog()
    const cover = await asset(rootAdminId, 'cover')
    const demo = await asset(rootAdminId, 'demo')
    let ws = await data(call(rootAdminId, 'POST', '/programs', { programTypeId: c.workout.id, owner: 'PLATFORM' }))
    ws = await data(call(rootAdminId, 'PATCH', `/programs/${ws.id}/draft`, { coverMediaId: cover.id, expectedRevision: ws.draftRevision }))
    const act = await data(call(rootAdminId, 'POST', '/activities', { title: 'Wall Sit', categoryId: c.fitness.id, owner: 'PLATFORM' }))
    await data(call(rootAdminId, 'POST', '/media-attachments', { mediaId: demo.id, target: { kind: 'ACTIVITY_REVISION', id: act.revisionId }, purpose: 'DEMONSTRATION' }))

    expect((await call(rootAdminId, 'DELETE', `/media/${cover.id}`)).statusCode).toBe(409)
    expect((await call(rootAdminId, 'DELETE', `/media/${demo.id}`)).statusCode).toBe(409)
    expect((await db.program.findUniqueOrThrow({ where: { id: ws.id } })).coverMediaId).toBe(cover.id)

    // Once platform content no longer uses it, it is the owner's to delete again.
    await data(call(rootAdminId, 'PATCH', `/programs/${ws.id}/draft`, { coverMediaId: null, expectedRevision: ws.draftRevision }))
    expect((await call(rootAdminId, 'DELETE', `/media/${cover.id}`)).statusCode).toBe(200)
    // A user's own Program cover is unaffected by the rule.
    const mine = await asset(testUserId, 'mine')
    const own = await data(call(testUserId, 'POST', '/programs', { programTypeId: c.workout.id }))
    await data(call(testUserId, 'PATCH', `/programs/${own.id}/draft`, { coverMediaId: mine.id, expectedRevision: own.draftRevision }))
    expect((await call(testUserId, 'DELETE', `/media/${mine.id}`)).statusCode).toBe(200)
  })

  it('lets an admin restrict publishing from the reports queue', async () => {
    await admin()
    const c = await catalog()
    const report = await data(call(testOtherUserId, 'POST', '/reports', { target: { type: 'USER', id: testUserId }, reason: 'HARASSMENT', details: 'Spam programs' }))
    const queue = await data(call(rootAdminId, 'GET', '/moderation/reports'))
    expect(queue.map((r: any) => r.id)).toEqual([report.id])
    await data(call(rootAdminId, 'POST', `/moderation/reports/${report.id}/resolve`, { status: 'RESOLVED', action: 'RESTRICT_PUBLISHING', reason: 'Repeated spam' }))
    expect(await data(call(rootAdminId, 'GET', '/moderation/reports'))).toEqual([])

    let ws = await data(call(testUserId, 'POST', '/programs', { programTypeId: c.workout.id }))
    ws = await data(call(testUserId, 'POST', `/programs/${ws.id}/draft/activities`, { activityIds: [c.squats.activity.id], expectedRevision: ws.draftRevision }))
    const refused = await call(testUserId, 'POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision })
    expect(refused.statusCode).toBe(400)
    expect(refused.json().fieldErrors.visibility).toMatch(/restricted/i)

    // Unrestrict: the existing RESTORE action, with a reason, recorded in the audit trail.
    const resolved = await data(call(rootAdminId, 'GET', '/moderation/reports?status=RESOLVED'))
    expect(resolved.map((r: any) => r.id)).toEqual([report.id])
    expect((await call(rootAdminId, 'POST', `/moderation/reports/${report.id}/resolve`, { status: 'RESOLVED', action: 'RESTORE' })).statusCode).toBe(400)
    await data(call(rootAdminId, 'POST', `/moderation/reports/${report.id}/resolve`, { status: 'RESOLVED', action: 'RESTORE', reason: 'Appeal accepted' }))
    const audit = await data(call(rootAdminId, 'GET', `/admin/audit?targetId=${testUserId}`))
    expect(audit.map((a: any) => [a.action, a.reason])).toEqual([['RESTORE', 'Appeal accepted'], ['RESTRICT_PUBLISHING', 'Repeated spam']])
    expect((await db.user.findUniqueOrThrow({ where: { id: testUserId } })).status).toBe('ACTIVE')

    const published = await data(call(testUserId, 'POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision }))
    expect(published).toMatchObject({ status: 'PUBLISHED', visibility: 'PUBLIC' })
  })
})
