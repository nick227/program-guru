import { expect, test } from '@playwright/test'
import { mockApi } from './fixtures'
import { login } from './journey'
import { libraryRows } from './program-library-fixtures'

test('personal library: responsive table, filters, insights and editor handoff', async ({
  page,
}, info) => {
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'))
  await mockApi(page)
  const rows = libraryRows()
  await page.route('**/me/program-library', (route) =>
    route.fulfill({ json: { data: rows } }),
  )
  await login(page, 'author@test.local', 'password')
  await page.goto('/library')
  await expect(page.getByRole('heading', { name: /My Programs/ })).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(3)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: `test-results/program-library-${info.project.name}.png`,
    fullPage: true,
  })
  await page.getByLabel('Search Programs', { exact: true }).fill('quieter')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.getByLabel('Search Programs', { exact: true }).fill('')
  await page.getByRole('button', { name: /^Paused/ }).click()
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.getByRole('button', { name: /^All/ }).click()
  await page.getByLabel('Created by me').check()
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.getByLabel('Created by me').uncheck()
  await page.getByLabel('Sort Programs').selectOption('name')
  await expect(page.locator('tbody tr').first()).toContainText(
    'A quieter morning',
  )
  await page.getByRole('link', { name: /Strength, with intention/ }).click()
  await expect(page).toHaveURL(/\/programs\/00000000-0000-4000-8000-000000000010\?returnTo=/)
  await expect(
    page.getByRole('heading', { name: 'Upcoming Activity', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Share Program' }).getByRole('button', { name: 'Copy link', exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('Program link', { exact: true })).toHaveValue(
    /\/programs\/my-strength-workout$/,
  )
  await expect(page.getByText('80 min', { exact: true })).toBeVisible()
  await expect(page.getByText('A creator update is available')).toBeVisible()
  await page.getByRole('button', { name: 'Edit Program', exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'Edit Program' }),
  ).toBeVisible()
  await page.getByLabel('Title', { exact: true }).fill('Updated Strength')
  await page.getByRole('button', { name: 'Save Details', exact: true }).click()
  await expect(page.getByText('Program details saved')).toBeVisible()
  await page.getByRole('button', { name: 'Edit Activities', exact: true }).click()
  await expect(
    page.getByRole('link', { name: 'Browse Library', exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'My Programs', exact: true }).click()
  await expect(page).toHaveURL(/\/library\?sort=name/)
  await page.goto('/library?program=00000000-0000-4000-8000-000000000010&sort=name')
  await expect(page).toHaveURL(/\/programs\/00000000-0000-4000-8000-000000000010\?returnTo=/)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: `test-results/program-details-${info.project.name}.png`,
    fullPage: true,
  })
})

