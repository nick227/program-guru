import { test, expect, type Page } from '@playwright/test'
import { mockApi, itemId } from './fixtures'
import { login } from './journey'

async function mediaApi(
  page: Page,
  options: {
    processing?: boolean
    photo?: boolean
    completionFailure?: boolean
    denied?: boolean
    uploadFailure?: boolean
    attachFailure?: boolean
    unavailable?: boolean
    initialState?: string
  } = {},
) {
  const calls: { path: string; method: string; body: any }[] = []
  let state =
    options.initialState ?? (options.processing ? 'PROCESSING' : 'READY')
  let results = 0
  const entries: { id: string; instructionId: null; media: unknown[] }[] = []
  const links: any[] = []
  let failCompletion = options.completionFailure
  let failUpload = options.uploadFailure
  let failAttach = options.attachFailure
  const asset = () => ({
    id: 'media-one',
    type: options.photo ? 'PHOTO' : 'VIDEO',
    state,
    thumbnailUrl: null,
    mime: options.photo ? 'image/png' : 'video/mp4',
    byteSize: 12,
    width: null,
    height: null,
    durationMs: 1000,
    alt: 'Squat recording',
    license: null,
    attribution: null,
    attachmentCount: 0,
    isOwner: true,
    createdAt: '2026-11-07T12:00:00Z',
  })
  await page.route('http://localhost:3001/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (
      !path.startsWith('/media') &&
      !path.endsWith('/results') &&
      !/^\/sessions\/[^/]+$/.test(path)
    )
      return route.fallback()
    if (request.method() === 'OPTIONS') return route.fallback()
    const body = request.headers()['content-type']?.includes('json')
      ? request.postDataJSON()
      : null
    calls.push({ path, method: request.method(), body })
    const send = (data: unknown, meta?: unknown) =>
      route.fulfill({ json: { data, ...(meta ? { meta } : {}) } })
    const deny = (message: string) =>
      route.fulfill({
        status: 403,
        json: { code: 'FORBIDDEN', message, requestId: 'media-test' },
      })
    if (/^\/sessions\/[^/]+$/.test(path))
      return send({ session: { id: path.split('/').at(-1) }, entries })
    if (path.endsWith('/results')) {
      const entry = {
        id: ++results === 1 ? 'result-one' : `result-${results}`,
        instructionId: null,
        media: [],
      }
      entries.push(entry)
      return send(entry)
    }
    if (path === '/media/mine' || path === '/media/platform') {
      if (new URL(request.url()).searchParams.get('q') === '') return route.fulfill({ status: 400, json: { code: 'VALIDATION_ERROR', message: 'q must not be empty' } })
      return send([asset()], { nextCursor: null })
    }
    if (path === '/media/uploads')
      return send({
        uploadId: 'upload-one',
        mediaId: 'media-one',
        method: 'PUT',
        uploadUrl: 'http://localhost:3001/media/upload-content',
        expiresAt: '2099-01-01T00:00:00Z',
        headers: { 'content-type': 'application/octet-stream' },
        maxBytes: 100000,
      })
    if (path === '/media/upload-content') {
      if (failUpload) {
        failUpload = false
        return route.fulfill({ status: 503, body: 'Try again' })
      }
      return route.fulfill({ status: 200 })
    }
    if (path.endsWith('/complete')) {
      if (failCompletion) {
        failCompletion = false
        return route.fulfill({
          status: 503,
          json: { code: 'UNAVAILABLE', message: 'Completion unavailable' },
        })
      }
      state = 'PROCESSING'
      return send(asset())
    }
    if (path === '/media/media-one') return send(asset())
    if (path === '/media/media-one/url' && options.unavailable)
      return route.fulfill({
        status: 404,
        json: { code: 'NOT_FOUND', message: 'Media unavailable' },
      })
    if (path === '/media/media-one/url')
      return options.denied
        ? deny('You cannot view this media')
        : send({
            url: options.photo
              ? '/signed-photo.png?sig=fixture'
              : '/delivery.mp4',
            posterUrl: null,
            mime: 'video/mp4',
            expiresAt: null,
          })
    if (path.startsWith('/media-attachments/')) {
      const index = links.findIndex(
        (link) => link.id === path.split('/').at(-1),
      )
      if (index >= 0) links.splice(index, 1)
      return send({ ok: true })
    }
    if (path === '/media-attachments' && request.method() === 'GET')
      return send(
        links.filter(
          (link) =>
            link.target.id ===
            new URL(request.url()).searchParams.get('targetId'),
        ),
        { nextCursor: null },
      )
    if (path === '/media-attachments') {
      if (failAttach) {
        failAttach = false
        return deny('You cannot attach this media')
      }
      const link = {
        id: 'attachment-one',
        ...body,
        media: asset(),
        mediaState: state,
        mediaDeleted: false,
      }
      links.push(link)
      return send(link)
    }
    return route.fulfill({ status: 404 })
  })
  return {
    calls,
    ready: () => {
      state = 'READY'
    },
  }
}
async function openActivity(page: Page) {
  await login(page, 'participant@test.local', 'password')
  await page.goto(
    `/occurrences/${itemId}?returnTo=${encodeURIComponent('/?week=2026-11-09&day=2026-11-10')}`,
  )
  await page.getByRole('button', { name: 'Add media' }).click()
}
test('picker waits for processing, preserves the Activity and attaches privately without uploading again', async ({
  page,
}, testInfo) => {
  await mockApi(page)
  const media = await mediaApi(page, { processing: true })
  await openActivity(page)
  const picker = page.getByRole('dialog', { name: 'Attach media' })
  await expect(
    picker.getByRole('button', { name: 'Squat recording · PROCESSING' }),
  ).toBeDisabled()
  await page.screenshot({
    path: testInfo.outputPath('media-picker.png'),
    fullPage: true,
  })
  media.ready()
  await picker.getByRole('button', { name: 'Squat recording · READY' }).click()
  await expect(picker).not.toBeVisible()
  await expect(page).toHaveURL(/day%3D2026-11-10/)
  expect(
    media.calls.find(
      (call) => call.path === '/media-attachments' && call.method === 'POST',
    )?.body,
  ).toEqual({
    mediaId: 'media-one',
    target: { kind: 'RESULT_ENTRY', id: 'result-one' },
    purpose: 'JOURNAL',
  })
  expect(
    media.calls.filter(
      (call) =>
        call.path.includes('uploads') || call.path.includes('publications'),
    ),
  ).toHaveLength(0)
})
test('attachment denial stays in picker, retains selection context and permits retry', async ({
  page,
}) => {
  await mockApi(page)
  const media = await mediaApi(page, { attachFailure: true })
  await openActivity(page)
  await page.getByRole('button', { name: 'Squat recording · READY' }).click()
  await expect(page.getByRole('alert')).toContainText(
    'You cannot attach this media',
  )
  await page.getByRole('button', { name: 'Squat recording · READY' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  expect(
    media.calls.filter((call) => call.path.endsWith('/results')),
  ).toHaveLength(1)
})
test('failed upload resumes the same ticket and never publishes', async ({
  page,
}) => {
  await mockApi(page)
  const media = await mediaApi(page, { uploadFailure: true })
  await login(page, 'participant@test.local', 'password')
  await page.goto('/media')
  await page.getByLabel('Upload private media').setInputFiles({
    name: 'demo.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('video'),
  })
  await expect(page.getByRole('alert')).toContainText('Upload failed')
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(
    page.getByText('Processing. Ready items appear below.'),
  ).toBeVisible()
  expect(
    media.calls.filter((call) => call.path === '/media/uploads'),
  ).toHaveLength(1)
  expect(
    media.calls.filter((call) => call.path === '/media/upload-content'),
  ).toHaveLength(2)
  expect(
    media.calls.filter(
      (call) =>
        call.path.includes('publications') ||
        call.path === '/media-attachments',
    ),
  ).toHaveLength(0)
})
test('viewer respects delivery authorization and never falls back to a thumbnail', async ({
  page,
}) => {
  await mockApi(page)
  await mediaApi(page, { denied: true })
  await login(page, 'participant@test.local', 'password')
  await page.goto('/media')
  await page.getByRole('button', { name: 'Squat recording · READY' }).click()
  const viewer = page.getByRole('dialog')
  await expect(viewer.getByRole('alert')).toContainText(
    'You cannot view this media',
  )
  await expect(viewer.locator('video, audio, img')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(viewer).not.toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Squat recording · READY' }),
  ).toBeFocused()
})
test('picker closes with Escape, restores focus and fits a narrow screen', async ({
  page,
}) => {
  await mockApi(page)
  await mediaApi(page)
  await openActivity(page)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Add media' })).toBeFocused()
})

test('already attached media cannot be selected again', async ({ page }) => {
  await mockApi(page)
  const media = await mediaApi(page)
  await login(page, 'participant@test.local', 'password')
  const response = page.waitForResponse((response) =>
    response.url().endsWith(`/calendar-items/${itemId}/occurrence`),
  )
  await page.goto(`/occurrences/${itemId}`)
  const envelope = await (await response).json()
  envelope.data.myMedia = [
    {
      id: 'media-one',
      type: 'VIDEO',
      alt: 'Squat recording',
      thumbnailUrl: null,
      canSelect: true,
      durationMs: 1000,
    },
  ]
  await page.route(`**/calendar-items/${itemId}/occurrence`, (route) =>
    route.fulfill({ json: envelope }),
  )
  await page.reload()
  await page.getByRole('button', { name: 'Add media' }).click()
  await expect(
    page
      .getByRole('dialog')
      .getByRole('button', { name: 'Squat recording · READY' }),
  ).toBeDisabled()
  expect(
    media.calls.filter(
      (call) => call.path === '/media-attachments' && call.method === 'POST',
    ),
  ).toHaveLength(0)
})

test('refresh retains server attachment selection without another result entry', async ({
  page,
}) => {
  await mockApi(page)
  const media = await mediaApi(page)
  await openActivity(page)
  await page.getByRole('button', { name: 'Squat recording · READY' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Add media' }).click()
  await expect(
    page
      .getByRole('dialog')
      .getByRole('button', { name: 'Squat recording · READY' }),
  ).toBeDisabled()
  expect(
    media.calls.filter((call) => call.path.endsWith('/results')),
  ).toHaveLength(1)
  expect(
    media.calls.filter(
      (call) => call.path === '/media-attachments' && call.method === 'POST',
    ),
  ).toHaveLength(1)
})

for (const state of ['FAILED', 'BLOCKED']) {
  test(`${state} assets are unavailable for attachment`, async ({ page }) => {
    await mockApi(page)
    const media = await mediaApi(page, { initialState: state })
    await openActivity(page)
    await expect(
      page.getByRole('button', { name: `Squat recording · ${state}` }),
    ).toBeDisabled()
    expect(
      media.calls.filter(
        (call) => call.path === '/media-attachments' && call.method === 'POST',
      ),
    ).toHaveLength(0)
  })
}
test('deleted media fails closed with a recoverable viewer error', async ({
  page,
}) => {
  await mockApi(page)
  await mediaApi(page, { unavailable: true })
  await login(page, 'participant@test.local', 'password')
  await page.goto('/media')
  await page.getByRole('button', { name: 'Squat recording · READY' }).click()
  await expect(page.getByRole('alert')).toContainText('Media unavailable')
  await expect(
    page.getByRole('dialog').locator('video, audio, img'),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Retry', exact: true }),
  ).toBeVisible()
})

test('upload finishes processing and the viewer renders the authorized rendition', async ({
  page,
}) => {
  await mockApi(page)
  const media = await mediaApi(page, { photo: true })
  await page.route('**/signed-photo.png?sig=fixture', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  )
  await login(page, 'participant@test.local', 'password')
  await page.goto('/media')
  await page.getByLabel('Upload private media').setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from('fixture-upload'),
  })
  await expect(
    page.getByText('Processing. Ready items appear below.'),
  ).toBeVisible()
  media.ready()
  await expect(page.getByText('Ready to attach.')).toBeVisible()
  await page.getByRole('button', { name: 'Squat recording · READY' }).click()
  const rendition = page
    .getByRole('dialog')
    .getByRole('img', { name: 'Squat recording', exact: true })
  await expect(rendition).toHaveAttribute(
    'src',
    '/signed-photo.png?sig=fixture',
  )
  await expect
    .poll(() =>
      rendition.evaluate(
        (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
      ),
    )
    .toBe(true)
  expect(
    media.calls.filter((call) => call.path.includes('publications')),
  ).toHaveLength(0)
})

test('completion retry does not upload the bytes or create a ticket again', async ({
  page,
}) => {
  await mockApi(page)
  const media = await mediaApi(page, { completionFailure: true })
  await login(page, 'participant@test.local', 'password')
  await page.goto('/media')
  await page.getByLabel('Upload private media').setInputFiles({
    name: 'video.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('fixture-upload'),
  })
  await expect(page.getByRole('alert')).toContainText('Completion unavailable')
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(
    page.getByText('Processing. Ready items appear below.'),
  ).toBeVisible()
  expect(
    media.calls.filter((call) => call.path === '/media/uploads'),
  ).toHaveLength(1)
  expect(
    media.calls.filter((call) => call.path === '/media/upload-content'),
  ).toHaveLength(1)
  expect(
    media.calls.filter((call) => call.path.endsWith('/complete')),
  ).toHaveLength(2)
})

test('type filters use the SDK query and native capture reuses the picker modal', async ({
  page,
}) => {
  await mockApi(page)
  await mediaApi(page)
  await openActivity(page)
  const filtered = page.waitForRequest(
    (request) =>
      request.url().includes('/media/mine?') &&
      new URL(request.url()).searchParams.get('type') === 'VIDEO',
  )
  await page.getByRole('button', { name: 'Videos', exact: true }).click()
  await filtered
  await page.getByRole('button', { name: 'Capture', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(page.getByLabel('Photo or video')).toHaveAttribute(
    'capture',
    'environment',
  )
  await page.getByRole('button', { name: 'Back to library' }).click()
  await expect(page.getByLabel('Search media')).toBeVisible()
})

test('attachment IDs survive refresh and detach is confirmed after a second refresh', async ({
  page,
}) => {
  await mockApi(page)
  const media = await mediaApi(page)
  await openActivity(page)
  await page.getByRole('button', { name: 'Squat recording · READY' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.reload()
  await page
    .getByRole('button', { name: 'Manage attachments', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Detach', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Detach', exact: true }).click()
  await expect(page.getByText('No attachments for this result.')).toBeVisible()
  await page.reload()
  await page
    .getByRole('button', { name: 'Manage attachments', exact: true })
    .click()
  await expect(page.getByText('No attachments for this result.')).toBeVisible()
  expect(
    media.calls
      .filter((call) => call.method === 'DELETE')
      .map((call) => call.path),
  ).toEqual(['/media-attachments/attachment-one'])
  expect(
    media.calls.filter((call) => call.path.endsWith('/results')),
  ).toHaveLength(1)
})

test('picker reads all attachment pages before permitting a duplicate selection', async ({
  page,
}) => {
  await mockApi(page)
  await mediaApi(page)
  await openActivity(page)
  await page.getByRole('button', { name: 'Squat recording · READY' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  const cursors: (string | null)[] = []
  await page.route('**/media-attachments?**', async (route) => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor')
    cursors.push(cursor)
    await route.fulfill({
      json: {
        data: cursor
          ? [
              {
                id: 'persisted-link',
                mediaId: 'media-one',
                mediaDeleted: false,
              },
            ]
          : [],
        meta: { hasMore: !cursor, nextCursor: cursor ? null : 'second-page' },
      },
    })
  })
  await page.reload()
  await page.getByRole('button', { name: 'Add media' }).click()
  await expect(
    page
      .getByRole('dialog')
      .getByRole('button', { name: 'Squat recording · READY' }),
  ).toBeDisabled()
  await expect.poll(() => cursors).toContain('second-page')
})

test('attachment enumeration denial blocks selection instead of treating the target as empty', async ({
  page,
}) => {
  await mockApi(page)
  await mediaApi(page)
  await openActivity(page)
  await page.getByRole('button', { name: 'Squat recording · READY' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.route('**/media-attachments?**', (route) =>
    route.fulfill({
      status: 404,
      json: { code: 'NOT_FOUND', message: 'Target unavailable' },
    }),
  )
  await page.reload()
  await page.getByRole('button', { name: 'Add media' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'Target unavailable',
  )
  await expect(
    page
      .getByRole('dialog')
      .getByRole('button', { name: 'Squat recording · READY' }),
  ).toBeDisabled()
})

test('failed detach preserves the persisted link and allows an explicit retry', async ({
  page,
}) => {
  await mockApi(page)
  await mediaApi(page)
  await openActivity(page)
  await page.getByRole('button', { name: 'Squat recording · READY' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.reload()
  await page
    .getByRole('button', { name: 'Manage attachments', exact: true })
    .click()
  await page.route(
    '**/media-attachments/attachment-one',
    (route) =>
      route.fulfill({
        status: 503,
        json: { code: 'UNAVAILABLE', message: 'Detach unavailable' },
      }),
    { times: 1 },
  )
  await page.getByRole('button', { name: 'Detach', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Detach unavailable')
  await expect(
    page.getByRole('button', { name: 'View', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Detach', exact: true }).click()
  await expect(page.getByText('No attachments for this result.')).toBeVisible()
})

test('occurrence rows follow the locked order with media after session controls', async ({
  page,
}) => {
  await mockApi(page)
  await login(page, 'participant@test.local', 'password')
  await page.goto(`/occurrences/${itemId}`)
  await expect(page.getByRole('heading', { name: 'Session', exact: true })).toBeVisible()
  const headings = await page.getByRole('heading', { level: 2 }).allInnerTexts()
  const order = ["Today's Results", 'Session', 'My Metrics', 'Your session media']
    .map((name) => headings.findIndex((text) => text.trim() === name))
  expect(order.every((index) => index >= 0)).toBe(true)
  expect([...order].sort((a, b) => a - b)).toEqual(order)
})

test('session upload attaches to the current attempt privately without starting it', async ({
  page,
}) => {
  await mockApi(page)
  const media = await mediaApi(page, { photo: true })
  await login(page, 'participant@test.local', 'password')
  await page.goto(`/occurrences/${itemId}`)
  const session = page.getByRole('heading', { name: 'Session', exact: true }).locator('xpath=ancestor::section[1]')
  await expect(session.getByRole('button', { name: 'Upload media' })).toBeEnabled()
  await session.locator('input[type="file"]').setInputFiles({
    name: 'capture.png',
    mimeType: 'image/png',
    buffer: Buffer.from('fixture-capture'),
  })
  await expect(session.getByText('Processing media…')).toBeVisible()
  media.ready()
  await expect(session.getByText('Media attached to this attempt.')).toBeVisible()
  const attachCalls = media.calls.filter(
    (call) => call.path === '/media-attachments' && call.method === 'POST',
  )
  expect(attachCalls).toHaveLength(1)
  expect(attachCalls[0]!.body).toMatchObject({
    mediaId: 'media-one',
    target: { kind: 'RESULT_ENTRY' },
    purpose: 'JOURNAL',
  })
  expect(media.calls.filter((call) => call.path.includes('publications'))).toHaveLength(0)
  await expect(session.getByText('Ready to start')).toBeVisible()
})
