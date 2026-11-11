import { test, expect } from '@playwright/test'
import { mockApi, programId, itemId, activityId } from './fixtures'
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

  await page.getByRole('button', { name: /Workout/ }).click()
  await expect(page).toHaveURL(/\/programs\/new\?type=/)
  // Top-five suggestions for the chosen type.
  await expect(
    page
      .getByRole('region', { name: 'Suggested' })
      .getByRole('button', { name: 'Use as starting point: Beginner Strength' }),
  ).toBeVisible()

  // The full library is its own dedicated route.
  await page.getByLabel('Program name').fill('Draft name kept')
  const discoveryRequest = page.waitForRequest((request) => {
    const url = new URL(request.url())
    return (
      url.pathname === '/discover' &&
      url.searchParams.get('programTypeId') ===
        '00000000-0000-4000-8000-000000000002' &&
      url.searchParams.get('limit') === '20'
    )
  })
  await page.getByRole('button', { name: 'Browse Program Library' }).click()
  await discoveryRequest
  await expect(page).toHaveURL(/\/browse\?.*type=/)
  await expect(page.getByRole('heading', { name: 'Workout Library', exact: true })).toBeVisible()
  const searchRequest = page.waitForRequest((request) => {
    const url = new URL(request.url())
    return url.pathname === '/discover' && url.searchParams.get('q') === 'Beginner'
  })
  await page.getByLabel('Search Programs').fill('Beginner')
  await searchRequest
  await expect(page).toHaveURL(/q=Beginner/)
  await page.getByRole('link', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/programs\/new\?type=/)
  await expect(page.getByLabel('Program name')).toHaveValue('Draft name kept')

  await page.getByRole('button', { name: 'Browse Program Library' }).click()
  await page
    .getByRole('button', { name: 'Use as starting point: Beginner Strength' })
    .click()
  await expect(page).toHaveURL(/\/programs\/new\?type=/)
  await expect(page.getByLabel('Program name')).toHaveValue('Beginner Strength')
  await expect(page.getByText('Starting point:')).toContainText('Beginner Strength')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
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

  // The copy lands on step 2 of the three-step editor.
  await expect(page).toHaveURL(/\/workspace\?step=activities/)
})