test('Library browser keeps filters and cached content through discovery and participation', async ({
  page,
}) => {
  const { requests } = await mockApi(page)
  let libraryReads = 0
  await page.route('**/me/program-library', (route) => {
    libraryReads++
    return route.fulfill({ json: { data: libraryRows() } })
  })
  await login(page, 'participant@test.local', 'password')
  await page.goto('/library?q=Strength&sort=name')
  await page.evaluate(() => {
    ;(window as any).__spaMarker = 'same-document'
  })
  await expect(page.locator('tbody tr')).toHaveCount(1)
  const readsBeforeBrowse = libraryReads
  await page
    .getByRole('link', { name: 'Community', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Community', exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('Program type', { exact: true })).toHaveValue(
    '',
  )
  await page.getByLabel('Search Programs', { exact: true }).fill('Beginner')
  await expect(page).toHaveURL(/q=Beginner/)
  await page
    .getByRole('button', { name: 'View Program: Beginner Strength' })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Beginner Strength', exact: true }),
  ).toBeVisible()
  expect(await page.evaluate(() => (window as any).__spaMarker)).toBe(
    'same-document',
  )
  expect(requests.filter((r) => r.path === '/resolve-slug')).toHaveLength(0)
  await page
    .getByRole('navigation', { name: 'Breadcrumb' })
    .getByRole('link', { name: 'Community', exact: true })
    .click()
  await expect(page).toHaveURL(/\/browse\?q=Beginner/)
  await expect(
    page.getByRole('heading', { name: 'Community', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByLabel('Search Programs', { exact: true }),
  ).toHaveValue('Beginner')
  await page.getByRole('link', { name: 'Programs', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: /My Programs/ }),
  ).toBeVisible()
  expect(libraryReads).toBe(readsBeforeBrowse)
  await page
    .getByRole('navigation', { name: 'Workspace navigation' })
    .getByRole('link', { name: 'Community', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'View Program: Beginner Strength' })
    .click()
  // One click starts today and stays on the Program; the button then reads "Program Added" (13 §4).
  const hero = page.getByRole('region', { name: 'Beginner Strength hero' })
  await hero.getByRole('button', { name: 'Start Program' }).click()
  await expect(hero.getByRole('button', { name: 'Program Added' })).toBeDisabled()
  await expect(page).toHaveURL(/\/programs\//)
  expect(
    requests.filter(
      (r) => r.path.endsWith('/enrollments') && r.method === 'POST',
    ),
  ).toHaveLength(1)
  expect(await page.evaluate(() => (window as any).__spaMarker)).toBe(
    'same-document',
  )
})

test('Paused programs can be resumed; programs can be removed from library', async ({
  page,
}) => {
  await mockApi(page)
  const rows = libraryRows().slice(0, 1)
  const first = rows[0]!
  first.status = 'Paused'
  first.current!.status = 'PAUSED'
  const actions: string[] = []
  await page.route('**/me/program-library', (route) =>
    route.fulfill({ json: { data: rows } }),
  )
  await page.route('**/me/program-library/*', async (route) => {
    actions.push(route.request().postDataJSON().action)
    return route.fulfill({ json: { data: first } })
  })
  await page.route('**/enrollments/**', async (route) => {
    actions.push(
      route.request().postDataJSON()?.action ??
        route.request().postDataJSON()?.status ??
        'leave',
    )
    first.status = 'Active'
    first.current!.status = 'ACTIVE'
    return route.fulfill({ json: { data: {} } })
  })
  await login(page, 'author@test.local', 'password')
  await page.goto('/library')
  await expect(
    page.getByRole('button', { name: 'Resume', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await expect(
    page.getByRole('link', { name: 'Continue', exact: true }),
  ).toBeVisible()
  expect(actions).toEqual(['ACTIVE'])
  await page.getByLabel('Manage Strength, with intention').click()
  await page.getByRole('button', { name: 'Remove from Programs' }).click()
  await expect(
    page.getByRole('dialog', { name: 'Remove Program' }),
  ).toBeVisible()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Remove Program' })
    .click()
  await expect.poll(() => actions).toContain('ARCHIVE')
})

test('ProgramPage resets edit state on id change and scrolls ?start=1 once', async ({
  page,
}) => {
  await mockApi(page)
  const rows = libraryRows() as any[]
  const baseRun = rows[0].current
  rows[0].runs = [
    baseRun,
    { ...baseRun, id: 'run-prev', startDate: '2026-10-01' },
  ]
  rows[1].program.id = '00000000-0000-4000-8000-000000000011'
  rows[1].program.visibility = 'PRIVATE'
  rows[1].owned = false
  rows[1].status = 'Active'
  rows[1].current = { ...baseRun, id: 'run-other' }
  rows[1].runs = [rows[1].current]

  await page.route('**/me/program-library', (route) =>
    route.fulfill({ json: { data: rows } }),
  )
  await page.route('**/me/program-library/*', (route) =>
    route.fulfill({ json: { data: rows[1] } }),
  )
  await page.route('**/enrollments/**', (route) =>
    route.fulfill({ json: { data: {} } }),
  )

  await page.addInitScript(() => {
    const origFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const response = await origFetch(input, init)
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url
      if (new URL(url, window.location.origin).pathname === '/programs/00000000-0000-4000-8000-000000000011') {
        const json = await response.clone().json()
        if (json?.data) {
          json.data.visibility = 'PRIVATE'
          json.data.viewerAccess = 'GRANTED'
        }
        return new Response(JSON.stringify(json), {
          status: response.status,
          headers: response.headers,
        })
      }
      return response
    }
    ;(window as any).__scrollCalls = 0
    const origScroll = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (...args) {
      ;(window as any).__scrollCalls++
      return origScroll.apply(this, args)
    }
  })

  await login(page, 'author@test.local', 'password')
  await page.goto('/programs/00000000-0000-4000-8000-000000000010')
  // A previously started Program offers another run, with previous run dates as chips (13 §4).
  const runs = page.getByRole('navigation', { name: 'Previous runs' })
  await expect(runs.getByRole('link')).toHaveCount(2)
  await expect(runs.getByRole('link', { name: 'Oct 1', exact: true })).toHaveAttribute('href', /day=2026-10-01/)
  const again = page.getByRole('button', { name: 'Run It Again', exact: true })
  await again.click()
  await expect(page.getByRole('button', { name: 'Program Added', exact: true })).toBeDisabled()
  await expect(page).toHaveURL(/\/programs\/00000000-0000-4000-8000-000000000010$/)
  await page.getByRole('button', { name: 'Edit Program', exact: true }).click()
  await page.getByRole('button', { name: 'Edit Activities', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Edit Program' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Browse Library', exact: true })).toBeVisible()

  // Same-instance SPA navigation to a different program ID resets editor and run state.
  await page.evaluate(() => {
    window.history.pushState({}, '', '/programs/00000000-0000-4000-8000-000000000011?start=1&returnTo=%2Fbrowse')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.getByRole('heading', { name: 'Beginner Strength', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Edit Program' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Browse Library', exact: true })).toHaveCount(0)

  // ?start=1 scrolls once on navigation, not again on subsequent data refetches.
  await expect.poll(() => page.evaluate(() => (window as any).__scrollCalls)).toBe(1)
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await page.waitForTimeout(150)
  expect(await page.evaluate(() => (window as any).__scrollCalls)).toBe(1)

})

test('Program page layout: clean hero, Community pending invitations, group creation and responsive dark layout', async ({
  page,
}, info) => {
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'))
  const { requests } = await mockApi(page)
  const progId = '00000000-0000-4000-8000-000000000010'
  const invitedGroupId = '00000000-0000-4000-8000-000000000077'

  await page.addInitScript((targetId) => {
    const origFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const response = await origFetch(input, init)
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url
      if (new URL(url, window.location.origin).pathname === `/programs/${targetId}`) {
        const json = await response.clone().json()
        if (json?.data) {
          json.data.enrollmentCount = 12
          json.data.completionRate = 0.75
          json.data.coverUrl = '/program-cover.svg'
          json.data.coverMedia = {
            id: 'media-vid-1',
            type: 'VIDEO',
            playbackUrl: '/preview.mp4',
            thumbnailUrl: '/program-cover.svg',
          }
        }
        return new Response(JSON.stringify(json), {
          status: response.status,
          headers: response.headers,
        })
      }
      return response
    }
  }, progId)

  await page.route('**/program-cover.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#326b67"/></svg>',
    }),
  )

  await page.route('**/users/me/group-invitations*', (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: 'inv-1',
            kind: 'USER',
            expiresAt: '2099-11-14T00:00:00Z',
            groupId: invitedGroupId,
            preview: {
              groupName: 'Morning Crew',
              inviter: {
                id: '00000000-0000-4000-8000-000000000005',
                handle: 'participant',
                displayName: 'Alex Rivera',
                avatarUrl: null,
              },
              program: { id: progId, title: 'My Strength Workout' },
              mode: 'ASYNC',
              startLocalDate: null,
              canAccept: true,
              requiresAccess: false,
              join: {
                status: 'READY_TO_JOIN',
                enrollmentId: null,
                startLocalDate: null,
                startDateDiffers: false,
              },
            },
          },
        ],
        meta: { nextCursor: null, hasMore: false },
      },
    }),
  )

  await login(page, 'author@test.local', 'password')
  await page.goto(`/programs/${progId}`)

  const hero = page.getByRole('region', { name: 'My Strength Workout hero' })
  await expect(hero.getByRole('heading', { name: 'My Strength Workout' })).toBeVisible()
  // No play overlay button or badge over the cover image; Watch preview is in the action row.
  await expect(hero.getByRole('button', { name: /^Play / })).toHaveCount(0)
  await expect(hero.locator('img')).toBeVisible()
  await expect(hero.locator('[data-hero-category] svg')).toHaveCount(0)
  await expect(hero.getByRole('button', { name: 'Watch preview' })).toBeVisible()
  await expect(hero.getByText('12 participants')).toBeVisible()
  await expect(hero.getByText(/1 activity/)).toBeVisible()

  // Community panel shows real count, pending invitation Join link, and Create Group.
  const community = page.getByRole('region', { name: 'Community' })
  await expect(community.getByText('12 participants · 75% completion')).toBeVisible()
  await expect(community.getByText('Morning Crew')).toBeVisible()
  await expect(community.getByText('Invited by Alex Rivera')).toBeVisible()
  await expect(community.getByRole('link', { name: 'Join Morning Crew' })).toHaveAttribute(
    'href',
    new RegExp(`/groups/${invitedGroupId}`),
  )

  // Responsive layout has zero horizontal overflow in dark theme.
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true)

  // Creating a group from the Community panel persists and switches to Open.
  await community.getByRole('button', { name: 'Create Group', exact: true }).click()
  await community.getByLabel('Group name (optional)').fill('Home Gym Squad')
  await community.getByRole('button', { name: 'Create', exact: true }).click()
  await expect.poll(() =>
    requests.some((r) => r.path === '/groups' && r.method === 'POST'),
  ).toBe(true)
  await expect(community.getByRole('link', { name: 'Open Group Home Gym Squad' })).toBeVisible()

  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: `test-results/program-redesign-${info.project.name}.png`,
    fullPage: true,
  })
})
