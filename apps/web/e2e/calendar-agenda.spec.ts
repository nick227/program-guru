import { test, expect } from '@playwright/test'
import { mockApi } from './fixtures'

test('day agenda sorts start times, stacks simultaneous Activities and separates untimed items', async ({ page }) => {
  await mockApi(page)
  const rows = [
    { id: 'late', title: 'Evening walk', localTime: '18:30', status: 'PLANNED' },
    { id: 'any', title: 'Read a chapter', localTime: null, status: 'PLANNED' },
    { id: 'early', title: 'Morning stretch', localTime: '07:00', status: 'DONE' },
    { id: 'same', title: 'Team check-in', localTime: '07:00', status: 'NOT_PARTICIPATING' },
    { id: 'midnight', title: 'Night journal', localTime: '00:00', status: 'PLANNED' },
  ].map(item => ({ ...item, localDate: '2026-11-09', programTitle: 'Daily routine', participantAvatars: [], unreadCount: 0, locked: false }))
  await page.route('**/calendar/items?*', route => route.fulfill({ json: { data: rows } }))
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill('author@test.local')
  await page.getByLabel('Password', { exact: true }).fill('password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('radio', { name: 'Day', exact: true })).toBeVisible()
  await page.goto('/?view=day&day=2026-11-09')
  const agenda = page.getByRole('list', { name: 'Activities by start time' })
  await expect(agenda.locator('.calendar-agenda__time')).toHaveText(['00:00', '07:00', '18:30', 'Any time'])
  await expect(agenda.locator('.calendar-agenda__slot').nth(1).locator('.calendar-tile')).toHaveCount(2)
  await expect(agenda.locator('.calendar-tile--compact')).toHaveCount(5)
  // Only planned items can be removed from the tile (03-UX §2); finished or declined ones cannot.
  await expect(agenda.getByRole('button', { name: /More actions/ })).toHaveCount(3)
  await expect(agenda.getByRole('button', { name: 'More actions for Morning stretch' })).toHaveCount(0)
  await expect(agenda.getByRole('button', { name: 'More actions for Team check-in' })).toHaveCount(0)
  await expect(agenda.getByRole('button', { name: 'Mark Evening walk complete' })).toBeVisible()
  await expect(agenda.getByRole('button', { name: 'Mark Team check-in complete' })).toHaveCount(0)
  const tiles = await agenda.locator('.calendar-tile').evaluateAll(elements => elements.map(el => el.getBoundingClientRect().toJSON()))
  for (let i = 1; i < tiles.length; i++) expect(tiles[i]!.top).toBeGreaterThanOrEqual(tiles[i - 1]!.bottom)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await agenda.getByRole('link', { name: /Evening walk/ }).click()
  await expect(page).toHaveURL(/\/occurrences\/late/)
})