test('Add Program continues with a blank structure without choosing a starting point', async ({
  page,
}) => {
  const { requests } = await mockApi(page)
  await login(page, 'author@test.local', 'password')
  await page.goto('/programs/new')
  await page.getByRole('button', { name: /Workout/ }).click()
  await page.getByLabel('Program name').fill('My own practice')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()

  await expect(
    page.getByRole('heading', { name: 'Activities', exact: true }),
  ).toBeVisible()
  expect(
    requests.find(
      (request) => request.path === '/programs' && request.method === 'POST',
    )?.body,
  ).toMatchObject({
    programTypeId: '00000000-0000-4000-8000-000000000002',
    focusId: null,
  })
  expect(
    requests.find(
      (request) =>
        request.path.endsWith('/draft') &&
        request.body.title === 'My own practice',
    ),
  ).toBeDefined()
  expect(requests.some((request) => request.path.endsWith('/copy'))).toBe(false)
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
  await expect(page.getByText('You have unsaved edits in progress.')).toBeVisible()
  await page.getByRole('button', { name: 'Keep Editing' }).click()
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
  await page.getByRole('button', { name: 'Mark as Complete', exact: true }).click()
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
  await page.getByRole('button', { name: /Pages menu/ }).click()
  await page
    .getByRole('navigation', { name: 'Workspace navigation' })
    .getByRole('link', { name: 'Calendar', exact: true })
    .click()
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
  await page.goto('/?view=month&day=2026-11-09')
  const tuesday = page
    .locator('.calendar-month-picker:visible, .calendar-month-grid:visible')
    .getByRole('button', { name: 'Tue 10', exact: true })
  await tuesday.focus()
  await page.keyboard.press('Enter')
  // Choosing a date opens that day.
  await expect(page).toHaveURL(/view=day/)
  await expect(page).toHaveURL(/day=2026-11-10/)
  await expect(
    page.getByRole('heading', { name: 'Tuesday, November 10, 2026' }),
  ).toBeVisible()
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 })
    const dimensions = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      offenders: Array.from(document.querySelectorAll('body *'))
        .map((element) => ({
          tag: element.tagName,
          className: typeof element.className === 'string' ? element.className : '',
          right: Math.round(element.getBoundingClientRect().right),
        }))
        .filter((element) => element.right > innerWidth + 1)
        .slice(0, 5),
    }))
    expect(dimensions.documentWidth, `overflow at ${width}px: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(width)
  }
})

test('calendar defaults to day, toggles month and all-hours, and stays within a mobile viewport', async ({
  page,
}) => {
  await mockApi(page)
  await login(page, 'participant@test.local', 'password')
  await page.goto('/?day=2026-11-09')
  await expect(
    page.getByRole('heading', { name: 'Monday, November 9, 2026' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'All hours' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await page.getByRole('button', { name: 'All hours' }).click()
  await expect(page.getByRole('button', { name: 'All 24h' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.locator('.calendar-filter__trigger').click()
  await page.getByRole('button', { name: 'Fitness', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Fitness', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.locator('.calendar-filter__trigger').click()
  await page.getByRole('button', { name: 'Month', exact: true }).click()
  await expect(page).toHaveURL(/view=month/)
  await page.setViewportSize({ width: 360, height: 780 })
  const day = page
    .getByLabel('Select a day')
    .getByRole('button', { name: 'Tue 10', exact: true })
  await day.click()
  await expect(page).toHaveURL(/view=day&day=2026-11-10|day=2026-11-10&view=day/)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

test('calendar highlights today and lets a participant quick-finish an Activity', async ({
  page,
}) => {
  const date = await page.evaluate(() => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date())
    const value = (type: string) => parts.find((part) => part.type === type)!.value
    return `${value('year')}-${value('month')}-${value('day')}`
  })
  const { requests } = await mockApi(page, {
    calendarItem: true,
    calendarDate: date,
    groupItem: true,
  })
  await login(page, 'participant@test.local', 'password')
  await page.goto(`/?view=month&day=${date}`)

  const isMobile = await page.evaluate(() => innerWidth < 640)
  const itemRegion = isMobile
    ? page.locator('.calendar-selected-day--mobile-only')
    : page.locator('.calendar-month-cell--today')
  if (isMobile) {
    await expect(
      page.locator('.calendar-month-picker button[aria-current="date"]'),
    ).toBeVisible()
    await expect(
      itemRegion.getByRole('heading', { name: 'Today' }),
    ).toBeVisible()
  } else {
    await expect(itemRegion).toBeVisible()
    await expect(itemRegion.locator('button[aria-current="date"]')).toBeVisible()
  }
  await expect(
    itemRegion.locator('.calendar-tile__thumbnail'),
  ).toBeVisible()
  await expect(itemRegion.getByLabel('Group participant')).toBeVisible()
  if (!isMobile)
    await expect(page.locator('.calendar-selected-day--mobile-only')).toBeHidden()

  await itemRegion.getByRole('button', { name: 'Mark Squats complete' }).click()
  await expect(
    page.getByText('Activity marked complete', { exact: true }),
  ).toBeVisible()
  expect(
    requests.find((request) => request.path === '/sessions' && request.method === 'POST')
      ?.body,
  ).toMatchObject({
    calendarItemId: itemId,
    idempotencyKey: expect.any(String),
  })
  expect(
    requests.find(
      (request) => request.path.endsWith('/actions'),
    )?.body,
  ).toMatchObject({ action: 'FINISH', expectedRevision: 0 })

  await page.getByRole('button', { name: 'Month', exact: true }).click()
  await expect(page).toHaveURL(/view=month|view=day/)
  const daySchedule = page.locator('.calendar-day-schedule')
  await expect(daySchedule).toBeVisible()
  await expect(daySchedule.locator('.calendar-tile--complete')).toBeVisible()
  await expect(daySchedule.getByRole('link', { name: /Squats, .*Completed/ })).toBeVisible()
  await expect(daySchedule.getByRole('button', { name: 'Mark Squats complete' })).toHaveCount(0)
  await expect(daySchedule.locator('.calendar-tile__status')).toHaveCount(0)
})

test('calendar and header span the viewport with aligned gutters', async ({ page }) => {
  await mockApi(page)
  await login(page, 'participant@test.local', 'password')
  await page.goto('/?view=month')

  for (const width of [1280, 1920]) {
    await page.setViewportSize({ width, height: 1080 })
    const rail = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>('header > div')
      const page = document.querySelector<HTMLElement>('main.page--wide')
      const board = page?.querySelector<HTMLElement>('.calendar-month-grid')
      if (!header || !page || !board) throw new Error('Full-width calendar or header is missing')
      return {
        headerLeft: header.getBoundingClientRect().left,
        headerWidth: header.getBoundingClientRect().width,
        pageLeft: page.getBoundingClientRect().left,
        pageWidth: page.getBoundingClientRect().width,
        headerGutter: getComputedStyle(header).paddingLeft,
        pageGutter: getComputedStyle(page).paddingLeft,
        boardWidth: board.getBoundingClientRect().width,
        viewportWidth: window.innerWidth,
      }
    })

    expect(rail.headerLeft).toBe(0)
    expect(rail.pageLeft).toBe(0)
    expect(rail.pageWidth).toBe(rail.viewportWidth)
    expect(rail.headerWidth).toBe(rail.viewportWidth)
    expect(rail.headerGutter).toBe('24px')
    expect(rail.pageGutter).toBe(rail.headerGutter)
    expect(rail.boardWidth).toBe(rail.pageWidth - 48)
  }
})

test('mobile calendar exposes selected-day items, inline quick-completion, and navigation to occurrence', async ({
  page,
}) => {
  const date = await page.evaluate(() => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date())
    const value = (type: string) => parts.find((part) => part.type === type)!.value
    return `${value('year')}-${value('month')}-${value('day')}`
  })
  const { requests } = await mockApi(page, {
    calendarItem: true,
    calendarDate: date,
    recurring: true,
  })
  await login(page, 'participant@test.local', 'password')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/?view=month&day=${date}`)

  const agenda = page.locator('.calendar-selected-day--mobile-only')
  await expect(agenda).toBeVisible()
  await expect(agenda.getByRole('heading', { name: 'Today' })).toBeVisible()
  await expect(agenda.getByRole('button', { name: /More actions/ })).toHaveCount(0)
  await expect(agenda.locator('.calendar-tile__status')).toHaveCount(0)

  await agenda.getByRole('button', { name: 'Mark Squats complete' }).click()
  await expect(
    page.getByText('Activity marked complete', { exact: true }),
  ).toBeVisible()
  expect(
    requests.find((request) => request.path === '/sessions' && request.method === 'POST')
      ?.body,
  ).toMatchObject({ calendarItemId: itemId })

  await expect(agenda.locator('.calendar-tile--complete')).toBeVisible()
  await expect(agenda.getByRole('button', { name: 'Mark Squats complete' })).toHaveCount(0)
  await agenda.getByRole('link', { name: /Squats, .*Completed/ }).click()
  await expect(page).toHaveURL(new RegExp(`/occurrences/${itemId}`))
})

