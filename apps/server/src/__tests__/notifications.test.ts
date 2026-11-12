// Contract and scenario tests for the notifications operations.
import { describe, expect, it } from 'vitest'
import { db } from '@project/db'
import {
  GROUP_WINDOW_MS,
  groupAndPaginateNotifications,
  type NotificationRowLike,
} from '../domains/social/notification.service'
import {
  buildTestApp,
  seedUser,
  testOtherUserId,
  testUserId,
} from './helpers'
import { randomUUID } from 'crypto'
import { contractCase } from './helpers/contract'

const app = buildTestApp()

function makeActor(id: string, name: string) {
  return {
    id,
    handle: name.toLowerCase().replace(/\s+/g, '_'),
    displayName: name,
    avatarUrl: `https://example.com/${id}.jpg`,
  }
}

function makeRow(
  overrides: Partial<NotificationRowLike> & { id: string; createdAt: Date },
): NotificationRowLike {
  return {
    type: 'COMPLETION_REACTION',
    title: 'Someone reacted',
    deepLink: '/occurrences/occ-1',
    entityKind: 'COMPLETION_SHARE',
    entityId: '00000000-0000-4000-8000-000000000100',
    groupOccurrenceKey: 'group:1:day:1',
    readAt: null,
    actor: makeActor('u1', 'Alex'),
    ...overrides,
  }
}

// ── Contract: one block per operationId (pnpm test:generate recognizes these) ──

describe('listNotifications', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listNotifications')
  })
})

describe('getUnreadNotificationCount', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'getUnreadNotificationCount')
  })
})

describe('markNotificationsRead', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'markNotificationsRead')
  })
})

describe('unsubscribeDailyEmail', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'unsubscribeDailyEmail')
  })
})

// ── Grouping & pagination boundaries ──

describe('groupAndPaginateNotifications', () => {
  it('groups reactions within the bounded window and splits across window boundary', () => {
    const t0 = new Date('2026-11-10T18:00:00.000Z')
    const within = new Date(t0.getTime() - 2 * 60 * 60 * 1000)
    const outside = new Date(t0.getTime() - GROUP_WINDOW_MS - 1000)

    const rows: NotificationRowLike[] = [
      makeRow({ id: 'n3', createdAt: t0, actor: makeActor('a1', 'Alex'), readAt: null }),
      makeRow({ id: 'n2', createdAt: within, actor: makeActor('a2', 'Maya'), readAt: within }),
      makeRow({ id: 'n1', createdAt: outside, actor: makeActor('a3', 'Sam'), readAt: null }),
    ]

    const page = groupAndPaginateNotifications(rows, { limit: 10, exhausted: true })
    expect(page.groups).toHaveLength(2)

    expect(page.groups[0]!.ids).toEqual(['n3', 'n2'])
    expect(page.groups[0]!.count).toBe(2)
    expect(page.groups[0]!.unreadCount).toBe(1)
    expect(page.groups[0]!.readAt).toBeNull()
    expect(page.groups[0]!.title).toBe('Alex and Maya reacted to your activity')
    expect(page.groups[0]!.actors.map((a) => a.id)).toEqual(['a1', 'a2'])

    expect(page.groups[1]!.ids).toEqual(['n1'])
    expect(page.groups[1]!.count).toBe(1)
    expect(page.groups[1]!.unreadCount).toBe(1)
  })

  it('paginates grouped notifications without duplicating or skipping interleaved singletons', () => {
    const t3 = new Date('2026-11-10T12:00:00.000Z')
    const t2 = new Date('2026-11-10T11:00:00.000Z')
    const t1 = new Date('2026-11-10T10:00:00.000Z')

    const rows: NotificationRowLike[] = [
      makeRow({ id: 'r2', createdAt: t3, actor: makeActor('a1', 'Alex') }),
      makeRow({
        id: 'rem1',
        type: 'ACTIVITY_REMINDER',
        title: 'Time for Squats',
        entityKind: 'CALENDAR_ITEM',
        entityId: '00000000-0000-4000-8000-000000000200',
        groupOccurrenceKey: null,
        actor: null,
        createdAt: t2,
      }),
      makeRow({ id: 'r1', createdAt: t1, actor: makeActor('a2', 'Maya') }),
    ]

    const p1 = groupAndPaginateNotifications(rows, { limit: 1, exhausted: true })
    expect(p1.groups).toHaveLength(1)
    expect(p1.groups[0]!.ids).toEqual(['r2', 'r1'])
    expect(p1.hasMore).toBe(true)
    expect(p1.nextCursor).toBeTruthy()

    const p2 = groupAndPaginateNotifications(rows, {
      cursor: p1.nextCursor!,
      limit: 1,
      exhausted: true,
    })
    expect(p2.groups).toHaveLength(1)
    expect(p2.groups[0]!.id).toBe('rem1')
    expect(p2.hasMore).toBe(false)
  })
})

