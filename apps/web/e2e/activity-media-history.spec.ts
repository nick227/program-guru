import { test, expect, type Page } from '@playwright/test'
import { mockApi, activityId, itemId } from './fixtures'
import { login } from './journey'
import type { components } from '@project/sdk'
type S = components['schemas']
async function setup(
  page: Page,
  options: {
    locked?: boolean
    deleted?: boolean
    noResults?: boolean
    abandoned?: boolean
  } = {},
) {
  await mockApi(page)
  const asset: S['MediaAsset'] = {
    id: 'old-photo',
    type: 'PHOTO',
    state: 'READY',
    thumbnailUrl: null,
    mime: 'image/png',
    byteSize: 10,
    width: 1,
    height: 1,
    durationMs: null,
    alt: 'Earlier recording',
    license: null,
    attribution: null,
    attachmentCount: 2,
    isOwner: true,
    createdAt: '2026-11-01T14:00:00Z',
  }
  const row = (
    id: string,
    session: string,
    day: string,
  ): S['ActivityMediaHistoryItem'] => ({
    attachment: {
      id,
      mediaId: asset.id,
      target: { kind: 'RESULT_ENTRY', id: `result-${session}` },
      purpose: 'JOURNAL',
      position: 0,
      mediaState: 'READY',
      mediaDeleted: options.deleted ?? false,
      media: { ...asset, alt: asset.alt ?? '', canSelect: true },
    },
    resultEntryId: `result-${session}`,
    sessionId: session,
    sessionStatus: 'FINISHED',
    calendarItemId: itemId,
    occurrenceDate: day,
    instructionId: null,
    recordedAt: `${day}T14:00:00Z`,
  })
  let rows = [
    row('new-link', 'session-new', '2026-11-06'),
    row('old-link', 'session-old', '2026-11-01'),
  ]
  const attempts: S['ActivityAttempt'][] = rows.map((item) => ({
    sessionId: item.sessionId,
    activityRevisionId: 'revision',
    status: item.sessionStatus,
    createdAt: item.recordedAt,
    startedAt: item.recordedAt,
    endedAt: item.recordedAt,
    calendarItemId: item.calendarItemId,
    occurrenceDate: item.occurrenceDate,
    entries: [
      {
        resultEntryId: item.resultEntryId,
        instructionId: item.instructionId,
        recordedAt: item.recordedAt,
      },
    ],
  }))
  if (options.noResults) {
    attempts[1]!.entries = []
    attempts[1]!.status = options.abandoned ? 'ABANDONED' : 'FINISHED'
    rows = rows.filter((row) => row.sessionId !== 'session-old')
  }
  const calls: { path: string; method: string; body: any }[] = []
  const cursors: (string | null)[] = []
  let denial = 0
  await page.route('http://localhost:3001/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname
    if (req.method() === 'OPTIONS') return route.fallback()
    const send = (data: unknown, meta?: unknown) =>
      route.fulfill({ json: { data, ...(meta ? { meta } : {}) } })
    if (path === `/activities/${activityId}/my-attempts`) {
      if (denial)
        return route.fulfill({
          status: denial,
          json: { code: 'NOT_FOUND', message: 'History unavailable' },
        })
      const cursor = url.searchParams.get('cursor')
      cursors.push(cursor)
      const offset = cursor ? Number(cursor.replace('next', '')) || 1 : 0
      return send(attempts.slice(offset, offset + 1), {
        hasMore: offset + 1 < attempts.length,
        nextCursor:
          offset + 1 < attempts.length
            ? offset === 0
              ? 'next'
              : `next${offset + 1}`
            : null,
      })
    }
    if (!path.startsWith('/media') && !path.startsWith('/sessions'))
      return route.fallback()
    calls.push({
      path,
      method: req.method(),
      body: req.postData() ? req.postDataJSON() : null,
    })
    if (path === '/sessions/session-old')
      return send({
        session: { id: 'session-old' },
        entries: attempts[1]!.entries.map((entry) => ({
          ...entry,
          id: entry.resultEntryId,
        })),
      })
    if (path === '/sessions/session-old/results') {
      const entry = {
        resultEntryId: 'result-session-old',
        instructionId: null,
        recordedAt: '2026-11-01T14:00:00Z',
      }
      attempts[1]!.entries = [entry]
      return send({ ...entry, id: entry.resultEntryId })
    }
    if (path === '/media/mine' || path === '/media/platform')
      return send(
        [asset, { ...asset, id: 'library-photo', alt: 'Library recording' }],
        { nextCursor: null },
      )
    if (path === '/media/old-photo/url')
      return send({
        url: '/history.png',
        mime: 'image/png',
        expiresAt: null,
        posterUrl: null,
      })
    if (path === '/media-attachments' && req.method() === 'GET')
      return send(
        rows
          .filter(
            (row) => row.resultEntryId === url.searchParams.get('targetId'),
          )
          .map((row) => row.attachment),
        { nextCursor: null },
      )
    if (path === '/media-attachments' && req.method() === 'POST') {
      const body = req.postDataJSON()
      const item = row(
        `restored-${rows.length}`,
        body.target.id.replace('result-', ''),
        '2026-11-01',
      )
      item.attachment.mediaId = body.mediaId
      item.attachment.media.id = body.mediaId
      if (body.mediaId === 'library-photo')
        item.attachment.media.alt = 'Library recording'
      rows.push(item)
      return send(item.attachment)
    }
    if (path.startsWith('/media-attachments/') && req.method() === 'DELETE') {
      rows = rows.filter((row) => row.attachment.id !== path.split('/').at(-1))
      return send({ ok: true })
    }
    return route.fallback()
  })
  await page.route('**/history.png', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  )
  await login(page, 'participant@test.local', 'password')
  if (options.locked) {
    const response = page.waitForResponse((response) =>
      response.url().endsWith(`/calendar-items/${itemId}/occurrence`),
    )
    await page.goto(`/occurrences/${itemId}`)
    const envelope = await (await response).json()
    envelope.data.item.locked = true
    envelope.data.instructions = []
    await page.route(`**/calendar-items/${itemId}/occurrence`, (route) =>
      route.fulfill({ json: envelope }),
    )
  }
  await page.goto(
    `/occurrences/${itemId}?returnTo=${encodeURIComponent('/?week=2026-11-09&day=2026-11-10')}`,
  )
  await page.getByRole('button', { name: 'Media from all attempts' }).click()
  await page
    .getByLabel('Attempt session-new', { exact: true })
    .getByRole('button', { name: 'Manage media', exact: true })
    .click()
  return {
    calls,
    cursors,
    deny: (status: number) => {
      denial = status
    },
  }
}
test('older attempts paginate, view, detach, restore and refresh without changing results or calendar context', async ({
  page,
}, testInfo) => {
  const api = await setup(page)
  const history = page.getByRole('region', { name: 'Activity media history' })
  await expect(history.getByText(/2026-11-06 · Earlier attempt/)).toBeVisible()
  await history.getByRole('button', { name: 'Load older attempts' }).click()
  await history
    .getByLabel('Attempt session-old', { exact: true })
    .getByRole('button', { name: 'Manage media', exact: true })
    .click()
  await expect(history.getByText(/2026-11-01 · Earlier attempt/)).toBeVisible()
  expect(api.cursors).toContain('next')
  await page.screenshot({
    path: testInfo.outputPath('activity-media-history.png'),
    fullPage: true,
  })
  await history
    .getByRole('button', { name: 'Earlier recording · READY' })
    .last()
    .click()
  await expect(page.getByRole('dialog').getByRole('img')).toHaveAttribute(
    'src',
    '/history.png',
  )
  await page.keyboard.press('Escape')
  await history
    .getByRole('button', { name: 'Detach', exact: true })
    .last()
    .click()
  await expect(
    history.getByRole('button', { name: 'Undo detach' }),
  ).toBeVisible()
  expect(
    api.calls
      .filter((call) => call.method === 'DELETE')
      .map((call) => call.path),
  ).toEqual(['/media-attachments/old-link'])
  await history.getByRole('button', { name: 'Undo detach' }).click()
  await expect(
    history.getByRole('button', { name: 'Undo detach' }),
  ).toHaveCount(0)
  expect(api.calls.find((call) => call.method === 'POST')?.body).toEqual({
    mediaId: 'old-photo',
    target: { kind: 'RESULT_ENTRY', id: 'result-session-old' },
    purpose: 'JOURNAL',
    position: 0,
  })
  await page.reload()
  await page.getByRole('button', { name: 'Media from all attempts' }).click()
  await history.getByRole('button', { name: 'Load older attempts' }).click()
  await history
    .getByLabel('Attempt session-old', { exact: true })
    .getByRole('button', { name: 'Manage media', exact: true })
    .click()
  await expect(history.getByText(/2026-11-01 · Earlier attempt/)).toBeVisible()
  await history
    .getByRole('button', { name: 'Attach to this attempt' })
    .last()
    .click()
  await expect(
    page
      .getByRole('dialog')
      .getByRole('button', { name: 'Earlier recording · READY' }),
  ).toBeDisabled()
  await page.keyboard.press('Escape')
  await history
    .getByRole('button', { name: 'Detach', exact: true })
    .last()
    .click()
  await expect(
    history.getByRole('button', { name: 'Undo detach' }),
  ).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Media from all attempts' }).click()
  await history.getByRole('button', { name: 'Load older attempts' }).click()
  await history
    .getByLabel('Attempt session-old', { exact: true })
    .getByRole('button', { name: 'Manage media', exact: true })
    .click()
  const older = history.getByLabel('Attempt session-old', { exact: true })
  await expect(
    older.getByText('No media attached to this result.'),
  ).toBeVisible()
  await older.getByRole('button', { name: 'Attach to this attempt' }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Earlier recording · READY' })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    older.getByRole('button', { name: 'Earlier recording · READY' }),
  ).toBeVisible()
  expect(
    api.calls.filter((call) => call.method === 'POST').at(-1)?.body,
  ).toEqual({
    mediaId: 'old-photo',
    target: { kind: 'RESULT_ENTRY', id: 'result-session-old' },
    purpose: 'JOURNAL',
  })
  await expect(
    page.getByRole('heading', { name: "Today's Results" }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Calendar', exact: true }).click()
  await expect(page).toHaveURL(/week=2026-11-09&day=2026-11-10/)
  expect(
    api.calls.filter((call) => /results|publications|uploads/.test(call.path)),
  ).toHaveLength(0)
})
test('deleted media remains detachable; restricted Activities retain private history', async ({
  page,
}) => {
  await setup(page, { deleted: true, locked: true })
  const history = page.getByRole('region', { name: 'Activity media history' })
  await expect(history.getByText('Earlier recording · deleted')).toBeVisible()
  await expect(
    history.getByRole('button', { name: 'Earlier recording · READY' }),
  ).toBeDisabled()
  await history.getByRole('button', { name: 'Detach', exact: true }).click()
  await expect(
    history.getByRole('button', { name: 'Undo detach' }),
  ).toHaveCount(0)
})
for (const status of [401, 403, 404])
  test(`history ${status} after refresh hides cached private rows and offers retry`, async ({
    page,
  }) => {
    const api = await setup(page)
    const history = page.getByRole('region', {
      name: 'Activity media history',
    })
    await expect(
      history.getByText(/2026-11-06 · Earlier attempt/),
    ).toBeVisible()
    api.deny(status)
    await history.getByRole('button', { name: 'Refresh history' }).click()
    await expect(history.getByRole('alert')).toContainText(
      'History unavailable',
    )
    await expect(
      history.getByRole('button', { name: 'Detach', exact: true }),
    ).toHaveCount(0)
    api.deny(0)
    await history.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(
      history.getByText(/2026-11-06 · Earlier attempt/),
    ).toBeVisible()
  })

test('reattaches library media to the selected older result and recovers from detach denial', async ({
  page,
}) => {
  const api = await setup(page)
  const history = page.getByRole('region', { name: 'Activity media history' })
  await history.getByRole('button', { name: 'Load older attempts' }).click()
  await history
    .getByLabel('Attempt session-old', { exact: true })
    .getByRole('button', { name: 'Manage media', exact: true })
    .click()
  await history
    .getByLabel('Attempt session-old', { exact: true })
    .getByRole('button', { name: 'Attach to this attempt' })
    .click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Library recording · READY' })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(api.calls.find((call) => call.method === 'POST')?.body).toEqual({
    mediaId: 'library-photo',
    target: { kind: 'RESULT_ENTRY', id: 'result-session-old' },
    purpose: 'JOURNAL',
  })
  await expect(
    history.getByText('Library recording', { exact: true }),
  ).toBeVisible()
  await page.route(
    '**/media-attachments/restored-2',
    (route) =>
      route.fulfill({
        status: 403,
        json: { code: 'FORBIDDEN', message: 'Detach denied' },
      }),
    { times: 1 },
  )
  await history
    .getByRole('button', { name: 'Detach', exact: true })
    .last()
    .click()
  await expect(history.getByRole('alert')).toContainText('Detach denied')
  await expect(
    history.getByText('Library recording', { exact: true }),
  ).toBeVisible()
  await history
    .getByRole('button', { name: 'Detach', exact: true })
    .last()
    .click()
  await expect(
    history.getByRole('button', { name: 'Undo detach' }),
  ).toBeVisible()
})

