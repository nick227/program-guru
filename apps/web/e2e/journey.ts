import { expect, type Page } from '@playwright/test'
export async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  // exact: true — login heading "Sign in to your week" must not match.
  await expect(
    page.getByRole('heading', { name: 'Your week', exact: true }),
  ).toBeVisible()
}
export async function journey(
  page: Page,
  credentials: { author: [string, string]; participant: [string, string] },
) {
  await login(page, ...credentials.author)
  await page.getByRole('link', { name: 'Program', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Find your next Program' }),
  ).toBeVisible()
  // A real library must have at least one Program before we begin authoring.
  await expect(
    page
      .locator('a[href^="/programs/"]')
      .filter({ has: page.locator('h2') })
      .first(),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Create Program', exact: true }).click()
  await page.getByRole('button', { name: 'Workout', exact: true }).click()
  await page.getByRole('button', { name: 'Strength', exact: true }).click()
  // Title is the accessible-name prefix; avoid matching "Chair Squats".
  await page.getByRole('button', { name: /^Squats/ }).click()
  await page.getByRole('button', { name: 'Add 1 Activities' }).click()
  await expect(
    page.getByRole('heading', { name: 'Activities', exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Edit', exact: true }).click()
  const title = `Browser strength ${Date.now()}`
  await page.getByLabel('Program title').fill(title)
  await expect(
    page.getByRole('status').filter({ hasText: /^Saved$/ }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Workspace', exact: true }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await page.getByRole('link', { name: 'Calendar', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Review schedule' }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Review schedule' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Workspace', exact: true }).click()
  await page
    .getByRole('link', { name: 'Preview & Publish', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Publish Program', exact: true })
    .click()
  await expect(page).toHaveURL(/\/programs\/[^/?]+$/)
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
  await page.getByRole('button', { name: 'Join Free' }).click()
  await page.getByLabel('Start date').fill('2026-11-09')
  await page.getByRole('button', { name: 'Preview my calendar' }).click()
  await page.getByRole('button', { name: 'Confirm & add to Calendar' }).click()
  await expect(page).toHaveURL(/week=2026-11-09&day=2026-11-09/)
  await page.reload()
  await page
    .getByRole('link', { name: /^Squats/ })
    .first()
    .click()
  await expect(
    page.getByRole('heading', { name: "Today's Results" }),
  ).toBeVisible()
  await expect(page.getByLabel('Reps (reps)', { exact: true })).toHaveValue('')
  await page.getByRole('button', { name: 'Increase Reps' }).click()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await page.getByRole('button', { name: 'Finish', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Your week', exact: true }),
  ).toBeVisible()
  await expect(page).toHaveURL(/week=2026-11-09&day=2026-11-09/)
  await expect(page.getByRole('link', { name: /^Squats/ }).first()).toContainText(
    'Completed',
  )
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByRole('link', { name: /^Squats/ }).first()).toContainText(
    'Planned',
  )
  await page.reload()
  await expect(page.getByRole('link', { name: /^Squats/ }).first()).toContainText(
    'Planned',
  )
  return { title, publishedPath }
}
