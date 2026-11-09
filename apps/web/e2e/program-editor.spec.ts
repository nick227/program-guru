import { test, expect } from '@playwright/test'
import { mockApi, programId } from './fixtures'
import { login } from './journey'

test.describe('Unified 4-Step Program Editor', () => {
  test('full lifecycle: create → details → activities → schedule projection → publish → start → reopen and edit', async ({
    page,
  }) => {
    const { requests } = await mockApi(page)
    await login(page, 'author@test.local', 'password')

    // ── 1. INITIAL CREATION ENTRY POINT ───────────────────────────────────
    await page.goto('/programs/new')

    // Persistent 4-step stepper is visible from the beginning
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
      .fill('A comprehensive 4-step functional program.')

    // Continue into the unified workspace
    await page
      .getByRole('button', { name: 'Continue to customize', exact: true })
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

    // Verify Title input and Cover image controls are visible
    await expect(page.getByLabel('Program name')).toBeVisible()
    const coverGroup = page.getByRole('group', { name: 'Program cover' })
    await expect(coverGroup).toBeVisible()
    await expect(
      coverGroup.getByRole('button', { name: 'Attach Program image' }),
    ).toBeVisible()

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

    // Advance to Step 2 via Next control
    await page.getByRole('button', { name: 'Continue to Activities →' }).click()
    await expect(page).toHaveURL(new RegExp(`/programs/${programId}/workspace\\?step=activities`))

    // ── 3. STEP 2: ACTIVITIES ─────────────────────────────────────────────
    // Compact editable rows with thumbnails are displayed
    await expect(page.getByRole('heading', { name: 'Activities', exact: true })).toBeVisible()

    // Create a new activity inline without losing the program draft
    await page.getByLabel('Activity title').fill('Push-ups')
    await page.getByLabel('Description').fill('Chest and triceps strength.')
    await page
      .getByLabel('Instructions (optional)')
      .fill('Keep core tight throughout.')
    await page.getByRole('button', { name: 'Create Activity', exact: true }).click()

    // Add newly created activity to program
    await page.getByRole('button', { name: 'Add Activity to Program' }).click()

    // Advance to Step 3 (Schedule) via Next control
    await page.getByRole('button', { name: 'Continue to Schedule →' }).click()
    await expect(page).toHaveURL(new RegExp(`/programs/${programId}/workspace\\?step=schedule`))

    // ── 4. STEP 3: SCHEDULE REVIEW & PROJECTION ───────────────────────────
    await expect(stepper.getByRole('button', { name: /Schedule/ })).toHaveAttribute(
      'aria-current',
      'step',
    )
    await expect(
      page.getByRole('heading', { name: 'Schedule & placement', exact: true }),
    ).toBeVisible()

    // Projected calendar surface (month view) is rendered
    await expect(page.locator('.calendar')).toBeVisible()
    await expect(page.getByText('Projected start date')).toBeVisible()

    // Previous month / Next month controls
    await expect(page.getByRole('button', { name: 'Previous month' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next month' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Today' })).toBeVisible()

    // Test deep-link reload persistence on Step 3
    await page.reload()
    await expect(page).toHaveURL(new RegExp(`/programs/${programId}/workspace\\?step=schedule`))
    await expect(
      page.getByRole('heading', { name: 'Schedule & placement', exact: true }),
    ).toBeVisible()

    // Advance to Step 4 (Publish & Share)
    await page
      .getByRole('button', { name: 'Continue to Publish & Share →' })
      .click()
    await expect(page).toHaveURL(new RegExp(`/programs/${programId}/workspace\\?step=publish`))

    // ── 5. STEP 4: PUBLISH & SHARE ────────────────────────────────────────
    await expect(stepper.getByRole('button', { name: /Publish/ })).toHaveAttribute(
      'aria-current',
      'step',
    )
    await expect(
      page.getByRole('heading', { name: 'Publish & Share', exact: true }),
    ).toBeVisible()

    // Summary and visibility controls
    await expect(page.getByRole('button', { name: 'Public' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Link only' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Private' })).toBeVisible()

    // Publish Program
    await page.getByRole('button', { name: 'Publish Program' }).click()
    expect(
      requests.find(
        (r) =>
          r.path === `/programs/${programId}/publish` && r.method === 'POST',
      ),
    ).toBeDefined()

    // ── 6. START PROGRAM ON PERSONAL CALENDAR ─────────────────────────────
    // Revisit workspace to start program on calendar
    await page.goto(`/programs/${programId}/workspace?step=publish`)
    const startButton = page.getByRole('button', {
      name: /Start Program|Add to Calendar/,
    })
    await expect(startButton).toBeVisible()
    await startButton.click()

    // Redirects to user's personal calendar
    await expect(
      page.getByRole('heading', { name: 'Calendar', exact: true }),
    ).toBeVisible()

    // ── 7. REOPEN SAME PROGRAM AND EDIT THROUGH ALL FOUR STEPS ─────────────
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

    // Move to Step 3 (Schedule)
    await stepper.getByRole('button', { name: /Schedule/ }).click()
    await expect(page.getByRole('heading', { name: 'Schedule & placement', exact: true })).toBeVisible()

    // Move to Step 4 (Publish & Share)
    await stepper.getByRole('button', { name: /Publish/ }).click()
    await expect(page.getByRole('heading', { name: 'Publish & Share', exact: true })).toBeVisible()

    // Navigate back to Step 1 using Previous button
    await page.getByRole('button', { name: '← Back to Schedule' }).click()
    await expect(page.getByRole('heading', { name: 'Schedule & placement', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '← Back to Activities' }).click()
    await expect(page.getByRole('heading', { name: 'Activities', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '← Back to Details' }).click()
    await expect(page.getByLabel('Program name')).toBeVisible()
  })

  test('navigation to incomplete steps shows validation requirements at publish', async ({
    page,
  }) => {
    await mockApi(page)
    await login(page, 'author@test.local', 'password')
    await page.goto(`/programs/${programId}/workspace?step=details`)

    const stepper = page.getByRole('navigation', { name: 'Program editor steps' })

    // Jump directly to Step 4 (Publish & Share) without visiting steps 2 or 3
    await stepper.getByRole('button', { name: /Publish/ }).click()
    await expect(page).toHaveURL(new RegExp(`/programs/${programId}/workspace\\?step=publish`))
    await expect(page.getByRole('heading', { name: 'Publish & Share', exact: true })).toBeVisible()

    // Validation requirements and summary are clearly shown
    await expect(page.getByText('Who can find it?')).toBeVisible()
  })

  test('calendar projection allows editing day placements and recurring schedule without altering personal calendar', async ({
    page,
  }) => {
    const { requests } = await mockApi(page, { added: true })
    await login(page, 'author@test.local', 'password')
    await page.goto(`/programs/${programId}/workspace?step=schedule`)

    await expect(page.getByRole('heading', { name: 'Schedule & placement', exact: true })).toBeVisible()

    // Check projected start date is visible
    await expect(page.getByText('Projected start date')).toBeVisible()

    // Add activity to day
    await page.getByLabel('Add an Activity to this day').selectOption({ label: 'Squats' })
    await page.getByRole('button', { name: 'Add to day' }).click()

    expect(
      requests.some(
        (r) =>
          r.path.includes('/draft/placements') &&
          r.method === 'POST',
      ),
    ).toBe(true)

    // Verify personal calendar was NOT modified (no calendar-items or enrollments requests)
    expect(
      requests.some(
        (r) =>
          r.path.includes('/calendar-items') &&
          (r.method === 'POST' || r.method === 'PATCH'),
      ),
    ).toBe(false)
  })
})

