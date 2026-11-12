import { test, expect } from '@playwright/test'
import { mockApi } from './fixtures'
import { login } from './journey'

for (const count of [0, 1, 3, 6, 10]) {
  test(`calendar ${count} Activities: geometry, overflow and day navigation`, async ({ page }, info) => {
    await mockApi(page)
    const rows = Array.from({ length: count }, (_, i) => ({
      id: `activity-${i}`, localDate: '2026-11-09', title: `Activity ${i + 1}`,
      programTitle: 'Everyday practice', status: ['PLANNED', 'DONE', 'NOT_PARTICIPATING', 'PLANNED'][i % 4],
      sessionStatus: i === 3 ? 'ACTIVE' : null, activeSeconds: i === 3 ? 125 : null,
      localTime: '09:00', participantAvatars: i === 0 ? ['data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22%3E%3Crect width=%2240%22 height=%2240%22 fill=%22teal%22/%3E%3C/svg%3E'] : [], unreadCount: 0, locked: false,
      groupName: i === 0 ? 'Morning crew' : null, sharedCompletionCount: i === 0 ? 2 : null,
    }))
    await page.route('**/calendar/items?*', route => route.fulfill({ json: { data: rows } }))
    await login(page, 'author@test.local', 'password')
    await page.goto('/calendar?view=month&day=2026-11-09')
    if (info.project.name === 'desktop') {
      await page.setViewportSize({ width: 1800, height: 1100 })
      const grid = page.locator('.calendar-month-grid')
      await expect(grid).toBeVisible()
      await expect(grid.locator('.calendar-tile')).toHaveCount(Math.min(count, 4))
      const sizes = await grid.locator('.calendar-month-cell').evaluateAll(cells => cells.slice(7, 14).map(c => ({ height: c.getBoundingClientRect().height, width: c.getBoundingClientRect().width })))
      expect(new Set(sizes.map(s => s.height)).size).toBe(1)
      expect(sizes[0]!.height).toBeGreaterThanOrEqual(sizes[0]!.width - 2)
      await expect(grid.getByText('CUSTOM', { exact: true })).toHaveCount(0)
      await expect(grid.getByText('Planned', { exact: true })).toHaveCount(0)
      if (count) {
        const tile = grid.locator('.calendar-tile').first()
        await expect(tile).toHaveCSS('display', 'grid')
        const action = await tile.locator('.calendar-tile__complete').boundingBox()
        const link = await tile.locator('.calendar-tile__link').boundingBox()
        expect(action!.x).toBeGreaterThan(link!.x)
        expect(action!.y).toBeLessThan(link!.y + 10)
      }
      if (count === 10) await page.screenshot({ path: '/tmp/calendar-month-10.png', fullPage: true })
      if (count > 4) await grid.getByRole('button', { name: `+${count - 4} more` }).click()
      else await grid.getByRole('button', { name: /^Mon 9(?:,|$)/ }).click()
    } else {
      await page.locator('.calendar-month-picker').getByRole('button', { name: /^Mon 9(?:,|$)/ }).click()
    }
    await expect(page).toHaveURL(/view=day/)
    await expect(page.locator('.calendar-tile--day')).toHaveCount(count)
    if (count) {
      await expect(page.getByText('Morning crew')).toBeVisible()
      await expect(page.getByText('2 shared completions')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Mark Activity 1 complete', exact: true })).toBeVisible()
    }
    if (count >= 3) await expect(page.getByRole('button', { name: 'Mark Activity 3 complete' })).toHaveCount(0)
    if (count >= 6) {
      await expect(page.getByRole('link', { name: /Activity 4, Everyday practice, In progress/ })).toBeVisible()
      await expect(page.locator('.calendar-tile__status')).toHaveCount(0)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}

test('failed quick completion stays pending and preserves its retry key', async ({ page }) => {
  const { requests } = await mockApi(page, { calendarItem: true, calendarDate: '2026-11-09', finishFailure: true })
  await login(page, 'participant@test.local', 'password')
  await page.goto('/calendar?view=day&day=2026-11-09')
  const complete = page.getByRole('button', { name: 'Mark Squats complete' })
  await complete.click()
  await expect(page.getByText('Could not confirm completion')).toBeVisible()
  await expect(page.getByText('Activity marked complete', { exact: true })).toHaveCount(0)
  await expect(complete).toBeEnabled()
  await complete.click()
  await expect.poll(() => requests.filter(r => r.path.endsWith('/actions')).length).toBe(2)
  const creates = requests.filter(r => r.path === '/sessions')
  expect(creates[0]!.body.idempotencyKey).toBe(creates[1]!.body.idempotencyKey)
})

test('calendar defaults to Day, toggles Month, and exposes Pages menu in main header', async ({ page }) => {
  await mockApi(page, { calendarItem: true, calendarDate: '2026-11-09' })
  await login(page, 'participant@test.local', 'password')
  await page.goto('/?day=2026-11-09')
  await expect(page.locator('.calendar-tile--day')).toHaveCount(1)
  const allHoursToggle = page.getByRole('button', { name: 'All hours', exact: true })
  await expect(allHoursToggle).toBeVisible()
  const monthToggle = page.getByRole('button', { name: 'Month', exact: true })
  await expect(monthToggle).toHaveAttribute('aria-pressed', 'false')
  await monthToggle.click()
  await expect(page).toHaveURL(/view=month/)
  await expect(monthToggle).toHaveAttribute('aria-pressed', 'true')
  // All three toolbar controls stay visible on Month view, and All hours still toggles
  await expect(allHoursToggle).toBeVisible()
  await expect(page.locator('.calendar-filter__trigger')).toBeVisible()
  await allHoursToggle.click()
  await expect(page.getByRole('button', { name: 'All 24h', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await monthToggle.click()
  await expect(page).toHaveURL(/view=day/)
  await expect(page.getByRole('button', { name: 'All 24h', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.locator('.calendar-tile__link').click()
  await expect(page).toHaveURL(/\/occurrences\//)

  // Pages menu in main header reveals sitewide pages
  await page.getByRole('button', { name: /Pages menu/ }).click()
  const nav = page.getByRole('navigation', { name: 'Workspace navigation' })
  await expect(nav.getByRole('link', { name: 'Calendar', exact: true })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Community', exact: true })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Programs', exact: true })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Add Program', exact: true })).toBeVisible()
})
