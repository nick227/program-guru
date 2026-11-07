import { test, expect } from '@playwright/test'
import { mockApi, programId, itemId } from './fixtures'
import { journey, login } from './journey'
test('author publishes; another user joins, records, finishes and undoes', async ({
  page,
}, testInfo) => {
  const { requests } = await mockApi(page)
  await journey(page, {
    author: ['author@test.local', 'password'],
    participant: ['participant@test.local', 'password'],
  })
  expect(
    requests.filter(
      (r) => r.path.endsWith('/enrollments') && r.method === 'POST',
    ),
  ).toHaveLength(1)
  expect(
    requests.find((r) => r.path.endsWith('/results'))?.body.values,
  ).toEqual([
    {
      metricDefinitionId: '00000000-0000-4000-8000-000000000023',
      value: 1,
      unit: 'reps',
    },
  ])
  expect(
    requests.filter(
      (r) => r.path.endsWith('/actions') && r.body.action === 'FINISH',
    ),
  ).toHaveLength(1)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('calendar.png'),
    fullPage: true,
  })
})
test('draft conflicts preserve the local title and require explicit resolution', async ({
  page,
}) => {
  await mockApi(page, { conflict: true })
  await login(page, 'author@test.local', 'password')
  await page.goto(`/programs/${programId}/workspace?panel=edit`)
  await page.getByLabel('Program title').fill('My local title')
  await expect(page.getByRole('alert')).toContainText('This draft changed')
  await expect(page.getByLabel('Program title')).toHaveValue('My local title')
  await page.getByRole('link', { name: 'Workspace', exact: true }).click()
  await expect(page.getByText('You have unsaved changes.')).toBeVisible()
  await page.getByRole('button', { name: 'Keep editing' }).click()
  await expect(page.getByLabel('Program title')).toHaveValue('My local title')
})
test('server validation retains field errors and request reference', async ({
  page,
}) => {
  await mockApi(page)
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill('author@test.local')
  await page.getByLabel('Password', { exact: true }).fill('wrong')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Email needs attention')
  await expect(page.getByRole('alert')).toContainText('browser-test-request')
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(
    'author@test.local',
  )
})
test('auth server failure stays an error instead of redirecting to login', async ({
  page,
}) => {
  await mockApi(page, { meFailure: true })
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('Temporarily unavailable')
  await expect(page).toHaveURL(/\/$/)
})
test('offline edits are kept locally and are not sent', async ({
  page,
  context,
}) => {
  const { requests } = await mockApi(page)
  await login(page, 'author@test.local', 'password')
  await page.goto(`/programs/${programId}/workspace?panel=edit`)
  await expect(page.getByLabel('Program title')).toBeVisible()
  await context.setOffline(true)
  await page.getByLabel('Program title').fill('Offline title')
  await expect(
    page.getByText('Offline · changes have not been saved'),
  ).toBeVisible()
  await page.waitForTimeout(800)
  expect(requests.filter((r) => r.method === 'PATCH')).toHaveLength(0)
  await context.setOffline(false)
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: /^Saved$/ }),
  ).toBeVisible()
})

test('failed Finish stays on the Activity and never confirms completion', async ({
  page,
}) => {
  const { requests } = await mockApi(page, { finishFailure: true })
  await login(page, 'participant@test.local', 'password')
  await page.goto(
    `/occurrences/${itemId}?returnTo=${encodeURIComponent('/?week=2026-11-09&day=2026-11-09')}`,
  )
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('button', { name: 'Finish', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Could not confirm completion',
  )
  await expect(
    page.getByRole('heading', { name: 'Squats', exact: true }),
  ).toBeVisible()
  expect(
    requests.filter(
      (r) => r.path.endsWith('/actions') && r.body.action === 'FINISH',
    ),
  ).toHaveLength(1)
})
test('Back does not silently discard edited results', async ({ page }) => {
  await mockApi(page)
  await login(page, 'participant@test.local', 'password')
  await page.goto(`/occurrences/${itemId}`)
  await page.getByRole('button', { name: 'Increase Reps' }).click()
  await page.getByRole('link', { name: 'Calendar', exact: true }).click()
  await expect(page.getByText('You have unsaved results.')).toBeVisible()
  await page.getByRole('button', { name: 'Keep editing' }).click()
  await expect(page.getByLabel('Reps (reps)', { exact: true })).toHaveValue('1')
})

test('autosave serializes edits typed while a previous save is in flight', async ({
  page,
}) => {
  const { requests } = await mockApi(page)
  await page.route('**/draft', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300))
    await route.fallback()
  })
  await login(page, 'author@test.local', 'password')
  await page.goto(`/programs/${programId}/workspace?panel=edit`)
  const firstRequest = page.waitForRequest(
    (request) => request.method() === 'PATCH',
  )
  await page.getByLabel('Program title').fill('First edit')
  await firstRequest
  await page.getByLabel('Program title').fill('Latest edit')
  await expect(
    page.getByRole('status').filter({ hasText: /^Saved$/ }),
  ).toBeVisible()
  await expect(page.getByLabel('Program title')).toHaveValue('Latest edit')
  const writes = requests.filter((r) => r.method === 'PATCH')
  expect(writes.map((r) => [r.body.title, r.body.expectedRevision])).toEqual([
    ['First edit', 1],
    ['Latest edit', 2],
  ])
})
test('calendar day selection works from the keyboard', async ({ page }) => {
  await mockApi(page)
  await login(page, 'participant@test.local', 'password')
  await page.goto('/?week=2026-11-09&day=2026-11-09')
  const tuesday = page.getByRole('button', { name: 'Tue 10', exact: true })
  await tuesday.focus()
  await page.keyboard.press('Enter')
  await expect(tuesday).toHaveAttribute('aria-pressed', 'true')
  await expect(page).toHaveURL(/day=2026-11-10/)
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  }
})
