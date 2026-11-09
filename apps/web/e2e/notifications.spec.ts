import { test, expect, type Page } from '@playwright/test'
import type { components } from '@project/sdk'
import { login } from './journey'

type S = components['schemas']

const uid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const programId = uid(10)
const activityId = uid(20)
const itemId = uid(30)
const enrollmentId = uid(40)
const groupId = uid(70)
const inviteGroupId = uid(71)
const invitationId = uid(72)
const shareId = uid(80)
const achievementId = uid(90)
const followReqId = uid(95)

async function setupNotificationsMock(
  page: Page,
  options: { failFirstNotificationsLoad?: boolean } = {},
) {
  let loggedIn = false
  let failList = options.failFirstNotificationsLoad ?? false
  let pendingVersionId: string | null = uid(19)
  let sharedAchievement = false
  let followReqPending = true
  let reacted = false
  let joinedInvitedGroup = false
  let leftInvitedGroup = false
  let declinedInvitation = false

  let prefs: S['UserPreferences'] = {
    timezone: 'America/Chicago',
    locale: 'en-US',
    defaultVisibility: 'PRIVATE',
    notifications: {
      inAppReminders: true,
      dailyEmail: false,
      dailyReminderTime: '08:00',
      groupActivity: true,
      followRequests: true,
      mutedGroupIds: [],
    },
  }

  const coach: S['UserSummary'] = {
    id: uid(2),
    handle: 'coach_maya',
    displayName: 'Coach Maya',
    avatarUrl: null,
  }

  let notifications: S['Notification'][] = [
    {
      id: uid(101),
      type: 'ACTIVITY_REMINDER',
      title: 'Time for Morning Squats',
      actor: null,
      createdAt: '2026-11-07T14:00:00Z',
      readAt: null,
      deepLink: `/occurrences/${itemId}`,
    },
    {
      id: uid(102),
      type: 'PROGRAM_UPDATE',
      title: 'Strength Foundation has a new version available',
      actor: coach,
      createdAt: '2026-11-07T13:30:00Z',
      readAt: null,
      deepLink: `/programs/${programId}`,
    },
    {
      id: uid(103),
      type: 'GROUP_INVITE',
      title: 'Coach Maya invited you to Morning Crew',
      actor: coach,
      createdAt: '2026-11-07T13:00:00Z',
      readAt: null,
      deepLink: `/groups/${inviteGroupId}/invitations/${invitationId}`,
    },
    {
      id: uid(104),
      type: 'ACHIEVEMENT_EARNED',
      title: 'Earned First Activity Completed',
      actor: null,
      createdAt: '2026-11-06T18:00:00Z',
      readAt: '2026-11-06T19:00:00Z',
      deepLink: '/achievements',
    },
    {
      id: uid(105),
      type: 'FOLLOW_ACCEPTED',
      title: 'Coach Maya accepted your follow request',
      actor: coach,
      createdAt: '2026-11-05T15:00:00Z',
      readAt: '2026-11-05T16:00:00Z',
      deepLink: '/u/coach_maya',
    },
  ]

  const requests: {
    path: string
    method: string
    body: Record<string, unknown>
  }[] = []

  const programSummary: S['ProgramSummary'] = {
    id: programId,
    title: 'Strength Foundation',
    type: {
      id: uid(3),
      categoryId: uid(4),
      slug: 'workout',
      label: 'Workout',
      icon: null,
      isFeatured: true,
      focusIds: [],
    },
    focus: null,
    creator: coach,
    coverUrl: null,
    durationDays: 28,
    programDays: 12,
    placements: 12,
    frequencyLabel: '3 days/week',
    visibility: 'PUBLIC',
    accessMode: 'OPEN',
    prices: [],
    viewerAccess: 'GRANTED',
    isPlatform: false,
  }

  await page.route('http://localhost:3001/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname
    const method = req.method()

    if (method === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin':
            req.headers().origin ?? 'http://localhost:5173',
          'access-control-allow-credentials': 'true',
          'access-control-allow-methods': '*',
          'access-control-allow-headers': '*',
        },
      })
    }

    const body = (req.postDataJSON() ?? {}) as Record<string, unknown>
    requests.push({ path, method, body })

    const send = (
      data: unknown,
      status = 200,
      meta?: { hasMore: boolean; nextCursor: string | null },
    ) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({
          data,
          ...(meta ? { meta } : {}),
        }),
      })

    const error = (status: number, code: string, message: string) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({
          code,
          message,
          requestId: 'notif-test-req',
        }),
      })

    if (path === '/auth/login') {
      loggedIn = true
      return send({})
    }
    if (path === '/auth/me') {
      if (!loggedIn) return error(401, 'UNAUTHORIZED', 'Not authenticated')
      return send({
        id: uid(1),
        email: 'participant@test.local',
        emailVerified: true,
        status: 'ACTIVE',
        role: 'USER',
        profile: {
          id: uid(1),
          handle: 'participant',
          displayName: 'Alex Participant',
          avatarUrl: null,
          bio: null,
          coverUrl: null,
          visibility: 'PUBLIC',
          relationship: 'NONE',
          followerCount: 2,
          followingCount: 1,
          publicProgramCount: 0,
          focusChips: [],
        },
        preferences: prefs,
        createdAt: '2026-11-01T00:00:00Z',
      } satisfies S['UserMe'])
    }

    if (path === '/users/me/preferences' && method === 'PATCH') {
      prefs = {
        ...prefs,
        ...(typeof body.timezone === 'string'
          ? { timezone: body.timezone }
          : {}),
        notifications: {
          ...prefs.notifications,
          ...((body.notifications as Partial<S['NotificationPrefs']>) ?? {}),
        },
      }
      return send(prefs)
    }

    if (path === '/email/unsubscribe' && method === 'POST') {
      if (body.token !== 'valid-unsub-token') {
        return error(400, 'INVALID_TOKEN', 'Unsubscribe token is invalid')
      }
      prefs = {
        ...prefs,
        notifications: {
          ...prefs.notifications,
          dailyEmail: false,
        },
      }
      return send({ ok: true })
    }

    if (path === '/notifications/unread-count') {
      const count = notifications.filter((n) => !n.readAt).length
      return send({ count })
    }

    if (path === '/notifications' && method === 'GET') {
      if (failList) {
        return error(
          503,
          'UNAVAILABLE',
          'Notifications temporarily unavailable',
        )
      }
      const cursor = url.searchParams.get('cursor')
      if (!cursor) {
        return send(notifications.slice(0, 3), 200, {
          hasMore: notifications.length > 3,
          nextCursor: notifications.length > 3 ? 'page-2' : null,
        })
      }
      return send(notifications.slice(3), 200, {
        hasMore: false,
        nextCursor: null,
      })
    }

    if (path === '/notifications/read' && method === 'POST') {
      const nowIso = '2026-11-07T15:00:00Z'
      if (body.all) {
        notifications = notifications.map((n) => ({
          ...n,
          readAt: n.readAt ?? nowIso,
        }))
      } else if (Array.isArray(body.ids)) {
        const idSet = new Set(body.ids as string[])
        notifications = notifications.map((n) =>
          idSet.has(n.id) ? { ...n, readAt: n.readAt ?? nowIso } : n,
        )
      }
      return send({ ok: true })
    }

    if (path === '/calendar/items') {
      const start = url.searchParams.get('start') ?? '2026-11-07'
      const end = url.searchParams.get('end') ?? start
      const itemDate =
        '2026-11-07' >= start && '2026-11-07' <= end ? '2026-11-07' : start
      return send([
        {
          id: itemId,
          localDate: itemDate,
          localTime: '09:30',
          status: 'PLANNED',
          title: 'Morning Squats',
          activityId,
          activityRevisionId: uid(21),
          programTitle: 'Strength Foundation',
          enrollmentId,
          programDayIndex: 0,
          recurrenceId: null,
          conflict: false,
          locked: false,
          thumbnailUrl: null,
          participantAvatars: [],
          unreadCount: notifications.some(
            (n) => n.id === uid(101) && !n.readAt,
          )
            ? 1
            : 0,
          updatedAt: '2026-11-07T12:00:00Z',
        },
        // Pre-join item dated before participationStartDate -> NOT_PARTICIPATING (never Missed, never reminded)
        {
          id: uid(32),
          localDate: itemDate,
          localTime: '07:00',
          status: 'NOT_PARTICIPATING',
          title: 'Pre-Join Warmup',
          activityId,
          activityRevisionId: uid(21),
          programTitle: 'Strength Foundation',
          enrollmentId,
          programDayIndex: 0,
          recurrenceId: null,
          conflict: false,
          locked: false,
          thumbnailUrl: null,
          participantAvatars: [],
          unreadCount: 0,
          updatedAt: '2026-11-07T12:00:00Z',
        },
        // Duplicate occurrence on same date/time/activity/enrollment to verify deduplication
        {
          id: uid(31),
          localDate: itemDate,
          localTime: '09:30',
          status: 'PLANNED',
          title: 'Morning Squats',
          activityId,
          activityRevisionId: uid(21),
          programTitle: 'Strength Foundation',
          enrollmentId,
          programDayIndex: 0,
          recurrenceId: null,
          conflict: false,
          locked: false,
          thumbnailUrl: null,
          participantAvatars: [],
          unreadCount: 0,
          updatedAt: '2026-11-07T12:00:00Z',
        },
      ] satisfies S['CalendarItem'][])
    }

    if (path === `/calendar-items/${itemId}/occurrence`) {
      return send({
        item: {
          id: itemId,
          localDate: '2026-11-07',
          localTime: '09:30',
          status: 'PLANNED',
          title: 'Morning Squats',
          activityId,
          activityRevisionId: uid(21),
          programTitle: 'Strength Foundation',
          enrollmentId,
          programDayIndex: 0,
          recurrenceId: null,
          conflict: false,
          locked: false,
          thumbnailUrl: null,
          participantAvatars: [],
          unreadCount: 0,
          updatedAt: '2026-11-07T12:00:00Z',
        },
        session: null,
        resultInputs: [],
        collaborators: {
          groupId,
          occurrenceKey: '0:0',
          finishedCount: 1,
          totalCount: 2,
          unreadCount: 0,
          members: [
            {
              user: coach,
              status: 'DONE',
              completionShareId: shareId,
              completedAt: null,
              reactions: reacted
                ? [{ emoji: '👏', count: 1, reactedByMe: true }]
                : [],
            },
          ],
        },
        personalStats: [],
        instructions: [],
        tools: [],
        myMedia: [],
        sharedMedia: [],
        communityMedia: [],
        communityStats: null,
      } satisfies S['ActivityOccurrence'])
    }

    if (path === '/resolve-slug') {
      return send({
        id: programId,
        kind: 'PROGRAM',
        canonicalSlug: null,
        creatorHandle: null,
        isAlias: false,
        canonicalUrl: `/programs/${programId}`,
      } satisfies S['SlugResolution'])
    }

    if (path === `/programs/${programId}`) {
      return send({
        ...programSummary,
        description: 'Progressive strength program.',
        latestVersionId: uid(19),
        safeActivityOutline: [
          { title: 'Morning Squats', dayIndex: 0, mediaPreviewUrl: null },
        ],
        enrollmentCount: 8,
        completionRate: 0.75,
        canJoin: true,
        canRequestAccess: false,
        canPurchase: false,
        myEnrollmentId: enrollmentId,
      } satisfies S['ProgramPreview'])
    }

    if (path === `/enrollments/${enrollmentId}` && method === 'GET') {
      return send({
        id: enrollmentId,
        program: programSummary,
        programVersionId: uid(12),
        pendingVersionId,
        groupId,
        startLocalDate: '2026-11-07',
        timezone: prefs.timezone,
        status: 'ACTIVE',
        calendarItemCount: 12,
        participationStartDate: '2026-11-07',
      } satisfies S['Enrollment'])
    }

    if (path === `/enrollments/${enrollmentId}/accept-update`) {
      pendingVersionId = null
      return send({
        id: enrollmentId,
        program: programSummary,
        programVersionId: uid(19),
        pendingVersionId: null,
        groupId,
        startLocalDate: '2026-11-07',
        timezone: prefs.timezone,
        status: 'ACTIVE',
        calendarItemCount: 12,
        participationStartDate: '2026-11-07',
      } satisfies S['Enrollment'])
    }

    const invitePreview: S['InvitationPreview'] = {
      groupName: 'Morning Crew',
      inviter: coach,
      program: {
        ...programSummary,
        description: 'Progressive strength program.',
        latestVersionId: uid(19),
        safeActivityOutline: [],
        enrollmentCount: 8,
        completionRate: 0.75,
        canJoin: true,
        canRequestAccess: false,
        canPurchase: false,
        myEnrollmentId: null,
      },
      mode: 'SYNC',
      startLocalDate: '2026-11-07',
      canAccept: true,
      requiresAccess: false,
      join: {
        status: 'CONFIRM_ENROLLMENT',
        enrollmentId: null,
        startLocalDate: '2026-11-07',
        startDateDiffers: false,
      },
    }

    const buildGroupDetail = (targetGroupId: string): S['GroupDetail'] => ({
      id: targetGroupId,
      programVersionId: uid(19),
      programTitle: 'Strength Foundation',
      name: 'Morning Crew',
      mode: 'SYNC',
      memberCount: 2,
      myRole: 'MEMBER',
      startLocalDate: '2026-11-07',
      timezone: prefs.timezone,
      joinLinkEnabled: true,
      members: [
        {
          user: coach,
          role: 'OWNER',
          status: 'ACTIVE',
          sharedCompletion: true,
        },
      ],
      mySharedCompletion: true,
      myEnrollment: {
        enrollmentId,
        startLocalDate: '2026-11-07',
        startDateDiffers: false,
      },
    })

    if (path === '/users/me/group-invitations' && method === 'GET') {
      return send(
        joinedInvitedGroup || leftInvitedGroup || declinedInvitation
          ? ([] satisfies S['ReceivedGroupInvitation'][])
          : ([
              {
                id: invitationId,
                kind: 'USER',
                expiresAt: '2026-11-21T00:00:00Z',
                groupId: inviteGroupId,
                preview: invitePreview,
              },
            ] satisfies S['ReceivedGroupInvitation'][]),
        200,
        { hasMore: false, nextCursor: null },
      )
    }

    if (
      path === `/users/me/group-invitations/${invitationId}/accept` &&
      method === 'POST'
    ) {
      if (!body.enrollment) {
        return error(400, 'VALIDATION_ERROR', 'Confirm your schedule to join this group')
      }
      joinedInvitedGroup = true
      return send(buildGroupDetail(inviteGroupId))
    }

    if (
      path === `/users/me/group-invitations/${invitationId}/decline` &&
      method === 'POST'
    ) {
      declinedInvitation = true
      return send({ ok: true } satisfies S['Ack'])
    }

    if (path === '/group-invitations/invite-token-123' && method === 'GET') {
      return send(invitePreview)
    }

    if (
      path === '/group-invitations/invite-token-123/accept' &&
      method === 'POST'
    ) {
      return send(buildGroupDetail(groupId))
    }

    if (path === '/groups' && method === 'GET') {
      return send(
        [
          {
            id: groupId,
            programId,
            programVersionId: uid(19),
            programTitle: 'Strength Foundation',
            name: 'Morning Crew',
            mode: 'SYNC',
            memberCount: 2,
            myRole: 'MEMBER',
          },
        ] satisfies S['GroupSummary'][],
        200,
        { hasMore: false, nextCursor: null },
      )
    }

    if (path === `/groups/${inviteGroupId}` && method === 'GET') {
      if (!joinedInvitedGroup || leftInvitedGroup) {
        return error(404, 'NOT_FOUND', 'Group not found')
      }
      return send(buildGroupDetail(inviteGroupId))
    }

    if (path === `/groups/${inviteGroupId}/members/me` && method === 'PATCH') {
      if (body.leave) {
        leftInvitedGroup = true
      }
      return send(buildGroupDetail(inviteGroupId))
    }

    if (path === `/groups/${groupId}` && method === 'GET') {
      return send(buildGroupDetail(groupId))
    }

    if (
      (path === `/groups/${groupId}/invitations` ||
        path === `/groups/${inviteGroupId}/invitations`) &&
      method === 'GET'
    ) {
      return send([] satisfies S['GroupInvitation'][])
    }

    if (
      (path === `/groups/${groupId}/invitations` ||
        path === `/groups/${inviteGroupId}/invitations`) &&
      method === 'POST'
    ) {
      return send(
        {
          id: uid(75),
          kind: (body.kind as S['InviteKind']) ?? 'LINK',
          status: 'PENDING',
          expiresAt: '2026-11-14T00:00:00Z',
          joinUrl: 'http://localhost:5173/join/generated-token-456',
          invitedUser: null,
        } satisfies S['GroupInvitation'],
        201,
      )
    }

    if (
      (path === `/groups/${groupId}/completions` ||
        path === `/groups/${inviteGroupId}/completions`) &&
      method === 'GET'
    ) {
      if (path.includes(inviteGroupId) && (!joinedInvitedGroup || leftInvitedGroup)) {
        return error(404, 'NOT_FOUND', 'Group not found')
      }
      return send(
        [
          {
            id: shareId,
            user: coach,
            activityId,
            activityTitle: 'Morning Squats',
            programDayIndex: 0,
            occurrenceKey: '0:0',
            completedAt: '2026-11-07T14:10:00Z',
            reactions: reacted
              ? [{ emoji: '👏', count: 1, reactedByMe: true }]
              : [],
          },
        ] satisfies S['CompletionShare'][],
        200,
        { hasMore: false, nextCursor: null },
      )
    }

    if (path === `/groups/${inviteGroupId}/media` && method === 'GET') {
      if (!joinedInvitedGroup || leftInvitedGroup) {
        return error(404, 'NOT_FOUND', 'Group not found')
      }
      return send(
        [
          {
            id: uid(82),
            thumbnailUrl: null,
            type: 'PHOTO',
            durationMs: null,
            alt: 'Shared workout photo',
            canSelect: false,
            publicationId: uid(83),
            owner: coach,
            commentCount: 0,
            caption: 'Post-workout',
          },
        ] satisfies S['GroupMediaThumb'][],
        200,
        { hasMore: false, nextCursor: null },
      )
    }

    if (
      path === `/completion-shares/${shareId}/reactions` &&
      method === 'POST'
    ) {
      reacted = true
      return send([{ emoji: '👏', count: 1, reactedByMe: true }])
    }

    if (path === '/achievements/me' && method === 'GET') {
      return send([
        {
          id: achievementId,
          key: 'first_activity',
          label: 'First Activity Completed',
          description: 'Finished your first scheduled Activity.',
          icon: 'trophy',
          programTitle: 'Strength Foundation',
          earnedAt: '2026-11-06T18:00:00Z',
          isShared: sharedAchievement,
        },
      ] satisfies S['Achievement'][])
    }

    if (path === `/achievements/${achievementId}` && method === 'PATCH') {
      sharedAchievement = Boolean(body.isShared)
      return send({
        id: achievementId,
        key: 'first_activity',
        label: 'First Activity Completed',
        description: 'Finished your first scheduled Activity.',
        icon: 'trophy',
        programTitle: 'Strength Foundation',
        earnedAt: '2026-11-06T18:00:00Z',
        isShared: sharedAchievement,
      } satisfies S['Achievement'])
    }

    if (path === '/users/coach_maya' && method === 'GET') {
      return send({
        id: coach.id,
        handle: coach.handle,
        displayName: coach.displayName,
        avatarUrl: null,
        bio: 'Strength & mobility coach.',
        coverUrl: null,
        visibility: 'PUBLIC',
        relationship: 'FOLLOWING',
        followerCount: 42,
        followingCount: 10,
        publicProgramCount: 1,
        focusChips: [],
      } satisfies S['UserProfile'])
    }

    if (path === '/users/coach_maya/programs') {
      return send([programSummary], 200, { hasMore: false, nextCursor: null })
    }
    if (path === '/users/coach_maya/activities') {
      return send([], 200, { hasMore: false, nextCursor: null })
    }
    if (path === '/users/coach_maya/publications') {
      return send([], 200, { hasMore: false, nextCursor: null })
    }
    if (path === '/users/coach_maya/achievements') {
      return send([
        {
          id: uid(91),
          key: 'program_completed',
          label: 'Program Finisher',
          description: 'Completed a full Program cycle.',
          icon: 'medal',
          programTitle: 'Strength Foundation',
          earnedAt: '2026-10-20T12:00:00Z',
          isShared: true,
        },
      ] satisfies S['Achievement'][])
    }

    if (path === '/users/me/follow-requests' && method === 'GET') {
      return send(
        followReqPending
          ? ([
              {
                id: followReqId,
                requester: coach,
                createdAt: '2026-11-07T11:00:00Z',
                status: 'PENDING',
              },
            ] satisfies S['FollowRequest'][])
          : [],
        200,
        { hasMore: false, nextCursor: null },
      )
    }

    if (
      path === `/follow-requests/${followReqId}/approve` &&
      method === 'POST'
    ) {
      followReqPending = false
      return send({
        id: followReqId,
        requester: coach,
        createdAt: '2026-11-07T11:00:00Z',
        status: 'APPROVED',
      } satisfies S['FollowRequest'])
    }

    return error(404, 'NOT_FOUND', `Unhandled mock: ${method} ${path}`)
  })

  return {
    requests,
    setFailNotifications: (value: boolean) => {
      failList = value
    },
  }
}

