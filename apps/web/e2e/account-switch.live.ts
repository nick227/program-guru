import { test, expect } from '@playwright/test'
import { login } from './journey'

/** Live API: signing out and into another account in the same tab never shows the previous viewer's data. */
test('live API: account switch in one tab isolates private calendar, occurrence and identity', async ({
  page,
  playwright,
}) => {
  const api = process.env.HISTORY_TEST_API
  if (!api || !/^http:\/\/(localhost|127\.0\.0\.1):/.test(api))
    throw new Error('HISTORY_TEST_API must name a local API.')
  const suffix = crypto.randomUUID().slice(0, 8)
  const password = `Switch-test-${suffix}!`
  const users = {
    a: { email: `switch-a-${suffix}@test.local`, handle: `switch_a_${suffix}`, displayName: `Alpha ${suffix}` },
    b: { email: `switch-b-${suffix}@test.local`, handle: `switch_b_${suffix}`, displayName: `Bravo ${suffix}` },
  }
  const ctxA = await playwright.request.newContext({ baseURL: api })
  const ctxB = await playwright.request.newContext({ baseURL: api })
  const data = async (r: import('@playwright/test').APIResponse) => {
    expect(r.ok(), `${r.status()} ${await r.text()}`).toBe(true)
    return (await r.json()).data
  }
  try {
    for (const [ctx, u] of [[ctxA, users.a], [ctxB, users.b]] as const)
      await data(await ctx.post('/auth/register', { data: { ...u, password, timezone: 'UTC' } }))
    const today = new Date().toISOString().slice(0, 10)
    const source = (await data(await ctxA.get('/activities?source=PLATFORM&limit=1')))[0]
    const secretTitle = `Private-${suffix}`
    const copy = await data(await ctxA.post(`/activities/${source.id}/copy`, { data: { newTitle: secretTitle } }))
    const item = (await data(await ctxA.post('/calendar/items', {
      data: { activityId: copy.id, localDate: today, idempotencyKey: crypto.randomUUID() },
    }))).item

    await login(page, users.a.email, password)
    await expect(page.getByText(secretTitle).first()).toBeVisible()
    await expect(page.getByText(users.a.displayName).first()).toBeVisible()

    await page.locator('summary').filter({ hasText: users.a.displayName }).click()
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page).toHaveURL(/\/login/)
    // Back after sign-out must not reveal the cached calendar.
    await page.goBack()
    await expect(page.getByText(secretTitle)).toHaveCount(0)

    await login(page, users.b.email, password)
    await expect(page.getByText(users.b.displayName).first()).toBeVisible()
    await expect(page.getByText(users.a.displayName)).toHaveCount(0)
    await expect(page.getByText(secretTitle)).toHaveCount(0)

    // Direct navigation to A's occurrence and private Activity is denied for B.
    await page.goto(`/occurrences/${item.id}`)
    await expect(page.getByRole('alert').first()).toBeVisible()
    await expect(page.getByText(secretTitle)).toHaveCount(0)
    await page.goto(`/activities/${copy.id}`)
    await expect(page.getByRole('alert').first()).toBeVisible()
    await expect(page.getByText(secretTitle)).toHaveCount(0)
    expect((await ctxB.get(`/calendar-items/${item.id}/occurrence`)).status()).toBe(404)
    expect((await ctxB.get(`/activities/${copy.id}`)).status()).toBe(404)
  } finally {
    await ctxA.dispose()
    await ctxB.dispose()
  }
})

