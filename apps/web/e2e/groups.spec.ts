import { expect, test } from '@playwright/test'
import { activityId, groupId, mockApi, programId } from './fixtures'
import { login } from './journey'

// Groups center on check-ins in a full-screen animated stage, with management and check-in history drawers.
test('group page: renders full-screen stage with themes, check-in history, owner management, and invitations', async ({ page }) => {
  const { requests } = await mockApi(page)
  await login(page, 'author@test.local', 'password')
  await page.goto(`/groups/${groupId}`)

  // Full-screen stage HUD & theme switching
  await expect(page.getByRole('group', { name: 'Animation theme' })).toBeVisible()
  await page.getByRole('button', { name: 'Sprout Garden' }).click()
  expect(
    requests.some(
      (request) =>
        request.path === `/groups/${groupId}` &&
        request.method === 'PATCH' &&
        request.body?.stageTheme === 'sprout',
    ),
  ).toBe(true)

  // Check-ins & History drawer
  await page.getByRole('button', { name: /Check-ins/ }).click()
  await expect(page.getByRole('heading', { name: 'Check-ins & History' })).toBeVisible()
  await page.getByRole('button', { name: 'Close panel' }).click()

  // Group Info drawer -> Manage group & Invite by handle
  await page.getByRole('button', { name: 'Group Info' }).click()
  await expect(page.getByRole('heading', { name: 'Manage group' })).toBeVisible()

  await page.getByLabel('Invite by handle').fill('participant')
  await page.getByRole('button', { name: 'Invite user' }).click()
  await expect(page.getByText('Invitation sent')).toBeVisible()
  expect(
    requests.find(
      (request) =>
        request.path === `/groups/${groupId}/invitations` &&
        request.method === 'POST',
    )?.body,
  ).toMatchObject({ kind: 'USER', handle: 'participant' })
})

