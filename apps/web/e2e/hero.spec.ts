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

const libraryPhoto = {
  id: '00000000-0000-4000-8000-000000000777',
  type: 'PHOTO',
  state: 'READY',
  thumbnailUrl: null,
  mime: 'image/jpeg',
  byteSize: 10,
  width: 10,
  height: 10,
  durationMs: null,
  alt: 'Trail photo',
  license: null,
  attribution: null,
  attachmentCount: 0,
  isOwner: true,
  createdAt: '2026-11-07T12:00:00Z',
}
async function withLibraryPhoto(page: import('@playwright/test').Page) {
  await page.route(/localhost:3001\/media\/mine(\?|$)/, (route) =>
    route.fulfill({ json: { data: [libraryPhoto], meta: { nextCursor: null } } }),
  )
}

test('Workspace Upload image sets the Program cover directly, without the picker or capture', async ({
  page,
}) => {
  const { requests } = await mockApi(page)
  await login(page, 'author@test.local', 'password')
  await page.goto(`/programs/${programId}/workspace`)
  const cover = page.getByRole('group', { name: 'Program cover' })
  // 3/4 canvas cover dropzone
  await expect(cover.getByRole('button', { name: 'Upload image' }).first()).toBeVisible()

  // Directly upload a file through the Change image file input
  await cover.locator('input[type="file"]').setInputFiles({
    name: 'cover.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('fake image content'),
  })

  // Ensure no slideout picker dialog exists
  await expect(page.getByRole('dialog', { name: 'Choose program cover' })).toHaveCount(0)

  await expect.poll(() =>
    requests.find((r) => r.path === `/programs/${programId}/draft` && r.method === 'PATCH')?.body,
  ).toMatchObject({ coverMediaId: 'media:user:uploaded' })
})

test('a new Activity gets an uploaded image as a COVER on its own revision', async ({ page }) => {
  const { requests } = await mockApi(page)
  await login(page, 'participant@test.local', 'password')
  await page.goto('/add-activity?day=2026-11-12')
  await page.getByLabel('Activity title').fill('Evening sketch')
  await page.getByLabel('Category').selectOption({ label: 'Fitness' })
  await page.getByRole('button', { name: 'Create Activity' }).click()
  const image = page.getByRole('group', { name: 'Activity image' })
  await expect(image.locator('[data-hero-category="fitness"]')).toBeVisible()

  // Directly upload a file through the Activity image file input
  await image.locator('input[type="file"]').setInputFiles({
    name: 'cover.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('fake image content'),
  })

  // Ensure no slideout picker dialog exists
  await expect(page.getByRole('dialog', { name: 'Choose activity image' })).toHaveCount(0)

  await expect.poll(() =>
    requests.find((r) => r.path === '/media-attachments' && r.method === 'POST')?.body,
  ).toMatchObject({
    mediaId: 'media:user:uploaded',
    purpose: 'COVER',
    target: { kind: 'ACTIVITY_REVISION' },
  })
})

test('Workspace cover chooses an existing library photo, without capture', async ({
  page,
}) => {
  const { requests } = await mockApi(page)
  await withLibraryPhoto(page)
  await login(page, 'author@test.local', 'password')
  await page.goto(`/programs/${programId}/workspace`)
  const cover = page.getByRole('group', { name: 'Program cover' })
  await cover.getByRole('button', { name: 'Choose from library' }).click()
  const picker = page.getByRole('dialog', { name: 'Choose program cover' })
  await expect(picker).toBeVisible()
  await expect(picker.getByRole('button', { name: 'Capture', exact: true })).toHaveCount(0)
  await picker.getByRole('button', { name: 'Trail photo · READY' }).click()
  await expect(picker).toBeHidden()
  expect(
    requests.find((r) => r.path === `/programs/${programId}/draft` && r.method === 'PATCH')?.body,
  ).toMatchObject({ coverMediaId: libraryPhoto.id })
})

test('a new Activity can use an existing library photo as its COVER', async ({ page }) => {
  const { requests } = await mockApi(page)
  await withLibraryPhoto(page)
  await login(page, 'participant@test.local', 'password')
  await page.goto('/add-activity?day=2026-11-12')
  await page.getByLabel('Activity title').fill('Evening sketch')
  await page.getByLabel('Category').selectOption({ label: 'Fitness' })
  await page.getByRole('button', { name: 'Create Activity' }).click()
  const image = page.getByRole('group', { name: 'Activity image' })
  await expect(image.locator('[data-hero-category="fitness"]')).toBeVisible()
  await image.getByRole('button', { name: /Choose from library|Change image/ }).click()
  await page
    .getByRole('dialog', { name: 'Choose activity image' })
    .getByRole('button', { name: 'Trail photo · READY' })
    .click()
  await expect(page.getByRole('dialog', { name: 'Choose activity image' })).toBeHidden()
  expect(
    requests.find((r) => r.path === '/media-attachments' && r.method === 'POST')?.body,
  ).toMatchObject({ mediaId: libraryPhoto.id, purpose: 'COVER', target: { kind: 'ACTIVITY_REVISION' } })
})
