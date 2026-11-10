// Admin navigation (12-SOCIAL §7a). Regression: switching tabs client-side once crashed with
// "Should have a queue" because one resource's table instance was reused for another whose
// actions call a different number of hooks. Every section and resource tab must render.
import { expect, test, type Page } from '@playwright/test'

const me = {
  id: '00000000-0000-4000-8000-0000000000ad',
  email: 'admin-dev@test.local',
  emailVerified: true,
  emailVerificationRequired: false,
  status: 'ACTIVE',
  role: 'ADMIN',
  createdAt: '2026-11-01T00:00:00.000Z',
  profile: { id: '00000000-0000-4000-8000-0000000000ad', displayName: 'Admin Dev', handle: 'admindev', avatarUrl: null, bio: null, coverUrl: null, visibility: 'PUBLIC', relationship: 'NONE', followerCount: 0, followingCount: 0, publicProgramCount: 0, focusChips: [] },
  preferences: { timezone: 'America/Chicago', locale: 'en-US', defaultVisibility: 'PRIVATE', notifications: { inAppReminders: true, dailyEmail: false, dailyReminderTime: '08:00', groupActivity: true, followRequests: true, mutedGroupIds: [] } },
}
const contentRow = {
  kind: 'PROGRAM', id: '00000000-0000-4000-8000-000000000101', title: 'Core Foundations', status: 'DRAFT', visibility: 'PUBLIC', accessMode: 'OPEN', isPlatform: true, creator: null,
  typeLabel: 'Workout', durationDays: 28, placementCount: 12, moderated: false, hasUnpublishedChanges: false, draftRevision: 1, createdAt: '2026-11-10T00:00:00.000Z', updatedAt: '2026-11-10T00:00:00.000Z',
}
const reportRow = {
  id: '00000000-0000-4000-8000-000000000201', target: { type: 'USER', id: '00000000-0000-4000-8000-000000000301' }, reason: 'HARASSMENT', details: 'Rude comments', status: 'OPEN',
  reporter: { id: '00000000-0000-4000-8000-000000000302', handle: 'bob', displayName: 'Bob', avatarUrl: null }, createdAt: '2026-11-10T00:00:00.000Z', resolvedAt: null,
}

async function mockAdminApi(page: Page) {
  await page.route('http://localhost:3001/**', async (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    if (req.method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': req.headers().origin ?? '*', 'access-control-allow-credentials': 'true', 'access-control-allow-methods': '*', 'access-control-allow-headers': '*' } })
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': req.headers().origin ?? '*', 'access-control-allow-credentials': 'true' }, body: JSON.stringify(body) })
    const list = (data: unknown[]) => json({ data, meta: { hasMore: false, nextCursor: null } })
    if (path === '/auth/me') return json({ data: me })
    if (path === '/notifications/unread-count') return json({ data: { count: 0 } })
    if (path === '/admin/content') return list([contentRow])
    if (path === '/moderation/reports') return list([reportRow])
    return list([]) // every other admin collection: empty
  })
}

test('every admin section and tab renders when navigating client-side', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await mockAdminApi(page)
  await page.goto('/admin')
  await expect(page.getByRole('link', { name: 'Core Foundations' })).toBeVisible()

  const sections = page.getByRole('navigation', { name: 'Admin sections' })
  await sections.getByRole('link', { name: 'Users' }).click()
  await expect(page.getByPlaceholder('Name, handle or email')).toBeVisible()

  await sections.getByRole('link', { name: 'Moderation' }).click()
  await expect(page.getByText('Rude comments')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Restrict publishing' })).toBeVisible()
  await page.getByRole('link', { name: 'Media approvals' }).click()
  await expect(page.getByText('No public contributions are waiting for review.')).toBeVisible()

  await sections.getByRole('link', { name: 'Membership' }).click()
  await expect(page.getByRole('link', { name: 'Grant access' })).toBeVisible()
  for (const tab of ['Subscriptions', 'Purchases', 'Prices', 'Access']) {
    await page.getByRole('navigation', { name: 'membership views' }).getByRole('link', { name: tab }).click()
    await expect(page.getByText('This view could not load')).toHaveCount(0)
  }

  await sections.getByRole('link', { name: 'Content' }).click()
  await expect(page.getByRole('link', { name: 'Core Foundations' })).toBeVisible()
  await expect(page.getByText('This view could not load')).toHaveCount(0)
  expect(errors).toEqual([])
})
