/** Live API: bulk Calendar management — select, Move, Remove, Undo, partial failure (03-UX §5). */
import { test, expect, type Page } from '@playwright/test'
import { api, chip, monthCell, mouseDrag, plus, setup, today } from './calendar-live-helpers'

const bar = (page: Page) => page.getByRole('toolbar', { name: 'Selected Activities' })
const startSelecting = async (page: Page) => {
  await page.getByLabel('View options').click()
  await page.getByRole('button', { name: 'Select Activities' }).click()
  await expect(bar(page)).toBeVisible()
}

test.describe('bulk @mouse and keyboard', () => {
  test('selection mode toggles without opening, navigating, dragging or quick-adding; Shift-click and Select day', async ({ page }) => {
    const { acts, add, get } = await setup(page)
    const t = today()
    const a = (await add(acts[0]!, plus(t, 2), '07:30')).item
    const b = (await add(acts[1]!, plus(t, 3), '09:00')).item
    const c = (await add(acts[2]!, plus(t, 5), null)).item
    await page.goto(`/calendar?view=month&day=${t}`)
    await expect(chip(page, acts[0]!.title)).toBeVisible()
    await startSelecting(page)
    const url = page.url()

    await chip(page, acts[0]!.title).locator('button').first().click()
    await expect(bar(page)).toContainText('1 selected')
    await expect(page.locator('aside.calendar-panel .calendar-panel__title-link')).toHaveCount(0)
    expect(page.url()).toBe(url)

    // Shift-click selects the range in date/time order (a, b, c).
    await chip(page, acts[2]!.title).locator('button').first().click({ modifiers: ['Shift'] })
    await expect(bar(page)).toContainText('3 selected')

    // Keyboard: focus a card and press Space to toggle it off.
    await chip(page, acts[1]!.title).locator('button').first().focus()
    await page.keyboard.press('Space')
    await expect(bar(page)).toContainText('2 selected')

    // The date mark selects that day instead of opening Day view; empty space does not quick-add.
    await monthCell(page, plus(t, 3)).locator('.calendar-month-cell__date').click()
    await expect(bar(page)).toContainText('3 selected')
    expect(page.url()).toBe(url)
    const box = (await monthCell(page, plus(t, 9)).boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 24)
    await expect(page.locator('.calendar-inline-picker')).toHaveCount(0)

    // Nothing drags while selecting.
    expect(await mouseDrag(page, chip(page, acts[0]!.title), monthCell(page, plus(t, 8)))).toBe(0)
    expect((await get(a.id))!.localDate).toBe(plus(t, 2))

    // Escape leaves selection mode.
    await page.keyboard.press('Escape')
    await expect(bar(page)).toHaveCount(0)
    expect([(await get(b.id))!.localDate, (await get(c.id))!.localDate]).toEqual([plus(t, 3), plus(t, 5)])
  })

  test('Move keeps relative dates and times; Undo puts them back; a single day lands on the chosen date', async ({ page }) => {
    const { acts, add, get } = await setup(page)
    const t = today()
    const a = (await add(acts[0]!, plus(t, 2), '07:30')).item
    const b = (await add(acts[1]!, plus(t, 4), '18:00')).item
    await page.goto(`/calendar?view=month&day=${t}`)
    await startSelecting(page)
    await chip(page, acts[0]!.title).locator('button').first().click()
    await chip(page, acts[1]!.title).locator('button').first().click()
    await bar(page).getByRole('button', { name: 'Move', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: /^Move 2 Activities/ })
    const target = plus(t, 6)
    const label = new Date(`${target}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    if (target.slice(0, 7) !== t.slice(0, 7)) await dialog.getByRole('button', { name: /Next month/ }).click()
    await dialog.getByRole('button', { name: label }).click()
    await expect(dialog).toContainText('(+4 days)')
    await dialog.getByRole('button', { name: 'Move 2' }).click()
    await expect.poll(async () => [(await get(a.id))!.localDate, (await get(b.id))!.localDate]).toEqual([plus(t, 6), plus(t, 8)])
    expect([(await get(a.id))!.localTime, (await get(b.id))!.localTime]).toEqual(['07:30', '18:00'])
    await expect(bar(page)).toHaveCount(0)
    await page.locator('[data-sonner-toast]').filter({ hasText: 'Moved 2' }).getByRole('button', { name: 'Undo' }).click()
    await expect.poll(async () => [(await get(a.id))!.localDate, (await get(b.id))!.localDate]).toEqual([plus(t, 2), plus(t, 4)])
  })

  test('Remove skips completed entries, removes only that occurrence of a series, leaves a gathering; Undo restores the same entries', async ({ page }) => {
    const { acts, add, list, data } = await setup(page)
    const t = today()
    const done = (await add(acts[0]!, t, '06:00')).item
    const s = await data(await page.request.post(`${api}/sessions`, { data: { calendarItemId: done.id, idempotencyKey: crypto.randomUUID() } }))
    await page.request.post(`${api}/sessions/${s.id}/actions`, { data: { action: 'FINISH', expectedRevision: 0 } })
    await add(acts[1]!, plus(t, 2), '18:00', { recurrence: { kind: 'DAILY' }, untilDate: plus(t, 4) })
    const g = (await add(acts[2]!, plus(t, 2), '10:00')).item
    await page.request.post(`${api}/activities/${acts[2]!.id}/gatherings`, {
      data: { localDate: plus(t, 2), localTime: '10:00', calendarItemId: g.id, idempotencyKey: crypto.randomUUID() },
    })
    await page.goto(`/calendar?view=month&day=${t}`)
    await expect(chip(page, acts[1]!.title)).toBeVisible()
    await startSelecting(page)
    await monthCell(page, t).locator('.calendar-month-cell__date').click()
    await monthCell(page, plus(t, 2)).locator('.calendar-month-cell__date').click()
    await expect(bar(page)).toContainText('3 selected')
    await bar(page).getByRole('button', { name: 'Remove' }).click()
    const dialog = page.getByRole('dialog', { name: /^Remove 2 Activities from Calendar/ })
    await expect(dialog).toContainText('1 will stay as they are (1 completed)')
    await expect(dialog).toContainText('only this occurrence')
    await expect(dialog).toContainText('in a gathering will leave it')
    const before = (await list(t, plus(t, 6))).map((i) => i.id).sort()
    await dialog.getByRole('button', { name: 'Remove 2' }).click()
    const ids = async () => (await list(t, plus(t, 6))).map((i) => i.id).sort()
    await expect.poll(async () => (await ids()).length).toBe(before.length - 2)
    const after = await list(t, plus(t, 6))
    expect(after.find((i) => i.id === done.id)!.status).toBe('DONE')
    expect(after.filter((i) => i.recurrenceId).map((i) => i.localDate).sort()).toEqual([plus(t, 3), plus(t, 4)])
    await page.locator('[data-sonner-toast]').filter({ hasText: 'Removed 2' }).getByRole('button', { name: 'Undo' }).click()
    await expect.poll(ids).toEqual(before)
  })

  test('a partial failure reports which entries failed and keeps only those selected', async ({ page }) => {
    const { acts, add, get } = await setup(page)
    const t = today()
    const a = (await add(acts[0]!, plus(t, 2), '07:30')).item
    const b = (await add(acts[1]!, plus(t, 2), '09:00')).item
    await page.goto(`/calendar?view=month&day=${t}`)
    await expect(chip(page, acts[1]!.title)).toBeVisible()
    await startSelecting(page)
    await monthCell(page, plus(t, 2)).locator('.calendar-month-cell__date').click()
    // b changes elsewhere after the page loaded: its version check will refuse the move.
    await page.request.patch(`${api}/calendar-items/${b.id}`, { data: { localTime: '09:15', expectedUpdatedAt: b.updatedAt } })
    await bar(page).getByRole('button', { name: 'Move', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: /^Move 2 Activities/ })
    const target = plus(t, 3)
    const label = new Date(`${target}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    if (target.slice(0, 7) !== t.slice(0, 7)) await dialog.getByRole('button', { name: /Next month/ }).click()
    await dialog.getByRole('button', { name: label }).click()
    await dialog.getByRole('button', { name: 'Move 2' }).click()
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /1 could not be moved/ })).toContainText(acts[1]!.title)
    expect((await get(a.id))!.localDate).toBe(plus(t, 3))
    expect((await get(b.id))!.localDate).toBe(plus(t, 2))
    await expect(bar(page)).toContainText('1 selected')
  })
})

