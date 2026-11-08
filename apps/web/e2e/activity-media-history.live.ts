import { test, expect } from '@playwright/test'
import { login } from './journey'

test('live API: 25 attempts, pagination, detach/restore, refresh and private authorization', async ({
  page,
  playwright,
}) => {
  const api = process.env.HISTORY_TEST_API
  if (!api || !/^http:\/\/(localhost|127\.0\.0\.1):/.test(api))
    throw new Error(
      'HISTORY_TEST_API must name a local API running backend 5c3a3eb or newer.',
    )
  const suffix = crypto.randomUUID().slice(0, 8)
  const password = `History-test-${suffix}!`
  const email = `history-${suffix}@test.local`
  const owner = await playwright.request.newContext({ baseURL: api })
  const stranger = await playwright.request.newContext({ baseURL: api })
  const data = async (response: import('@playwright/test').APIResponse) => {
    expect(
      response.ok(),
      `${response.status()} ${await response.text()}`,
    ).toBe(true)
    return (await response.json()).data
  }
  try {
    await data(
      await owner.post('/auth/register', {
        data: {
          email,
          password,
          handle: `history_${suffix}`,
          displayName: 'History Test',
        },
      }),
    )
    await data(
      await stranger.post('/auth/register', {
        data: {
          email: `other-${email}`,
          password,
          handle: `other_${suffix}`,
          displayName: 'Other Test',
        },
      }),
    )
    const activity = (
      await data(await owner.get('/activities?source=PLATFORM&limit=1'))
    )[0]
    const media = (
      await data(await owner.get('/media/platform?type=PHOTO&limit=1'))
    )[0]
    expect(activity?.id).toBeTruthy()
    expect(media?.state).toBe('READY')
    const item = (
      await data(
        await owner.post('/calendar/items', {
          data: {
            activityId: activity.id,
            localDate: '2026-11-07',
            idempotencyKey: crypto.randomUUID(),
          },
        }),
      )
    ).item
    const attempts: {
      sessionId: string
      entryId: string
      attachmentId: string
    }[] = []
    for (let n = 0; n < 25; n++) {
      const session = await data(
        await owner.post('/sessions', {
          data: {
            calendarItemId: item.id,
            idempotencyKey: crypto.randomUUID(),
          },
        }),
      )
      const entry = await data(
        await owner.post(`/sessions/${session.id}/results`, {
          data: { values: [] },
        }),
      )
      const link = await data(
        await owner.post('/media-attachments', {
          data: {
            mediaId: media.id,
            target: { kind: 'RESULT_ENTRY', id: entry.id },
            purpose: 'JOURNAL',
          },
        }),
      )
      attempts.push({
        sessionId: session.id,
        entryId: entry.id,
        attachmentId: link.id,
      })
    }
    const before = await data(
      await owner.get(`/calendar-items/${item.id}/occurrence`),
    )
    await login(page, email, password)
    await page.goto(
      `/occurrences/${item.id}?returnTo=${encodeURIComponent('/?week=2026-11-02&day=2026-11-07')}`,
    )
    await page
      .getByRole('button', { name: 'Media from all attempts' })
      .click()
    const history = page.getByRole('region', {
      name: 'Activity media history',
    })
    await expect(
      history.getByRole('button', { name: 'Detach', exact: true }),
    ).toHaveCount(24)
    await history.getByRole('button', { name: 'Load older media' }).click()
    await expect(
      history.getByRole('button', { name: 'Detach', exact: true }),
    ).toHaveCount(25)
    await history
      .getByRole('button', { name: 'Detach', exact: true })
      .last()
      .click()
    await expect(
      history.getByRole('button', { name: 'Undo detach' }),
    ).toBeVisible()
    const oldest = attempts[0]!
    const afterDetach = await data(
      await owner.get(`/activities/${activity.id}/my-media?limit=100`),
    )
    expect(afterDetach.map((row: any) => row.attachment.id)).not.toContain(
      oldest.attachmentId,
    )
    await history.getByRole('button', { name: 'Undo detach' }).click()
    await expect(
      history.getByRole('button', { name: 'Undo detach' }),
    ).toHaveCount(0)
    await page.reload()
    await page
      .getByRole('button', { name: 'Media from all attempts' })
      .click()
    await history.getByRole('button', { name: 'Load older media' }).click()
    await expect(
      history.getByRole('button', { name: 'Detach', exact: true }),
    ).toHaveCount(25)
    const restored = await data(
      await owner.get(`/activities/${activity.id}/my-media?limit=100`),
    )
    expect(
      restored.find((row: any) => row.resultEntryId === oldest.entryId)
        .attachment.id,
    ).not.toBe(oldest.attachmentId)
    const after = await data(
      await owner.get(`/calendar-items/${item.id}/occurrence`),
    )
    expect(before.resultInputs).toBeInstanceOf(Array)
    expect(after.resultInputs).toEqual(before.resultInputs)
    expect(
      after.personalStats.map(
        ({ computedAt, ...stat }: { computedAt: string }) => stat,
      ),
    ).toEqual(
      before.personalStats.map(
        ({ computedAt, ...stat }: { computedAt: string }) => stat,
      ),
    )
    expect(after.item).toEqual(before.item)
    expect(after.session).toEqual(before.session)
    expect(
      await data(await stranger.get(`/activities/${activity.id}/my-media`)),
    ).toEqual([])
    expect(
      (
        await stranger.delete(
          `/media-attachments/${restored[0].attachment.id}`,
        )
      ).status(),
    ).toBe(404)
    const anonymous = await playwright.request.newContext({ baseURL: api })
    expect(
      (await anonymous.get(`/activities/${activity.id}/my-media`)).status(),
    ).toBe(401)
    await anonymous.dispose()
  } finally {
    await owner.dispose()
    await stranger.dispose()
  }
})
