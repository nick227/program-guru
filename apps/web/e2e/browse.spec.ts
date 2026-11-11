import { expect, test, type Page } from '@playwright/test'
import { mockApi } from './fixtures'
import { login } from './journey'

const uid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const catFitness = { id: uid(101), slug: 'fitness', label: 'Fitness', icon: null }
const catWellness = { id: uid(102), slug: 'wellness', label: 'Wellness', icon: null }

const typeWorkout = {
  id: uid(201),
  categoryId: catFitness.id,
  slug: 'workout',
  label: 'Workout',
  icon: null,
  isFeatured: true,
  focusIds: [uid(301)],
}
const typeMind = {
  id: uid(202),
  categoryId: catWellness.id,
  slug: 'mindfulness',
  label: 'Mindfulness',
  icon: null,
  isFeatured: false,
  focusIds: [uid(302)],
}

const focusStrength = {
  id: uid(301),
  categoryId: catFitness.id,
  slug: 'strength',
  label: 'Strength',
}
const focusBreath = {
  id: uid(302),
  categoryId: catWellness.id,
  slug: 'breathwork',
  label: 'Breathwork',
}

function makeProgram(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: uid(400 + index),
    title: `Program ${index}`,
    type: typeWorkout,
    focus: focusStrength,
    level: 'ALL_LEVELS',
    sessionMinutes: null,
    tags: [],
    creator: {
      id: uid(500),
      handle: 'coach',
      displayName: 'Coach Alex',
      avatarUrl: null,
    },
    coverUrl: null,
    durationDays: 28,
    programDays: 12,
    placements: 12,
    frequencyLabel: '3 days/week',
    visibility: 'PUBLIC',
    accessMode: 'OPEN',
    prices: [],
    viewerAccess: 'PREVIEW',
    isPlatform: false,
    ...overrides,
  }
}

function makeActivity(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: uid(600 + index),
    revisionId: uid(700 + index),
    title: `Activity ${index}`,
    summary: 'Calm, structured practice with clear instructions.',
    durationMinutes: 20,
    targetTime: null,
    frequency: { kind: 'N_PER_WEEK', n: 3 },
    creator: null,
    categoryId: catFitness.id,
    focusIds: [focusStrength.id],
    thumbnailUrl: null,
    instructionCount: 2,
    mediaCount: 0,
    metricLabels: ['Reps'],
    visibility: 'PUBLIC',
    status: 'PUBLISHED',
    isCopy: false,
    isPlatform: true,
    ...overrides,
  }
}

