/** Live API: Calendar direct scheduling by touch on phone and tablet (03-UX §5). */
import { test, expect } from '@playwright/test'
import { api, chip, dayIndex, gridStart, monthCell, mouseDrag, plus, setup, today, touchDrag } from './calendar-live-helpers'

test.describe('touch', () => {
  for (const [label, viewport] of [
    ['phone', { width: 390, height: 844 }],
    ['tablet', { width: 820, height: 1180 }],
  ] as const) {
    test(`${label}: tap selects, swipe scrolls, long-press drags to a date and to an hour`, async ({ page, context }) => {
      await page.setViewportSize(viewport)
      const cdp = await context.newCDPSession(page)
      const { acts, add, get } = await setup(page)
      const t = today()
      const d = plus(t, 1)
      const once = (await add(acts[0]!, d, '07:30')).item
      await page.goto(`/calendar?view=month&day=${d}`)
      const badge = page.locator('.calendar-selected-day .calendar-badge').filter({ hasText: acts[0]!.title })
      await expect(badge).toBeVisible()
      const strip = (date: string) => page.locator('.calendar-month-picker button').nth(dayIndex(gridStart(t), date))

      expect(await touchDrag(page, cdp, badge, strip(plus(t, 5)), 40)).toBe(0)
      await page.waitForTimeout(500)
      expect((await get(once.id))!.localDate).toBe(d)

      expect(await touchDrag(page, cdp, badge, strip(plus(t, 5)))).toBe(1)
      await expect.poll(async () => (await get(once.id))!.localDate).toBe(plus(t, 5))
      expect((await get(once.id))!.localTime).toBe('07:30')

      await page.goto(`/calendar?view=month&day=${plus(t, 5)}`)
      await page.locator('.calendar-selected-day .calendar-badge').filter({ hasText: acts[0]!.title }).locator('button').tap()
      await expect(page.locator('.calendar-sheet .calendar-panel__title-link')).toHaveCount(1)

      await page.goto(`/calendar?view=day&day=${plus(t, 5)}`)
      await page.getByLabel('View options').tap()
      await page.getByRole('button', { name: 'All 24h' }).tap()
      await touchDrag(page, cdp, page.locator('.calendar-badge').filter({ hasText: acts[0]!.title }), page.locator('tr[data-slot="10"]'))
      await expect.poll(async () => (await get(once.id))!.localTime).toBe('10:00')
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
    })
  }
})
