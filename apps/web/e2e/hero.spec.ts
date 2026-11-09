import { expect, test } from '@playwright/test'
import { mockApi, programId } from './fixtures'
import { login } from './journey'

const hero = (page: import('@playwright/test').Page) =>
  page.locator('main [data-hero-category]').first()

test('a Program without a cover shows its category fallback, never a broken image', async ({
  page,
}) => {
  await mockApi(page)
  await login(page, 'author@test.local', 'password')
  await page.goto(`/programs/${programId}`)
  await expect(hero(page)).toHaveAttribute('data-hero-category', 'fitness')
  await expect(hero(page)).toHaveAttribute('data-hero-fallback', 'true')
  await expect(hero(page).locator('img')).toHaveCount(0)
})

test('a cover that fails to load falls back to the category art', async ({
  page,
}) => {
  await mockApi(page)
  // Rewrite the mocked preview's cover to an image that fails to load.
  await page.addInitScript((id) => {
    const original = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const response = await original(input, init)
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (!new URL(url).pathname.endsWith(`/programs/${id}`)) return response
      const json = await response.clone().json()
      json.data.coverUrl = 'http://localhost:3001/missing-cover.jpg'
      return new Response(JSON.stringify(json), { status: response.status, headers: response.headers })
    }
  }, programId)
  await page.route('**/missing-cover.jpg', (route) =>
    route.fulfill({ status: 404, body: '' }),
  )
  await login(page, 'author@test.local', 'password')
  const attempted = page.waitForRequest('**/missing-cover.jpg')
  await page.goto(`/programs/${programId}`)
  await attempted
  await expect(hero(page)).toHaveAttribute('data-hero-fallback', 'true')
  await expect(hero(page).locator('img')).toHaveCount(0)
})

// A real 1×1 PNG, so local previews actually render.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const photo = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG })
const uploadBodies = (requests: { path: string; method: string; body: Record<string, unknown> }[]) =>
  requests.filter((r) => r.path === '/media/uploads' && r.method === 'POST').map((r) => r.body)

test('Workspace cover uploads bound to the Program and sets it, with no picker buttons', async ({
  page,
}) => {
  const { requests } = await mockApi(page)
  await login(page, 'author@test.local', 'password')
  await page.goto(`/programs/${programId}/workspace?step=details`)
  const cover = page.getByRole('group', { name: 'Program cover' })
  await expect(cover.getByRole('button', { name: 'Add image' })).toBeVisible()
  await expect(cover.getByRole('button', { name: /Upload image|Choose from library/ })).toHaveCount(0)

  await cover.locator('input[type="file"]').setInputFiles(photo('cover.jpg'))

  await expect.poll(() => uploadBodies(requests)[0]).toMatchObject({
    target: { kind: 'PROGRAM', id: programId },
    purpose: 'COVER',
  })
  await expect.poll(() =>
    requests.find((r) => r.path === `/programs/${programId}/draft` && r.method === 'PATCH')?.body,
  ).toMatchObject({ coverMediaId: 'media:user:uploaded' })
  await expect(cover.getByRole('button', { name: 'Replace image' })).toBeVisible()
})

test('Workspace cover is removed inline', async ({ page }) => {
  const { requests } = await mockApi(page, { cover: '/existing-cover.jpg' })
  await login(page, 'author@test.local', 'password')
  await page.goto(`/programs/${programId}/workspace?step=details`)
  const cover = page.getByRole('group', { name: 'Program cover' })
  await cover.getByRole('button', { name: /^Remove/ }).click()
  await expect.poll(() =>
    requests.find((r) => r.path === `/programs/${programId}/draft` && r.method === 'PATCH')?.body,
  ).toMatchObject({ coverMediaId: null })
  await expect(cover.getByRole('button', { name: /^Remove/ })).toHaveCount(0)
  await expect(cover.getByRole('button', { name: 'Add image' })).toBeVisible()
})

test('Add Program takes a cover on the first step and sends it once the draft exists', async ({
  page,
}) => {
  const { requests } = await mockApi(page)
  await login(page, 'author@test.local', 'password')
  await page.goto('/programs/new')
  await page.getByRole('button', { name: /Workout/ }).click()
  await page.getByLabel('Program name').fill('Cover first')
  const cover = page.getByRole('group', { name: 'Program cover' })
  await cover.locator('input[type="file"]').setInputFiles(photo('first.jpg'))
  await expect(cover.getByRole('button', { name: /^Remove/ })).toHaveCount(1)
  // Inline remove, then choose again: nothing is sent before the draft exists.
  await cover.getByRole('button', { name: /^Remove/ }).click()
  await expect(cover.getByRole('button', { name: /^Remove/ })).toHaveCount(0)
  await cover.locator('input[type="file"]').setInputFiles(photo('second.jpg'))
  expect(uploadBodies(requests)).toHaveLength(0)

  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page).toHaveURL(new RegExp(`/programs/${programId}/workspace`))
  expect(uploadBodies(requests)).toEqual([
    expect.objectContaining({
      filename: 'second.jpg',
      target: { kind: 'PROGRAM', id: programId },
      purpose: 'COVER',
    }),
  ])
})

