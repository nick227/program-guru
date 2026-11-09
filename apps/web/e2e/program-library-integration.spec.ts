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
    .getByRole('button', { name: 'Browse Programs', exact: true })
    .click()
  const browser = page.getByRole('dialog', { name: 'Program Library' })
  await expect(browser).toBeVisible()
  await expect(browser.getByLabel('Program type', { exact: true })).toHaveValue(
    '',
  )
  await browser.getByLabel('Search Programs', { exact: true }).fill('Beginner')
  await expect(page).toHaveURL(/bq=Beginner/)
  await browser
    .getByRole('button', { name: 'View Program: Beginner Strength' })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Beginner Strength', exact: true }),
  ).toBeVisible()
  expect(await page.evaluate(() => (window as any).__spaMarker)).toBe(
    'same-document',
  )
  expect(requests.filter((r) => r.path === '/resolve-slug')).toHaveLength(0)
  await page.getByRole('link', { name: 'Back', exact: true }).click()
  await expect(
    page.getByRole('dialog', { name: 'Program Library' }),
  ).toBeVisible()
  await expect(
    page.getByRole('dialog').getByLabel('Search Programs', { exact: true }),
  ).toHaveValue('Beginner')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Back', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByLabel('Search Programs', { exact: true })).toHaveValue(
    'Strength',
  )
  await expect(page.getByLabel('Sort Programs')).toHaveValue('name')
  expect(libraryReads).toBe(readsBeforeBrowse)
  await page
    .getByRole('button', { name: 'Browse Programs', exact: true })
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

test('archived Programs stay reachable and Restore does not resume scheduling', async ({
  page,
}) => {
  await mockApi(page)
  const rows = libraryRows().slice(0, 1)
  const first = rows[0]!
  first.status = 'Archived'
  first.current!.status = 'PAUSED'
  const actions: string[] = []
  await page.route('**/me/program-library', (route) =>
    route.fulfill({ json: { data: rows } }),
  )
  await page.route('**/me/program-library/*', async (route) => {
    actions.push(route.request().postDataJSON().action)
    first.status = 'Paused'
    return route.fulfill({ json: { data: first } })
  })
  await page.route('**/enrollments/run', async (route) => {
    actions.push(route.request().postDataJSON().status)
    first.status = 'Active'
    first.current!.status = 'ACTIVE'
    return route.fulfill({ json: { data: {} } })
  })
  await login(page, 'author@test.local', 'password')
  await page.goto('/library')
  await page.getByRole('button', { name: 'Archived Programs (1)' }).click()
  await page.getByRole('link', { name: 'View', exact: true }).click()
  await expect(
    page.getByText(/Its schedule will stay paused until you choose Resume/),
  ).toBeVisible()
  await page.getByLabel('Manage Strength, with intention').click()
  await expect(
    page.getByText(/Its schedule stays paused until you choose Resume/),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Restore to library' }).click()
  await expect(
    page.getByRole('button', { name: 'Resume', exact: true }),
  ).toBeVisible()
  expect(actions).toEqual(['RESTORE'])
  await expect(
    page.getByText(/Restored to Library. Your schedule is still paused/),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await expect(
    page.getByRole('link', { name: 'Continue', exact: true }),
  ).toBeVisible()
  expect(actions).toEqual(['RESTORE', 'ACTIVE'])
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