describe('GET /notifications grouping, filters, and read state', () => {
  it('groups reactions server-side, supports direct/groups/unread filters, and marks group ids read', async () => {
    const carolId = randomUUID()
    await seedUser(carolId, 'carol_notif')
    const shareId = randomUUID()
    const inviteId = randomUUID()
    const now = new Date()

    await db.notification.createMany({
      data: [
        {
          id: randomUUID(),
          recipientId: testUserId,
          actorId: testOtherUserId,
          type: 'COMPLETION_REACTION',
          title: 'Bob reacted 👍',
          deepLink: `/occurrences/${shareId}`,
          entityKind: 'COMPLETION_SHARE',
          entityId: shareId,
          groupOccurrenceKey: 'occ-shared-1',
          dedupeKey: `test-react-1-${shareId}`,
          createdAt: now,
        },
        {
          id: randomUUID(),
          recipientId: testUserId,
          actorId: carolId,
          type: 'COMPLETION_REACTION',
          title: 'Carol reacted 🔥',
          deepLink: `/occurrences/${shareId}`,
          entityKind: 'COMPLETION_SHARE',
          entityId: shareId,
          groupOccurrenceKey: 'occ-shared-1',
          dedupeKey: `test-react-2-${shareId}`,
          createdAt: new Date(now.getTime() - 60_000),
        },
        {
          id: randomUUID(),
          recipientId: testUserId,
          actorId: testOtherUserId,
          type: 'GROUP_INVITE',
          title: 'Bob invited you to Morning Crew',
          deepLink: `/groups/${randomUUID()}/invitations/${inviteId}`,
          entityKind: 'GROUP_INVITATION',
          entityId: inviteId,
          dedupeKey: `test-invite-${inviteId}`,
          createdAt: new Date(now.getTime() - 120_000),
        },
        {
          id: randomUUID(),
          recipientId: testUserId,
          actorId: null,
          type: 'ACTIVITY_REMINDER',
          title: 'Time for Mobility',
          deepLink: `/occurrences/${randomUUID()}`,
          entityKind: 'CALENDAR_ITEM',
          entityId: randomUUID(),
          dedupeKey: `test-rem-${randomUUID()}`,
          createdAt: new Date(now.getTime() - 180_000),
        },
      ],
    })

    const aliceAuth = { authorization: `Bearer ${testUserId}` }
    const bobAuth = { authorization: `Bearer ${testOtherUserId}` }

    // Unread count reflects all 4 underlying rows
    const unreadRes = await app.inject({
      method: 'GET',
      url: '/notifications/unread-count',
      headers: aliceAuth,
    })
    expect(unreadRes.statusCode).toBe(200)
    expect(unreadRes.json().data.count).toBe(4)

    // Grouped list returns 3 entries (2 reactions grouped + 1 invite + 1 reminder)
    const allRes = await app.inject({
      method: 'GET',
      url: '/notifications?limit=10',
      headers: aliceAuth,
    })
    expect(allRes.statusCode).toBe(200)
    const allData = allRes.json().data
    expect(allData).toHaveLength(3)
    expect(allData[0].count).toBe(2)
    expect(allData[0].unreadCount).toBe(2)
    expect(allData[0].ids).toHaveLength(2)
    expect(allData[0].actors).toHaveLength(2)
    expect(allData[0].items).toHaveLength(2)

    // Server-side filter=groups excludes ACTIVITY_REMINDER
    const groupsRes = await app.inject({
      method: 'GET',
      url: '/notifications?filter=groups',
      headers: aliceAuth,
    })
    expect(groupsRes.statusCode).toBe(200)
    expect(groupsRes.json().data).toHaveLength(2)

    // Marking the grouped reaction entry read marks both underlying rows read
    const markRes = await app.inject({
      method: 'POST',
      url: '/notifications/read',
      headers: aliceAuth,
      payload: { ids: allData[0].ids },
    })
    expect(markRes.statusCode).toBe(200)

    const unreadAfter = await app.inject({
      method: 'GET',
      url: '/notifications/unread-count',
      headers: aliceAuth,
    })
    expect(unreadAfter.json().data.count).toBe(2)

    // Cross-user isolation: bob cannot read or mark alice's notifications
    const bobList = await app.inject({
      method: 'GET',
      url: '/notifications',
      headers: bobAuth,
    })
    expect(bobList.json().data).toHaveLength(0)

    await app.inject({
      method: 'POST',
      url: '/notifications/read',
      headers: bobAuth,
      payload: { ids: [allData[1].id] },
    })
    const aliceStillUnread = await app.inject({
      method: 'GET',
      url: '/notifications/unread-count',
      headers: aliceAuth,
    })
    expect(aliceStillUnread.json().data.count).toBe(2)
  })
})
