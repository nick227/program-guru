/**
 * Live API: Home's inline Activity execution, now the shared ActivityExecution in Home's stage
 * layout (03-UX §2a, §5). Verified separately from the Calendar's panel layout.
 */
import { test, expect, type Page } from '@playwright/test'
import { api, setup, today } from './calendar-live-helpers'

/** Today: one entry whose Activity has a numeric (rating) metric, so Home's opening turn leads with it. */
async function seed(page: Page) {
  const ctx = await setup(page)
  const t = today()
  const occurrence = async (id: string) => ctx.data(await page.request.get(`${api}/calendar-items/${id}/occurrence`))
  const all: { id: string; title: string }[] = await ctx.data(await page.request.get(`${api}/activities?source=PLATFORM&limit=30`))
  for (const a of all) {
    const item = (await ctx.add(a, t, '23:30')).item
    const o = await occurrence(item.id)
    if (o.resultInputs.some((m: { valueType: string }) => !['DURATION', 'TEXT', 'BOOLEAN'].includes(m.valueType))) return { ...ctx, t, activity: a, item, occurrence }
    await page.request.delete(`${api}/calendar-items/${item.id}?scope=THIS_ONE`)
  }
  throw new Error('No platform Activity with a numeric metric')
}

const exec = (page: Page) => page.locator('.activity-exec')

test.describe('home @mouse', () => {
  test("Start now opens Home's stage; the guard covers Back, Close and Start over; Finish → Next suggestion", async ({ page }) => {
    const { activity, item, occurrence } = await seed(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Start now' }).first().click()
    await expect(exec(page)).toHaveClass(/activity-exec--stage/)
    await expect(exec(page).locator('h2')).toHaveText(activity.title)
    await expect(exec(page).locator('h2')).toHaveClass(/text-2xl/)
    expect(new URL(page.url()).pathname).toBe('/')
    // Home's stage: centered, at most 620px; the hero spans it.
    const stage = (await exec(page).boundingBox())!
    expect(Math.round(stage.width)).toBeLessThanOrEqual(620)
    const hero = exec(page).locator('.activity-exec__hero')
    if (await hero.count()) expect(Math.round((await hero.boundingBox())!.width)).toBeGreaterThanOrEqual(Math.round(stage.width) - 2 * 20 - 2)

    await exec(page).getByRole('button', { name: 'Start', exact: true }).click()
    await expect(exec(page).locator('.activity-exec__status')).toHaveText(/in progress/i)
    await expect.poll(async () => (await occurrence(item.id)).session?.status).toBe('ACTIVE')

    const input = exec(page).locator('[aria-label="Results"] input').first()
    await input.fill('4')
    const guard = page.getByRole('alertdialog', { name: 'Unsaved results' })
    await exec(page).getByRole('button', { name: 'Back' }).click()
    await expect(guard).toBeVisible()
    await guard.getByRole('button', { name: 'Keep editing' }).click()
    await exec(page).getByRole('button', { name: 'Close', exact: true }).click()
    await expect(guard).toBeVisible()
    await guard.getByRole('button', { name: 'Keep editing' }).click()
    // Start over (Home's reset) also asks before dropping unsaved results.
    await page.getByRole('button', { name: 'Start over' }).click()
    await expect(guard).toBeVisible()
    await guard.getByRole('button', { name: 'Save and close' }).click()
    await expect(exec(page)).toHaveCount(0)
    const saved = await occurrence(item.id)
    expect(saved.resultInputs.some((m: { recorded: unknown }) => String(m.recorded) === '4')).toBe(true)
    expect(saved.session?.status).toBe('ACTIVE')

    // Back on Home, the same entry resumes into the same running session.
    await page.goto('/')
    await page.getByRole('button', { name: /^(Start now|Resume)$/ }).first().click()
    await expect(exec(page).locator('.activity-exec__timer')).toBeVisible()
    const finish = exec(page).getByRole('button', { name: 'Finish', exact: true })
    test.skip(!(await finish.isEnabled()), 'completion is not open yet for this entry')
    await finish.click()
    await expect(exec(page).locator('.activity-exec__done')).toBeVisible()
    await expect.poll(async () => (await occurrence(item.id)).item.status).toBe('DONE')
    await exec(page).getByRole('button', { name: 'Next suggestion' }).click()
    await expect(exec(page)).toHaveCount(0)
    expect(new URL(page.url()).pathname).toBe('/')
  })
})

test.describe('home @touch', () => {
  test('phone: Start now opens the stage, Start runs, Close returns to Home; no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const { item, occurrence } = await seed(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Start now' }).first().tap()
    await expect(exec(page)).toHaveClass(/activity-exec--stage/)
    await exec(page).getByRole('button', { name: 'Start', exact: true }).tap()
    await expect.poll(async () => (await occurrence(item.id)).session?.status).toBe('ACTIVE')
    await expect(exec(page)).toHaveCount(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
    await exec(page).getByRole('button', { name: 'Close', exact: true }).tap()
    await expect(exec(page)).toHaveCount(0)
  })
})
