import { describe, it, expect } from 'vitest'
import { db } from '@project/db'
import { buildTestApp, asAuth, validateResponse, testUserId, testOtherUserId, seedUser } from './helpers'
import { contractCase } from './helpers/contract'

const app = buildTestApp()
const carolId = '00000000-0000-4000-8000-0000000000c0'

describe('getUserByHandle', () => {
  it('is public, personalizes the relationship, and hides blocked users', async () => {
    const anon = await app.inject({ method: 'GET', url: '/users/bob' })
    expect(anon.statusCode).toBe(200)
    await validateResponse('getUserByHandle', 200, anon.json())
    expect(anon.json().data.relationship).toBe('NONE')
    await app.inject({ method: 'POST', url: `/follow-users/${testOtherUserId}`, headers: asAuth(testUserId) })
    const viewer = await app.inject({ method: 'GET', url: '/users/bob', headers: asAuth(testUserId) })
    expect(viewer.json().data).toMatchObject({ relationship: 'FOLLOWING', followerCount: 1 })
    await app.inject({ method: 'POST', url: `/blocked-users/${testUserId}`, headers: asAuth(testOtherUserId) })
    expect((await app.inject({ method: 'GET', url: '/users/bob', headers: asAuth(testUserId) })).statusCode).toBe(404)
    expect(await db.userFollow.count()).toBe(0) // block cleared the follow
  })
})

describe('followUser', () => {
  it('requires approval for a private profile', async () => {
    await seedUser(carolId, 'carol', { visibility: 'PRIVATE' })
    const res = await app.inject({ method: 'POST', url: `/follow-users/${carolId}`, headers: asAuth(testUserId) })
    expect(res.statusCode).toBe(200)
    await validateResponse('followUser', 200, res.json())
    expect(res.json().data.relationship).toBe('REQUESTED')
    const pending = await app.inject({ method: 'GET', url: '/users/me/follow-requests', headers: asAuth(carolId) })
    await validateResponse('listMyFollowRequests', 200, pending.json())
    const requestId = pending.json().data[0].id
    expect((await app.inject({ method: 'POST', url: `/follow-requests/${requestId}/approve`, headers: asAuth(testOtherUserId) })).statusCode).toBe(404)
    const approved = await app.inject({ method: 'POST', url: `/follow-requests/${requestId}/approve`, headers: asAuth(carolId) })
    expect(approved.json().data.status).toBe('APPROVED')
    const profile = await app.inject({ method: 'GET', url: '/users/carol', headers: asAuth(testUserId) })
    expect(profile.json().data.relationship).toBe('FOLLOWING')
  })

  it('refuses self-follow', async () => {
    const res = await app.inject({ method: 'POST', url: `/follow-users/${testUserId}`, headers: asAuth(testUserId) })
    expect(res.statusCode).toBe(400)
  })

  it('requires auth', async () => {
    expect((await app.inject({ method: 'POST', url: `/follow-users/${testOtherUserId}` })).statusCode).toBe(401)
  })
})

describe('updateMyProfile', () => {
  it('normalizes the handle and rejects one that is taken', async () => {
    const ok = await app.inject({ method: 'PATCH', url: '/users/me/profile', headers: asAuth(testUserId), payload: { handle: 'alice.k', bio: '  Runner  ' } })
    expect(ok.statusCode).toBe(200)
    await validateResponse('updateMyProfile', 200, ok.json())
    expect(ok.json().data).toMatchObject({ handle: 'alice.k', bio: 'Runner' })
    const taken = await app.inject({ method: 'PATCH', url: '/users/me/profile', headers: asAuth(testUserId), payload: { handle: 'bob' } })
    expect(taken.statusCode).toBe(409)
  })

  it('only accepts your own ready photo as an avatar', async () => {
    const bobs = await db.mediaAsset.create({ data: { ownerId: testOtherUserId, type: 'PHOTO', originalStorageKey: 'k/1', mime: 'image/jpeg', byteSize: 10, state: 'READY' } })
    const res = await app.inject({ method: 'PATCH', url: '/users/me/profile', headers: asAuth(testUserId), payload: { avatarMediaId: bobs.id } })
    expect(res.statusCode).toBe(400)
  })
})

describe('updateMyPreferences', () => {
  it('opts into the daily email and rejects unknown timezones', async () => {
    const ok = await app.inject({ method: 'PATCH', url: '/users/me/preferences', headers: asAuth(testUserId), payload: { notifications: { dailyEmail: true, dailyReminderTime: '07:30' } } })
    expect(ok.statusCode).toBe(200)
    await validateResponse('updateMyPreferences', 200, ok.json())
    expect(ok.json().data.notifications).toMatchObject({ dailyEmail: true, dailyReminderTime: '07:30', inAppReminders: true })
    const bad = await app.inject({ method: 'PATCH', url: '/users/me/preferences', headers: asAuth(testUserId), payload: { timezone: 'Mars/Olympus' } })
    expect(bad.statusCode).toBe(400)
  })
})

describe('searchUsers', () => {
  it('matches handle prefixes and paginates', async () => {
    const res = await app.inject({ method: 'GET', url: '/users?q=bo&limit=1' })
    expect(res.statusCode).toBe(200)
    await validateResponse('searchUsers', 200, res.json())
    expect(res.json().data.map((u: any) => u.handle)).toEqual(['bob'])
  })
})

// ── Contract: one block per operationId (pnpm test:generate recognizes these) ──

describe('deactivateMe', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'deactivateMe')
  })
})

describe('listMyFollowRequests', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listMyFollowRequests')
  })
})

describe('unfollowUser', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'unfollowUser')
  })
})

describe('approveFollowRequest', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'approveFollowRequest')
  })
})

describe('declineFollowRequest', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'declineFollowRequest')
  })
})

describe('blockUser', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'blockUser')
  })
})

describe('unblockUser', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'unblockUser')
  })
})
