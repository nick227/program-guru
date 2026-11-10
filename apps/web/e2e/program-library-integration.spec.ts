import { expect, test } from '@playwright/test'
import { mockApi } from './fixtures'
import { login } from './journey'
import { libraryRows } from './program-library-fixtures'

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
  // The hero's primary action leads to the Start section, whose button joins on the chosen date.
  await page
    .getByRole('region', { name: 'Beginner Strength hero' })
    .getByRole('button', { name: 'Start Program' })
    .click()
  await page
    .getByRole('region', { name: 'Start Program' })
    .getByRole('button', { name: 'Start Program', exact: true })
    .click()
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

test('archived Programs are hidden and there is no archive shelf', async ({
  page,
}) => {
  await mockApi(page)
  const rows = libraryRows().slice(0, 2)
  rows[0]!.status = 'Archived'
  await page.route('**/me/program-library', (route) =>
    route.fulfill({ json: { data: rows } }),
  )
  await login(page, 'author@test.local', 'password')
  await page.goto('/library')
  await expect(page.getByText(rows[1]!.program.title).first()).toBeVisible()
  await expect(page.getByText(rows[0]!.program.title)).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Archived Programs/ })).toHaveCount(0)
  await page.getByLabel(`Manage ${rows[1]!.program.title}`).click()
  await expect(page.getByRole('button', { name: /Archive personally|Restore to library/ })).toHaveCount(0)
})

test('shared hero renders covers and recovers from failed images', async ({
  page,
}) => {
  await mockApi(page)
  const rows = libraryRows()
  rows[0]!.program.coverUrl = '/missing-program-cover.jpg' as never
  rows[1]!.program.coverUrl = '/program-cover.svg' as never
  await page.route('**/me/program-library', (route) =>
    route.fulfill({ json: { data: rows } }),
  )
  await page.route('**/missing-program-cover.jpg', (route) =>
    route.fulfill({ status: 404, body: '' }),
  )
  await page.route('**/program-cover.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#326b67"/></svg>',
    }),
  )
  await login(page, 'author@test.local', 'password')
  await page.goto('/library')
  const failed = page
    .getByRole('link', { name: /Strength, with intention/ })
    .locator('[data-hero-category]')
  await expect(failed).toHaveAttribute('data-hero-fallback', 'true')
  const cover = page
    .getByRole('link', { name: /A quieter morning/ })
    .locator('img')
  await expect(cover).toBeVisible()
  expect(
    await cover.evaluate((img) => (img as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0)
  await expect(
    page
      .locator('tbody tr')
      .filter({ hasText: 'A quieter morning' })
      .getByRole('link', { name: 'Start', exact: true }),
  ).toBeVisible()
})

test('published owned Programs start through enrollment and fit tablet widths', async ({ page }) => {
  const { requests } = await mockApi(page)
  const rows = libraryRows()
  rows[0]!.status = 'Not Started'
  rows[0]!.current = null
  rows[0]!.runs = []
  await page.route('**/me/program-library', route => route.fulfill({ json: { data: rows } }))
  await login(page, 'author@test.local', 'password')
  await page.setViewportSize({ width: 820, height: 1000 })
  await page.goto('/library')
  await expect(page.locator('tbody tr')).toHaveCount(3)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const own = page.locator('tbody tr').filter({ hasText: 'Strength, with intention' })
  await own.getByRole('link', { name: 'Start', exact: true }).click()
  // Start opens the Program at its Start section (?start=1), where the date is chosen.
  await expect(page).toHaveURL(/[?&]start=1/)
  await expect(page.getByRole('region', { name: 'Start Program' })).toBeVisible()
  expect(requests.some(r => r.path.endsWith('/publish') && r.method === 'POST')).toBe(false)
})

test('/discover redirects to /browse with query params and /programs/new stays behind AuthGuard', async ({ page }) => {
  await mockApi(page)
  await page.goto('/discover?kind=activities&category=cat-1&q=Morning')
  await expect(page).toHaveURL(/\/browse\?kind=activities&category=cat-1&q=Morning/)
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible()

  await page.goto('/programs/new')
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fprograms%2Fnew/)
})
