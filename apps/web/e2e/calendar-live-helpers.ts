import { expect, type Page, type Locator, type CDPSession } from '@playwright/test'

/**
 * Shared by the live Calendar specs (calendar-direct.live.ts, calendar-touch.live.ts; run through
 * scripts/history-live.ts). Mouse drags use real pointer moves; touch drags use real touch events
 * (long-press, move, lift). Every write is checked against the server.
 */
export const api = process.env.HISTORY_TEST_API ?? ''
export const TZ = 'America/Chicago'
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
export const plus = (d: string, n: number) => {
  const t = new Date(`${d}T12:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}
/** First date of the Month grid (Monday on or before the 1st). */
export const gridStart = (d: string) => {
  const first = `${d.slice(0, 8)}01`
  return plus(first, -((new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7))
}
export const dayIndex = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)

export type Item = { id: string; localDate: string; localTime: string | null; status: string; activityId: string | null; recurrenceId: string | null; updatedAt: string; title: string }

export async function setup(page: Page) {
  if (!/^http:\/\/(localhost|127\.0\.0\.1):/.test(api)) throw new Error('HISTORY_TEST_API must name a local API.')
  const s = crypto.randomUUID().slice(0, 8)
  const data = async (r: Awaited<ReturnType<Page['request']['get']>>) => {
    expect(r.ok(), `${r.status()} ${await r.text()}`).toBe(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((await r.json()) as { data: any }).data
  }
  await data(
    await page.request.post(`${api}/auth/register`, {
      data: { email: `cal-${s}@test.local`, handle: `cal_${s}`, displayName: `Cal ${s}`, password: `Calendar-${s}-pw!`, timezone: TZ },
    }),
  )
  const acts: { id: string; title: string }[] = await data(await page.request.get(`${api}/activities?source=PLATFORM&limit=6`))
  const add = async (activity: { id: string }, localDate: string, localTime: string | null, extra: Record<string, unknown> = {}) =>
    data(await page.request.post(`${api}/calendar/items`, { data: { activityId: activity.id, localDate, localTime, idempotencyKey: crypto.randomUUID(), ...extra } }))
  const list = async (start: string, end: string): Promise<Item[]> => data(await page.request.get(`${api}/calendar/items?start=${start}&end=${end}`))
  const get = async (id: string) => (await list(today(), plus(today(), 45))).find((i) => i.id === id)
  return { acts, add, list, get, data }
}

export async function mouseDrag(page: Page, from: Locator, to: Locator, { escape = false } = {}) {
  const a = (await from.boundingBox())!
  const b = (await to.boundingBox())!
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 3 })
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
  const preview = await page.locator('.calendar-drag-preview').count()
  if (escape) await page.keyboard.press('Escape')
  await page.mouse.up()
  return preview
}

export async function touchDrag(page: Page, cdp: CDPSession, from: Locator, to: Locator, hold = 500) {
  const a = (await from.boundingBox())!
  const b = (await to.boundingBox())!
  const pt = (x: number, y: number) => [{ x: Math.round(x), y: Math.round(y), id: 1, radiusX: 4, radiusY: 4, force: 1 }]
  const [ax, ay, bx, by] = [a.x + a.width / 2, a.y + a.height / 2, b.x + b.width / 2, b.y + b.height / 2]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(ax, ay) })
  await page.waitForTimeout(hold)
  let preview = 0
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(ax + ((bx - ax) * i) / 12, ay + ((by - ay) * i) / 12) })
    await page.waitForTimeout(25)
    if (i === 6) preview = await page.locator('.calendar-drag-preview').count()
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  return preview
}

export const monthCell = (page: Page, date: string) =>
  page.locator('.calendar-month-grid section[aria-label]').nth(dayIndex(gridStart(today()), date))
export const chip = (page: Page, title: string) => page.locator('.calendar-month-grid .calendar-chip').filter({ hasText: title }).first()

