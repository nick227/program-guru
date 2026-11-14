// G1 (10 §9.3): Program-group operations act on PROGRAM groups only. A gathering row (kind GATHERING,
// no Program version) is "not found" on every Program-only /groups operation and never appears in
// Program lists, while operations keyed only by group id keep working for its members.
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@project/db'
import { asAuth, buildTestApp, testOtherUserId, testUserId } from './helpers'
import { seedCatalog } from './helpers/fixtures'
import { World } from './helpers/contract'

const app = buildTestApp()
let cat: Awaited<ReturnType<typeof seedCatalog>>
let gatheringId = ''
beforeEach(async () => {
  cat = await seedCatalog()
  const g = await db.programGroup.create({
    data: {
      kind: 'GATHERING',
      activityId: cat.squats.activity.id,
      ownerId: testUserId,
      startLocalDate: new Date('2026-12-05T00:00:00Z'),
      timezone: 'America/Chicago',
      visibility: 'PUBLIC',
      joinPolicy: 'OPEN',
      members: { create: { userId: testUserId, role: 'OWNER', status: 'ACTIVE', joinedAt: new Date() } },
    },
  })
  gatheringId = g.id
})

const call = (method: string, url: string, payload?: unknown, userId = testUserId) =>
  app.inject({ method: method as any, url, headers: asAuth(userId), ...(payload !== undefined ? { payload: payload as any } : {}) })

describe('Program-only /groups operations never act on a gathering', () => {
  it('returns 404 for detail, update, membership, invitations, preview and join', async () => {
    const cases: [string, string, unknown?, string?][] = [
      ['GET', `/groups/${gatheringId}`],
      ['PATCH', `/groups/${gatheringId}`, { name: 'x' }],
      ['PATCH', `/groups/${gatheringId}/members/me`, { sharedCompletion: false }],
      ['DELETE', `/groups/${gatheringId}/members/${testOtherUserId}`],
      ['GET', `/groups/${gatheringId}/invitations`],
      ['POST', `/groups/${gatheringId}/invitations`, { kind: 'LINK' }],
      ['GET', `/groups/${gatheringId}/preview`, undefined, testOtherUserId],
      ['POST', `/groups/${gatheringId}/join`, {}, testOtherUserId],
    ]
    for (const [method, url, payload, user] of cases) {
      const res = await call(method, url, payload, user ?? testUserId)
      expect(res.statusCode, `${method} ${url}`).toBe(404)
    }
  })

  it('a gathering link token is not a Program invitation', async () => {
    const { sha256 } = await import('../lib/auth')
    await db.groupInvitation.create({
      data: { groupId: gatheringId, kind: 'LINK', createdById: testUserId, tokenHash: sha256('gathering-token-123'), expiresAt: new Date(Date.now() + 86_400_000) },
    })
    await db.programGroup.update({ where: { id: gatheringId }, data: { joinLinkEnabled: true } })
    expect((await call('GET', '/group-invitations/gathering-token-123', undefined, testOtherUserId)).statusCode).toBe(404)
    expect((await call('POST', '/group-invitations/gathering-token-123/accept', {}, testOtherUserId)).statusCode).toBe(404)
  })

  it('never appears in My Groups, a Program enrollment, or Program discovery', async () => {
    const world = new World(app)
    const program = await world.program()
    const mine = await call('GET', '/groups')
    expect(mine.statusCode).toBe(200)
    expect(mine.json().data.map((g: { id: string }) => g.id)).not.toContain(gatheringId)
    const enroll = await call('POST', `/programs/${program.id}/enrollments`, {
      programVersionId: program.versionId, startLocalDate: '2026-12-01', timezone: 'America/Chicago', groupId: gatheringId, idempotencyKey: 'guard-enroll-1',
    }, testUserId)
    expect(enroll.statusCode).toBe(400)
    const discover = await app.inject({ method: 'GET', url: '/discover?kind=PROGRAM' })
    const featured = discover.json().data.map((d: { featuredGroup?: { id: string } | null }) => d.featuredGroup?.id).filter(Boolean)
    expect(featured).not.toContain(gatheringId)
  })

  it('operations keyed by group id still work for its members', async () => {
    expect((await call('GET', `/groups/${gatheringId}/completions`)).statusCode).toBe(200)
    expect((await call('GET', `/groups/${gatheringId}/media`)).statusCode).toBe(200)
    // Non-members still cannot read it.
    expect((await call('GET', `/groups/${gatheringId}/completions`, undefined, testOtherUserId)).statusCode).toBe(404)
  })
})
