/** Live API: Calendar direct scheduling with a mouse, and its safety rules (03-UX §5). */
import { test, expect } from '@playwright/test'
import { api, chip, dayIndex, gridStart, monthCell, mouseDrag, plus, setup, today, touchDrag } from './calendar-live-helpers'

test.describe('desktop mouse', () => {
  test('Month drag: date moves, time stays; click selects; Undo; Escape and outside drops change nothing', async ({ page }) => {
    const { acts, add, get } = await setup(page)
    const t = today()
    const once = (await add(acts[0]!, plus(t, 2), '07:30')).item
    await page.goto(`/calendar?view=month&day=${t}`)
    await expect(chip(page, acts[0]!.title)).toBeVisible()

    await chip(page, acts[0]!.title).locator('button').first().click()
    await expect(page.locator('aside.calendar-panel .calendar-panel__title-link')).toContainText(acts[0]!.title)
    expect((await get(once.id))!.localDate).toBe(plus(t, 2))

    expect(await mouseDrag(page, chip(page, acts[0]!.title), monthCell(page, plus(t, 6)))).toBe(1)
    await expect.poll(async () => (await get(once.id))!.localDate).toBe(plus(t, 6))
    // The drop's own click is swallowed: no quick add opens on the target date.
    await expect(page.locator('.calendar-inline-picker')).toHaveCount(0)
    expect((await get(once.id))!.localTime).toBe('07:30')
    await expect(monthCell(page, plus(t, 6)).locator('.calendar-chip').filter({ hasText: acts[0]!.title })).toHaveCount(1)
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect.poll(async () => (await get(once.id))!.localDate).toBe(plus(t, 2))

    await mouseDrag(page, chip(page, acts[0]!.title), monthCell(page, plus(t, 7)), { escape: true })
    await mouseDrag(page, chip(page, acts[0]!.title), page.locator('.calendar-month-weekdays'))
    await mouseDrag(page, chip(page, acts[0]!.title), monthCell(page, plus(t, -1)))
    await page.waitForTimeout(800)
    expect((await get(once.id))!.localDate).toBe(plus(t, 2))
  })

  test('Month drag to an adjacent-month day in the grid', async ({ page }) => {
    const { acts, add, get } = await setup(page)
    const t = today()
    const last = plus(gridStart(t), 41)
    test.skip(last.slice(0, 7) === t.slice(0, 7), 'this month fills the grid')
    const once = (await add(acts[0]!, plus(t, 1), '08:00')).item
    await page.goto(`/calendar?view=month&day=${t}`)
    // The last grid row sits below the fold: holding the drag at the bottom edge auto-scrolls to it.
    const src = (await chip(page, acts[0]!.title).boundingBox())!
    const vh = page.viewportSize()!.height
    await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2)
    await page.mouse.down()
    await page.mouse.move(src.x + src.width / 2 + 10, src.y + src.height / 2 + 10, { steps: 3 })
    await page.mouse.move(src.x + src.width / 2, vh - 4, { steps: 10 })
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5000 }).toBeGreaterThan(0)
    await page.waitForTimeout(800)
    const dst = (await monthCell(page, last).boundingBox())!
    expect(dst.y + dst.height / 2).toBeLessThan(vh)
    await page.mouse.move(dst.x + dst.width / 2, dst.y + dst.height / 2, { steps: 8 })
    await page.mouse.up()
    await expect.poll(async () => (await get(once.id))!.localDate).toBe(last)
    await expect(monthCell(page, last).locator('.calendar-chip').filter({ hasText: acts[0]!.title })).toHaveCount(1)
  })

  test('completed entries do not drag; recurring asks This one / This and future; series end shifts', async ({ page }) => {
    const { acts, add, list, get, data } = await setup(page)
    const t = today()
    const done = (await add(acts[2]!, t, '06:00')).item
    const session = await data(await page.request.post(`${api}/sessions`, { data: { calendarItemId: done.id, idempotencyKey: crypto.randomUUID() } }))
    await page.request.post(`${api}/sessions/${session.id}/actions`, { data: { action: 'FINISH', expectedRevision: 0 } })
    await add(acts[1]!, plus(t, 2), '18:00', { recurrence: { kind: 'DAILY' }, untilDate: plus(t, 5) })
    await page.goto(`/calendar?view=month&day=${t}`)
    await expect(chip(page, acts[1]!.title)).toBeVisible()

    expect(await mouseDrag(page, chip(page, acts[2]!.title), monthCell(page, plus(t, 3)))).toBe(0)
    expect((await get(done.id))!.localDate).toBe(t)

    const series = async () =>
      (await list(t, plus(t, 12))).filter((i) => i.recurrenceId).map((i) => i.localDate).sort().join(',')
    const before = await series()
    const dialog = page.getByRole('dialog', { name: /^Move to/ })
    await mouseDrag(page, monthCell(page, plus(t, 3)).locator('.calendar-chip').filter({ hasText: acts[1]!.title }), monthCell(page, plus(t, 8)))
    await expect(dialog.getByRole('radio')).toHaveCount(2)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    expect(await series()).toBe(before)

    // This and future from day 4 to day 6: days 4–5 become 6–7, nothing lost (09 §4.8).
    await mouseDrag(page, monthCell(page, plus(t, 4)).locator('.calendar-chip').filter({ hasText: acts[1]!.title }), monthCell(page, plus(t, 6)))
    await dialog.getByRole('radio', { name: 'This and future' }).click()
    await dialog.getByRole('button', { name: 'Move' }).click()
    await expect.poll(series).toBe([plus(t, 2), plus(t, 3), plus(t, 6), plus(t, 7)].join(','))
  })

  test('gathering entries confirm leaving before a move', async ({ page }) => {
    const { acts, add } = await setup(page)
    const t = today()
    const item = (await add(acts[3]!, plus(t, 3), '10:00')).item
    const created = await page.request.post(`${api}/activities/${acts[3]!.id}/gatherings`, {
      data: { localDate: plus(t, 3), localTime: '10:00', calendarItemId: item.id, idempotencyKey: crypto.randomUUID() },
    })
    expect(created.ok()).toBe(true)
    await page.goto(`/calendar?view=month&day=${t}`)
    await mouseDrag(page, chip(page, acts[3]!.title), monthCell(page, plus(t, 5)))
    const dialog = page.getByRole('dialog', { name: /^Move to/ })
    await expect(dialog).toContainText('Moving leaves the gathering')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
  })

  test('a stale write is refused, rolled back and explained once', async ({ page }) => {
    const { acts, add, get } = await setup(page)
    const t = today()
    const once = (await add(acts[0]!, plus(t, 2), '07:30')).item
    await page.goto(`/calendar?view=month&day=${t}`)
    await expect(chip(page, acts[0]!.title)).toBeVisible()
    await page.request.patch(`${api}/calendar-items/${once.id}`, { data: { localTime: '07:45', expectedUpdatedAt: once.updatedAt } })
    await mouseDrag(page, chip(page, acts[0]!.title), monthCell(page, plus(t, 6)))
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /changed elsewhere/ })).toBeVisible()
    await expect(page.getByText('This was changed elsewhere')).toHaveCount(0)
    expect((await get(once.id))!.localDate).toBe(plus(t, 2))
    await expect(monthCell(page, plus(t, 2)).locator('.calendar-chip').filter({ hasText: acts[0]!.title })).toHaveCount(1)
  })

  test('Day drag sets the hour or Any time; Remove then Undo restores the same entry', async ({ page }) => {
    const { acts, add, get, list } = await setup(page)
    const d = plus(today(), 1)
    const once = (await add(acts[0]!, d, '07:00')).item
    await add(acts[1]!, d, '09:00')
    await page.goto(`/calendar?view=day&day=${d}`)
    const badge = page.locator('.calendar-badge').filter({ hasText: acts[0]!.title })
    await mouseDrag(page, badge, page.locator('tr[data-slot="09"]'))
    await expect.poll(async () => (await get(once.id))!.localTime).toBe('09:00')
    await mouseDrag(page, badge, page.locator('tr[data-slot="anytime"]'))
    await expect.poll(async () => (await get(once.id))!.localTime).toBe(null)

    await badge.locator('button').first().click()
    await page.locator('aside.calendar-panel').getByRole('button', { name: 'Remove from Calendar' }).click()
    await page.getByRole('dialog', { name: 'Remove from Calendar?' }).getByRole('button', { name: 'Remove' }).click()
    await expect(badge).toHaveCount(0)
    await page.locator('[data-sonner-toast]').filter({ hasText: 'Removed' }).getByRole('button', { name: 'Undo' }).click()
    await expect(badge).toHaveCount(1)
    const ids = (await list(d, d)).filter((i) => i.title === acts[0]!.title)
    expect(ids.map((i) => [i.id, i.status])).toEqual([[once.id, 'PLANNED']])
  })

  test('conflicts are marked; Move to next open slot moves only that entry, with Undo', async ({ page }) => {
    const { acts, add, list } = await setup(page)
    const t = today()
    const d = plus(t, 2)
    for (const a of acts.slice(0, 2)) await add(a, d, '09:00')
    await page.goto(`/calendar?view=month&day=${t}`)
    await expect(page.locator('.calendar-chip--conflict')).toHaveCount(2)
    await page.locator('.calendar-chip--conflict').filter({ hasText: acts[1]!.title }).locator('button').first().click()
    await page.locator('aside.calendar-panel').getByRole('button', { name: 'Move to next open slot' }).click()
    const times = async () => (await list(d, d)).map((i) => `${i.title}@${i.localTime}`).sort().join(',')
    await expect.poll(times).toBe([`${acts[0]!.title}@09:00`, `${acts[1]!.title}@09:30`].sort().join(','))
    await expect(page.locator('.calendar-chip--conflict')).toHaveCount(0)
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect.poll(times).toBe([`${acts[0]!.title}@09:00`, `${acts[1]!.title}@09:00`].sort().join(','))
  })

  test('the panel shows a series and edits or ends it from that entry on', async ({ page }) => {
    const { acts, add, list } = await setup(page)
    const t = today()
    await add(acts[0]!, plus(t, 1), '18:00', { recurrence: { kind: 'DAILY' }, untilDate: plus(t, 8) })
    const from = plus(t, 4)
    await page.goto(`/calendar?view=day&day=${from}`)
    await expect(page.locator('aside.calendar-panel .calendar-panel__series-rule')).toContainText('Every day · until')
    await page.locator('aside.calendar-panel').getByRole('button', { name: 'Edit series' }).click()
    const edit = page.getByRole('dialog', { name: 'Edit series' })
    await edit.locator('input[type=time]').fill('07:15')
    await edit.getByRole('button', { name: 'Save' }).click()
    const all = async () => (await list(t, plus(t, 12))).map((i) => `${i.localDate} ${i.localTime}`)
    await expect.poll(async () => (await all()).filter((x) => x >= from).every((x) => x.endsWith('07:15'))).toBe(true)
    expect((await all()).filter((x) => x < from).every((x) => x.endsWith('18:00'))).toBe(true)

    await page.goto(`/calendar?view=day&day=${plus(t, 6)}`)
    await page.locator('aside.calendar-panel').getByRole('button', { name: 'End series' }).click()
    await page.getByRole('dialog', { name: 'End this series?' }).getByRole('button', { name: 'End series' }).click()
    await expect.poll(async () => (await all()).every((x) => x < plus(t, 6))).toBe(true)
  })
})

