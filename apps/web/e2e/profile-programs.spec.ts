import { expect, test } from '@playwright/test'
import { mockApi, programId } from './fixtures'

const image =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#385d67"/><circle cx="160" cy="100" r="60" fill="#91b7a5"/></svg>',
  )

for (const usage of ['available', 'zero', 'unavailable']) {
  const available = usage === 'available'
  test(`profile program overview with ${usage} usage`, async ({
    page,
  }, testInfo) => {
    await mockApi(page)
    const program = {
      id: programId,
      title: 'Everyday movement',
      creator: null,
      type: { id: 'workout', label: 'Workout', categoryId: 'fitness' },
      coverUrl: image,
      durationDays: 14,
      frequencyLabel: 'Daily',
      sessionMinutes: 20,
      accessMode: 'OPEN',
      viewerAccess: 'PREVIEW',
      tags: [],
    }
    await page.route('**/users/author**', async (route) => {
      const path = new URL(route.request().url()).pathname
      let data: unknown = []
      if (path.endsWith('/users/author'))
        data = {
          id: 'author',
          handle: 'author',
          displayName: 'Alex Morgan',
          bio: 'Make room for movement, one day at a time.',
          visibility: 'PUBLIC',
          relationship: 'NONE',
          publicProgramCount: 1,
          followerCount: 24,
          followingCount: 8,
          focusChips: [],
        }
      if (path.endsWith('/programs')) data = [program]
      await route.fulfill({ json: { data, meta: { nextCursor: null } } })
    })
    await page.route(`**/programs/${programId}`, (route) =>
      route.fulfill({
        json: {
          data: {
            ...program,
            description:
              'A little strength, a little mobility, and a routine you can make your own.',
            latestVersionId: null,
            enrollmentCount: available ? 128 : usage === 'zero' ? 0 : null,
            completionRate: available ? 0.75 : usage === 'zero' ? 0 : null,
            safeActivityOutline: Array.from({ length: 6 }, (_, i) => ({
              title: `Movement ${i + 1}`,
              dayIndex: i + 1,
              durationMinutes: 20,
              mediaPreviewUrl:
                i === 0 ? image : image.replace('91b7a5', 'ddb483'),
            })),
          },
        },
      }),
    )
    await page.goto('/@author')
    await page
      .getByRole('region', { name: 'Creator programs' })
      .scrollIntoViewIfNeeded()
    const card = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: 'Everyday movement' }) })
    if (usage !== 'unavailable') {
      await expect(
        card.getByText(available ? '128' : '0', { exact: true }).first(),
      ).toBeVisible()
      await expect(
        card.getByText(available ? '75%' : '0%', { exact: true }),
      ).toBeVisible()
    } else {
      await expect(card.getByText('Enrolled', { exact: true })).toHaveCount(0)
    }
    await expect(card.getByText('—', { exact: true })).toHaveCount(0)
    const gallery = card.getByRole('region', {
      name: 'Everyday movement media',
    })
    await expect(gallery.getByRole('button')).toHaveCount(1)
    await expect(gallery.getByText('Media · 1')).toBeVisible()
    await expect(card.getByText('Movement 5', { exact: true })).toHaveCount(0)
    await card.getByRole('button', { name: 'Show all 6 activities' }).click()
    await expect(
      card
        .getByRole('region', { name: 'Everyday movement activities' })
        .getByText('Movement 6', { exact: true }),
    ).toBeVisible()
    await card.getByRole('button', { name: 'Show fewer activities' }).click()
    await gallery
      .getByRole('button', { name: 'Movement 2', exact: true })
      .click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(
      card.getByRole('link', { name: 'Open Everyday movement' }),
    ).toHaveAttribute(
      'href',
      '/@author/everyday-movement?returnTo=%2F%40author',
    )
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    if (testInfo.project.name === 'desktop') {
      const box = await card.boundingBox()
      expect(box!.height).toBeLessThan(180)
    }
    await card.screenshot({ path: testInfo.outputPath('program-overview.png') })
  })
}
