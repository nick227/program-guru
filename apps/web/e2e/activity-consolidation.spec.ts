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
