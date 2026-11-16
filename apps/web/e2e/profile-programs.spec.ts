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
    // The final Profile design: one list of offerings, each Program a horizontal ProgramCard.
    const card = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: 'Everyday movement' }) })
    await card.scrollIntoViewIfNeeded()
    await expect(card).toBeVisible()

    // Usage: shown when known (including zero); absent, never a placeholder, when unavailable.
    if (usage !== 'unavailable') {
      await expect(card.getByText(available ? '128' : '0', { exact: true }).first()).toBeVisible()
      await expect(card.getByText('Enrolled', { exact: true })).toBeVisible()
      await expect(card.getByText(available ? '75%' : '0%', { exact: true })).toBeVisible()
      await expect(card.getByText('Completed', { exact: true })).toBeVisible()
    } else {
      await expect(card.getByText('Enrolled', { exact: true })).toHaveCount(0)
      await expect(card.getByText('Completed', { exact: true })).toHaveCount(0)
    }
    await expect(card.getByText('—', { exact: true })).toHaveCount(0)

    // Commitment and description from the Program.
    for (const fact of ['2 weeks', 'Daily', '6 activities', '20m/session'])
      await expect(card.getByText(fact, { exact: true })).toBeVisible()
    await expect(card.getByText('A little strength, a little mobility, and a routine you can make your own.')).toBeVisible()

    // The title opens the Program within the creator's profile, returning here (at every width; the
    // extra chevron link is desktop-only).
    await expect(card.getByRole('heading', { name: 'Everyday movement' }).getByRole('link')).toHaveAttribute(
      'href',
      '/@author/everyday-movement?returnTo=%2F%40author',
    )
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await card.screenshot({ path: testInfo.outputPath('program-overview.png') })
  })
}
