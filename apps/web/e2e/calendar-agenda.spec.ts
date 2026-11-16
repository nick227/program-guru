import { test, expect } from '@playwright/test'
import { mockApi } from './fixtures'

const plusDays = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Mouse drag through real pointer moves (the Calendar's drag starts after 6px; 03-UX §5). */
async function mouseDrag(page: import('@playwright/test').Page, from: import('@playwright/test').Locator, to: import('@playwright/test').Locator) {
  await from.scrollIntoViewIfNeeded()
  const a = (await from.boundingBox())!
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 3 })
  await to.scrollIntoViewIfNeeded()
  const b = (await to.boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 })
  await page.mouse.up()
}

test('day view: Any time first, focused and all 24 hours, drag to an hour and back to Any time, select without navigating', async ({ page }, info) => {
  await mockApi(page)
  // A future date: drops are refused on past dates (03-UX §5).
  const day = plusDays(3)
  const rows = [
    { id: 'late', title: 'Evening walk', localTime: '18:30', status: 'PLANNED' },
    { id: 'any', title: 'Read a chapter', localTime: null, status: 'PLANNED' },
    { id: 'early', title: 'Morning stretch', localTime: '07:00', status: 'DONE' },
    { id: 'same', title: 'Team check-in', localTime: '07:00', status: 'NOT_PARTICIPATING' },
    { id: 'midnight', title: 'Night journal', localTime: '00:00', status: 'PLANNED' },
  ].map((item) => ({
    ...item,
    localDate: day,
    programTitle: 'Daily routine',
    participantAvatars: [],
    unreadCount: 0,
    locked: false,
    recurrenceId: null,
    gatheringId: null,
    updatedAt: '2026-11-09T06:00:00Z',
  }))
  const patches: { id: string; body: Record<string, unknown> }[] = []

  await page.route('**/calendar/items?*', (route) => route.fulfill({ json: { data: rows } }))
  await page.route('**/calendar-items/*', async (route) => {
    const req = route.request()
    if (req.method() !== 'PATCH') return route.fallback()
    const id = req.url().split('/').pop()!
    const body = req.postDataJSON() as { localTime?: string | null }
    patches.push({ id, body })
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
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
  await page.goto(`/calendar?view=day&day=${day}`)

  const table = page.getByRole('table', { name: 'Day schedule' })
  await expect(table).toBeVisible()
  const [tableBox, containerBox] = await Promise.all([table.boundingBox(), page.locator('.calendar-selected-day').boundingBox()])
  expect(tableBox!.width).toBeGreaterThanOrEqual(containerBox!.width - 2)

  // Focused (default): Any time plus the populated hours 00, 07 and 18.
  await expect(table.locator('tbody tr[data-slot]')).toHaveCount(4)

  // All 24h from the View menu: the day starts at its earliest entry (midnight here), so 25 slots.
  await page.getByLabel('View options').click()
  await page.getByRole('button', { name: 'All 24h', exact: true }).click()
  const slots = table.locator('tbody tr[data-slot]')
  await expect(slots).toHaveCount(25)
  await expect(slots.nth(0)).toHaveAttribute('data-slot', 'anytime')
  await expect(slots.nth(0).locator('.calendar-day-table__time')).toHaveText('Any time')
  await expect(slots.nth(1)).toHaveAttribute('data-slot', '00')
  await expect(slots.nth(1).locator('.calendar-day-table__time')).toContainText('12:00 AM')
  await expect(slots.nth(24)).toHaveAttribute('data-slot', '23')

  // Entries sit in their rows; cards stay quiet (no overflow menus or status badges).
  await expect(slots.nth(0).locator('article[data-item-id="any"]')).toHaveCount(1)
  await expect(table.locator('tr[data-slot="00"] article[data-item-id]')).toHaveCount(1)
  await expect(table.locator('tr[data-slot="07"] article[data-item-id]')).toHaveCount(2)
  await expect(table.locator('tr[data-slot="18"] article[data-item-id]')).toHaveCount(1)
  await expect(table.getByRole('button', { name: /More actions/ })).toHaveCount(0)
  await expect(table.locator('.calendar-tile__status')).toHaveCount(0)
  // Generous geometry: 44px cards, 88px+ hour rows (03-UX §5).
  expect(Math.round((await table.locator('article[data-item-id="late"]').boundingBox())!.height)).toBeGreaterThanOrEqual(44)
  expect(Math.round((await table.locator('tr[data-slot="05"]').boundingBox())!.height)).toBeGreaterThanOrEqual(88)

  if (info.project.name === 'desktop') {
    // Drag "Read a chapter" from Any time to 2 AM, then back to Any time (mouse; touch is in the live suite).
    await mouseDrag(page, table.locator('article[data-item-id="any"]'), table.locator('tr[data-slot="02"]'))
    await expect(table.locator('tr[data-slot="02"] article[data-item-id="any"]')).toBeVisible()
    expect(patches.at(-1)).toEqual({ id: 'any', body: expect.objectContaining({ localTime: '02:00' }) })
    await mouseDrag(page, table.locator('article[data-item-id="any"]'), slots.nth(0))
    await expect(slots.nth(0).locator('article[data-item-id="any"]')).toBeVisible()
    expect(patches.at(-1)).toEqual({ id: 'any', body: expect.objectContaining({ localTime: null }) })
    // A completed entry does not move.
    const before = patches.length
    await mouseDrag(page, table.locator('article[data-item-id="early"]'), table.locator('tr[data-slot="09"]'))
    await page.waitForTimeout(300)
    expect(patches.length).toBe(before)
  }

  // Clicking an entry selects it (opens its details) and never navigates.
  const url = page.url()
  await table.locator('article[data-item-id="late"] button').first().click()
  await expect(table.locator('article[data-item-id="late"]')).toHaveClass(/calendar-badge--selected/)
  expect(page.url()).toBe(url)
  // Phones show the details as a sheet; close it before using the toolbar.
  if (info.project.name !== 'desktop') await page.locator('.calendar-sheet').getByRole('button', { name: 'Close activity details' }).click()

  // The date heading opens the date picker and switches day.
  const next = plusDays(4)
  const nextLabel = new Date(`${next}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  await page.getByRole('button', { name: /^Change date/ }).click()
  const picker = page.getByRole('dialog', { name: 'Choose a date' })
  await expect(picker).toBeVisible()
  if (next.slice(0, 7) !== day.slice(0, 7)) await picker.getByRole('button', { name: /Next month/ }).click()
  await picker.getByRole('button', { name: nextLabel }).click()
  await expect(page).toHaveURL(new RegExp(`day=${next}`))
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
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
  await page.getByLabel('Domain').selectOption('00000000-0000-4000-8000-000000000003')
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
  await page.goto('/calendar?view=day&day=2026-11-10')

  // Day: one expandable card for the GROUPED workout; the SEPARATE Program stays its own card.
  const groupTile = page.locator('[data-workout-group="enroll-fitness"]')
  await expect(groupTile).toHaveCount(1)
  await expect(groupTile).toContainText('Beginner Core & Strength')
  await expect(groupTile).toContainText('0/6')
  const dayTable = page.getByRole('table', { name: 'Day schedule' })
  await expect(dayTable.getByText('Morning Routine')).toBeVisible()
  await expect(dayTable.getByText('Squats')).toHaveCount(0)
  await groupTile.locator('button[aria-expanded]').first().click()
  await expect(groupTile.getByText('Warm-up')).toBeVisible()
  await expect(groupTile.getByText('Squats')).toBeVisible()
  await expect(groupTile.getByText('Cool-down')).toBeVisible()

  // Month (desktop grid): the workout is one 44px card; its exercises open over the cell, which
  // keeps its fixed height (03-UX §5).
  if (test.info().project.name === 'desktop') {
    await page.goto('/calendar?view=month&day=2026-11-10')
    const grid = page.locator('.calendar-month-grid')
    await expect(grid).toBeVisible()
    const card = grid.locator('[data-workout-group="enroll-fitness"]')
    await expect(card).toHaveCount(1)
    expect(Math.round((await card.boundingBox())!.height)).toBe(44)
    const cell = grid.locator('section').filter({ has: page.locator('[data-workout-group="enroll-fitness"]') })
    const heights = () => grid.evaluate((g) => [...new Set([...g.querySelectorAll('section')].map((c) => Math.round(c.getBoundingClientRect().height)))])
    expect(await heights()).toEqual([216])
    await card.getByRole('button', { name: /Beginner Core & Strength/ }).click()
    const overlay = cell.getByRole('dialog', { name: /Beginner Core & Strength, 6 exercises/ })
    await expect(overlay).toBeVisible()
    await expect(overlay.locator('.calendar-chip')).toHaveCount(6)
    expect(await heights()).toEqual([216])
    await page.keyboard.press('Escape')
    await expect(overlay).toHaveCount(0)
  }
})