test.describe('bulk @touch', () => {
  test('phone: tap to select, Select day, Move from the bar; no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const { acts, add, get } = await setup(page)
    const t = today()
    const a = (await add(acts[0]!, plus(t, 2), '07:30')).item
    const b = (await add(acts[1]!, plus(t, 2), '09:00')).item
    await page.goto(`/calendar?view=month&day=${plus(t, 2)}`)
    await expect(page.locator('.calendar-selected-day .calendar-badge').first()).toBeVisible()
    await page.getByLabel('View options').tap()
    await page.getByRole('button', { name: 'Select Activities' }).tap()
    await page.locator('.calendar-selected-day .calendar-badge').filter({ hasText: acts[0]!.title }).locator('button').tap()
    await expect(bar(page)).toContainText('1 selected')
    await expect(page.locator('.calendar-sheet')).toHaveCount(0)
    await bar(page).getByRole('button', { name: /Select every Activity on/ }).tap()
    await expect(bar(page)).toContainText('2 selected')
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
    await bar(page).getByRole('button', { name: 'Move', exact: true }).tap()
    const dialog = page.getByRole('dialog', { name: /^Move 2 Activities/ })
    const target = plus(t, 4)
    const label = new Date(`${target}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    if (target.slice(0, 7) !== plus(t, 2).slice(0, 7)) await dialog.getByRole('button', { name: /Next month/ }).tap()
    await dialog.getByRole('button', { name: label }).tap()
    await dialog.getByRole('button', { name: 'Move 2' }).tap()
    await expect.poll(async () => [(await get(a.id))!.localDate, (await get(b.id))!.localDate]).toEqual([target, target])
  })
})
