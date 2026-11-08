import { test, expect, type Page } from '@playwright/test'
import { mockApi, programId, activityId } from './fixtures'
import { login } from './journey'

async function studioApi(page: Page) {
  let displayName = 'Author'
  let bio = 'Building strength programs.'
  let visibility: 'PUBLIC' | 'PRIVATE' = 'PUBLIC'
  let archived = false
  let followStatus: 'PENDING' | 'APPROVED' | 'DECLINED' = 'PENDING'
  let accessStatus: 'PENDING' | 'APPROVED' | 'DECLINED' = 'PENDING'
  await page.route('http://localhost:3001/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()
    if (method === 'OPTIONS') return route.fallback()
    const body = request.headers()['content-type']?.includes('json')
      ? request.postDataJSON()
      : null
    const send = (data: unknown, meta?: unknown) =>
      route.fulfill({
        json: { data, ...(meta ? { meta } : { meta: { nextCursor: null } }) },
      })
    if (path === '/activities' && url.searchParams.get('source') === 'MINE')
      return send(
        [
          {
            id: activityId,
            revisionId: '00000000-0000-4000-8000-000000000021',
            title: 'Squats',
            summary: 'A controlled squat.',
            creator: null,
            categoryId: '00000000-0000-4000-8000-000000000003',
            focusIds: ['00000000-0000-4000-8000-000000000004'],
            thumbnailUrl: null,
            instructionCount: 1,
            mediaCount: 0,
            metricLabels: ['Reps'],
            visibility: 'PUBLIC',
            status: 'DRAFT',
            isCopy: false,
            isPlatform: false,
          },
        ],
        { nextCursor: null },
      )
    if (path === '/media/mine')
      return send(
        [
          {
            id: 'media-one',
            type: 'VIDEO',
            state: 'READY',
            thumbnailUrl: null,
            mime: 'video/mp4',
            byteSize: 12,
            width: null,
            height: null,
            durationMs: 1000,
            alt: 'Squat recording',
            license: null,
            attribution: null,
            attachmentCount: 0,
            isOwner: true,
            createdAt: '2026-11-07T12:00:00Z',
          },
        ],
        { nextCursor: null },
      )
    if (path === '/users/author')
      return send({
        id: '00000000-0000-4000-8000-000000000001',
        handle: 'author',
        displayName,
        avatarUrl: null,
        bio,
        coverUrl: null,
        visibility,
        relationship: 'SELF',
        followerCount: 3,
        followingCount: 1,
        publicProgramCount: archived ? 0 : 1,
        focusChips: [],
      })
    if (path === '/users/me/profile' && method === 'PATCH') {
      displayName = body.displayName ?? displayName
      bio = body.bio ?? bio
      visibility = body.visibility ?? visibility
      return send({
        id: '00000000-0000-4000-8000-000000000001',
        handle: 'author',
        displayName,
        avatarUrl: null,
        bio,
        coverUrl: null,
        visibility,
        relationship: 'SELF',
        followerCount: 3,
        followingCount: 1,
        publicProgramCount: 1,
        focusChips: [],
      })
    }
    if (path === '/users/me/follow-requests')
      return send(
        followStatus === 'PENDING'
          ? [
              {
                id: 'follow-req-1',
                requester: {
                  id: '00000000-0000-4000-8000-000000000005',
                  handle: 'participant',
                  displayName: 'Participant',
                  avatarUrl: null,
                },
                createdAt: '2026-11-07T12:00:00Z',
                status: 'PENDING',
              },
            ]
          : [],
        { nextCursor: null },
      )
    if (path === '/follow-requests/follow-req-1/approve') {
      followStatus = 'APPROVED'
      return send({
        id: 'follow-req-1',
        requester: {
          id: '00000000-0000-4000-8000-000000000005',
          handle: 'participant',
          displayName: 'Participant',
          avatarUrl: null,
        },
        createdAt: '2026-11-07T12:00:00Z',
        status: 'APPROVED',
      })
    }
    if (path === `/programs/${programId}/access-requests`)
      return send(
        [
          {
            id: 'access-req-1',
            user: {
              id: '00000000-0000-4000-8000-000000000005',
              handle: 'participant',
              displayName: 'Participant',
              avatarUrl: null,
            },
            programId,
            status: accessStatus,
            requestedAt: '2026-11-07T12:00:00Z',
            resolvedAt:
              accessStatus === 'PENDING' ? null : '2026-11-07T12:05:00Z',
          },
        ],
        { nextCursor: null },
      )
    if (path === '/access-requests/access-req-1/approve') {
      accessStatus = 'APPROVED'
      return send({
        id: 'access-req-1',
        user: {
          id: '00000000-0000-4000-8000-000000000005',
          handle: 'participant',
          displayName: 'Participant',
          avatarUrl: null,
        },
        programId,
        status: 'APPROVED',
        requestedAt: '2026-11-07T12:00:00Z',
        resolvedAt: '2026-11-07T12:05:00Z',
      })
    }
    if (path === `/programs/${programId}/archive`) {
      archived = true
      return send({ ok: true })
    }
    if (path === '/billing/earnings')
      return send({
        currency: 'USD',
        grossMinor: 2500,
        platformFeesMinor: 250,
        netMinor: 2250,
        activeSubscriptions: 2,
        purchases: 4,
      })
    if (path === '/billing/payout-account')
      return send({
        status: 'ACTIVE',
        chargesEnabled: true,
        payoutsEnabled: true,
      })
    return route.fallback()
  })
  return {
    get displayName() {
      return displayName
    },
    get archived() {
      return archived
    },
  }
}