test('compact notification dropdown and mobile slide-up sheet update unread count and mark read', async ({
  page,
}) => {
  const { requests } = await setupNotificationsMock(page)
  await login(page, 'participant@test.local', 'password')

  // Unread count starts at 3 in the Calendar account widget
  const bell = page.getByRole('button', { name: 'Notifications' })
  await expect(bell.getByLabel('3 Unread notifications')).toBeVisible()

  // Open compact dropdown on desktop (1280px)
  await page.setViewportSize({ width: 1280, height: 900 })
  await bell.click()
  const dialog = page.getByRole('dialog', { name: 'Recent notifications' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Time for Morning Squats')).toBeVisible()

  // Mark one notification read inside the panel
  await dialog
    .getByRole('button', { name: 'Mark "Time for Morning Squats" read' })
    .click()
  await expect(bell.getByLabel('2 Unread notifications')).toBeVisible()
  expect(
    requests.find((r) => r.path === '/notifications/read')?.body,
  ).toEqual({ ids: [uid(101)] })

  // Verify mobile slide-up presentation at 360px with zero horizontal overflow
  await page.setViewportSize({ width: 360, height: 780 })
  await expect(dialog).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)

  // Mark all read clears the unread indicator
  await dialog.getByRole('button', { name: 'Mark all read' }).click()
  await expect(bell.getByLabel(/Unread notifications/)).toHaveCount(0)
})

test('Inbox pagination, filters, error retry, and contextual navigation to Program, Activity, Profile, Group, and Achievements', async ({
  page,
}) => {
  const mock = await setupNotificationsMock(page, {
    failFirstNotificationsLoad: true,
  })
  await login(page, 'participant@test.local', 'password')

  await page.goto('/notifications')
  // First load fails; user sees error and clicks Retry
  await expect(page.getByRole('alert')).toContainText(
    'Notifications temporarily unavailable',
  )
  mock.setFailNotifications(false)
  await page.getByRole('button', { name: 'Retry' }).click()

  // First page of 3 notifications loads
  await expect(page.getByText('Time for Morning Squats')).toBeVisible()
  await expect(
    page.getByText('Strength Foundation has a new version available'),
  ).toBeVisible()

  // Load more fetches page 2 (Achievement & Follow Accepted)
  await page.getByRole('button', { name: 'Load more' }).click()
  await expect(
    page.getByText('Earned First Activity Completed'),
  ).toBeVisible()
  await expect(
    page.getByText('Coach Maya accepted your follow request'),
  ).toBeVisible()

  // Filter by Unread
  await page.getByRole('tab', { name: 'Unread' }).click()
  await expect(
    page.getByText('Earned First Activity Completed'),
  ).toHaveCount(0)
  await page.getByRole('tab', { name: 'All' }).click()

  // 1. Navigate from Program Update notification -> /programs/:id and accept update
  await page
    .getByRole('link', {
      name: 'Strength Foundation has a new version available',
    })
    .click()
  await expect(page).toHaveURL(new RegExp(`/programs/${programId}$`))
  await expect(
    page.getByRole('heading', { name: 'Update available' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Accept update' }).click()
  await expect(
    page.getByRole('heading', { name: 'Update available' }),
  ).toHaveCount(0)

  // 2. Navigate from handle-based Group Invitation notification -> /groups/:id/invitations/:invitationId, confirm schedule, accept by ID, open personal calendar, and verify leaving revokes group access while preserving personal history
  await page.goto('/notifications')
  await page
    .getByRole('link', { name: 'Coach Maya invited you to Morning Crew' })
    .click()
  await expect(page).toHaveURL(
    new RegExp(`/groups/${inviteGroupId}/invitations/${invitationId}$`),
  )
  await expect(page.getByText(/Group members can see your name/)).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Confirm your schedule' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Accept invitation' }).click()
  await expect(page).toHaveURL(new RegExp(`/groups/${inviteGroupId}$`))
  await expect(
    page.getByRole('heading', { name: 'Morning Crew' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Your Personal Schedule' }),
  ).toBeVisible()
  await expect(page.getByText(/Joined on Nov 7 \(2026-11-07\)/)).toBeVisible()

  // React to group completion in Group view
  await expect(page.getByRole('heading', { name: 'Group Completions' })).toBeVisible()
  await expect(page.getByText('Coach Maya · Post-workout')).toBeVisible()
  const clapBtn = page.getByRole('button', {
    name: 'React 👏 to Coach Maya',
  })
  await clapBtn.click()
  await expect(clapBtn).toHaveAttribute('aria-pressed', 'true')

  // Open Calendar from the group schedule panel -> personal calendar items are present
  await page.getByRole('link', { name: 'Open Calendar' }).click()
  await expect(
    page.getByRole('heading', { name: 'Calendar', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: /Morning Squats/ }).first(),
  ).toBeVisible()
  // NOT_PARTICIPATING item shows "Not participating" and never "Missed"
  await expect(
    page.getByRole('link', { name: /Pre-Join Warmup.*Not participating/ }).first(),
  ).toBeVisible()
  await expect(page.getByText('Missed')).toHaveCount(0)

  // Leave group -> group access is revoked (404 Group Unavailable), personal calendar items stay intact
  await page.goto(`/groups/${inviteGroupId}`)
  await page.getByRole('button', { name: 'Leave group' }).click()
  await expect(
    page.getByRole('heading', { name: 'Calendar', exact: true }),
  ).toBeVisible()
  // Personal items stay on their date (mobile month view shows only the selected day).
  await page.goto('/?view=day&day=2026-11-07')
  await expect(
    page.getByRole('link', { name: /Morning Squats/ }).first(),
  ).toBeVisible()
  await page.goto(`/groups/${inviteGroupId}`)
  await expect(
    page.getByRole('heading', { name: 'Group Unavailable' }),
  ).toBeVisible()

  // 3. Navigate from Achievement notification -> /achievements and share milestone
  await page.goto('/notifications')
  await page.getByRole('button', { name: 'Load more' }).click()
  await page
    .getByRole('link', { name: 'Earned First Activity Completed' })
    .click()
  await expect(page).toHaveURL(/\/achievements$/)
  const shareCheckbox = page.getByRole('checkbox', {
    name: 'Share First Activity Completed on profile',
  })
  await shareCheckbox.check()
  await expect(shareCheckbox).toBeChecked()

  // 4. Navigate from Follow Accepted notification -> /@coach_maya
  await page.goto('/notifications')
  await page.getByRole('button', { name: 'Load more' }).click()
  await page
    .getByRole('link', { name: 'Coach Maya accepted your follow request' })
    .click()
  await expect(page).toHaveURL(/\/@coach_maya$/)
  await expect(
    page.getByRole('heading', { name: 'Coach Maya' }),
  ).toBeVisible()
  await expect(page.getByText('Program Finisher')).toBeVisible()
})

test('recipient can decline an addressed group invitation', async ({ page }) => {
  const { requests } = await setupNotificationsMock(page)
  await login(page, 'participant@test.local', 'password')

  await page.goto(`/groups/${inviteGroupId}/invitations/${invitationId}`)
  await expect(
    page.getByRole('heading', { name: 'Confirm your schedule' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Decline invitation' }).click()

  await expect(page).toHaveURL('/notifications')
  expect(
    requests.filter(
      (request) =>
        request.path ===
          `/users/me/group-invitations/${invitationId}/decline` &&
        request.method === 'POST',
    ),
  ).toHaveLength(1)
})

test('activity reminders deduplicate occurrences, respect timezone, persist preferences, and support email unsubscribe', async ({
  page,
}) => {
  const { requests } = await setupNotificationsMock(page)
  await login(page, 'participant@test.local', 'password')

  // Upcoming reminders live with Notifications, not beneath the Calendar (03-UX §2).
  await page.goto('/notifications')
  const reminderPanel = page.getByRole('region', {
    name: 'Activity reminders',
  })
  await expect(reminderPanel).toBeVisible()
  await expect(
    reminderPanel.locator('[data-testid^="upcoming-reminder-"]'),
  ).toHaveCount(1)
  await expect(reminderPanel).toContainText('Scheduled 9:30 AM')

  // Open Settings to configure reminder & timezone preferences
  await page.goto('/settings')
  await page.getByLabel('Timezone').selectOption('Asia/Tokyo')
  await page.getByLabel('Daily reminder email').check()
  await page.getByLabel('Daily reminder time').fill('07:30')
  await page.getByLabel('Mute Morning Crew').check()
  await page.getByRole('button', { name: 'Save preferences' }).click()

  await expect(
    page.getByRole('status').filter({ hasText: 'Preferences saved' }),
  ).toBeVisible()
  const patchReq = requests.find(
    (r) => r.path === '/users/me/preferences' && r.method === 'PATCH',
  )
  expect(patchReq?.body).toEqual({
    timezone: 'Asia/Tokyo',
    notifications: {
      inAppReminders: true,
      dailyEmail: true,
      dailyReminderTime: '07:30',
      groupActivity: true,
      followRequests: true,
      mutedGroupIds: [groupId],
    },
  })

  // Approve pending follow request in Settings
  await expect(page.getByText('Coach Maya')).toBeVisible()
  await page.getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByText('No pending follow requests.')).toBeVisible()

  // Reload page and confirm preferences persisted
  await page.reload()
  await expect(page.getByLabel('Timezone')).toHaveValue('Asia/Tokyo')
  await expect(page.getByLabel('Daily reminder email')).toBeChecked()
  await expect(page.getByLabel('Daily reminder time')).toHaveValue('07:30')
  await expect(page.getByLabel('Mute Morning Crew')).toBeChecked()

  // One-click email unsubscribe route
  await page.goto('/unsubscribe?token=valid-unsub-token')
  await expect(
    page.getByRole('heading', { name: 'Daily reminder emails turned off' }),
  ).toBeVisible()
})
