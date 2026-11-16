import { test, expect } from '@playwright/test'
import { setup } from './participant-activity-fixture'
import { itemId } from './fixtures'

test('Calendar detail and session links retain the selected occurrence and return date', async ({ page }) => {
  const { o } = await setup(page, { social: true })
  const calendarUrl = `/calendar?view=day&day=${o.item.localDate}`
  await page.goto(calendarUrl)
  await page.locator(`article[data-item-id="${itemId}"]`).click()
  const session = page.getByRole('link', { name: 'Open session', exact: true })
  await expect(session).toHaveAttribute('href', `/occurrences/${itemId}?returnTo=${encodeURIComponent(calendarUrl)}`)
  await session.click()
  await expect(page.getByRole('region', { name: 'Your session', exact: true })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/occurrences/${itemId}`))
})

test('Calendar inline execution protects dirty results when opening the Activity page', async ({ page }) => {
  const { o, calls } = await setup(page, { timed: true })
  await page.goto(`/calendar?view=day&day=${o.item.localDate}`)
  await page.locator(`article[data-item-id="${itemId}"]`).click()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  const execution = page.locator('.activity-exec')
  await expect(execution.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
  await execution.getByLabel('Reps (reps)', { exact: true }).fill('12')
  await execution.getByRole('button', { name: 'Open Activity Page' }).click()
  const guard = page.getByRole('alertdialog', { name: 'Unsaved results' })
  await expect(guard).toBeVisible()
  await guard.getByRole('button', { name: 'Keep editing' }).click()
  await expect(execution.getByLabel('Reps (reps)', { exact: true })).toHaveValue('12')
  await execution.getByRole('button', { name: 'Open Activity Page' }).click()
  await guard.getByRole('button', { name: 'Save and close' }).click()
  await expect(page).toHaveURL(new RegExp(`/occurrences/${itemId}`))
  expect(calls.find(c => c.path.endsWith('/results') && c.method === 'POST')?.body.values[0].value).toBe(12)
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
})

test('Home uses the shared execution controls and protects closing dirty results', async ({ page }) => {
  const { o } = await setup(page, { timed: true })
  o.item.localDate = new Date().toLocaleDateString('en-CA')
  o.item.enrollmentId = null
  await page.route('http://localhost:3001/calendar/items?*', route => route.fulfill({ json: { data: [o.item] } }))
  await page.goto('/')
  const agent = page.locator('section[aria-labelledby="home-agent-title"]')
  await agent.getByRole('button', { name: /^(Start now|Start)$/ }).first().click()
  const execution = page.locator('.activity-exec--stage')
  await expect(execution).toBeVisible()
  await execution.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(execution.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
  await execution.getByLabel('Reps (reps)', { exact: true }).fill('9')
  await execution.getByRole('button', { name: 'Close', exact: true }).click()
  const guard = page.getByRole('alertdialog', { name: 'Unsaved results' })
  await expect(guard).toBeVisible()
  await guard.getByRole('button', { name: 'Keep editing' }).click()
  await expect(execution.getByLabel('Reps (reps)', { exact: true })).toHaveValue('9')
  await execution.getByRole('button', { name: 'Finish', exact: true }).click()
  await expect(execution.getByRole('button', { name: 'Undo', exact: true })).toBeVisible()
  await expect(page).toHaveURL('/')
})