async function setupRichBrowseMocks(page: Page) {
  await mockApi(page)

  const programs = [
    makeProgram(1, {
      id: uid(11),
      title: 'Beginner Strength',
      type: typeWorkout,
      focus: focusStrength,
      durationDays: 28,
      frequencyLabel: '3 days/week',
      coverUrl: '/valid-cover.svg',
      isPlatform: true,
      creator: null,
      featuredGroup: {
        id: uid(901),
        programId: uid(11),
        programVersionId: uid(801),
        programTitle: 'Beginner Strength',
        name: 'Morning Strength Crew',
        mode: 'SYNC',
        visibility: 'PUBLIC',
        joinPolicy: 'OPEN',
        memberCount: 6,
        startLocalDate: '2026-11-15',
        timezone: 'America/Chicago',
        startingSoon: true,
        viewerIsMember: false,
      },
    }),
    makeProgram(2, {
      title: 'Morning Mobility Flow',
      type: typeWorkout,
      focus: focusStrength,
      durationDays: 14,
      frequencyLabel: '5 days/week',
      coverUrl: '/broken-cover.jpg',
      featuredGroup: {
        id: uid(902),
        programId: uid(402),
        programVersionId: uid(802),
        programTitle: 'Morning Mobility Flow',
        name: 'Mobility Circle',
        mode: 'ASYNC',
        visibility: 'PUBLIC',
        joinPolicy: 'INVITE_ONLY',
        memberCount: 3,
        startLocalDate: null,
        timezone: 'America/Chicago',
        startingSoon: false,
        viewerIsMember: false,
      },
    }),
    makeProgram(3, {
      title: 'Quiet Breath Cadence',
      type: typeMind,
      focus: focusBreath,
      durationDays: null,
      frequencyLabel: 'Daily',
    }),
    ...Array.from({ length: 10 }, (_, idx) =>
      makeProgram(idx + 4, {
        title: `Endurance Block ${idx + 4}`,
        durationDays: 56,
        frequencyLabel: '4 days/week',
      }),
    ),
  ]

  const activities = [
    makeActivity(1, {
      id: uid(20),
      title: 'Squats',
      summary: 'Lower-body strength staple focused on control and depth.',
      durationMinutes: 20,
      categoryId: catFitness.id,
      focusIds: [focusStrength.id],
    }),
    makeActivity(2, {
      title: 'Box Breathing',
      summary: 'Four-count nasal breathing cadence for recovery.',
      durationMinutes: 10,
      frequency: { kind: 'DAILY' },
      categoryId: catWellness.id,
      focusIds: [focusBreath.id],
      isPlatform: false,
      creator: {
        id: uid(501),
        handle: 'maya',
        displayName: 'Maya Lin',
        avatarUrl: null,
      },
    }),
  ]

  await page.route('**/valid-cover.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#2f6b5d"/></svg>',
    }),
  )
  await page.route('**/broken-cover.jpg', (route) =>
    route.fulfill({ status: 404, body: '' }),
  )

  let failDiscover = false
  const discoverRequests: URL[] = []

  await page.route('http://localhost:3001/catalog/categories', (route) =>
    route.fulfill({ json: { data: [catFitness, catWellness] } }),
  )
  await page.route('http://localhost:3001/catalog/program-types', (route) =>
    route.fulfill({ json: { data: [typeWorkout, typeMind] } }),
  )
  await page.route('http://localhost:3001/catalog/focuses*', (route) => {
    const url = new URL(route.request().url())
    const cat = url.searchParams.get('categoryId')
    const all = [focusStrength, focusBreath]
    const filtered = cat ? all.filter((f) => f.categoryId === cat) : all
    route.fulfill({ json: { data: filtered } })
  })

  await page.route('http://localhost:3001/discover*', (route) => {
    const url = new URL(route.request().url())
    discoverRequests.push(url)
    if (failDiscover) {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'INTERNAL', message: 'Feed unavailable' }),
      })
    }

    const kind = url.searchParams.get('kind') ?? 'PROGRAM'
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
    const categoryId = url.searchParams.get('categoryId')
    const programTypeId = url.searchParams.get('programTypeId')
    const focusId = url.searchParams.get('focusId')
    const timing = url.searchParams.get('timing')
    const cursor = url.searchParams.get('cursor')

    if (kind === 'ACTIVITY') {
      const matched = activities.filter((a) => {
        if (q && !a.title.toLowerCase().includes(q) && !a.summary.toLowerCase().includes(q)) return false
        if (categoryId && a.categoryId !== categoryId) return false
        if (focusId && !a.focusIds.includes(focusId)) return false
        return true
      })
      return route.fulfill({
        json: {
          data: matched.map((activity) => ({
            kind: 'ACTIVITY',
            program: null,
            activity,
            creator: null,
          })),
          meta: { hasMore: false, nextCursor: null },
        },
      })
    }

    const matched = programs.filter((p: any) => {
      if (q && !p.title.toLowerCase().includes(q)) return false
      if (categoryId && p.type.categoryId !== categoryId) return false
      if (programTypeId && p.type.id !== programTypeId) return false
      if (focusId && p.focus?.id !== focusId) return false
      if (timing === 'STARTING_SOON' && !p.featuredGroup?.startingSoon) return false
      return true
    })

    const offset = cursor === 'page-2' ? 8 : 0
    const slice = matched.slice(offset, offset + 8)
    const hasMore = offset + 8 < matched.length
    return route.fulfill({
      json: {
        data: slice.map(({ featuredGroup = null, ...program }: any) => ({
          kind: 'PROGRAM',
          program,
          activity: null,
          creator: null,
          featuredGroup,
        })),
        meta: { hasMore, nextCursor: hasMore ? 'page-2' : null },
      },
    })
  })

  return {
    discoverRequests,
    setDiscoverError: (failing: boolean) => {
      failDiscover = failing
    },
  }
}

