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
    await page.getByRole('button', { name: 'Add media', exact: true }).click()
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
    await expect(
      page.getByRole('button', { name: `${type} · READY`, exact: true }),
    ).toBeEnabled({ timeout: 60000 })
    await page
      .getByRole('button', { name: `${type} · READY`, exact: true })
      .click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: 'Add media', exact: true }).click()
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
    await page.getByRole('button', { name: 'Add media', exact: true }).click()
    await expect(
      page
        .getByRole('dialog')
        .getByRole('button', { name: `${type} · READY`, exact: true }),
    ).toBeEnabled()
  })
}
