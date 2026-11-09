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
  await expect(
    page.getByRole('heading', { name: 'Upcoming Activities' }),
  ).toBeVisible()
  await expect(page.getByText('80 min', { exact: true })).toBeVisible()
  await expect(page.getByText('A creator update is available')).toBeVisible()
  await page.getByLabel('Manage Strength, with intention').click()
  await expect(
    page.getByRole('link', { name: 'Edit Program', exact: true }),
  ).toHaveAttribute('href', /\/workspace$/)
  const menuBox = await page
    .locator('.library-detail .library-menu > div')
    .boundingBox()
  expect(menuBox!.x).toBeGreaterThanOrEqual(0)
  await page.getByRole('button', { name: 'Restart as a new run' }).click()
  await expect(
    page.getByRole('dialog', { name: 'Restart Program' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByLabel('Manage Strength, with intention').click()
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
