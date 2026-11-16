import { expect, test } from '@playwright/test'
import { mockApi } from './fixtures'
import { login } from './journey'

test.describe('Home Redesign - Modern Studio Discovery Experience', () => {
  test('unauthenticated visitor sees studio-quality discovery homepage matching design specification', async ({
    page,
  }, testInfo) => {
    await mockApi(page)
    await page.goto('/')

    // 1. Header with Brand, Search, Notifications, and Account
    const header = page.locator('header')
    await expect(header.getByText('Program.Guru')).toBeVisible()
    await expect(header.getByLabel('Search activities and programs')).toBeVisible()
    await expect(header.getByLabel('Notifications')).toBeVisible()

    // 2. Hero introduction
    await expect(
      page.getByRole('heading', { name: /Find something\s+worth doing\./i }),
    ).toBeVisible()
    await expect(
      page.getByText('Discover activities, join people doing them, or follow programs to make progress over time.'),
    ).toBeVisible()
    const heroImage = page.locator('img[alt="Hikers exploring mountain trails"]')
    await expect(heroImage).toBeVisible()

    // 3. Home Agent in compact state
    const agent = page.locator('section[aria-labelledby="home-agent-title"]')
    await expect(agent).toBeVisible()
    await expect(agent.getByText('Home Agent')).toBeVisible()
    await expect(agent.getByText('What sounds good right now?')).toBeVisible()
    await expect(agent.getByRole('button', { name: 'Try it' })).toBeVisible()

    // Three starting actions
    const doNow = agent.getByRole('button', { name: /Do something now/ })
    const findNew = agent.getByRole('button', { name: /Find something new/ })
    const continueStarted = agent.getByRole('button', { name: /Continue what I've started/ })

    await expect(doNow).toBeVisible()
    await expect(findNew).toBeVisible()
    await expect(continueStarted).toBeVisible()

    // 4. "For you" section
    const forYouSection = page.locator('section[aria-labelledby="for-you-heading"]')
    await expect(forYouSection).toBeVisible()
    await expect(forYouSection.getByRole('heading', { name: 'For you' })).toBeVisible()
    await expect(forYouSection.getByRole('link', { name: 'See all' })).toBeVisible()

    // Featured activity card
    const featuredHeading = page.locator('#featured-activity-heading')
    await expect(featuredHeading).toBeVisible()
    await expect(forYouSection.getByRole('button', { name: /Join this activity|Start now|Open activity/ })).toBeVisible()

    // 5. "Explore activities" section
    const activitiesSection = page.locator('section[aria-labelledby="activities-heading"]')
    await expect(activitiesSection).toBeVisible()
    await expect(activitiesSection.getByRole('heading', { name: 'Explore activities' })).toBeVisible()
    await expect(activitiesSection.getByRole('link', { name: 'See all' })).toBeVisible()
    await expect(activitiesSection.getByText('Running groups')).toBeVisible()
    await expect(activitiesSection.getByText('Creative activities')).toBeVisible()

    // 6. "Programs to follow" section
    const programsSection = page.locator('section[aria-labelledby="programs-heading"]')
    await expect(programsSection).toBeVisible()
    await expect(programsSection.getByRole('heading', { name: 'Programs to follow' })).toBeVisible()
    await expect(programsSection.getByRole('link', { name: 'Explore' })).toBeVisible()
    await expect(programsSection.getByText(/30-Day Fitness Foundation|Beginner Strength|My Strength Workout/)).toBeVisible()

    // 7. Check no horizontal overflow
    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    )
    expect(noOverflow).toBe(true)

    // Capture desktop screenshot
    await page.screenshot({
      path: testInfo.outputPath('home-discovery-desktop.png'),
      fullPage: true,
    })

    // Set mobile viewport to verify mobile experience and capture mobile screenshot
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.locator('nav[aria-label="Mobile navigation"]')).toBeVisible()
    await expect(page.locator('nav[aria-label="Mobile navigation"]').getByText('Home')).toBeVisible()
    await expect(page.locator('nav[aria-label="Mobile navigation"]').getByText('Explore')).toBeVisible()
    await expect(page.locator('nav[aria-label="Mobile navigation"]').getByText('Create')).toBeVisible()
    await expect(page.locator('nav[aria-label="Mobile navigation"]').getByText('Community')).toBeVisible()
    await expect(page.locator('nav[aria-label="Mobile navigation"]').getByText('Programs')).toBeVisible()

    const mobileNoOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    )
    expect(mobileNoOverflow).toBe(true)

    await page.screenshot({
      path: testInfo.outputPath('home-discovery-mobile.png'),
      fullPage: true,
    })
  })

  test('Home Agent interaction: expanding, starting actions, minimizing and resetting', async ({
    page,
  }, testInfo) => {
    await mockApi(page)
    await page.goto('/')

    const agent = page.locator('section[aria-labelledby="home-agent-title"]')

    // 1. Click "Do something now" -> expands to now_time question
    await agent.getByRole('button', { name: /Do something now/ }).click()
    await expect(agent.getByText('How much time do you have?')).toBeVisible()
    await expect(agent.getByRole('button', { name: 'Minimize' })).toBeVisible()

    await page.screenshot({
      path: testInfo.outputPath('home-agent-expanded.png'),
    })

    // 2. Click "Minimize" -> collapses back to compact state
    await agent.getByRole('button', { name: 'Minimize' }).click()
    await expect(agent.getByRole('button', { name: /Do something now/ })).toBeVisible()
    await expect(agent.getByRole('button', { name: /Find something new/ })).toBeVisible()

    // 3. Click "Find something new" -> expands to explore_interest
    await agent.getByRole('button', { name: /Find something new/ }).click()
    await expect(agent.getByText('What would you like to discover?')).toBeVisible()

    // 4. Click Back button inside agent -> returns to compact state
    await agent.getByRole('button', { name: 'Back' }).click()
    await expect(agent.getByRole('button', { name: /Do something now/ })).toBeVisible()

    // 5. Click "Try it" -> expands with recommendation
    await agent.getByRole('button', { name: 'Try it' }).click()
    await expect(agent.getByRole('button', { name: 'Minimize' })).toBeVisible()
  })

  test('authenticated participant sees personalized For You action', async ({
    page,
  }, testInfo) => {
    await mockApi(page, { calendarItem: true })
    await login(page, 'participant@test.local', 'password')
    await page.goto('/')

    const forYouSection = page.locator('section[aria-labelledby="for-you-heading"]')
    await expect(forYouSection).toBeVisible()

    // Action button reflects personalized action
    const actionBtn = forYouSection.locator('button')
    await expect(actionBtn.first()).toBeVisible()
    const buttonText = await actionBtn.first().textContent()
    expect(buttonText).toMatch(/Start now|Join this activity|Open activity/)

    // No horizontal scrollbar
    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    )
    expect(noOverflow).toBe(true)

    await page.screenshot({
      path: testInfo.outputPath('home-authenticated-desktop.png'),
      fullPage: true,
    })
  })
})
