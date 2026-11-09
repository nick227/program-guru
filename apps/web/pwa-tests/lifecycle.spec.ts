import { test, expect } from '@playwright/test'
import { programId } from '../e2e/fixtures'

test('production installability, auth/deep links, offline shell, cache isolation and safe A → B update', async ({ page, context, request }) => {
  await page.goto(`/programs/${programId}/workspace?step=details`)
  await expect(page).toHaveURL(/login\?returnTo=/)
  await page.getByLabel('Email', { exact: true }).fill('author@test.local')
  await page.getByLabel('Password', { exact: true }).fill('password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByLabel('Program name')).toBeVisible()
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await expect(page.getByLabel('Program name')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-app-build', 'A')

  const cdp = await context.newCDPSession(page)
  await cdp.send('Page.enable')
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors')
  expect(installabilityErrors).toEqual([])
  const manifest = await (await request.get('/manifest.webmanifest')).json()
  expect(manifest).toMatchObject({ id: '/', start_url: '/', scope: '/', display: 'standalone' })
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src)
    const bytes = await response.body()
    expect(bytes.readUInt32BE(16)).toBe(Number(icon.sizes.split('x')[0]))
    expect(bytes.readUInt32BE(20)).toBe(Number(icon.sizes.split('x')[1]))
  }
  expect((await request.get('/sw.js')).headers()['cache-control']).toBe('no-cache')

  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Install App', exact: true }).click()
  // Chromium may supply a native install event; fallback is covered separately below.

  await page.evaluate(async () => {
    await fetch('/api/signed-media?token=private')
    await fetch('/api/uploads/private')
    await fetch('/api/media/upload-content', { method: 'PUT', body: 'private bytes' })
  })
  const urls = await page.evaluate(async () => {
    const result: string[] = []
    for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) result.push(req.url)
    return result
  })
  expect(urls.length).toBeGreaterThan(3)
  expect(urls.every(url => /^\/(?:index\.html|manifest\.webmanifest|favicon\.(?:ico|svg)|assets\/[^?]+|icons\/[^?]+)(?:\?|$)/.test(new URL(url).pathname))).toBe(true)
  expect(urls.some(url => /api\/|token=|signed-media|uploads\//.test(url))).toBe(false)

  await context.setOffline(true)
  await page.goto(`/programs/${programId}/workspace?step=details`)
  await expect(page.getByRole('heading', { name: 'Connect to load your account' })).toBeVisible()
  await context.setOffline(false)
  console.log('reconnect', await page.evaluate(() => ({ online: navigator.onLine, visibility: document.visibilityState })))
  page.on('requestfailed', req => console.log('failed', req.url(), req.failure()))
  page.on('console', msg => console.log('browser', msg.text()))
  await expect(page.getByLabel('Program name')).toBeVisible()
  // Session cookie survives the cold offline launch; API responses do not.
  const before = await (await request.get('/api/__test/state')).json()
  await page.clock.install()
  await page.clock.fastForward(61_000)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect.poll(async () => (await (await request.get('/api/__test/state')).json()).meRequests).toBeGreaterThan(before.meRequests)
  await page.clock.resume()

  await request.get('/api/__test/release')
  await page.evaluate(async () => { await (await navigator.serviceWorker.ready).update() })
  const prompt = page.getByRole('complementary', { name: 'App update' })
  await expect(prompt).toBeVisible()
  await prompt.getByRole('button', { name: 'Later' }).click()
  await expect(prompt).toBeHidden()
  await expect(page.locator('html')).toHaveAttribute('data-app-build', 'A')
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(prompt).toBeVisible()

  // An autosave stays in flight while Reload is clicked.
  await request.get('/api/__test/state?hold=true')
  const autosave = page.waitForRequest(req => req.method() === 'PATCH' && req.url().endsWith('/draft'))
  await page.getByLabel('Program name').fill('Keep my unsaved work')
  await prompt.getByRole('button', { name: 'Reload', exact: true }).click()
  await expect(prompt.getByText(/Save your work/)).toBeVisible()
  await autosave
  await prompt.getByRole('button', { name: 'Reload', exact: true }).click()
  await expect(prompt.getByText(/Save your work/)).toBeVisible()
  await expect(page.getByLabel('Program name')).toHaveValue('Keep my unsaved work')
  await expect(page.locator('html')).toHaveAttribute('data-app-build', 'A')
  await request.get('/api/__test/state')
  await expect(page.getByText('Saving…', { exact: true })).toBeHidden()
  // Leave the edited view using in-app navigation (the update remains waiting).
  await page.getByRole('link', { name: 'Program.Guru', exact: true }).click()
  await expect(page).toHaveURL('/')
  await prompt.getByRole('button', { name: 'Reload', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-app-build', 'B')
  await expect(prompt).toBeHidden()
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  await page.getByLabel('Account', { exact: true }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL('/login')
  await page.goto('/settings')
  await expect(page).toHaveURL(/login\?returnTo=/)
})

test('browser fallback and standalone install action', async ({ page }) => {
  // Suppress native install availability while exercising the real fallback UI.
  await page.addInitScript(() => {
    window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); event.stopImmediatePropagation() })
  })
  await page.goto('/login?returnTo=/settings')
  await page.getByLabel('Email', { exact: true }).fill('author@test.local')
  await page.getByLabel('Password', { exact: true }).fill('password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('button', { name: 'Install App', exact: true }).click()
  await expect(page.getByText(/On iPhone or iPad/)).toBeVisible()
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })
    window.dispatchEvent(new Event('appinstalled'))
  })
  await expect(page.getByRole('button', { name: 'Install App', exact: true })).toHaveCount(0)
})
