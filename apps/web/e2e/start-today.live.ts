/**
 * Live API: Start now has one rule on every surface (consolidation MR 5, lib/startToday): reuse
 * today's planned personal entry of the Activity, else add one, and never add a second on a repeat.
 * Each surface opens it its own way: Home in its stage, the Community drawer at the occurrence page.
 */
import { test, expect } from '@playwright/test'
import { api, setup, today } from './calendar-live-helpers'

test.describe('start today @mouse', () => {
  test('Community drawer: Start now adds one entry, a second Start now reuses it', async ({ page }) => {
    const { acts, list } = await setup(page)
    const activity = acts[0]!
    const mine = async () => (await list(today(), today())).filter((i) => i.activityId === activity.id)
    const startFromDrawer = async () => {
      await page.goto(`/browse?kind=activities&q=${encodeURIComponent(activity.title)}`)
      await page.getByRole('button', { name: `Quick preview: ${activity.title}` }).first().click()
      const drawer = page.getByRole('dialog').filter({ hasText: activity.title }).last()
      await drawer.getByRole('button', { name: 'Start now' }).click()
      await expect(page).toHaveURL(/\/occurrences\/[0-9a-f-]{36}/)
      return new URL(page.url()).pathname.split('/').pop()!
    }
    const first = await startFromDrawer()
    expect((await mine()).map((i) => i.id)).toEqual([first])
    const second = await startFromDrawer()
    expect(second).toBe(first)
    expect(await mine()).toHaveLength(1)
  })

  test("Home: Start now reuses today's planned entry and opens it in Home's stage", async ({ page }) => {
    const { add, list } = await setup(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Do something now' }).click()
    await page.getByRole('button', { name: '30+ minutes' }).click()
    await page.getByRole('button', { name: 'Surprise me' }).click()
    const previewButton = page.getByRole('button', { name: /^Preview / }).first()
    const title = (await previewButton.getAttribute('aria-label'))!.replace(/^Preview /, '')
    const all: { id: string; title: string }[] = await (await page.request.get(`${api}/activities?source=PLATFORM&limit=100`)).json().then((r) => r.data)
    const activity = all.find((a) => a.title === title)!
    const planned = (await add(activity, today(), null)).item

    await previewButton.click()
    const agent = page.locator('section[aria-labelledby="home-agent-title"]')
    await agent.getByRole('button', { name: 'Start now' }).first().click()
    await expect(page.locator('.activity-exec')).toHaveClass(/activity-exec--stage/)
    await expect(page.locator('.activity-exec h2')).toHaveText(title)
    expect(new URL(page.url()).pathname).toBe('/')
    expect((await list(today(), today())).filter((i) => i.activityId === activity.id).map((i) => i.id)).toEqual([planned.id])
  })
})
