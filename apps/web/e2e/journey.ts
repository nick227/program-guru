import { expect, type Page } from '@playwright/test'
export async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(
    page.getByRole('button', { name: /Pages menu, current page (Home|Calendar)/ }),
  ).toBeVisible()
}
export async function journey(
  page: Page,
  credentials: { author: [string, string]; participant: [string, string] },
) {
  await login(page, ...credentials.author)
  await page.getByRole('button', { name: /Pages menu/ }).click()
  await page.getByRole('link', { name: 'Add Program', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Add Program', exact: true }),
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
    page
      .getByRole('navigation', { name: 'Program editor steps' })
      .getByRole('button', { name: /Publish & Share/ }),
  ).toHaveAttribute('aria-current', 'step')
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
  // One click starts the Program today and stays on the page (13 §4).
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  await page.getByRole('button', { name: 'Start Program', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Program Added', exact: true })).toBeDisabled()
  // Day view lists every item (month cells cap at four; live accounts accumulate runs).
  await page.goto(`/calendar?view=day&day=${today}`)
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
  await page.getByRole('button', { name: 'Mark as Complete', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Completed' })).toBeVisible()
  // Completion stays on the Occurrence; the Calendar shows it, and Undo lives on the Occurrence.
  await page.goto(`/calendar?view=day&day=${today}`)
  await expect(tile('Completed')).toBeVisible()
  await tile('Completed').click()
  await page.getByRole('button', { name: 'Undo completion', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'To do' })).toBeVisible()
  await page.goto(`/calendar?view=day&day=${today}`)
  await expect(tile('Pending')).toBeVisible()
  await page.reload()
  await expect(tile('Pending')).toBeVisible()
  return { title, publishedPath }
}
