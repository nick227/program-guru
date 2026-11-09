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
    if (path === '/media/old-photo' && req.method() === 'GET') return send(asset)
    if (path === '/media/old-photo' && req.method() === 'DELETE') { rows = []; return send({ ok: true }) }
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
  return {
    calls,
    cursors,
    deny: (status: number) => {
      denial = status
    },
  }
}
test('all attempts appear automatically as one tile per asset with owner controls', async ({ page }) => {
  const { cursors, calls } = await setup(page)
  const media = page.getByRole('region', { name: 'Related Media', exact: true })
  await expect(media.getByRole('button', { name: 'Earlier recording', exact: true })).toHaveCount(1)
  await expect.poll(() => cursors.includes('next')).toBe(true)
  await expect(page.getByRole('button', { name: 'Media from all attempts' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Manage attachments' })).toHaveCount(0)
  await expect(media.getByRole('button', { name: 'Add media', exact: true })).toBeVisible()
  await media.getByLabel('Media options', { exact: true }).click()
  await expect(media.getByRole('button', { name: 'Share publicly', exact: true })).toBeDisabled()
  await media.getByLabel('Public sharing licence').selectOption('CC BY 4.0')
  await expect(media.getByRole('button', { name: 'Share publicly', exact: true })).toBeEnabled()
  await media.getByRole('button', { name: 'Delete media', exact: true }).click()
  await media.getByRole('button', { name: 'Confirm delete', exact: true }).click()
  await expect(media.getByRole('button', { name: 'Earlier recording', exact: true })).toHaveCount(0)
  expect(calls.some(call => call.path === '/media/old-photo' && call.method === 'DELETE')).toBe(true)
  expect(calls.some(call => call.path.startsWith('/sessions') && call.method === 'POST')).toBe(false)
})

test('deleted recordings are omitted and locked activities retain personal recordings', async ({ page }) => {
  await setup(page, { locked: true })
  await expect(page.getByRole('button', { name: 'Earlier recording', exact: true })).toBeVisible()
})

test('deleted attachments do not produce tiles', async ({ page }) => {
  const { cursors } = await setup(page, { deleted: true })
  await expect.poll(() => cursors.includes('next')).toBe(true)
  await expect(page.getByRole('button', { name: 'Earlier recording', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add media', exact: true })).toBeVisible()
})
