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
    page.getByRole('heading', { name: 'Activity history', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Runs & restart history', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Share Program' }).getByRole('button', { name: 'Copy link', exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('Program link', { exact: true })).toHaveValue(
    /\/programs\/my-strength-workout$/,
  )
  await expect(page.getByText('80 min', { exact: true })).toBeVisible()
  await expect(page.getByText('A creator update is available')).toBeVisible()
  await page.getByLabel('Manage Strength, with intention').click()
  await expect(
    page
      .getByRole('region', { name: 'Your progress and participation' })
      .getByRole('link', { name: 'Open Workspace', exact: true }),
  ).toHaveAttribute('href', /\/workspace$/)
  const menuBox = await page
    .locator('.library-menu > div')
    .boundingBox()
  expect(menuBox!.x).toBeGreaterThanOrEqual(0)
  await page.getByRole('button', { name: 'Restart as a new run' }).click()
  await expect(
    page.getByRole('dialog', { name: 'Restart Program' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
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
    .getByRole('link', { name: 'Browse Programs', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Program Library', exact: true }),
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
  await page.getByRole('link', { name: 'Browse Programs', exact: true }).click()
  await expect(page).toHaveURL(/\/browse\?q=Beginner/)
  await expect(
    page.getByRole('heading', { name: 'Program Library', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByLabel('Search Programs', { exact: true }),
  ).toHaveValue('Beginner')
  await page.getByRole('link', { name: 'My Programs', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: /My Programs/ }),
  ).toBeVisible()
  expect(libraryReads).toBe(readsBeforeBrowse)
  await page
    .getByRole('link', { name: 'Browse Programs', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'View Program: Beginner Strength' })
    .click()
  await page.getByRole('button', { name: 'Start Program', exact: true }).click()
  await page.getByRole('button', { name: 'Preview my calendar' }).click()
  await page.getByRole('button', { name: 'Confirm & add to Calendar' }).click()
  await expect(
    page.getByRole('heading', { name: 'Calendar', exact: true }),
  ).toBeVisible()
  expect(
    requests.some(
      (r) => r.path.endsWith('/enrollments') && r.method === 'POST',
    ),
  ).toBe(true)
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

test('ProgramPage resets edit/run state on id change, scrolls ?start=1 once, and redirects on private removal', async ({
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
  await expect(page.getByLabel('Choose Program run')).toHaveValue('run')
  await page.getByLabel('Choose Program run').selectOption('run-prev')
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

  // Removing a PRIVATE non-owned program opened outside /library redirects safely to /library.
  await page.getByLabel('Manage A quieter morning').click()
  await page.getByRole('button', { name: 'Remove from Programs' }).click()
  await page
    .getByRole('dialog', { name: 'Remove Program' })
    .getByRole('button', { name: 'Remove Program' })
    .click()
  await expect(page).toHaveURL(/\/library$/)
})