test('Program Activity creation keeps the description and adds the Activity to the Program', async ({
  page,
}) => {
  const { requests } = await mockApi(page)
  await login(page, 'author@test.local', 'password')
  await page.goto(`/programs/${programId}/workspace?step=activities`)
  await page.getByLabel('Activity title').fill('Evening walk')
  await page.getByLabel('Description (optional)').fill('Walk around the neighborhood.')
  // Instructions are added later from the Activity editor, not this inline form.
  await expect(page.getByLabel('Instructions (optional)')).toHaveCount(0)
  // Media is chosen on the same form; one action creates the Activity and adds it.
  await expect(
    page.getByRole('group', { name: 'Activity media' }).getByRole('button', { name: 'Add media' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Add to Program', exact: true }).click()
  await expect(page.getByLabel('Activity title')).toHaveValue('')
  expect(
    requests.find((request) => request.path === '/activities' && request.method === 'POST')
      ?.body,
  ).toMatchObject({
    title: 'Evening walk',
    summary: 'Walk around the neighborhood.',
  })
  expect(
    requests.find(
      (request) => request.path === `/programs/${programId}/draft/activities` && request.method === 'POST',
    )?.body,
  ).toMatchObject({ activityIds: ['00000000-0000-4000-8000-000000000022'] })
})

test('Calendar Activity creation starts blank and adds the new Activity on the selected date', async ({
  page,
}) => {
  const { requests } = await mockApi(page)
  await login(page, 'participant@test.local', 'password')
  await page.goto('/add-activity?day=2026-11-12')

  await expect(
    page.getByRole('heading', { name: 'Add Activity', level: 1 }),
  ).toBeVisible()
  await page.getByLabel('Activity title').fill('Evening sketch')
  await page
    .getByLabel('Description (optional)')
    .fill('Draw one thing from the day.')
  await page.getByLabel('Category').selectOption({ label: 'Fitness' })
  await page
    .getByLabel('Instructions (optional)')
    .fill('Keep the session informal.')
  await page
    .getByRole('button', { name: 'Create Activity' })
    .click()
  await expect(
    page.getByRole('group', { name: 'Activity media' }).getByRole('button', { name: 'Add media' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Add to Calendar', exact: true }).click()

  await expect(page).toHaveURL(/\/\?view=day&day=2026-11-12/)
  await expect(
    page.getByRole('button', { name: /Pages menu, current page Calendar/ }),
  ).toBeVisible()
  expect(
    requests.find(
      (request) => request.path === '/activities' && request.method === 'POST',
    )?.body,
  ).toMatchObject({
    title: 'Evening sketch',
    summary: 'Draw one thing from the day.',
    categoryId: '00000000-0000-4000-8000-000000000003',
  })
  expect(
    requests.find(
      (request) =>
        request.path === '/calendar/items' && request.method === 'POST',
    )?.body,
  ).toMatchObject({
    activityId: '00000000-0000-4000-8000-000000000022',
    localDate: '2026-11-12',
  })
})

test('Calendar Activity suggestions prefill an editable copy instead of replacing creation', async ({
  page,
}) => {
  const { requests } = await mockApi(page)
  await login(page, 'participant@test.local', 'password')
  await page.goto('/add-activity?day=2026-11-12')
  await page
    .getByRole('region', { name: 'Suggestions' })
    .getByRole('button', { name: 'Use as starting point: Squats', exact: true })
    .click()

  await expect(page.getByLabel('Activity title')).toHaveValue('Squats')
  await page.getByLabel('Activity title').fill('Evening squat practice')
  await page
    .getByRole('button', { name: 'Create a private copy' })
    .click()
  await page
    .getByRole('button', { name: /Start Program|Add to Calendar/ })
    .click()

  await expect(page).toHaveURL(/\/\?view=day&day=2026-11-12/)
  expect(
    requests.find(
      (request) =>
        request.path === `/activities/${activityId}/copy` &&
        request.method === 'POST',
    ),
  ).toBeDefined()
  expect(
    requests.find(
      (request) =>
        request.path ===
          '/activities/00000000-0000-4000-8000-000000000026/draft' &&
        request.method === 'PATCH',
    )?.body,
  ).toMatchObject({ title: 'Evening squat practice' })
  expect(
    requests.find(
      (request) =>
        request.path === '/calendar/items' && request.method === 'POST',
    )?.body,
  ).toMatchObject({
    activityId: '00000000-0000-4000-8000-000000000026',
    localDate: '2026-11-12',
  })
})