test('an attempt without results can attach to its original session without starting another', async ({
  page,
}) => {
  const api = await setup(page, { noResults: true })
  const history = page.getByRole('region', { name: 'Activity media history' })
  await history.getByRole('button', { name: 'Load older attempts' }).click()
  await history
    .getByLabel('Attempt session-old', { exact: true })
    .getByRole('button', { name: 'Manage media', exact: true })
    .click()
  const older = history.getByLabel('Attempt session-old', { exact: true })
  await expect(
    older.getByText('No results recorded for this attempt.'),
  ).toBeVisible()
  await older.getByRole('button', { name: 'Attach to this attempt' }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Earlier recording · READY' })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    older.getByRole('button', { name: 'Earlier recording · READY' }),
  ).toBeVisible()
  expect(api.calls.filter((call) => call.path === '/sessions')).toHaveLength(0)
  expect(
    api.calls.filter((call) => call.path.endsWith('/results')),
  ).toHaveLength(1)
  expect(
    api.calls.find(
      (call) => call.path === '/media-attachments' && call.method === 'POST',
    )?.body.target,
  ).toEqual({ kind: 'RESULT_ENTRY', id: 'result-session-old' })
})

test('an abandoned attempt without results is preserved but cannot create a result', async ({
  page,
}) => {
  await setup(page, { noResults: true, abandoned: true })
  const history = page.getByRole('region', { name: 'Activity media history' })
  await history.getByRole('button', { name: 'Load older attempts' }).click()
  await history
    .getByLabel('Attempt session-old', { exact: true })
    .getByRole('button', { name: 'Manage media', exact: true })
    .click()
  const older = history.getByLabel('Attempt session-old', { exact: true })
  await expect(
    older.getByText('No results recorded for this attempt.'),
  ).toBeVisible()
  await expect(
    older.getByRole('button', { name: 'Attach to this attempt' }),
  ).toHaveCount(0)
})