test('Community feed supports combined filters, switching kind, sorting, pagination, fallbacks, and scroll return', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'mobile', 'Desktop layout test')
  const { discoverRequests } = await setupRichBrowseMocks(page)

  await page.goto('/browse')
  await expect(page.getByRole('button', { name: /Pages menu, current page Community/ })).toBeVisible()

  // Header Pages menu reveals Workspace navigation with Community active.
  await page.getByRole('button', { name: /Pages menu/ }).click()
  await expect(
    page
      .getByRole('navigation', { name: 'Workspace navigation' })
      .getByRole('link', { name: 'Community', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
  await page.keyboard.press('Escape')

  // Initial feed renders first page (8 items) + Load more.
  await expect(page.getByRole('status').filter({ hasText: '8 Programs' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Load more' })).toBeVisible()

  // Broken cover falls back gracefully without broken image tag.
  const brokenRow = page.getByRole('button', { name: 'View Program: Morning Mobility Flow' })
  await expect(brokenRow.locator('[data-hero-fallback="true"]')).toBeVisible()
  await expect(brokenRow.locator('img')).toHaveCount(0)

  // Valid cover loads cleanly.
  const validRow = page.getByRole('button', { name: 'View Program: Beginner Strength' })
  await expect(validRow.locator('img')).toBeVisible()

  // Pagination appends remaining items.
  await page.getByRole('button', { name: 'Load more' }).click()
  await expect(page.getByRole('status').filter({ hasText: '13 Programs' })).toBeVisible()

  // Scroll down, open a Program, then return — URL filters and scroll position persist.
  await page.evaluate(() => window.scrollTo(0, 420))
  const savedY = await page.evaluate(() => window.scrollY)
  expect(savedY).toBeGreaterThan(200)

  await page.getByRole('button', { name: 'View Program: Endurance Block 10' }).click()
  await expect(page).toHaveURL(/\/programs\/00000000-0000-4000-8000-/)
  await page
    .getByRole('navigation', { name: 'Breadcrumb' })
    .getByRole('link', { name: 'Community', exact: true })
    .click()
  await expect(page).toHaveURL(/\/browse$/)
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(200)

  // Combined filtering: Category + Duration + Sort + Search.
  await page
    .getByRole('group', { name: 'Category' })
    .getByRole('button', { name: 'Fitness' })
    .click()
  await expect(page).toHaveURL(/category=/)

  await page
    .getByRole('group', { name: 'Filter by duration' })
    .getByRole('button', { name: '3–4 weeks' })
    .click()
  await expect(page).toHaveURL(/duration=medium/)
  await expect(page.getByRole('status').filter({ hasText: '1 Program' })).toBeVisible()

  // Sort option persists in URL and passes to API.
  await page
    .getByRole('radiogroup', { name: 'Sort by' })
    .getByRole('radio', { name: 'Newest' })
    .click()
  await expect(page).toHaveURL(/sort=NEW/)
  expect(discoverRequests.some((u) => u.searchParams.get('sort') === 'NEW')).toBe(true)

  // Switch Content type to Activities while preserving relevant filters (Category).
  await page
    .getByRole('radiogroup', { name: 'Content type' })
    .getByRole('radio', { name: 'Activities' })
    .click()
  await expect(page).toHaveURL(/kind=activities/)
  await expect(page).toHaveURL(/category=/)
  await expect(page.getByRole('status').filter({ hasText: '1 Activity' })).toBeVisible()

  // Activity row navigates to reusable Activity detail page (not Occurrence).
  await page.getByRole('button', { name: 'View Activity: Squats' }).click()
  await expect(page).toHaveURL(/\/activities\/00000000-0000-4000-8000-000000000020\?returnTo=/)

  // Return and test empty state + clear filters.
  await page.goBack()
  await page.getByLabel('Search Activities', { exact: true }).fill('nonexistent-xyz')
  await expect(page.getByText('No Activities match these filters')).toBeVisible()
  await page.getByRole('button', { name: 'Reset filters' }).click()
  await expect(page.getByRole('status').filter({ hasText: '2 Activities' })).toBeVisible()
})

test('Community feed handles API error and retry', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'Desktop error test')
  const { setDiscoverError } = await setupRichBrowseMocks(page)
  setDiscoverError(true)

  await page.goto('/browse')
  await expect(page.getByRole('alert')).toContainText('Feed unavailable')
  setDiscoverError(false)
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByRole('status').filter({ hasText: '8 Programs' })).toBeVisible()
})

test('Community responsive layout (tablet & mobile drawer) and dark/light themes have zero horizontal overflow', async ({
  page,
}, info) => {
  await setupRichBrowseMocks(page)

  // Light theme on Tablet (768px)
  if (info.project.name === 'desktop') {
    await page.addInitScript(() => localStorage.setItem('theme', 'light'))
    await page.setViewportSize({ width: 768, height: 900 })
    await page.goto('/browse')
    await expect(page.getByRole('status').filter({ hasText: '8 Programs' })).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    return
  }

  // Dark theme on Mobile (360px) with collapsible filter drawer
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'))
  await page.goto('/browse')
  await expect(page.getByRole('status').filter({ hasText: '8 Programs' })).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true)

  const filtersButton = page.getByRole('button', { name: /^Filters/ })
  await expect(filtersButton).toBeVisible()
  await filtersButton.click()
  await expect(filtersButton).toHaveAttribute('aria-expanded', 'true')

  await page
    .getByRole('group', { name: 'Category' })
    .getByRole('button', { name: 'Wellness' })
    .click()
  await page.getByRole('button', { name: /^Show / }).click()
  await expect(filtersButton).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('status').filter({ hasText: '1 Program' })).toBeVisible()
})

