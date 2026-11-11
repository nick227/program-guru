import { test, expect } from '@playwright/test'
import { mockApi } from './fixtures'

test('day view renders full-width 12am-12am hourly table with unknown times at top and drag-drop time adjustment', async ({ page }) => {
  const { requests } = await mockApi(page)
  const rows = [
    { id: 'late', title: 'Evening walk', localTime: '18:30', status: 'PLANNED' },
    { id: 'any', title: 'Read a chapter', localTime: null, status: 'PLANNED' },
    { id: 'early', title: 'Morning stretch', localTime: '07:00', status: 'DONE' },
    { id: 'same', title: 'Team check-in', localTime: '07:00', status: 'NOT_PARTICIPATING' },
    { id: 'midnight', title: 'Night journal', localTime: '00:00', status: 'PLANNED' },
  ].map((item) => ({
    ...item,
    localDate: '2026-11-09',
    programTitle: 'Daily routine',
    participantAvatars: [],
    unreadCount: 0,
    locked: false,
    updatedAt: '2026-11-09T06:00:00Z',
  }))

  await page.route('**/calendar/items?*', (route) => route.fulfill({ json: { data: rows } }))
  await page.route('**/calendar-items/*', async (route) => {
    const req = route.request()
    if (req.method() !== 'PATCH') return route.fallback()
    const id = req.url().split('/').pop()!
    const body = req.postDataJSON() as { localTime?: string | null }
    const target = rows.find((r) => r.id === id)
    if (target && body.localTime !== undefined) {
      target.localTime = body.localTime
      target.updatedAt = new Date().toISOString()
    }
    return route.fulfill({ json: { data: target } })
  })

  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill('author@test.local')
  await page.getByLabel('Password', { exact: true }).fill('password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('radio', { name: 'Day', exact: true })).toBeVisible()
  await page.goto('/?view=day&day=2026-11-09')

  const table = page.getByRole('table', { name: 'Day schedule' })
  await expect(table).toBeVisible()

  // Table is full width of its container
  const [tableBox, containerBox] = await Promise.all([
    table.boundingBox(),
    page.locator('.calendar-selected-day').boundingBox(),
  ])
  expect(tableBox!.width).toBeGreaterThanOrEqual(containerBox!.width - 2)

  // Top row is Any time, followed by 24 hour rows from 12:00 AM to 11:00 PM
  const slots = table.locator('tbody tr[data-slot]')
  await expect(slots).toHaveCount(25)
  await expect(slots.nth(0)).toHaveAttribute('data-slot', 'anytime')
  await expect(slots.nth(0).locator('.calendar-day-table__time')).toHaveText('Any time')
  await expect(slots.nth(1)).toHaveAttribute('data-slot', '00')
  await expect(slots.nth(1).locator('.calendar-day-table__time')).toHaveText('12:00 AM')
  await expect(slots.nth(24)).toHaveAttribute('data-slot', '23')
  await expect(slots.nth(24).locator('.calendar-day-table__time')).toHaveText('11:00 PM')

  // Untimed item is at the top in Any time; timed items sit in their respective hour rows
  await expect(slots.nth(0).locator('.calendar-tile')).toHaveCount(1)
  await expect(slots.nth(0)).toContainText('Read a chapter')
  await expect(table.locator('tr[data-slot="00"] .calendar-tile')).toHaveCount(1)
  await expect(table.locator('tr[data-slot="07"] .calendar-tile')).toHaveCount(2)
  await expect(table.locator('tr[data-slot="18"] .calendar-tile')).toHaveCount(1)
  await expect(table.locator('.calendar-tile--compact')).toHaveCount(5)

  // Tiles stay visually quiet (no overflow menus or status badges); only PLANNED items show quick-complete
  await expect(table.getByRole('button', { name: /More actions/ })).toHaveCount(0)
  await expect(table.locator('.calendar-tile__status')).toHaveCount(0)
  await expect(table.getByRole('button', { name: /^Mark .* complete$/ })).toHaveCount(3)
  await expect(table.getByRole('button', { name: 'Mark Morning stretch complete' })).toHaveCount(0)
  await expect(table.getByRole('button', { name: 'Mark Team check-in complete' })).toHaveCount(0)
  await expect(table.getByRole('button', { name: 'Mark Evening walk complete' })).toBeVisible()
  await expect(table.getByLabel('Time of day for Evening walk')).toHaveValue('18:30')

  // Drag "Read a chapter" from Any time to 2:00 AM row
  const readTile = table.locator('article[data-item-id="any"]')
  const twoAmRow = table.locator('tr[data-slot="02"]')
  await readTile.dragTo(twoAmRow)
  await expect(twoAmRow.locator('article[data-item-id="any"]')).toBeVisible()
  await expect(slots.nth(0).locator('article[data-item-id="any"]')).toHaveCount(0)

  // Day-level time input adjusts exact time of day (e.g. 02:45 -> stays in 2 AM row, shows 2:45 AM)
  const timeInput = page.getByLabel('Time of day for Read a chapter')
  await timeInput.fill('02:45')
  await expect(twoAmRow.locator('article[data-item-id="any"]')).toContainText('2:45 AM')

  // Clear time moves it back to Any time at the top
  await page.getByRole('button', { name: 'Clear time for Read a chapter' }).click()
  await expect(slots.nth(0).locator('article[data-item-id="any"]')).toBeVisible()

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await table.getByRole('link', { name: /Evening walk/ }).click()
  await expect(page).toHaveURL(/\/occurrences\/late/)
  expect(requests.length).toBeGreaterThanOrEqual(0)
})

test('activity target time is displayed on Activity and can be set by user', async ({ page }) => {
  await mockApi(page)
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill('author@test.local')
  await page.getByLabel('Password', { exact: true }).fill('password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()

  // Create an Activity with optional target time via Add Activity
  await page.goto('/add-activity?day=2026-11-09')
  await page.getByLabel('Activity title').fill('Morning Mobility')
  await page.getByLabel('Target time (optional)').fill('07:30')
  await page.getByLabel('Category').selectOption('00000000-0000-4000-8000-000000000003')
  await page.getByRole('button', { name: 'Create Activity' }).click()
  await expect(page.getByRole('button', { name: 'Add to Calendar' })).toBeVisible()

  // Activity detail page displays Target time and lets owner update it
  await page.goto('/activities/00000000-0000-4000-8000-000000000022')
  await expect(page.getByText('Target time: 7:30 AM')).toBeVisible()
  await page.getByRole('button', { name: 'Edit Activity' }).click()
  await page.getByLabel('Target time (optional)').fill('08:15')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Target time: 8:15 AM')).toBeVisible()
})

test('grouped workout renders one expandable tile while separate programs stay individual', async ({ page }) => {
  await mockApi(page)
  const items = [
    { id: 'w1', title: 'Warm-up', localTime: '07:30', durationMinutes: 5 },
    { id: 'w2', title: 'Squats', localTime: '07:35', durationMinutes: 9 },
    { id: 'w3', title: 'Push-ups', localTime: '07:44', durationMinutes: 9 },
    { id: 'w4', title: 'Plank', localTime: '07:53', durationMinutes: 5 },
    { id: 'w5', title: 'Glute Bridge', localTime: '07:58', durationMinutes: 7 },
    { id: 'w6', title: 'Cool-down', localTime: '08:05', durationMinutes: 5 },
  ].map((it, idx) => ({
    ...it,
    localDate: '2026-11-10',
    status: 'PLANNED',
    activityId: `act-${idx}`,
    activityRevisionId: `rev-${idx}`,
    programTitle: 'Beginner Core & Strength',
    enrollmentId: 'enroll-fitness',
    programDayIndex: 1,
    sessionPresentation: 'GROUPED',
    recurrenceId: null,
    conflict: false,
    locked: false,
    thumbnailUrl: null,
    participantAvatars: [],
    unreadCount: 0,
    updatedAt: '2026-11-10T06:00:00Z',
  }))

  items.push({
    id: 'm1',
    title: 'Morning Routine',
    localTime: '08:00',
    durationMinutes: 5,
    localDate: '2026-11-10',
    status: 'PLANNED',
    activityId: 'act-m1',
    activityRevisionId: 'rev-m1',
    programTitle: 'Daily Mindfulness & Reflection',
    enrollmentId: 'enroll-mind',
    programDayIndex: 1,
    sessionPresentation: 'SEPARATE',
    recurrenceId: null,
    conflict: false,
    locked: false,
    thumbnailUrl: null,
    participantAvatars: [],
    unreadCount: 0,
    updatedAt: '2026-11-10T06:00:00Z',
  })

  await page.route('**/calendar/items?*', (route) => route.fulfill({ json: { data: items } }))

  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill('author@test.local')
  await page.getByLabel('Password', { exact: true }).fill('password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.goto('/?view=day&day=2026-11-10')

  const groupTile = page.locator('[data-workout-group="enroll-fitness"]')
  await expect(groupTile).toHaveCount(1)
  await expect(groupTile).toContainText('Beginner Core & Strength')
  await expect(groupTile).toContainText('6 exercises · 40 min')
  await expect(groupTile).toContainText('0/6 done')
  await expect(page.getByText('Morning Routine')).toBeVisible()
  await expect(page.getByText('Squats')).toHaveCount(0)

  await groupTile.getByRole('button', { name: 'Show workout' }).click()
  await expect(groupTile.getByText('Warm-up')).toBeVisible()
  await expect(groupTile.getByText('Squats')).toBeVisible()
  await expect(groupTile.getByText('Cool-down')).toBeVisible()
})