test('group page: owner invite link controls', async ({ page }) => {
  const { requests } = await mockApi(page)
  await login(page, 'author@test.local', 'password')
  await page.goto(`/groups/${groupId}`)
  await page.getByRole('button', { name: 'Group Info' }).click()
  await page.getByRole('button', { name: 'Invite people', exact: true }).click()
  await page.getByRole('button', { name: 'Create invite link', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Invite link', exact: true })).toHaveValue('http://localhost/join/link-1')
  await expect(page.getByRole('button', { name: 'Copy invite link', exact: true })).toBeVisible()
  // Server-confirmed toggle: it reflects the saved group setting once the update returns.
  const sharing = page.getByLabel('Allow members to create invite links')
  await sharing.click()
  await expect(sharing).toBeChecked()
  expect(requests.some((r) => r.method === 'PATCH' && r.body.memberLinkSharingEnabled === true)).toBe(true)
  await page.getByRole('button', { name: 'Replace all invite links' }).click()
  await expect(page.getByRole('textbox', { name: 'Invite link', exact: true })).toHaveValue('http://localhost/join/link-2')
  expect(requests.some((r) => r.body?.rotate === true)).toBe(true)
  await page.getByRole('button', { name: 'Revoke all invite links' }).click()
  await expect(page.getByRole('textbox', { name: 'Invite link', exact: true })).toHaveCount(0)
  expect(requests.some((r) => r.method === 'PATCH' && r.body.joinLinkEnabled === false)).toBe(true)
})

test('GroupStatus widget on Activity page: switches multiple groups, joins open group, and shares multi-group check-in', async ({
  page,
}) => {
  const openPublicGroupId = '00000000-0000-4000-8000-000000000079'
  let joinedPublic = false
  let checkInPayload: any = null

  await mockApi(page)

  await page.route(`http://localhost:3001/activities/${activityId}/groups*`, (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: groupId,
            programId,
            programVersionId: '00000000-0000-4000-8000-000000000011',
            programTitle: 'My Strength Workout',
            name: 'Morning Crew',
            mode: 'ASYNC',
            visibility: 'PRIVATE',
            joinPolicy: 'INVITE_ONLY',
            memberCount: 4,
            startLocalDate: null,
            timezone: null,
            startingSoon: false,
            viewerIsMember: true,
            memberAvatars: [
              { id: '00000000-0000-4000-8000-000000000001', handle: 'author', displayName: 'Alex Author', avatarUrl: null },
              { id: '00000000-0000-4000-8000-000000000002', handle: 'bob', displayName: 'Bob Rivera', avatarUrl: null },
            ],
            recentCheckInCount: 3,
            latestCheckIn: {
              id: '00000000-0000-4000-8000-000000000901',
              user: { id: '00000000-0000-4000-8000-000000000002', handle: 'bob', displayName: 'Bob Rivera', avatarUrl: null },
              activityTitle: 'Squats',
              completedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
            },
          },
          {
            id: openPublicGroupId,
            programId,
            programVersionId: '00000000-0000-4000-8000-000000000011',
            programTitle: 'My Strength Workout',
            name: 'Sunset Crew',
            mode: 'ASYNC',
            visibility: 'PUBLIC',
            joinPolicy: 'OPEN',
            memberCount: joinedPublic ? 7 : 6,
            startLocalDate: null,
            timezone: null,
            startingSoon: false,
            viewerIsMember: joinedPublic,
            memberAvatars: joinedPublic
              ? [{ id: '00000000-0000-4000-8000-000000000001', handle: 'author', displayName: 'Alex Author', avatarUrl: null }]
              : [],
            recentCheckInCount: 2,
            latestCheckIn: null,
          },
        ],
        meta: { hasMore: false, nextCursor: null },
      },
    }),
  )

  await page.route(`http://localhost:3001/activities/${activityId}/my-attempts*`, (route) =>
    route.fulfill({
      json: {
        data: [
          {
            sessionId: '00000000-0000-4000-8000-000000000051',
            activityRevisionId: '00000000-0000-4000-8000-000000000021',
            status: 'FINISHED',
            createdAt: new Date(Date.now() - 20 * 60_000).toISOString(),
            startedAt: new Date(Date.now() - 15 * 60_000).toISOString(),
            endedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
            calendarItemId: null,
            occurrenceDate: null,
            entries: [],
          },
        ],
        meta: { hasMore: false, nextCursor: null },
      },
    }),
  )

  await page.route('http://localhost:3001/groups*', (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname !== '/groups' || route.request().method() !== 'GET') return route.fallback()
    const base = [
      {
        id: groupId,
        programId,
        programVersionId: '00000000-0000-4000-8000-000000000011',
        programTitle: 'My Strength Workout',
        name: 'Morning Crew',
        mode: 'ASYNC',
        visibility: 'PRIVATE',
        joinPolicy: 'INVITE_ONLY',
        startLocalDate: null,
        timezone: null,
        memberCount: 4,
        myRole: 'OWNER',
      },
    ]
    if (joinedPublic) {
      base.push({
        id: openPublicGroupId,
        programId,
        programVersionId: '00000000-0000-4000-8000-000000000011',
        programTitle: 'My Strength Workout',
        name: 'Sunset Crew',
        mode: 'ASYNC',
        visibility: 'PUBLIC',
        joinPolicy: 'OPEN',
        startLocalDate: null,
        timezone: null,
        memberCount: 7,
        myRole: 'MEMBER',
      })
    }
    return route.fulfill({ json: { data: base, meta: { hasMore: false, nextCursor: null } } })
  })

  await page.route(`http://localhost:3001/groups/${openPublicGroupId}/join`, (route) => {
    joinedPublic = true
    return route.fulfill({
      json: {
        data: {
          group: {
            id: openPublicGroupId,
            programId,
            programVersionId: '00000000-0000-4000-8000-000000000011',
            programTitle: 'My Strength Workout',
            name: 'Sunset Crew',
            mode: 'ASYNC',
            visibility: 'PUBLIC',
            joinPolicy: 'OPEN',
            memberCount: 7,
            myRole: 'MEMBER',
          },
          enrollmentId: null,
        },
      },
    })
  })

  await page.route('http://localhost:3001/check-ins', (route) => {
    checkInPayload = route.request().postDataJSON()
    return route.fulfill({ status: 201, json: { data: [] } })
  })

  await login(page, 'author@test.local', 'password')
  await page.goto(`/activities/${activityId}`)

  await expect(page.getByText('4 members · 3 recent check-ins')).toBeVisible()
  await expect(page.getByText(/Bob Rivera completed Squats/)).toBeVisible()

  // Switch between groups inside GroupStatus
  await page.getByRole('tab', { name: 'Sunset Crew' }).click()
  await expect(page.getByText('6 members · 2 recent check-ins · Flexible pace')).toBeVisible()
  await page.getByRole('button', { name: 'Join Sunset Crew' }).click()
  await expect(page.getByText('Joined group')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open Group Sunset Crew' })).toBeVisible()

  // Switch back to Morning Crew and share check-in across both groups
  await page.getByRole('tab', { name: 'Morning Crew' }).click()
  await page.getByRole('button', { name: 'Check In' }).click()
  const dialog = page.getByRole('dialog', { name: 'Share Check-in' })
  await expect(dialog.getByRole('heading', { name: 'Share Check-in' })).toBeVisible()
  await dialog.getByRole('button', { name: /Sunset Crew/ }).click()
  await dialog.getByPlaceholder(/Share a quick thought/i).fill('Strong final set')
  await dialog.getByRole('button', { name: 'Share Check-in' }).click()

  await expect.poll(() => checkInPayload?.groupIds?.length ?? 0).toBe(2)
  expect(checkInPayload.groupIds).toEqual(expect.arrayContaining([groupId, openPublicGroupId]))
  expect(checkInPayload.note).toBe('Strong final set')

  // Open GroupStage from GroupStatus
  await page.getByRole('link', { name: 'Open Group Morning Crew' }).click()
  await expect(page).toHaveURL(new RegExp(`/groups/${groupId}`))
})
