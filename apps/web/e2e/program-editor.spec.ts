import { test, expect } from '@playwright/test'
import { mockApi, programId } from './fixtures'
import { login } from './journey'

test.describe('Unified Program Editor (Details → Activities → Publish & Share)', () => {
  test('full lifecycle: create → details with 3/4 canvas → activities → publish & share → reopen and edit', async ({
    page,
  }) => {
    const { requests } = await mockApi(page)
    await login(page, 'author@test.local', 'password')

    // ── 1. INITIAL CREATION ENTRY POINT ───────────────────────────────────
    await page.goto('/programs/new')

    // Persistent 3-step stepper is visible from the beginning
    const stepper = page.getByRole('navigation', { name: 'Program editor steps' })
    await expect(stepper).toBeVisible()
    await expect(stepper.getByRole('button', { name: /Details/ })).toHaveAttribute(
      'aria-current',
      'step',
    )

    // Select Program Type (Workout)
    await page.getByRole('button', { name: /Workout/ }).click()
    await expect(page).toHaveURL(/\/programs\/new\?type=/)

    // Enter initial Program name and description
    await page.getByLabel('Program name').fill('Full Body Mastery')
    await page
      .getByPlaceholder('What is this Program about?')
      .fill('A comprehensive functional program.')

    // Continue into the unified workspace
    await page
      .getByRole('button', { name: 'Continue', exact: true })
      .click()

    // Lands on Step 2 (Activities)
    await expect(page).toHaveURL(new RegExp(`/programs/${programId}/workspace\\?step=activities`))
    await expect(page.getByRole('heading', { name: 'Activities', exact: true })).toBeVisible()
    await expect(stepper.getByRole('button', { name: /Activities/ })).toHaveAttribute(
      'aria-current',
      'step',
    )

    // ── 2. STEP 1: DETAILS & RELOAD PERSISTENCE ───────────────────────────
    // Navigate back to Step 1 via persistent stepper
    await stepper.getByRole('button', { name: /Details/ }).click()
    await expect(page).toHaveURL(new RegExp(`/programs/${programId}/workspace\\?step=details`))
    await expect(stepper.getByRole('button', { name: /Details/ })).toHaveAttribute(
      'aria-current',
      'step',
    )

    // Verify Title input and 3/4 Canvas Cover image controls are visible
    await expect(page.getByLabel('Program name')).toBeVisible()
    const coverGroup = page.getByRole('group', { name: 'Program cover' })
    await expect(coverGroup).toBeVisible()
    // "Attach Program image" button is removed, 3/4 canvas upload dropzone is present
    await expect(coverGroup.getByRole('button', { name: 'Upload image' }).first()).toBeVisible()
    await expect(
      coverGroup.getByRole('button', { name: 'Attach Program image' }),
    ).toHaveCount(0)

    // Test duration adjustment in Details
    await page.getByRole('button', { name: '4 weeks', exact: true }).click()
    expect(
      requests.some(
        (r) =>
          r.path.endsWith('/draft') &&
          r.method === 'PATCH' &&
          r.body.durationDays === 28,
      ),
    ).toBe(true)

    // Test reload persistence on Step 1
    await page.reload()
    await expect(page).toHaveURL(new RegExp(`/programs/${programId}/workspace\\?step=details`))
    await expect(page.getByLabel('Program name')).toBeVisible()

    // Advance to Step 2 via consistent Continue button
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/programs/${programId}/workspace\\?step=activities`))

    // ── 3. STEP 2: ACTIVITIES ─────────────────────────────────────────────
    await expect(page.getByRole('heading', { name: 'Activities', exact: true })).toBeVisible()

    // Create a new activity inline without losing the program draft
    // Verify Instructions are cut per user instruction
    await page.getByLabel('Activity title').fill('Push-ups')
    await page.getByLabel('Description (optional)').fill('Chest and triceps strength.')
    await expect(page.getByLabel('Instructions (optional)')).toHaveCount(0)

    // No per-Activity duration or frequency: Program scheduling owns frequency, and these
    // values were never saved.
    await expect(page.getByLabel('Duration')).toHaveCount(0)
    await expect(page.getByLabel('Frequency')).toHaveCount(0)

    await page.getByRole('button', { name: 'Create Activity', exact: true }).click()

    // Suggested Activities section is cut per user instruction
    await expect(page.getByText('Suggested Activities')).toHaveCount(0)

    // 3/4 Multi-media upload canvas is present on the created activity
    await expect(page.locator('.aspect-\\[3\\/4\\]').first()).toBeVisible()

    // Add newly created activity to program
    await page.getByRole('button', { name: 'Add to Program' }).click()

    // Advance to Step 3 (Publish & Share) via consistent Continue button
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/programs/${programId}/workspace\\?step=publish`))

    // ── 4. STEP 3: PUBLISH & SHARE ────────────────────────────────────────
    await expect(stepper.getByRole('button', { name: /Publish & Share/ })).toHaveAttribute(
      'aria-current',
      'step',
    )
    await expect(
      page.getByRole('heading', { name: 'Publish & Share', exact: true }),
    ).toBeVisible()

    // Visibility & Group Sharing combined section without sentence titles
    await expect(
      page.getByRole('heading', { name: 'Visibility & Group Sharing', exact: true }),
    ).toBeVisible()
    await expect(page.getByText('Who can find it?')).toHaveCount(0)
    await expect(page.getByText('Do this together')).toHaveCount(0)

    // "Start Program on Calendar" section is cut per user instruction
    await expect(page.getByText('Start Program on Calendar')).toHaveCount(0)

    // Visibility controls
    await expect(page.getByRole('button', { name: 'Public' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Link only' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Private' })).toBeVisible()

    // Publish Program
    // Wait for the request itself: checking the log right after the click raced the network.
    const publishRequest = page.waitForRequest(
      (request) =>
        new URL(request.url()).pathname === `/programs/${programId}/publish` &&
        request.method() === 'POST',
    )
    await page.getByRole('button', { name: 'Publish Program', exact: true }).click()
    await publishRequest
    expect(
      requests.find(
        (r) =>
          r.path === `/programs/${programId}/publish` && r.method === 'POST',
      ),
    ).toBeDefined()

    // ── 5. REOPEN SAME PROGRAM AND EDIT THROUGH ALL THREE STEPS ───────────
    await page.goto(`/programs/${programId}/workspace`)

    // Starts on Step 1 (Details)
    await expect(stepper.getByRole('button', { name: /Details/ })).toHaveAttribute(
      'aria-current',
      'step',
    )
    await expect(page.getByLabel('Program name')).toBeVisible()

    // Move to Step 2 (Activities)
    await stepper.getByRole('button', { name: /Activities/ }).click()
    await expect(page.getByRole('heading', { name: 'Activities', exact: true })).toBeVisible()

    // Move to Step 3 (Publish & Share)
    await stepper.getByRole('button', { name: /Publish & Share/ }).click()
    await expect(page.getByRole('heading', { name: 'Publish & Share', exact: true })).toBeVisible()

    // Navigate back to Step 1 using Previous button
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Activities', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(page.getByLabel('Program name')).toBeVisible()
  })

  test('navigation to incomplete steps preserves state and allows review', async ({
    page,
  }) => {
    await mockApi(page)
    await login(page, 'author@test.local', 'password')
    await page.goto(`/programs/${programId}/workspace?step=details`)

    const stepper = page.getByRole('navigation', { name: 'Program editor steps' })

    // Jump directly to Step 3 (Publish & Share) without completing activities
    await stepper.getByRole('button', { name: /Publish & Share/ }).click()
    await expect(page).toHaveURL(new RegExp(`/programs/${programId}/workspace\\?step=publish`))
    await expect(page.getByRole('heading', { name: 'Publish & Share', exact: true })).toBeVisible()

    // Combined Visibility & Group Sharing is present
    await expect(
      page.getByRole('heading', { name: 'Visibility & Group Sharing', exact: true }),
    ).toBeVisible()
  })
})