test('Community displays discoverable Groups beneath Programs and supports Starting Soon vs disabled Happening Now', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'mobile', 'Desktop social group discovery test')
  const { discoverRequests } = await setupRichBrowseMocks(page)

  await page.goto('/browse')
  await expect(page.getByText('Morning Strength Crew')).toBeVisible()
  await expect(page.getByText('6 members')).toBeVisible()
  await expect(page.getByText('Starts Nov 15')).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Join Morning Strength Crew' }),
  ).toHaveAttribute('href', `/groups/${uid(901)}?returnTo=%2Fbrowse`)

  await expect(page.getByText('Mobility Circle')).toBeVisible()
  await expect(page.getByText('3 members')).toBeVisible()
  await expect(page.getByText('Invite only')).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'View Mobility Circle' }),
  ).toHaveAttribute('href', `/groups/${uid(902)}?returnTo=%2Fbrowse`)

  const timingGroup = page.getByRole('group', { name: 'Filter by group timing' })
  await expect(timingGroup.getByRole('button', { name: 'All Programs' })).toHaveAttribute('aria-pressed', 'true')
  await expect(timingGroup.getByRole('button', { name: /Happening Now/ })).toBeDisabled()

  await timingGroup.getByRole('button', { name: 'Starting Soon' }).click()
  await expect(page).toHaveURL(/timing=STARTING_SOON/)
  expect(discoverRequests.some((u) => u.searchParams.get('timing') === 'STARTING_SOON')).toBe(true)
  await expect(page.getByRole('status').filter({ hasText: '1 Program' })).toBeVisible()
  await expect(page.getByText('Morning Strength Crew')).toBeVisible()
})

