import { test, expect } from '@playwright/test'
import { login } from './journey'

/** Ready tiles in the one Related Media gallery: enabled, labelled, and not uploading or processing. */
const readyTiles = (page: import('@playwright/test').Page) =>
  page
    .getByRole('region', { name: 'Related Media' })
    .getByRole('listitem')
    .filter({ has: page.locator('button[aria-label]:not([disabled])') })
    .filter({ hasNot: page.getByRole('status') })
    .filter({ hasNot: page.getByRole('button', { name: /^(Add|Replace) (media|image)$/ }) })

for (const type of ['PHOTO', 'VIDEO'] as const) {
  test(`live ${type}: Upload → READY → Refresh → View → Delete → Refresh`, async ({
    page,
  }) => {
    const { api, email, password } = liveEnv()
    await login(page, email, password)
    // Setup a real calendar occurrence through authenticated public APIs, not mocked requests.
    const activities = await page.request.get(`${api}/activities?limit=1`)
    expect(activities.ok()).toBe(true)
    const activity = (await activities.json()).data[0]
    const added = await page.request.post(`${api}/calendar/items`, {
      data: { activityId: activity.id, localDate: '2026-11-09', idempotencyKey: crypto.randomUUID() },
    })
    expect(added.ok()).toBe(true)
    const item = (await added.json()).data.item
    await page.goto(`/occurrences/${item.id}`)
    const related = page.getByRole('region', { name: 'Related Media' })
    await page.waitForLoadState('networkidle')
    const before = await readyTiles(page).count()
    const complete = page.waitForResponse(
      (response) => response.url().includes('/complete') && response.request().method() === 'POST',
    )
    await related
      .locator('input[type="file"]')
      .setInputFiles(process.env[type === 'PHOTO' ? 'MEDIA_TEST_PHOTO' : 'MEDIA_TEST_VIDEO']!)
    const asset = (await (await complete).json()).data
    // The worker processes the file; the gallery shows it as ready without user action.
    await expect(readyTiles(page)).toHaveCount(before + 1, { timeout: 60000 })
    await page.reload()
    await expect(readyTiles(page)).toHaveCount(before + 1)

    // Owned tiles carry the media menu (a disclosure summary, not a button role).
    const options = 'summary[aria-label="Media options"]'
    const tile = readyTiles(page).filter({ has: page.locator(options) }).first()
    await tile.locator('button[aria-label]:not([disabled])').first().click()
    const viewer = page.getByRole('dialog')
    if (type === 'PHOTO') {
      await expect
        .poll(() => viewer.locator('img').first().evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0))
        .toBe(true)
    } else {
      await expect
        .poll(() => viewer.locator('video').evaluate((video: HTMLVideoElement) => video.readyState >= 1 && video.duration > 0))
        .toBe(true)
      await viewer.locator('video').evaluate(async (video: HTMLVideoElement) => {
        video.muted = true
        await video.play()
      })
      await expect
        .poll(() => viewer.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime))
        .toBeGreaterThan(0)
    }
    await page.getByRole('button', { name: 'Close', exact: true }).click()

    // The owner deletes through the tile menu, with confirmation; it is gone after a reload.
    await tile.locator(options).click()
    await tile.getByRole('button', { name: 'Delete media' }).click()
    await tile.getByRole('button', { name: 'Confirm delete' }).click()
    await expect(readyTiles(page)).toHaveCount(before)
    await page.reload()
    await expect(readyTiles(page)).toHaveCount(before)
    expect((await page.request.get(`${api}/media/${asset.id}/url`)).ok()).toBe(false)
  })
}

function liveEnv() {
  const api = process.env.MEDIA_TEST_API!
  if (!api || !process.env.MEDIA_TEST_EMAIL || !process.env.MEDIA_TEST_PASSWORD)
    throw new Error('Run apps/web/scripts/media-live.ts with an isolated database.')
  return { api, email: process.env.MEDIA_TEST_EMAIL, password: process.env.MEDIA_TEST_PASSWORD }
}

test('live session upload: durable intent attaches after processing, session not started', async ({ page }) => {
  const { api, email, password } = liveEnv()
  await login(page, email, password)
  const activity = (await (await page.request.get(`${api}/activities?limit=1`)).json()).data[0]
  const added = await page.request.post(`${api}/calendar/items`, {
    data: { activityId: activity.id, localDate: '2026-11-10', idempotencyKey: crypto.randomUUID() },
  })
  expect(added.ok()).toBe(true)
  const item = (await added.json()).data.item
  await page.goto(`/occurrences/${item.id}`)
  // Earlier uploads to this Activity are listed too: compare with a baseline.
  await page.waitForLoadState('networkidle')
  const before = await readyTiles(page).count()
  const ticket = page.waitForRequest(
    (request) => request.url().endsWith('/media/uploads') && request.method() === 'POST',
  )
  await page
    .getByRole('region', { name: 'Related Media' })
    .locator('input[type="file"]')
    .setInputFiles(process.env.MEDIA_TEST_PHOTO!)
  expect((await ticket).postDataJSON()).toMatchObject({ target: { kind: 'RESULT_ENTRY' }, purpose: 'JOURNAL' })
  // The worker finishes processing and completes the durable intent (the gallery polls while
  // processing); it survives a reload.
  await expect(readyTiles(page)).toHaveCount(before + 1, { timeout: 90000 })
  await page.reload()
  await expect(readyTiles(page)).toHaveCount(before + 1)
  // Uploading never starts or completes the session.
  await expect(page.getByRole('button', { name: /^(Start|Complete)$/ })).toBeVisible()
})