test('attachment pagination remains independent of attempt pagination', async ({
  page,
}) => {
  await setup(page)
  const cursors: (string | null)[] = []
  await page.route('**/media-attachments?**', async (route) => {
    const query = new URL(route.request().url()).searchParams
    if (query.get('targetId') !== 'result-session-new') return route.fallback()
    cursors.push(query.get('cursor'))
    return route.fulfill({
      json: {
        data: query.get('cursor')
          ? [
              {
                id: 'older-link',
                mediaId: 'old-photo',
                mediaState: 'READY',
                mediaDeleted: false,
                purpose: 'JOURNAL',
                position: 1,
                target: { kind: 'RESULT_ENTRY', id: 'result-session-new' },
                media: {
                  id: 'old-photo',
                  type: 'PHOTO',
                  alt: 'Paginated recording',
                  thumbnailUrl: null,
                  durationMs: null,
                  canSelect: true,
                },
              },
            ]
          : [],
        meta: {
          hasMore: !query.get('cursor'),
          nextCursor: query.get('cursor') ? null : 'links-next',
        },
      },
    })
  })
  await page.getByRole('button', { name: 'Refresh history' }).click()
  const newer = page.getByLabel('Attempt session-new', { exact: true })
  await newer.getByRole('button', { name: 'More attachments' }).click()
  await expect(
    newer.getByRole('button', { name: 'Paginated recording · READY' }),
  ).toBeVisible()
  expect(cursors).toContain('links-next')
})
