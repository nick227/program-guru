/** Live API: doing an Activity inline from the Calendar panel (03-UX §5). */
import { test, expect, type Page } from '@playwright/test'
import { api, setup, today } from './calendar-live-helpers'

/** Schedules today's entries: one whose Activity has a rating metric (1–5), and one more. */
async function seed(page: Page) {
  const ctx = await setup(page)
  const t = today()
  const occurrence = async (id: string) => ctx.data(await page.request.get(`${api}/calendar-items/${id}/occurrence`))
  const all: { id: string; title: string }[] = await ctx.data(await page.request.get(`${api}/activities?source=PLATFORM&limit=30`))
  for (const a of all) {
    const item = (await ctx.add(a, t, '20:00')).item
    const o = await occurrence(item.id)
    const rating = o.resultInputs.find((m: { valueType: string }) => m.valueType !== 'DURATION' && m.valueType !== 'TEXT' && m.valueType !== 'BOOLEAN')
    if (rating) {
      const other = all.find((x) => x.id !== a.id)!
      const second = (await ctx.add(other, t, '21:00')).item
      return { ...ctx, t, activity: a, other, item, second, occurrence }
    }
    await page.request.delete(`${api}/calendar-items/${item.id}?scope=THIS_ONE`)
  }
  throw new Error('No platform Activity with a numeric metric')
}

const exec = (page: Page) => page.locator('.activity-exec')

test.describe('inline @mouse', () => {
  test('Start runs in place; unsaved results are never dropped silently; Resume, Finish and Next', async ({ page }) => {
    const { t, activity, other, item, occurrence } = await seed(page)
    await page.goto(`/calendar?view=day&day=${t}`)
    await page.locator('.calendar-badge').filter({ hasText: activity.title }).locator('button').first().click()
    const url = page.url()
    await page.locator('aside.calendar-panel').getByRole('button', { name: 'Start' }).click()
    await expect(exec(page).locator('.activity-exec__status')).toHaveText(/in progress/i)
    expect(page.url()).toBe(url)
    await expect.poll(async () => (await occurrence(item.id)).session?.status).toBe('ACTIVE')
    expect(Math.round((await page.locator('aside.calendar-panel').boundingBox())!.width)).toBe(480)

    const input = exec(page).locator('[aria-label="Results"] input').first()
    await input.fill('12')
    const guard = page.getByRole('alertdialog', { name: 'Unsaved results' })
    await exec(page).getByRole('button', { name: 'Back' }).click()
    await expect(guard).toBeVisible()
    await guard.getByRole('button', { name: 'Keep editing' }).click()
    await page.keyboard.press('Escape')
    await expect(guard).toBeVisible()
    await guard.getByRole('button', { name: 'Keep editing' }).click()
    await page.locator('.calendar-badge').filter({ hasText: other.title }).locator('button').first().click()
    await expect(guard).toBeVisible()
    // An invalid value is refused with the reason; nothing closes and the value stays.
    await guard.getByRole('button', { name: 'Save and close' }).click()
    await expect(exec(page).locator('[role=alert]').first()).toBeVisible()
    await expect(input).toHaveValue('12')
    await input.fill('4')
    await guard.getByRole('button', { name: 'Save and close' }).click()
    await expect(page.locator('aside.calendar-panel .calendar-panel__title-link')).toContainText(other.title)
    const saved = await occurrence(item.id)
    expect(saved.resultInputs.some((m: { recorded: unknown }) => String(m.recorded) === '4')).toBe(true)
    expect(saved.session?.status).toBe('ACTIVE')

    await page.locator('.calendar-badge').filter({ hasText: activity.title }).locator('button').first().click()
    await page.locator('aside.calendar-panel').getByRole('button', { name: 'Resume' }).click()
    await expect(exec(page).locator('.activity-exec__timer')).toBeVisible()
    const finish = exec(page).getByRole('button', { name: 'Finish', exact: true })
    test.skip(!(await finish.isEnabled()), 'completion is not open yet for this entry')
    await finish.click()
    await expect(exec(page).locator('.activity-exec__done')).toBeVisible()
    await expect.poll(async () => (await occurrence(item.id)).item.status).toBe('DONE')
    await exec(page).getByRole('button', { name: `Next: ${other.title}` }).click()
    await expect(page.locator('aside.calendar-panel .calendar-panel__title-link')).toContainText(other.title)
    await expect(exec(page)).toHaveCount(0)
  })

  test('Month: a 480px drawer while doing an Activity; the grid is never squeezed', async ({ page }) => {
    const { t, other } = await seed(page)
    await page.goto(`/calendar?view=month&day=${t}`)
    await page.locator('.calendar-month-grid .calendar-chip').filter({ hasText: other.title }).locator('button').first().click()
    const col = () => page.evaluate(() => Math.round(document.querySelectorAll('.calendar-month-grid > section')[10]!.getBoundingClientRect().width))
    const before = await col()
    await page.locator('aside.calendar-panel').getByRole('button', { name: 'Start' }).click()
    await expect(exec(page).locator('.activity-exec__timer')).toBeVisible()
    expect(Math.round((await page.locator('aside.calendar-panel').boundingBox())!.width)).toBe(480)
    // The wider execution never squeezes the grid (the docked preview gives way to a drawer).
    expect(await col()).toBeGreaterThanOrEqual(before)
    await exec(page).getByRole('button', { name: 'Back' }).click()
    await expect(exec(page)).toHaveCount(0)
  })
})

test.describe('inline @touch', () => {
  test('phone: a full-height focused sheet, one execution, Back returns to the Calendar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const { t, other, second, occurrence } = await seed(page)
    await page.goto(`/calendar?view=day&day=${t}`)
    await page.locator('.calendar-badge').filter({ hasText: other.title }).locator('button').first().tap()
    await page.locator('.calendar-sheet').getByRole('button', { name: 'Start' }).tap()
    await expect(page.locator('.calendar-sheet .activity-exec__timer')).toBeVisible()
    expect(Math.round((await page.locator('.calendar-sheet').boundingBox())!.height)).toBe(844)
    await expect(exec(page)).toHaveCount(1)
    await expect.poll(async () => (await occurrence(second.id)).session?.status).toBe('ACTIVE')
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
    await exec(page).getByRole('button', { name: 'Back' }).tap()
    await expect(exec(page)).toHaveCount(0)
  })
})
