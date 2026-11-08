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