async function openStudio(page: Page, section?: string) {
  await login(page, 'author@test.local', 'password')
  await page.goto(section ? `/studio?section=${section}` : '/studio')
  await expect(page.getByRole('heading', { name: 'Creator Studio' })).toBeVisible()
}

test('studio library lists Programs, Activities, and Media', async ({
  page,
}) => {
  await mockApi(page)
  await studioApi(page)
  await openStudio(page)
  await expect(page.getByRole('heading', { name: 'Programs' })).toBeVisible()
  await expect(page.getByText('My Strength Workout')).toBeVisible()
  await page.getByRole('button', { name: 'Activities', exact: true }).click()
  await expect(page.getByText('Squats')).toBeVisible()
  await page.getByRole('button', { name: 'Media', exact: true }).click()
  await expect(page.getByText('Squat recording')).toBeVisible()
  await page.getByRole('button', { name: 'Posts', exact: true }).click()
  await expect(page.getByText(/Posts are blocked/)).toBeVisible()
})

test('studio publishing archives a Program', async ({ page }) => {
  await mockApi(page)
  const studio = await studioApi(page)
  await openStudio(page, 'publishing')
  await page.getByLabel('Select Program').selectOption(programId)
  await page.getByRole('button', { name: 'Archive', exact: true }).click()
  await expect(page.getByText('Program archived.')).toBeVisible()
  expect(studio.archived).toBe(true)
})

test('studio channel branding saves through profile update', async ({
  page,
}) => {
  await mockApi(page)
  const studio = await studioApi(page)
  await openStudio(page, 'channel')
  await page.getByLabel('Display name').fill('Studio Author')
  await page.getByLabel('Introduction').fill('Channel intro')
  await page.getByRole('button', { name: 'Save branding', exact: true }).click()
  await expect(page.getByText('Channel branding saved.')).toBeVisible()
  expect(studio.displayName).toBe('Studio Author')
})

test('studio dashboard renders earnings and program stats', async ({
  page,
}) => {
  await mockApi(page)
  await studioApi(page)
  await openStudio(page, 'dashboard')
  await expect(page.getByText('$25.00')).toBeVisible()
  await expect(page.getByText('Active Program subscriptions')).toBeVisible()
  await page.getByLabel('Published Program').selectOption(programId)
  await expect(page.getByText('Enrollments')).toBeVisible()
})

test('studio audience approves follow and access requests', async ({
  page,
}) => {
  await mockApi(page)
  await studioApi(page)
  await openStudio(page, 'audience')
  await expect(page.getByText('3 followers')).toBeVisible()
  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(page.getByText('No pending follow requests.')).toBeVisible()
  await page
    .getByRole('combobox', { name: 'Program' })
    .selectOption({ label: 'My Strength Workout' })
  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(page.getByText('APPROVED')).toBeVisible()
})
