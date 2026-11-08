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

test('Add Program filters by type and copies a selected starting point', async ({
  page,
}) => {
  const { requests } = await mockApi(page)
  await login(page, 'author@test.local', 'password')
  await page.goto('/programs/new')

  const discoveryRequest = page.waitForRequest((request) => {
    const url = new URL(request.url())
    return url.pathname === '/discover' && url.searchParams.has('programTypeId')
  })
  await page.getByRole('button', { name: /Workout/ }).click()
  expect(
    new URL((await discoveryRequest).url()).searchParams.get('programTypeId'),
  ).toBe('00000000-0000-4000-8000-000000000002')

  await page.getByRole('button', { name: /Beginner Strength/ }).click()
  await expect(page.getByLabel('Program name')).toHaveValue('Beginner Strength')
  await page
    .getByRole('button', { name: 'Use this starting point', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Activities', exact: true }),
  ).toBeVisible()

  expect(
    requests.filter(
      (request) =>
        request.path === '/programs/00000000-0000-4000-8000-000000000011/copy',
    ),
  ).toHaveLength(1)
  expect(
    requests.find(
      (request) =>
        request.path.endsWith('/draft') &&
        request.body.title === 'Beginner Strength',
    ),
  ).toBeDefined()

  await page.getByRole('button', { name: 'Add to Calendar' }).click()
  await expect(
    page.getByRole('heading', { name: 'Calendar', exact: true }),
  ).toBeVisible()
  const privatePublish = requests.find(
    (request) =>
      request.path === '/programs/00000000-0000-4000-8000-000000000010/publish',
  )
  const personalJoinIndex = requests.findIndex(
    (request) =>
      request.path ===
        '/programs/00000000-0000-4000-8000-000000000010/enrollments' &&
      request.method === 'POST',
  )
  expect(privatePublish).toBeDefined()
  expect(privatePublish?.body.visibility).toBe('PRIVATE')
  expect(personalJoinIndex).toBeGreaterThan(
    privatePublish ? requests.indexOf(privatePublish) : -1,
  )
})

test('draft conflicts preserve the local title and require explicit resolution', async ({
  page,
}) => {
  await mockApi(page, { conflict: true })
  await login(page, 'author@test.local', 'password')
  await page.goto(`/programs/${programId}/workspace?panel=edit`)
  await page.getByLabel('Program name').fill('My local title')
  await expect(page.getByRole('alert')).toContainText('This draft changed')
  await expect(page.getByLabel('Program name')).toHaveValue('My local title')
  await page.getByRole('link', { name: 'Workspace', exact: true }).click()
  await expect(page.getByText('You have unsaved changes.')).toBeVisible()
  await page.getByRole('button', { name: 'Keep editing' }).click()
  await expect(page.getByLabel('Program name')).toHaveValue('My local title')
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
  await expect(page.getByLabel('Program name')).toBeVisible()
  await context.setOffline(true)
  await page.getByLabel('Program name').fill('Offline title')
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
  await page.getByRole('button', { name: /Finish/ }).click()
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
  await page.getByLabel('Program name').fill('First edit')
  await firstRequest
  await page.getByLabel('Program name').fill('Latest edit')
  await expect(
    page.getByRole('status').filter({ hasText: /^Saved$/ }),
  ).toBeVisible()
  await expect(page.getByLabel('Program name')).toHaveValue('Latest edit')
  const writes = requests.filter((r) => r.method === 'PATCH')
  expect(writes.map((r) => [r.body.title, r.body.expectedRevision])).toEqual([
    ['First edit', 1],
    ['Latest edit', 2],
  ])
})
test('calendar day selection works from the keyboard', async ({ page }) => {
  await mockApi(page)
  await login(page, 'participant@test.local', 'password')
  await page.goto('/?view=week&day=2026-11-09')
  const tuesday = page
    .getByLabel('Select a day')
    .getByRole('button', { name: 'Tue 10', exact: true })
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

test('calendar defaults to month, switches views, and stays within a mobile viewport', async ({
  page,
}) => {
  await mockApi(page)
  await login(page, 'participant@test.local', 'password')
  await page.goto('/?view=month&day=2026-11-09')
  await expect(page.getByRole('button', { name: 'Month', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: 'Year', exact: true }).click()
  await expect(page.getByRole('heading', { name: '2026', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Week', exact: true }).click()
  await expect(page).toHaveURL(/view=week/)
  await page.getByRole('button', { name: 'Month', exact: true }).click()
  await page.setViewportSize({ width: 360, height: 780 })
  const day = page
    .getByLabel('Select a day')
    .getByRole('button', { name: 'Tue 10', exact: true })
  await day.click()
  await expect(day).toHaveAttribute('aria-pressed', 'true')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

test('Program Activity creation keeps description and optional instructions in context', async ({
  page,
}) => {
  const { requests } = await mockApi(page)
  await login(page, 'author@test.local', 'password')
  await page.goto(`/programs/${programId}/workspace?panel=activities`)
  await page.getByLabel('Activity title').fill('Evening walk')
  await page.getByLabel('Description').fill('Walk around the neighborhood.')
  await page.getByLabel('Category').selectOption({ label: 'Fitness' })
  await page
    .getByLabel('Instructions (optional)')
    .fill('Choose a comfortable pace.')
  await page.getByRole('button', { name: 'Continue to media' }).click()
  await expect(
    page.getByRole('button', { name: 'Add Activity to Program' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Add Activity to Program' }).click()
  await expect(page.getByRole('heading', { name: 'Schedule & placement' })).toBeVisible()
  expect(
    requests.find((request) => request.path === '/activities' && request.method === 'POST')
      ?.body,
  ).toMatchObject({
    title: 'Evening walk',
    summary: 'Walk around the neighborhood.',
  })
  expect(
    requests.find((request) => request.path.endsWith('/draft/instructions'))?.body
      .instructions,
  ).toEqual([{ body: 'Choose a comfortable pace.' }])
})
