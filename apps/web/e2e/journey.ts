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
  await page.getByRole('button', { name: /Workout/ }).click()
  const title = `Browser strength ${Date.now()}`
  await page.getByLabel('Program name').fill(title)
  await page
    .getByRole('button', { name: 'Continue to customize', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Activities', exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'New Activity', exact: true }).click()
  await page.getByRole('button', { name: 'Browse Activity Library' }).click()
  const library = page.getByRole('dialog', { name: 'Activity Library' })
  await library.getByLabel('Search Activities').fill('Squats')
  // Exact name: avoid matching "Chair Squats".
  await library
    .getByRole('button', { name: 'Add to Program: Squats', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Activities', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('status').filter({ hasText: /^Saved$/ }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Schedule & placement' }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Schedule & placement' }),
  ).toBeVisible()
  await page
    .getByRole('link', { name: 'Preview & Publish', exact: true })
    .click()
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
  await page.getByRole('button', { name: 'Join Free' }).click()
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
    page.getByRole('heading', { name: "Today's Results" }),
  ).toBeVisible()
  await expect(page.getByLabel('Reps (reps)', { exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Increase Reps' }).click()
  // READY → Start; FINISHED → Start again (becomes ACTIVE); already ACTIVE → continue.
  const start = page.getByRole('button', { name: 'Start', exact: true })
  const startAgain = page.getByRole('button', {
    name: 'Start again',
    exact: true,
  })
  if (await startAgain.isVisible()) await startAgain.click()
  else if (await start.isVisible()) await start.click()
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await page.getByRole('button', { name: /Finish/ }).click()
  await expect(
    page.getByRole('heading', { name: 'Calendar', exact: true }),
  ).toBeVisible()
  await expect(page).toHaveURL(/completed=/)
  await expect(tile('Completed')).toBeVisible()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(tile('Pending')).toBeVisible()
  await page.reload()
  await expect(tile('Pending')).toBeVisible()
  return { title, publishedPath }
}