test('a new Activity takes several files, each uploaded to its own revision', async ({ page }) => {
  const { requests } = await mockApi(page)
  await login(page, 'participant@test.local', 'password')
  await page.goto('/add-activity?day=2026-11-12')
  await page.getByLabel('Activity title').fill('Evening sketch')
  await page.getByLabel('Category').selectOption({ label: 'Fitness' })
  await page.getByRole('button', { name: 'Create Activity' }).click()
  const media = page.getByRole('group', { name: 'Activity media' })
  await expect(media.getByRole('button', { name: 'Add media' })).toBeVisible()
  await expect(media.getByRole('button', { name: /Upload image|Choose from library/ })).toHaveCount(0)

  await media.locator('input[type="file"]').setInputFiles([photo('one.jpg'), photo('two.jpg')])

  await expect.poll(() => uploadBodies(requests).length).toBe(2)
  for (const body of uploadBodies(requests))
    expect(body).toMatchObject({
      target: { kind: 'ACTIVITY_REVISION' },
      purpose: 'DEMONSTRATION',
    })
  // The server attaches on processing; the client never posts a separate attachment.
  expect(requests.some((r) => r.path === '/media-attachments' && r.method === 'POST')).toBe(false)
})

test('Workspace cover is replaced, never duplicated', async ({ page }) => {
  const { requests } = await mockApi(page)
  await login(page, 'author@test.local', 'password')
  await page.goto(`/programs/${programId}/workspace?step=details`)
  const cover = page.getByRole('group', { name: 'Program cover' })
  const input = cover.locator('input[type="file"]')
  const coverPatches = () =>
    requests.filter((r) => r.path === `/programs/${programId}/draft` && r.method === 'PATCH' && 'coverMediaId' in r.body)

  await input.setInputFiles(photo('first.jpg'))
  await expect.poll(() => coverPatches().length).toBe(1)
  await expect(cover.getByRole('button', { name: 'Replace image' })).toBeVisible()
  await input.setInputFiles(photo('second.jpg'))
  await expect.poll(() => coverPatches().length).toBe(2)
  expect(uploadBodies(requests).map((b) => b.filename)).toEqual(['first.jpg', 'second.jpg'])
  await expect(cover.getByRole('button', { name: /^Remove/ })).toHaveCount(1)
})

test('a cover still processing survives navigation and reload, then settles', async ({ page }) => {
  await mockApi(page)
  let processing = true
  const asset = (state: string) => ({
    id: 'media:user:uploaded', type: 'PHOTO', state, originalUrl: null, variants: [], alt: null,
    aspectRatio: 1.5, isOwner: true, createdAt: '2026-11-08T00:00:00Z',
  })
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('http://localhost:3001/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/complete') || url.pathname === '/media/media:user:uploaded')
      return route.fulfill(json({ data: asset(processing ? 'PROCESSING' : 'READY') }))
    if (url.pathname === '/media-attachments' && url.searchParams.get('targetKind') === 'PROGRAM')
      return route.fulfill(json({
        data: processing
          ? [{
              id: 'intent-1', mediaId: 'media:user:uploaded', mediaState: 'PROCESSING', mediaDeleted: false,
              target: { kind: 'PROGRAM', id: programId }, purpose: 'COVER', position: 0,
              media: { id: 'media:user:uploaded', thumbnailUrl: null, type: 'PHOTO', durationMs: null, alt: '', canSelect: false },
            }]
          : [],
        meta: { hasMore: false, nextCursor: null },
      }))
    return route.fallback()
  })
  await login(page, 'author@test.local', 'password')
  await page.goto('/programs/new')
  await page.getByRole('button', { name: /Workout/ }).click()
  await page.getByLabel('Program name').fill('Slow cover')
  await page.getByRole('group', { name: 'Program cover' }).locator('input[type="file"]').setInputFiles(photo('slow.jpg'))
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page).toHaveURL(new RegExp(`/programs/${programId}/workspace`))

  // Navigation: the Workspace shows the same file, still processing, with its local preview.
  await page.getByRole('navigation', { name: 'Program editor steps' }).getByRole('button', { name: /Details/ }).click()
  const cover = page.getByRole('group', { name: 'Program cover' })
  await expect(cover.getByRole('status')).toHaveText('Processing…')
  await expect(cover.locator('img[src^="blob:"]')).toHaveCount(1)

  // Reload: the durable attachment intent keeps the tile.
  await page.reload()
  await expect(cover.getByRole('status')).toHaveText('Processing…')

  // The worker finishes: the tile settles without user action.
  processing = false
  await expect(cover.getByRole('status')).toHaveCount(0)
})

test('a failed upload shows its error and retries with the same file', async ({ page }) => {
  const { requests } = await mockApi(page)
  await page.route(
    /localhost:3001\/media\/uploads\/[^/]+\/complete$/,
    (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'UNAVAILABLE', message: 'Storage unavailable', requestId: 'r' }),
      }),
    { times: 1 },
  )
  await login(page, 'participant@test.local', 'password')
  await page.goto('/add-activity?day=2026-11-12')
  await page.getByLabel('Activity title').fill('Evening sketch')
  await page.getByLabel('Category').selectOption({ label: 'Fitness' })
  await page.getByRole('button', { name: 'Create Activity' }).click()
  const media = page.getByRole('group', { name: 'Activity media' })
  await media.locator('input[type="file"]').setInputFiles(photo('flaky.jpg'))

  await expect(media.getByRole('status')).toContainText('Storage unavailable')
  await media.getByRole('button', { name: 'Retry' }).click()
  await expect.poll(() => uploadBodies(requests).length).toBe(2)
  expect(uploadBodies(requests).every((b) => b.filename === 'flaky.jpg')).toBe(true)
  await expect(media.getByRole('button', { name: 'Retry' })).toHaveCount(0)
})
