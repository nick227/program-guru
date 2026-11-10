import { expect, type Page } from '@playwright/test'
export async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  // exact: true — login heading "Sign in to your week" must not match.
  await expect(
    page.getByRole('heading', { name: 'Calendar', exact: true }),
  ).toBeVisible()
}
export async function journey(
  page: Page,
  credentials: { author: [string, string]; participant: [string, string] },
) {
  await login(page, ...credentials.author)
  await page.getByRole('link', { name: 'Add Program', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Add a Program', exact: true }),
  ).toBeVisible()
  // Step 1 · Details: type, name, then Continue into the workspace.
  await page.getByRole('button', { name: /Workout/ }).click()
  const title = `Browser strength ${Date.now()}`
  await page.getByLabel('Program name').fill(title)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  // Step 2 · Activities: add Squats from the Activity Library.
  await expect(
    page.getByRole('heading', { name: 'Activities', exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Browse Library', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Activity Library', exact: true }),
  ).toBeVisible()
  await page.getByLabel('Search Activities').fill('Squats')
  // Exact name: avoid matching "Chair Squats".
  await page
    .getByRole('button', { name: 'Add to Program: Squats', exact: true })
    .click()
  await expect(page).toHaveURL(/\/programs\/[^/]+\/workspace\?step=activities/)
  await expect(page.getByRole('link', { name: 'Squats', exact: true })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('link', { name: 'Squats', exact: true })).toBeVisible()
  // Step 3 · Publish & Share.
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Publish & Share', exact: true }),
  ).toBeVisible()
  await page.getByLabel('Start now').uncheck()
  await page
    .getByRole('button', { name: 'Publish Program', exact: true })
    .click()
  // Canonical Program URL: /@creator/slug (friendly URLs) or /programs/:id.
  await expect(page).toHaveURL(/\/(programs\/[^/?]+|@[^/?]+\/[^/?]+)$/)
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  const publishedPath = new URL(page.url()).pathname
  await page.goto('/')
  await page.getByLabel('Account', { exact: true }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(
    page.getByRole('heading', { name: 'Sign in to your week' }),
  ).toBeVisible()
  await login(page, ...credentials.participant)
  await page.goto(publishedPath)
  await page.getByRole('button', { name: 'Start Program', exact: true }).click()
  await page.getByLabel('Start date').fill('2026-11-09')
  await page.getByRole('button', { name: 'Preview my calendar' }).click()
  await page.getByRole('button', { name: 'Confirm & add to Calendar' }).click()
  await expect(page).toHaveURL(/day=2026-11-09/)
  // Day view lists every item (month cells cap at four; live accounts accumulate runs).
  await page.goto('/?view=day&day=2026-11-09')
  // Scope to this run's Program title — live DB accumulates prior enrollments.
  // Tile links are named "<Activity>, <Program>, <status> — open activity".
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const tile = (status: string) =>
    page.getByRole('link', { name: new RegExp(`^Squats, ${escaped}, ${status}`) }).first()
  await tile('Pending').click()
  await expect(
    page.getByRole('heading', { name: 'Today' }),
  ).toBeVisible()
  await expect(page.getByLabel('Reps (reps)', { exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Increase Reps' }).click()
  await page.getByRole('button', { name: 'Complete', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Completed' })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Workspace navigation' })
    .getByRole('link', { name: 'Calendar', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Calendar', exact: true }),
  ).toBeVisible()
  await expect(tile('Completed')).toBeVisible()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(tile('Pending')).toBeVisible()
  await page.reload()
  await expect(tile('Pending')).toBeVisible()
  return { title, publishedPath }
}