test('Community Join action opens public group preview and joins in one step', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'mobile', 'Desktop public group join test')
  await setupRichBrowseMocks(page)
  await login(page, 'author@test.local', 'password')

  const groupUuid = uid(901)
  const programUuid = uid(11)
  let joined = false
  let joinPayload: any = null

  await page.route(`http://localhost:3001/groups/${groupUuid}`, (route) => {
    if (!joined) {
      return route.fulfill({
        status: 404,
        json: { code: 'NOT_FOUND', message: 'Group not found', requestId: 'r1' },
      })
    }
    return route.fulfill({
      json: {
        data: {
          id: groupUuid,
          programVersionId: uid(801),
          programTitle: 'Beginner Strength',
          name: 'Morning Strength Crew',
          mode: 'SYNC',
          visibility: 'PUBLIC',
          joinPolicy: 'OPEN',
          memberCount: 7,
          myRole: 'MEMBER',
          startLocalDate: '2026-11-15',
          timezone: 'America/Chicago',
          joinLinkEnabled: false,
          memberLinkSharingEnabled: false,
          members: [
            {
              user: {
                id: uid(1),
                handle: 'author',
                displayName: 'Author',
                avatarUrl: null,
              },
              role: 'MEMBER',
              status: 'ACTIVE',
              sharedCompletion: true,
            },
          ],
          mySharedCompletion: true,
          myEnrollment: {
            enrollmentId: uid(40),
            startLocalDate: '2026-11-15',
            startDateDiffers: false,
          },
        },
      },
    })
  })

  await page.route(`http://localhost:3001/groups/${groupUuid}/preview`, (route) =>
    route.fulfill({
      json: {
        data: {
          id: groupUuid,
          groupName: 'Morning Strength Crew',
          mode: 'SYNC',
          visibility: 'PUBLIC',
          joinPolicy: 'OPEN',
          memberCount: 6,
          startLocalDate: '2026-11-15',
          timezone: 'America/Chicago',
          program: makeProgram(1, {
            id: programUuid,
            title: 'Beginner Strength',
            description: 'Build a foundation.',
            latestVersionId: uid(801),
            safeActivityOutline: [],
            enrollmentCount: null,
            completionRate: null,
            canJoin: true,
            canRequestAccess: false,
            canPurchase: false,
            myEnrollmentId: null,
          }),
          canJoin: true,
          requiresAccess: false,
          join: {
            status: 'CONFIRM_ENROLLMENT',
            enrollmentId: null,
            startLocalDate: '2026-11-15',
            startDateDiffers: false,
          },
        },
      },
    }),
  )

  await page.route(`http://localhost:3001/groups/${groupUuid}/join`, async (route) => {
    joined = true
    joinPayload = route.request().postDataJSON()
    await route.fulfill({
      json: {
        data: {
          id: groupUuid,
          programVersionId: uid(801),
          programTitle: 'Beginner Strength',
          name: 'Morning Strength Crew',
          mode: 'SYNC',
          visibility: 'PUBLIC',
          joinPolicy: 'OPEN',
          memberCount: 7,
          myRole: 'MEMBER',
          startLocalDate: '2026-11-15',
          timezone: 'America/Chicago',
          joinLinkEnabled: false,
          memberLinkSharingEnabled: false,
          members: [],
          mySharedCompletion: true,
          myEnrollment: {
            enrollmentId: uid(40),
            startLocalDate: '2026-11-15',
            startDateDiffers: false,
          },
        },
      },
    })
  })

  await page.route(`http://localhost:3001/groups/${groupUuid}/completions*`, (route) =>
    route.fulfill({ json: { data: [], meta: { hasMore: false, nextCursor: null } } }),
  )
  await page.route(`http://localhost:3001/groups/${groupUuid}/media*`, (route) =>
    route.fulfill({ json: { data: [], meta: { hasMore: false, nextCursor: null } } }),
  )
  await page.route(`http://localhost:3001/groups/${groupUuid}/invitations*`, (route) =>
    route.fulfill({ json: { data: [] } }),
  )

  await page.goto('/browse')
  await page.getByRole('button', { name: 'Join Morning Strength Crew' }).click()
  await expect(page.getByText('Joined group')).toBeVisible()
  expect(joinPayload).toBeFalsy()

  const openGroup = page.getByRole('link', { name: 'Open Group Morning Strength Crew' })
  await expect(openGroup).toBeVisible()
  await openGroup.click()
  await expect(page).toHaveURL(new RegExp(`/groups/${groupUuid}`))
  await expect(page.getByRole('heading', { name: 'Morning Strength Crew', level: 1 })).toBeVisible()
  await expect(page.getByText(/7 members/)).toBeVisible()
})

