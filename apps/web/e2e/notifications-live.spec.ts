import { test, expect } from '@playwright/test'
import { login } from './journey'

function currentClock(tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  )
  const hour = parts.hour === '24' ? '00' : parts.hour
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${parts.minute}`,
  }
}

test('live API + worker: adoption prompt, timed reminder across timezone, milestone notification, group invite & participation, preference persistence, and mark read', async ({
  page,
  browser,
}) => {
  const api = process.env.NOTIFICATIONS_TEST_API!
  const email = process.env.NOTIFICATIONS_TEST_EMAIL!
  const collabEmail = process.env.NOTIFICATIONS_COLLAB_EMAIL!
  const password = process.env.NOTIFICATIONS_TEST_PASSWORD!
  if (!api || !email || !collabEmail || !password) {
    throw new Error('Run apps/web/scripts/notifications-live.ts with an isolated database.')
  }

  await login(page, email, password)

  // 1. Discover and adopt a published Program -> triggers one-time daily email prompt on Calendar
  const discoverRes = await page.request.get(`${api}/discover?kind=PROGRAM&limit=1`)
  expect(discoverRes.ok()).toBe(true)
  const discovered = (await discoverRes.json()).data[0]
  const program = discovered?.program ?? discovered
  expect(program?.id).toBeTruthy()

  await page.goto(`/programs/${program.id}`)
  await page.getByRole('button', { name: 'Join Free' }).click()
  await page.getByRole('button', { name: 'Preview my calendar' }).click()
  await page.getByRole('button', { name: 'Confirm & add to Calendar' }).click()
  await expect(page).toHaveURL(/promptReminder=1/)

  // One-time daily email prompt appears on Calendar after first adoption
  await expect(
    page.getByRole('heading', {
      name: 'Want a daily email reminder on days you have Activities?',
    }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Enable daily email' }).click()
  await expect(
    page.getByRole('heading', {
      name: 'Want a daily email reminder on days you have Activities?',
    }),
  ).toHaveCount(0)

  // 2. Schedule Squats at the user's current UTC local clock -> worker generates real ACTIVITY_REMINDER notification without duplicates
  const activitiesRes = await page.request.get(`${api}/activities?q=Squats&limit=5`)
  expect(activitiesRes.ok()).toBe(true)
  const activities = (await activitiesRes.json()).data as Array<{
    id: string
    title: string
  }>
  const activity = (activities.find((a) => a.title === 'Squats') ?? activities[0])!
  const clock = currentClock('UTC')

  const addedRes = await page.request.post(`${api}/calendar/items`, {
    data: {
      activityId: activity.id,
      localDate: clock.date,
      localTime: clock.time,
      idempotencyKey: crypto.randomUUID(),
    },
  })
  expect(addedRes.ok()).toBe(true)
  const scheduledItem = (await addedRes.json()).data.item

  // Poll real /notifications endpoint until worker emits ACTIVITY_REMINDER
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`${api}/notifications`)
        if (!res.ok()) return []
        const body = await res.json()
        return (body.data as Array<{ type: string }>).map((n) => n.type)
      },
      { timeout: 15_000 },
    )
    .toEqual(expect.arrayContaining(['ACTIVITY_REMINDER']))

  // Wait 600ms (2+ worker ticks) and verify no duplicate ACTIVITY_REMINDER was created
  await page.waitForTimeout(600)
  const checkDupeRes = await page.request.get(`${api}/notifications`)
  const allNotifs = (await checkDupeRes.json()).data as Array<{ type: string }>
  expect(allNotifs.filter((n) => n.type === 'ACTIVITY_REMINDER')).toHaveLength(1)

  // Open Notifications dropdown on Calendar and click the ACTIVITY_REMINDER to navigate to the Occurrence
  await page.goto('/')
  const trigger = page.getByRole('button', { name: 'Notifications' })
  await expect(trigger).toContainText(/[1-9]/)
  await trigger.click()

  const panel = page.getByRole('dialog', { name: 'Recent notifications' })
  await expect(panel).toBeVisible()
  await panel.getByText(new RegExp(`Time for ${activity.title}`)).click()
  await expect(page).toHaveURL(new RegExp(`/occurrences/${scheduledItem.id}`))

  // Complete the scheduled occurrence in the UI -> worker emits ACHIEVEMENT_EARNED (First step)
  await expect(
    page.getByRole('heading', { name: "Today's Results" }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Increase Reps' }).click()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('button', { name: 'Finish', exact: true }).click()
  await expect(page).toHaveURL(/completed=/)

  await expect
    .poll(
      async () => {
        const res = await page.request.get(`${api}/notifications`)
        const body = await res.json()
        return (body.data as Array<{ type: string }>).map((n) => n.type)
      },
      { timeout: 15_000 },
    )
    .toEqual(expect.arrayContaining(['ACTIVITY_REMINDER', 'ACHIEVEMENT_EARNED']))

  // 3. Create a Group and invite collaborator via real invitation link
  const programDetailRes = await page.request.get(`${api}/programs/${program.id}`)
  expect(programDetailRes.ok()).toBe(true)
  const programDetail = (await programDetailRes.json()).data

  const groupRes = await page.request.post(`${api}/groups`, {
    data: {
      programVersionId: programDetail.latestVersionId,
      name: 'Live Morning Crew',
      mode: 'ASYNC',
    },
  })
  expect(groupRes.ok()).toBe(true)
  const group = (await groupRes.json()).data

  const inviteRes = await page.request.post(`${api}/groups/${group.id}/invitations`, {
    data: {
      kind: 'LINK',
    },
  })
  expect(inviteRes.ok()).toBe(true)
  const invitation = (await inviteRes.json()).data
  expect(invitation.joinUrl).toBeTruthy()
  const joinPath = new URL(invitation.joinUrl, 'http://localhost').pathname

  // Collaborator accepts the group invitation in a separate browser context
  const collabContext = await browser.newContext()
  const collabPage = await collabContext.newPage()
  await login(collabPage, collabEmail, password)
  await collabPage.goto(joinPath)
  await expect(collabPage.getByRole('heading', { name: 'Live Morning Crew' })).toBeVisible()
  await collabPage.getByRole('button', { name: 'Accept invitation' }).click()
  await expect(collabPage).toHaveURL(new RegExp(`/programs/${program.id}`))
  await collabContext.close()

  // Poll until worker emits MEMBER_JOINED for participant
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`${api}/notifications`)
        const body = await res.json()
        return (body.data as Array<{ type: string }>).map((n) => n.type)
      },
      { timeout: 15_000 },
    )
    .toEqual(expect.arrayContaining(['MEMBER_JOINED']))

  // 4. Verify Inbox page in browser UI
  await page.goto('/notifications')
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible()

  // Filter by Reminders tab
  await page.getByRole('tab', { name: 'Reminders' }).click()
  await expect(page.getByText(new RegExp(`Time for ${activity.title}`))).toBeVisible()

  // Filter by Achievements tab
  await page.getByRole('tab', { name: 'Achievements' }).click()
  await expect(page.getByText(/First step/i)).toBeVisible()

  // Filter by Groups tab
  await page.getByRole('tab', { name: 'Groups' }).click()
  await expect(page.getByText(/joined/i)).toBeVisible()

  // Switch back to Unread and Mark all read
  await page.getByRole('tab', { name: 'Unread' }).click()
  await page.getByRole('button', { name: 'Mark all read' }).click()
  await expect(page.getByText('No unread notifications.')).toBeVisible()

  // 5. Verify Preferences persistence on /settings against live API
  await page.goto('/settings')
  await page.getByLabel('Timezone').selectOption('America/New_York')
  await page.getByLabel('Daily reminder time').fill('06:45')
  await page.getByRole('button', { name: 'Save preferences' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Preferences saved' }),
  ).toBeVisible()

  await page.reload()
  await expect(page.getByLabel('Timezone')).toHaveValue('America/New_York')
  await expect(page.getByLabel('Daily reminder time')).toHaveValue('06:45')
})
