import { expect, test } from '@playwright/test'
import { mockApi } from './fixtures'
import { login } from './journey'

test('personal library: responsive table, filters, insights and editor handoff', async ({
  page,
}, info) => {
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'))
  await mockApi(page)
  const program = {
    id: '00000000-0000-4000-8000-000000000010',
    title: 'Strength, with intention',
    type: {
      id: '00000000-0000-4000-8000-000000000002',
      categoryId: '00000000-0000-4000-8000-000000000003',
      label: 'Workout',
    },
    creator: null,
    coverUrl: null,
    durationDays: 28,
    frequencyLabel: '3 days/week',
    visibility: 'PRIVATE',
  }
  const run = {
    id: 'run',
    status: 'ACTIVE',
    versionId: 'version-one',
    versionNumber: 1,
    pendingVersionId: 'version-two',
    startDate: '2026-11-01',
    createdAt: '2026-11-01T10:00:00Z',
    durationDays: 28,
    week: 2,
    planned: 24,
    completed: 6,
    due: 8,
    dueCompleted: 6,
    activeSeconds: 4800,
    lastParticipation: '2026-11-08T10:00:00Z',
    upcoming: [
      {
        id: 'next',
        title: 'Full body strength',
        date: '2026-11-09',
        time: '07:30',
        status: 'PLANNED',
      },
    ],
    history: [],
    customizedCount: 2,
  }
  const rows = [
    {
      program,
      owned: true,
      publicationStatus: 'PUBLISHED',
      sourceVersionId: null,
      status: 'Active',
      current: run,
      runs: [run],
    },
    {
      program: {
        ...program,
        id: 'second',
        title: 'A quieter morning',
        type: { ...program.type, label: 'Meditation' },
      },
      owned: false,
      publicationStatus: 'PUBLISHED',
      sourceVersionId: null,
      status: 'Not Started',
      current: null,
      runs: [],
    },
    {
      program: { ...program, id: 'third', title: 'Evening mobility' },
      owned: true,
      publicationStatus: 'PUBLISHED',
      sourceVersionId: 'source',
      status: 'Paused',
      current: {
        ...run,
        status: 'PAUSED',
        completed: 0,
        activeSeconds: null,
        upcoming: [],
      },
      runs: [],
    },
  ]
  await page.route('**/me/program-library', (route) =>
    route.fulfill({ json: { data: rows } }),
  )
  await login(page, 'author@test.local', 'password')
  await page.goto('/library')
  await expect(page.getByRole('heading', { name: /My Programs/ })).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(3)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: `test-results/program-library-${info.project.name}.png`,
    fullPage: true,
  })
  await page.getByLabel('Search Programs', { exact: true }).fill('quieter')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.getByLabel('Search Programs', { exact: true }).fill('')
  await page.getByRole('button', { name: /^Paused/ }).click()
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.getByRole('button', { name: /^All/ }).click()
  await page.getByLabel('Created by me').check()
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.getByLabel('Created by me').uncheck()
  await page.getByLabel('Sort Programs').selectOption('name')
  await expect(page.locator('tbody tr').first()).toContainText(
    'A quieter morning',
  )
  await page.getByRole('link', { name: /Strength, with intention/ }).click()
  await expect(
    page.getByRole('heading', { name: 'Upcoming Activities' }),
  ).toBeVisible()
  await expect(page.getByText('80 min', { exact: true })).toBeVisible()
  await expect(page.getByText('A creator update is available')).toBeVisible()
  await page.getByLabel('Manage Strength, with intention').click()
  await expect(
    page.getByRole('link', { name: 'Edit Program', exact: true }),
  ).toHaveAttribute('href', /\/workspace$/)
  const menuBox = await page.locator('.library-detail .library-menu > div').boundingBox()
  expect(menuBox!.x).toBeGreaterThanOrEqual(0)
  await page.getByRole('button', { name: 'Restart as a new run' }).click()
  await expect(page.getByRole('dialog', { name: 'Restart Program' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByLabel('Manage Strength, with intention').click()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: `test-results/program-details-${info.project.name}.png`,
    fullPage: true,
  })
})