test('live Program cover: uploaded image becomes the cover once processed', async ({ page }) => {
  const { api, email, password } = liveEnv()
  await login(page, email, password)
  const type = (await (await page.request.get(`${api}/catalog/program-types`)).json()).data[0]
  const created = await page.request.post(`${api}/programs`, { data: { programTypeId: type.id, focusId: null } })
  expect(created.ok()).toBe(true)
  const program = (await created.json()).data
  await page.goto(`/programs/${program.id}/workspace`)
  const cover = page.getByRole('group', { name: 'Program cover' })
  await cover.locator('input[type="file"]').setInputFiles(process.env.MEDIA_TEST_PHOTO!)
  await expect
    .poll(async () => {
      const ws = (await (await page.request.get(`${api}/programs/${program.id}/workspace`)).json()).data
      return Boolean(ws.coverUrl)
    }, { timeout: 90000, intervals: [2000] })
    .toBe(true)
  await page.reload()
  await expect(cover.getByRole('button', { name: /Replace (media|image)/ })).toBeVisible()
  await expect(cover.locator('img')).toBeVisible()
  // Inline removal clears the persisted cover.
  await cover.getByRole('button', { name: /^Remove/ }).click()
  await expect
    .poll(async () => (await (await page.request.get(`${api}/programs/${program.id}/workspace`)).json()).data.coverUrl)
    .toBeNull()
})

test('live Program cover: uploaded video becomes the cover with poster and play affordance', async ({ page }) => {
  const { api, email, password } = liveEnv()
  await login(page, email, password)
  const type = (await (await page.request.get(`${api}/catalog/program-types`)).json()).data[0]
  const created = await page.request.post(`${api}/programs`, { data: { programTypeId: type.id, focusId: null } })
  expect(created.ok()).toBe(true)
  const program = (await created.json()).data
  await page.goto(`/programs/${program.id}/workspace`)
  const cover = page.getByRole('group', { name: 'Program cover' })
  await cover.locator('input[type="file"]').setInputFiles(process.env.MEDIA_TEST_VIDEO!)
  await expect
    .poll(async () => {
      const ws = (await (await page.request.get(`${api}/programs/${program.id}/workspace`)).json()).data
      return Boolean(ws.coverUrl && ws.coverMedia?.type === 'VIDEO')
    }, { timeout: 90000, intervals: [2000] })
    .toBe(true)
  await page.reload()
  await expect(cover.getByRole('button', { name: /Replace (media|image)/ })).toBeVisible()
  // Video cover renders poster with play badge
  await expect(cover.locator('img')).toBeVisible()
  // Inline removal clears the persisted video cover.
  await cover.getByRole('button', { name: /^Remove/ }).click()
  await expect
    .poll(async () => (await (await page.request.get(`${api}/programs/${program.id}/workspace`)).json()).data.coverUrl)
    .toBeNull()
})

test('live Activity demonstration media: upload on the Activity page attaches after processing', async ({ page }) => {
  const { api, email, password } = liveEnv()
  await login(page, email, password)
  const category = (await (await page.request.get(`${api}/catalog/categories`)).json()).data[0]
  const created = await page.request.post(`${api}/activities`, {
    data: { title: `Live demo ${Date.now()}`, categoryId: category.id, focusIds: [], summary: null },
  })
  expect(created.ok()).toBe(true)
  const activity = (await created.json()).data
  expect(activity.mediaCount).toBe(0)
  await page.goto(`/activities/${activity.id}`)
  // The owner adds to the one Related Media gallery on the Activity page.
  const media = page.getByRole('region', { name: 'Related Media' })
  const tickets: Record<string, unknown>[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('/media/uploads') && request.method() === 'POST')
      tickets.push(request.postDataJSON())
  })
  // Several files in one pick; each attaches through its own durable intent.
  await media
    .locator('input[type="file"]')
    .setInputFiles([process.env.MEDIA_TEST_PHOTO!, process.env.MEDIA_TEST_PHOTO!])
  await expect.poll(() => tickets.length).toBe(2)
  for (const ticket of tickets)
    expect(ticket).toMatchObject({
      target: { kind: 'ACTIVITY_REVISION', id: activity.revisionId },
      purpose: 'DEMONSTRATION',
    })
  await expect
    .poll(async () => {
      // A transient non-OK response (e.g. rate limiting) is "not yet", not a failure.
      const res = await page.request.get(`${api}/activities/${activity.id}`)
      return res.ok() ? (await res.json()).data.mediaCount : -1
    }, {
      timeout: 90000,
      intervals: [2000],
    })
    .toBe(2)
  // After a reload both files are listed as ready tiles with inline removal.
  await page.reload()
  await expect(readyTiles(page)).toHaveCount(2)
  await expect(media.getByRole('status')).toHaveCount(0)
})
