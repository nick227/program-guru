import { test, expect } from '@playwright/test'
import { login } from './journey'

for (const type of ['PHOTO', 'VIDEO'] as const) {
  test(`live ${type}: Upload → READY → Attach → Refresh → View → Detach → Refresh`, async ({
    page,
  }) => {
    const api = process.env.MEDIA_TEST_API!
    if (
      !api ||
      !process.env.MEDIA_TEST_EMAIL ||
      !process.env.MEDIA_TEST_PASSWORD
    )
      throw new Error(
        'Run apps/web/scripts/media-live.ts with an isolated database.',
      )
    await login(
      page,
      process.env.MEDIA_TEST_EMAIL,
      process.env.MEDIA_TEST_PASSWORD,
    )
    // Setup a real calendar occurrence through authenticated public APIs, not mocked requests.
    const activities = await page.request.get(`${api}/activities?limit=1`)
    expect(activities.ok()).toBe(true)
    const activity = (await activities.json()).data[0]
    const added = await page.request.post(`${api}/calendar/items`, {
      data: {
        activityId: activity.id,
        localDate: '2026-11-09',
        idempotencyKey: crypto.randomUUID(),
      },
    })
    expect(added.ok()).toBe(true)
    const item = (await added.json()).data.item
    await page.goto(`/occurrences/${item.id}`)
    await page.getByRole('button', { name: 'Add media to this session', exact: true }).click()
    const complete = page.waitForResponse(
      (response) =>
        response.url().includes('/complete') &&
        response.request().method() === 'POST',
    )
    await page
      .getByLabel('Upload private media')
      .setInputFiles(
        process.env[
          type === 'PHOTO' ? 'MEDIA_TEST_PHOTO' : 'MEDIA_TEST_VIDEO'
        ]!,
      )
    const asset = (await (await complete).json()).data
    // The inbound controller attaches the upload as soon as it is READY and closes the picker.
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 60000 })
    await expect(
      page.getByRole('region', { name: 'Related Media' }).getByRole('button', { name: type, exact: true }).first(),
    ).toBeVisible({ timeout: 60000 })
    await page.reload()
    await page.getByRole('button', { name: 'Add media to this session', exact: true }).click()
    await expect(
      page
        .getByRole('dialog')
        .getByRole('button', { name: `${type} · READY`, exact: true }),
    ).toBeDisabled()
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await page
      .getByRole('button', { name: 'Manage attachments', exact: true })
      .click()
    await page.getByRole('button', { name: 'View', exact: true }).click()
    const viewer = page.getByRole('dialog')
    if (type === 'PHOTO') {
      await expect
        .poll(() =>
          viewer
            .locator('img')
            .evaluate(
              (image: HTMLImageElement) =>
                image.complete && image.naturalWidth > 0,
            ),
        )
        .toBe(true)
    } else {
      await expect
        .poll(() =>
          viewer
            .locator('video')
            .evaluate(
              (video: HTMLVideoElement) =>
                video.readyState >= 1 && video.duration > 0,
            ),
        )
        .toBe(true)
      await viewer
        .locator('video')
        .evaluate(async (video: HTMLVideoElement) => {
          video.muted = true
          await video.play()
        })
      await expect
        .poll(() =>
          viewer
            .locator('video')
            .evaluate((video: HTMLVideoElement) => video.currentTime),
        )
        .toBeGreaterThan(0)
    }
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await page.getByRole('button', { name: 'Detach', exact: true }).click()
    await expect(
      page.getByText('No attachments for this result.'),
    ).toBeVisible()
    await page.reload()
    await page
      .getByRole('button', { name: 'Manage attachments', exact: true })
      .click()
    await expect(
      page.getByText('No attachments for this result.'),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Detach', exact: true }),
    ).toHaveCount(0)
    // Detach preserves the asset; it can be selected again without another upload.
    expect((await page.request.get(`${api}/media/${asset.id}`)).ok()).toBe(true)
    await page.getByRole('button', { name: 'Add media to this session', exact: true }).click()
    await expect(
      page
        .getByRole('dialog')
        .getByRole('button', { name: `${type} · READY`, exact: true }),
    ).toBeEnabled()
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
  const related = page.getByRole('region', { name: 'Related Media' })
  // "Yours" spans this Activity, so earlier uploads may already be listed: compare with a baseline.
  const settledCount = async () => {
    await expect(related.getByRole('heading', { name: 'Related Media' })).toBeVisible()
    await page.waitForLoadState('networkidle')
    return related.getByRole('button', { name: 'PHOTO', exact: true }).count()
  }
  const before = await settledCount()
  const ticket = page.waitForRequest(
    (request) => request.url().endsWith('/media/uploads') && request.method() === 'POST',
  )
  await page.getByRole('button', { name: 'Upload media' }).locator('xpath=preceding-sibling::input[@type="file"]').setInputFiles(process.env.MEDIA_TEST_PHOTO!)
  expect((await ticket).postDataJSON()).toMatchObject({ target: { kind: 'RESULT_ENTRY' }, purpose: 'JOURNAL' })
  await expect(page.getByText('Media attached to this attempt.')).toBeVisible({ timeout: 60000 })
  // The worker finishes processing and completes the intent; the media appears in Related Media.
  await expect
    .poll(async () => {
      await page.reload()
      return settledCount()
    }, { timeout: 90000, intervals: [2000] })
    .toBeGreaterThan(before)
  // Uploading never starts the session.
  await expect(page.getByRole('button', { name: /^Start( timer)?$/ })).toBeVisible()
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
  await expect(cover.getByRole('button', { name: 'Change image' })).toBeVisible()
  await expect(cover.locator('img')).toBeVisible()
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
  const related = page.getByRole('region', { name: 'Related Media' })
  const ticket = page.waitForRequest(
    (request) => request.url().endsWith('/media/uploads') && request.method() === 'POST',
  )
  await related.locator('input[type="file"]').first().setInputFiles(process.env.MEDIA_TEST_PHOTO!)
  expect((await ticket).postDataJSON()).toMatchObject({
    target: { kind: 'ACTIVITY_REVISION', id: activity.revisionId },
    purpose: 'DEMONSTRATION',
  })
  await expect
    .poll(async () => (await (await page.request.get(`${api}/activities/${activity.id}`)).json()).data.mediaCount, {
      timeout: 90000,
      intervals: [2000],
    })
    .toBeGreaterThan(0)
})
