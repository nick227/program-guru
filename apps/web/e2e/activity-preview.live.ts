/**
 * Live API: the shared Activity preview controller (consolidation MR 3) on its three surfaces —
 * the Calendar panel, the Community drawer and Home's inline preview. Each keeps its own layout;
 * all show the same summary, the same owner-only Manage, and participation that reflects the
 * person's real state (Resume while running, Done after completing).
 */
import { test, expect, type Page } from '@playwright/test'
import { api, setup, today } from './calendar-live-helpers'

type Activity = { id: string; title: string; summary: string | null }

async function seed(page: Page) {
  const ctx = await setup(page)
  const platform: Activity[] = await ctx.data(await page.request.get(`${api}/activities?source=PLATFORM&limit=6`))
  const source = platform.find((a) => a.summary) ?? platform[0]!
  const copy: Activity & { canEdit: boolean } = await ctx.data(
    await page.request.post(`${api}/activities/${source.id}/copy`, { data: { newTitle: `Mine ${crypto.randomUUID().slice(0, 6)}` } }),
  )
  return { ...ctx, source, copy }
}

test.describe('preview @mouse', () => {
  test('Calendar panel: summary from the Activity; Manage only for the owner, opening its editor', async ({ page }) => {
    const { add, source, copy } = await seed(page)
    const t = today()
    await add(copy, t, '22:00')
    await add(source, t, '22:30')
    await page.goto(`/calendar?view=day&day=${t}`)
    const panel = page.locator('aside.calendar-panel')

    await page.locator('.calendar-badge').filter({ hasText: copy.title }).locator('button').first().click()
    await expect(panel.locator('.calendar-panel__title-link')).toContainText(copy.title)
    const manage = panel.getByRole('link', { name: 'Manage Activity' })
    await expect(manage).toHaveAttribute('href', /edit=1/)

    await page.locator('.calendar-badge').filter({ hasText: source.title }).locator('button').first().click()
    await expect(panel.locator('.calendar-panel__title-link')).toContainText(source.title)
    await expect(panel.getByRole('link', { name: 'Manage Activity' })).toHaveCount(0)
    if (source.summary) await expect(panel.locator('.calendar-panel__description')).toHaveText(source.summary.trim())

    // Manage opens the Activity page in its editor.
    await page.locator('.calendar-badge').filter({ hasText: copy.title }).locator('button').first().click()
    await panel.getByRole('link', { name: 'Manage Activity' }).click()
    await expect(page).toHaveURL(/edit=1/)
    await expect(page.getByRole('button', { name: 'Edit Activity', pressed: true })).toBeVisible()
  })

  test('Community drawer: same summary, no Manage for a platform Activity; Resume while running, Done after', async ({ page }) => {
    const { add, data, source } = await seed(page)
    const item = (await add(source, today(), '22:00')).item
    const open = async () => {
      await page.goto(`/browse?kind=activities&q=${encodeURIComponent(source.title)}`)
      await page.getByRole('button', { name: `Quick preview: ${source.title}` }).first().click()
      return page.getByRole('dialog').filter({ hasText: source.title }).last()
    }
    let drawer = await open()
    if (source.summary) await expect(drawer.getByText(source.summary.trim(), { exact: true })).toBeVisible()
    await expect(drawer.getByRole('link', { name: 'Manage' })).toHaveCount(0)

    const session = await data(await page.request.post(`${api}/sessions`, { data: { calendarItemId: item.id, idempotencyKey: crypto.randomUUID() } }))
    await page.request.post(`${api}/sessions/${session.id}/actions`, { data: { action: 'START', expectedRevision: session.revision } })
    drawer = await open()
    // Community has no inline execution, so Resume links to the occurrence page.
    await expect(drawer.getByRole('link', { name: 'Resume' })).toHaveAttribute('href', new RegExp(`/occurrences/${item.id}`))

    const running = await data(await page.request.get(`${api}/calendar-items/${item.id}/occurrence`))
    await page.request.post(`${api}/sessions/${session.id}/actions`, { data: { action: 'FINISH', expectedRevision: running.session.revision } })
    drawer = await open()
    await expect(drawer.locator('[data-participation-status="COMPLETED"], [data-participation-status="SCHEDULED"]')).toContainText(/Done/)
  })

  test("Home inline preview: the controller's summary and participation; no Manage for a platform Activity", async ({ page }) => {
    await seed(page)
    await page.goto('/')
    await page.getByRole('button', { name: /^(Something else|Try something else)$/ }).first().click()
    await page.getByRole('button', { name: 'Explore Activities' }).click()
    await page.getByRole('button', { name: '30+ minutes' }).click()
    await page.getByRole('button', { name: 'Surprise me' }).click()
    const previewButton = page.getByRole('button', { name: /^Preview / }).first()
    const title = (await previewButton.getAttribute('aria-label'))!.replace(/^Preview /, '')
    await previewButton.click()
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
    const all: Activity[] = await (await page.request.get(`${api}/activities?source=PLATFORM&limit=100`)).json().then((r) => r.data)
    const shown = all.find((a) => a.title === title)
    if (shown?.summary) await expect(page.getByText(shown.summary.trim(), { exact: true })).toBeVisible()
    await expect(page.locator('[data-participation-status]').first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Manage' })).toHaveCount(0)
  })
})
