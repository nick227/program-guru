// Live account journeys against the real API and worker (run via scripts/auth-live.ts). Links come from
// the emails the worker actually sent (capture provider log), so these exercise the exact URLs users get.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const mailLog = process.env.AUTH_LIVE_MAIL_LOG!
const api = process.env.AUTH_LIVE_API!
const run = Date.now().toString(36)
let n = 0
const newUser = () => {
  const id = `${run}${++n}`
  return { name: `Auth Tester ${id}`, handle: `auth_${id}`, email: `auth-${id}@test.local`, password: `Pw-${id}-correct-horse` }
}

/** Waits for the worker to send `subject` to `to`, then returns the link in it (the newest one). */
async function linkFor(to: string, path: '/verify-email' | '/reset-password', since = 0) {
  const pattern = new RegExp(`https?://[^\\s]+${path}\\?token=[A-Za-z0-9_-]+`, 'g')
  for (let i = 0; i < 80; i++) {
    const blocks = readFileSync(mailLog, 'utf8').split('[email] ').slice(1).filter((b) => b.startsWith(`to=${to} `))
    const links = blocks.slice(since).flatMap((b) => b.match(pattern) ?? [])
    if (links.length) return new URL(links.at(-1)!)
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`No ${path} email for ${to}`)
}
const mailCount = (to: string) => readFileSync(mailLog, 'utf8').split('[email] ').filter((b) => b.startsWith(`to=${to} `)).length
const relative = (u: URL) => `${u.pathname}${u.search}`

async function register(page: Page, u: ReturnType<typeof newUser>) {
  await page.goto('/login')
  await page.getByRole('link', { name: 'Create an account' }).click()
  await expect(page).toHaveURL(/\/register$/)
  await page.getByLabel('Name').fill(u.name)
  await page.getByLabel('Handle').fill(u.handle)
  await page.getByLabel('Email').fill(u.email)
  await page.getByLabel('Password').fill(u.password)
  await page.getByRole('button', { name: 'Create account' }).click()
}
async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}
const me = (page: Page) => page.request.get(`${api}/auth/me`)

test('register → verification required → verify from email → sign in', async ({ page, context }) => {
  const u = newUser()
  await register(page, u)
  // Signed in, with the verification-required state explained.
  await expect(page).toHaveURL(/\/verify-email\?sent=1/)
  await expect(page.getByRole('heading', { name: 'Confirm your email' })).toBeVisible()
  await expect(page.getByText(`We sent a confirmation link to ${u.email}`)).toBeVisible()
  await expect(page.getByText('Confirming is required before you publish')).toBeVisible()
  expect((await (await me(page)).json()).data).toMatchObject({ emailVerified: false })

  // Resend issues a newer link; the newest one is used below.
  const before = mailCount(u.email)
  await page.getByRole('button', { name: 'Send a new link' }).click()
  await expect(page.getByText('Check your inbox')).toBeVisible()
  const link = await linkFor(u.email, '/verify-email', before)

  // Sign out (clear the session), then open the emailed link signed out.
  await context.clearCookies()
  await page.goto(relative(link))
  await expect(page.getByRole('heading', { name: 'Email confirmed' })).toBeVisible()
  await page.getByRole('link', { name: 'Sign in' }).click()
  await page.getByLabel('Email').fill(u.email)
  await page.getByLabel('Password').fill(u.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/$/)
  expect((await (await me(page)).json()).data).toMatchObject({ emailVerified: true })

  // The same link again: single-use, and a verified viewer still sees success, not an error.
  await page.goto(relative(link))
  await expect(page.getByRole('heading', { name: 'Email confirmed' })).toBeVisible()
  // Signed out, the reused link is refused clearly.
  await context.clearCookies()
  await page.goto(relative(link))
  await expect(page.getByRole('heading', { name: "This link can't be used" })).toBeVisible()
  // The server answers a consumed token like an expired one; the page explains links work once.
  await expect(page.getByText(/invalid or has expired\. Verification links work once/)).toBeVisible()
})

