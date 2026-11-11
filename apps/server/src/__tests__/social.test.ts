import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@project/db'
import { buildTestApp, asAuth, validateResponse, testUserId, testOtherUserId, testAdminId, seedUser } from './helpers'
import { seedCatalog } from './helpers/fixtures'
import { contractCase } from './helpers/contract'

const app = buildTestApp()
let cat: Awaited<ReturnType<typeof seedCatalog>>
beforeEach(async () => {
  cat = await seedCatalog()
})
const req = (method: string, url: string, payload?: unknown, userId = testUserId) =>
  app.inject({ method: method as any, url, headers: asAuth(userId), ...(payload !== undefined ? { payload: payload as any } : {}) })

async function publicProgram(title: string) {
  let ws = (await req('POST', '/programs', { programTypeId: cat.workout.id, focusId: cat.strength.id })).json().data
  ws = (await req('POST', `/programs/${ws.id}/draft/activities`, { activityIds: [cat.squats.activity.id], expectedRevision: ws.draftRevision })).json().data
  ws = (await req('PATCH', `/programs/${ws.id}/draft`, { title, expectedRevision: ws.draftRevision })).json().data
  await req('POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision })
  return ws.id
}

describe('discover and creator profiles', () => {
  it('lists public programs, activities, and creators; the profile shows derived focus chips', async () => {
    await publicProgram('Core Basics')
    const programs = await app.inject({ method: 'GET', url: '/discover?kind=PROGRAM&q=Core' })
    expect(programs.statusCode).toBe(200)
    await validateResponse('discover', 200, programs.json())
    expect(programs.json().data.map((d: any) => d.program.title)).toEqual(['Core Basics'])
    const creators = (await app.inject({ method: 'GET', url: '/discover?kind=CREATOR' })).json().data
    expect(creators.map((c: any) => c.creator.handle)).toEqual(['alice'])
    const profile = (await app.inject({ method: 'GET', url: '/users/alice' })).json().data
    expect(profile).toMatchObject({ publicProgramCount: 1, focusChips: [{ label: 'Strength' }] })
    const list = await app.inject({ method: 'GET', url: '/users/alice/programs' })
    await validateResponse('listUserPrograms', 200, list.json())
    expect(list.json().data).toHaveLength(1)
  })

  it('supports composable server-side discovery filters for level, duration, session length, and tags', async () => {
    await db.tag.createMany({
      data: [
        { slug: 'no-equipment', label: 'No Equipment', group: 'equipment', position: 1 },
        { slug: 'at-home', label: 'At Home', group: 'setting', position: 2 },
        { slug: 'outdoors', label: 'Outdoors', group: 'setting', position: 3 },
      ],
    })
    const makeProgram = async (
      title: string,
      patch: { level: 'BEGINNER' | 'INTERMEDIATE'; durationDays: number | null; sessionMinutes: number; tagSlugs: string[] },
    ) => {
      let ws = (await req('POST', '/programs', { programTypeId: cat.workout.id, focusId: cat.strength.id })).json().data
      ws = (await req('POST', `/programs/${ws.id}/draft/activities`, { activityIds: [cat.squats.activity.id], expectedRevision: ws.draftRevision })).json().data
      ws = (await req('PATCH', `/programs/${ws.id}/draft`, { title, ...patch, expectedRevision: ws.draftRevision })).json().data
      await req('POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision })
      return ws.id
    }

    await makeProgram('Quick Home Core', { level: 'BEGINNER', durationDays: 14, sessionMinutes: 15, tagSlugs: ['no-equipment', 'at-home'] })
    await makeProgram('Outdoor Endurance', { level: 'INTERMEDIATE', durationDays: 42, sessionMinutes: 45, tagSlugs: ['no-equipment', 'outdoors'] })
    await makeProgram('Ongoing Habit', { level: 'BEGINNER', durationDays: null, sessionMinutes: 25, tagSlugs: ['at-home'] })

    const queryTitles = async (qs: string) => {
      const res = await app.inject({ method: 'GET', url: `/discover?kind=PROGRAM&${qs}` })
      expect(res.statusCode).toBe(200)
      await validateResponse('discover', 200, res.json())
      return res.json().data.map((d: any) => d.program.title)
    }

    expect(await queryTitles('level=BEGINNER&duration=SHORT')).toEqual(['Quick Home Core'])
    expect(await queryTitles('level=BEGINNER&duration=ONGOING')).toEqual(['Ongoing Habit'])
    expect(await queryTitles('maxSessionMinutes=25&tags=no-equipment,at-home')).toEqual(['Quick Home Core'])
    expect(await queryTitles('duration=LONG&tags=outdoors')).toEqual(['Outdoor Endurance'])
  })
})

describe('discover activities by popularity', () => {
  it('POPULAR ranks Activities by usage with a deterministic title tie-break; RELEVANT is unchanged', async () => {
    const titles = async (sort: string) =>
      (await app.inject({ method: 'GET', url: `/discover?kind=ACTIVITY&sort=${sort}` })).json().data.map((d: any) => d.activity.title)
    expect(await titles('POPULAR')).toEqual(['Leg Raises', 'Squats'])
    await publicProgram('Squat Basics')
    expect(await titles('POPULAR')).toEqual(['Squats', 'Leg Raises'])
    expect(await titles('RELEVANT')).toEqual(['Leg Raises', 'Squats'])
  })
})

describe('likes and views on public media', () => {
  it('likes are idempotent and views dedupe per viewer per day', async () => {
    const media = await db.mediaAsset.create({ data: { ownerId: testUserId, type: 'PHOTO', originalStorageKey: 'u/a/p', mime: 'image/png', byteSize: 10, state: 'READY' } })
    const pub = await db.mediaPublication.create({ data: { mediaId: media.id, publishedById: testUserId, audience: 'PUBLIC', status: 'APPROVED', license: 'CC0', activityId: cat.squats.activity.id } })
    const l1 = await req('POST', `/media-publications/${pub.id}/likes`, undefined, testOtherUserId)
    await validateResponse('likeMediaPublication', 200, l1.json())
    await req('POST', `/media-publications/${pub.id}/likes`, undefined, testOtherUserId)
    expect((await db.mediaPublication.findUniqueOrThrow({ where: { id: pub.id } })).likeCount).toBe(1)
    expect((await req('DELETE', `/media-publications/${pub.id}/likes`, undefined, testOtherUserId)).json().data).toEqual({ liked: false, likes: 0 })
    await req('POST', `/media-publications/${pub.id}/views`, undefined, testOtherUserId)
    await req('POST', `/media-publications/${pub.id}/views`, undefined, testOtherUserId)
    expect((await db.mediaPublication.findUniqueOrThrow({ where: { id: pub.id } })).viewCount).toBe(1)
    const hub = await app.inject({ method: 'GET', url: `/activities/${cat.squats.activity.id}/public-media` })
    await validateResponse('listActivityPublicMedia', 200, hub.json())
    expect(hub.json().data).toHaveLength(1)
  })

  it('enforces visibility, block rules, and per-creator caps in activityPublicMedia and likes', async () => {
    const carolId = '00000000-0000-4000-8000-0000000000c1'
    await seedUser(carolId, 'carol')

    // Create a private program and a paid program; public media attached to them must not leak into public hubs.
    let privProg = (await req('POST', '/programs', { programTypeId: cat.workout.id })).json().data
    privProg = (await req('POST', `/programs/${privProg.id}/draft/activities`, { activityIds: [cat.squats.activity.id], expectedRevision: privProg.draftRevision })).json().data
    privProg = (await req('PATCH', `/programs/${privProg.id}/draft`, { title: 'Private Plan', expectedRevision: privProg.draftRevision })).json().data
    await req('POST', `/programs/${privProg.id}/publish`, { visibility: 'PRIVATE', accessMode: 'OPEN', expectedRevision: privProg.draftRevision })

    const openProgId = await publicProgram('Open Featured Plan')

    // Alice (creator of openProgId) has 1 featured publication; Bob has 4 publications (capped at 3); Carol has 1 linked to private program.
    const mkPub = async (ownerId: string, rankScore: number, programId: string | null = null) => {
      const m = await db.mediaAsset.create({ data: { ownerId, type: 'PHOTO', originalStorageKey: `u/${ownerId}/${rankScore}`, mime: 'image/png', byteSize: 10, state: 'READY' } })
      return db.mediaPublication.create({
        data: {
          mediaId: m.id,
          publishedById: ownerId,
          audience: 'PUBLIC',
          status: 'APPROVED',
          license: 'CC0',
          activityId: cat.squats.activity.id,
          programId,
          rankScore,
        },
      })
    }

    const alicePub = await mkPub(testUserId, 1, openProgId)
    await mkPub(testOtherUserId, 10)
    await mkPub(testOtherUserId, 9)
    await mkPub(testOtherUserId, 8)
    await mkPub(testOtherUserId, 7) // 4th by Bob -> capped out
    await mkPub(carolId, 100, privProg.id) // linked to private program -> excluded

    const hub = await app.inject({ method: 'GET', url: `/activities/${cat.squats.activity.id}/public-media?programId=${openProgId}` })
    expect(hub.statusCode).toBe(200)
    const items = hub.json().data
    // Alice's featured publication comes first, followed by at most 3 from Bob; Carol's private-program media is excluded.
    expect(items).toHaveLength(4)
    expect(items[0].publicationId).toBe(alicePub.id)
    expect(items.filter((x: any) => x.creator?.handle === 'bob')).toHaveLength(3)

    // When Carol blocks Bob, Bob's media disappears from Carol's view of the hub, and Bob cannot like Carol's or Carol like Bob's media.
    await req('POST', `/blocked-users/${testOtherUserId}`, undefined, carolId)
    const carolHub = await req('GET', `/activities/${cat.squats.activity.id}/public-media`, undefined, carolId)
    expect(carolHub.json().data.some((x: any) => x.creator?.handle === 'bob')).toBe(false)
    expect((await req('POST', `/media-publications/${alicePub.id}/likes`, undefined, carolId)).statusCode).toBe(200)
    await req('POST', `/blocked-users/${carolId}`, undefined, testUserId)
    expect((await req('POST', `/media-publications/${alicePub.id}/likes`, undefined, carolId)).statusCode).toBe(404)
  })
})

describe('notifications and email opt-out', () => {
  it('lists, counts, and marks read; a signed token unsubscribes from the daily email', async () => {
    await db.notification.create({ data: { recipientId: testUserId, type: 'FOLLOW_REQUEST', title: 'New follow request', deepLink: '/u/bob', entityKind: 'USER', entityId: testOtherUserId } })
    expect((await req('GET', '/notifications/unread-count')).json().data.count).toBe(1)
    const list = await req('GET', '/notifications')
    await validateResponse('listNotifications', 200, list.json())
    await req('POST', '/notifications/read', { all: true })
    expect((await req('GET', '/notifications/unread-count')).json().data.count).toBe(0)
    expect((await req('GET', '/notifications/unread-count', undefined, testOtherUserId)).json().data.count).toBe(0)

    await db.userPreference.update({ where: { userId: testUserId }, data: { dailyEmailEnabled: true } })
    const { unsubscribeToken } = await import('../domains/social/notification.service')
    expect((await app.inject({ method: 'POST', url: '/email/unsubscribe', payload: { token: `${testUserId}.forged` } })).statusCode).toBe(404)
    expect((await app.inject({ method: 'POST', url: '/email/unsubscribe', payload: { token: unsubscribeToken(testUserId) } })).statusCode).toBe(200)
    expect((await db.userPreference.findUniqueOrThrow({ where: { userId: testUserId } })).dailyEmailEnabled).toBe(false)
  })
})

describe('reports and moderation', () => {
  it('a report leads to an audited takedown that removes the program from discovery', async () => {
    const programId = await publicProgram('Risky Plan')
    const report = await req('POST', '/reports', { target: { type: 'PROGRAM', id: programId }, reason: 'UNSAFE', details: 'Dangerous advice' }, testOtherUserId)
    expect(report.statusCode).toBe(201)
    await validateResponse('createReport', 201, report.json())
    expect((await req('GET', '/moderation/reports', undefined, testOtherUserId)).statusCode).toBe(403)
    const queue = await req('GET', '/moderation/reports', undefined, testAdminId)
    await validateResponse('listReports', 200, queue.json())
    const resolved = await req('POST', `/moderation/reports/${report.json().data.id}/resolve`, { status: 'RESOLVED', action: 'HIDE', reason: 'Unsafe guidance' }, testAdminId)
    expect(resolved.json().data.status).toBe('RESOLVED')
    expect((await app.inject({ method: 'GET', url: '/discover?kind=PROGRAM' })).json().data).toHaveLength(0)
    expect(await db.moderationAction.count({ where: { targetId: programId, action: 'HIDE' } })).toBe(1)
  })

  it('a publishing restriction blocks public publishing', async () => {
    const report = (await req('POST', '/reports', { target: { type: 'USER', id: testUserId }, reason: 'MISLEADING' }, testOtherUserId)).json().data
    await req('POST', `/moderation/reports/${report.id}/resolve`, { status: 'RESOLVED', action: 'RESTRICT_PUBLISHING', reason: 'Repeated misleading content' }, testAdminId)
    let ws = (await req('POST', '/programs', { programTypeId: cat.workout.id })).json().data
    ws = (await req('POST', `/programs/${ws.id}/draft/activities`, { activityIds: [cat.squats.activity.id], expectedRevision: ws.draftRevision })).json().data
    const res = await req('POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toMatch(/restricted/)
  })
})

// ── Contract: one block per operationId (pnpm test:generate recognizes these) ──

describe('getMediaPublication', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'getMediaPublication')
  })
})

describe('discover', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'discover')
  })
})

describe('listUserPrograms', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listUserPrograms')
  })
})

describe('listUserActivities', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listUserActivities')
  })
})

describe('listUserPublications', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listUserPublications')
  })
})

describe('likeMediaPublication', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'likeMediaPublication')
  })
})

describe('unlikeMediaPublication', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'unlikeMediaPublication')
  })
})

describe('recordMediaPublicationView', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'recordMediaPublicationView')
  })
})

describe('listMediaPublicationComments', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listMediaPublicationComments')
  })
})

describe('addMediaPublicationComment', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'addMediaPublicationComment')
  })
})

describe('deleteMediaComment', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'deleteMediaComment')
  })
})