test('Program page displays first-class owner visibility control beside title', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'mobile', 'Desktop Program visibility test')
  await setupRichBrowseMocks(page)
  await login(page, 'author@test.local', 'password')

  const programUuid = uid(11)
  let currentVisibility: 'PRIVATE' | 'UNLISTED' | 'PUBLIC' = 'PRIVATE'

  await page.route(`http://localhost:3001/programs/${programUuid}`, (route) =>
    route.fulfill({
      json: {
        data: makeProgram(1, {
          id: programUuid,
          title: 'Beginner Strength',
          description: 'Build a foundation.',
          visibility: currentVisibility,
          viewerAccess: 'OWNER',
          latestVersionId: uid(801),
          safeActivityOutline: [],
          canJoin: true,
          canRequestAccess: false,
          canPurchase: false,
          myEnrollmentId: null,
        }),
      },
    }),
  )
  await page.route(`http://localhost:3001/programs/${programUuid}/workspace`, (route) =>
    route.fulfill({
      json: {
        data: {
          ...makeProgram(1, {
            id: programUuid,
            title: 'Beginner Strength',
            visibility: currentVisibility,
            viewerAccess: 'OWNER',
            latestVersionId: uid(801),
          }),
          status: 'PUBLISHED',
          frequency: { kind: 'WEEKDAYS' },
          generationMode: 'ALL_EACH_DAY',
          description: 'Build a foundation.',
          activityCount: 1,
          instructionCount: 1,
          activities: [],
          draftRevision: 2,
          draftVersionId: null,
          latestPublishedVersionId: uid(801),
          hasUnpublishedChanges: false,
        },
      },
    }),
  )
  await page.route(`http://localhost:3001/programs/${programUuid}/visibility`, async (route) => {
    const body = route.request().postDataJSON()
    currentVisibility = body.visibility
    await route.fulfill({
      json: {
        data: {
          ...makeProgram(1, {
            id: programUuid,
            title: 'Beginner Strength',
            visibility: currentVisibility,
            viewerAccess: 'OWNER',
            latestVersionId: uid(801),
          }),
          status: 'PUBLISHED',
          frequency: { kind: 'WEEKDAYS' },
          generationMode: 'ALL_EACH_DAY',
          description: 'Build a foundation.',
          activityCount: 1,
          instructionCount: 1,
          activities: [],
          draftRevision: 3,
          draftVersionId: null,
          latestPublishedVersionId: uid(801),
          hasUnpublishedChanges: false,
        },
      },
    })
  })
  await page.route(`http://localhost:3001/programs/${programUuid}/groups*`, (route) =>
    route.fulfill({ json: { data: [], meta: { hasMore: false, nextCursor: null } } }),
  )
  await page.route(`http://localhost:3001/program-versions/${uid(801)}`, (route) =>
    route.fulfill({
      json: {
        data: {
          id: uid(801),
          programId: programUuid,
          versionNumber: 1,
          title: 'Beginner Strength',
          activities: [],
          placements: [],
        },
      },
    }),
  )

  await page.goto(`/programs/${programUuid}`)
  const visGroup = page.getByRole('group', { name: 'Program visibility' })
  await expect(visGroup).toBeVisible()
  await expect(visGroup.getByRole('button', { name: 'Private' })).toHaveAttribute('aria-pressed', 'true')

  await visGroup.getByRole('button', { name: 'Public' }).click()
  await expect(page.getByText('Program is now Public')).toBeVisible()
  await expect(visGroup.getByRole('button', { name: 'Public' })).toHaveAttribute('aria-pressed', 'true')
})