test('request reset from login → follow link → change password → sign in; old sessions end', async ({ page, browser }) => {
  const u = newUser()
  await register(page, u)
  await expect(page).toHaveURL(/\/verify-email/)
  // A second device stays signed in until the reset.
  const other = await browser.newContext()
  const otherPage = await other.newPage()
  await signIn(otherPage, u.email, u.password)
  await expect(otherPage).toHaveURL(/\/$/)

  await page.context().clearCookies()
  await page.goto('/login')
  await page.getByRole('link', { name: 'Forgot your password?' }).click()
  await expect(page).toHaveURL(/\/forgot-password$/)
  await page.getByLabel('Email').fill(u.email)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByText(`If an account uses ${u.email}, a reset link is on its way`)).toBeVisible()
  const link = await linkFor(u.email, '/reset-password')

  await page.goto(relative(link))
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
  const newPassword = `${u.password}-new`
  await page.getByLabel('New password', { exact: true }).fill(newPassword)
  await page.getByLabel('Confirm new password').fill(`${newPassword}-typo`)
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByText('Passwords do not match')).toBeVisible()
  await page.getByLabel('Confirm new password').fill(newPassword)
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByRole('heading', { name: 'Password changed' })).toBeVisible()

  // Every session ended: the other device is sent to sign in.
  await otherPage.goto('/')
  await expect(otherPage).toHaveURL(/\/login\?returnTo=/)
  await other.close()
  // Old password fails, new one works.
  await signIn(page, u.email, u.password)
  await expect(page.getByRole('alert')).toContainText('Email or password is incorrect')
  await signIn(page, u.email, newPassword)
  await expect(page).toHaveURL(/\/$/)
  // The used reset link is now dead.
  await page.goto(relative(link))
  await page.getByLabel('New password', { exact: true }).fill('another-password-1')
  await page.getByLabel('Confirm new password').fill('another-password-1')
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByRole('heading', { name: "This link can't be used" })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Request a new reset link' })).toBeVisible()
})

test('invalid, expired and missing tokens show clear states', async ({ page }) => {
  await page.goto('/verify-email?token=not-a-real-token')
  await expect(page.getByRole('heading', { name: "This link can't be used" })).toBeVisible()
  await expect(page.getByText(/invalid or has expired/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()

  await page.goto('/reset-password')
  await expect(page.getByText('This reset link is missing its code')).toBeVisible()

  // An expired reset link: issue a real one, then age it in the database.
  const u = newUser()
  const res = await page.request.post(`${api}/auth/register`, { data: { email: u.email, password: u.password, handle: u.handle, displayName: u.name } })
  expect(res.status()).toBe(201)
  await page.context().clearCookies()
  await page.request.post(`${api}/auth/forgot-password`, { data: { email: u.email } })
  const link = await linkFor(u.email, '/reset-password')
  const { PrismaClient } = createRequire(new URL('../../../packages/db/package.json', import.meta.url))('@prisma/client')
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } })
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: u.email } })
    await prisma.authToken.updateMany({ where: { userId: user.id, purpose: 'RESET_PASSWORD' }, data: { expiresAt: new Date(Date.now() - 60_000) } })
  } finally {
    await prisma.$disconnect()
  }
  await page.goto(relative(link))
  await page.getByLabel('New password', { exact: true }).fill('fresh-password-1')
  await page.getByLabel('Confirm new password').fill('fresh-password-1')
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByRole('heading', { name: "This link can't be used" })).toBeVisible()
  await expect(page.getByText(/invalid or has expired/)).toBeVisible()
  // The old password still works: nothing changed.
  await signIn(page, u.email, u.password)
  await expect(page).toHaveURL(/\/$/)
})

test('direct navigation and refresh work on every route (SPA fallback)', async ({ page }) => {
  const publicRoutes: [string, RegExp | string][] = [
    ['/login', 'Sign in to your week'],
    ['/register', 'Create your account'],
    ['/forgot-password', 'Reset your password'],
    ['/reset-password?token=abc', 'Choose a new password'],
    ['/verify-email', 'Confirm your email'],
    ['/discover', /./],
    ['/join/some-token', /./],
  ]
  for (const [path, heading] of publicRoutes) {
    for (const load of ['goto', 'reload'] as const) {
      const response = load === 'goto' ? await page.goto(path) : await page.reload()
      expect(response?.status(), `${load} ${path}`).toBe(200)
      await expect(page.getByRole('heading', { name: 'Page not found' })).toHaveCount(0)
      await expect(page.getByRole('heading').first()).toBeVisible()
      if (typeof heading === 'string') await expect(page.getByRole('heading', { name: heading })).toBeVisible()
    }
  }
  // Signed-out deep links into the app keep their destination through sign-in.
  for (const path of ['/settings', '/notifications', '/occurrences/00000000-0000-4000-8000-000000000001']) {
    const response = await page.goto(path)
    expect(response?.status()).toBe(200)
    await expect(page).toHaveURL(new RegExp(`/login\\?returnTo=${encodeURIComponent(path).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
  }
  // Signed in, a refresh on a protected route stays put.
  const u = newUser()
  await page.request.post(`${api}/auth/register`, { data: { email: u.email, password: u.password, handle: u.handle, displayName: u.name } })
  await page.goto('/settings')
  await page.reload()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.getByRole('heading', { name: 'Page not found' })).toHaveCount(0)
})
