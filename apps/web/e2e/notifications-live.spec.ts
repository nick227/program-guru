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

test('live API + worker: handle invitation notification → ID-based acceptance → personal calendar, removal/leave access revocation preserving personal history, timed reminders, and preferences', async ({
  page,
  browser,
}) => {
  const api = process.env.NOTIFICATIONS_TEST_API!
  const email = process.env.NOTIFICATIONS_TEST_EMAIL!
  const collabEmail = process.env.NOTIFICATIONS_COLLAB_EMAIL!
  const collabHandle = process.env.NOTIFICATIONS_COLLAB_HANDLE!
  const password = process.env.NOTIFICATIONS_TEST_PASSWORD!
  if (!api || !email || !collabEmail || !collabHandle || !password) {
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
  await page.getByRole('button', { name: /^(Start Program|Run It Again)$/ }).click()
  await expect(page.getByRole('button', { name: 'Program Added' })).toBeDisabled()
  // Starting no longer redirects (13 §4); the Calendar's reminder prompt is opened directly.
  await page.goto('/?promptReminder=1')

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
    page.getByRole('heading', { name: 'Today' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Increase Reps' }).click()
  await page.getByRole('button', { name: /^Start( timer)?$/ }).click()
  await page.getByRole('button', { name: 'Complete', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Completed' })).toBeVisible()

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

  // 3. Create a SYNC Group (started 4 days ago so collaborator joins as a late joiner) and invite collaborator by handle (kind: 'USER')
  const programDetailRes = await page.request.get(`${api}/programs/${program.id}`)
  expect(programDetailRes.ok()).toBe(true)
  const programDetail = (await programDetailRes.json()).data
  const pastGroupStart = new Date(
    Date.parse(`${clock.date}T00:00:00Z`) - 4 * 86_400_000,
  )
    .toISOString()
    .slice(0, 10)

  const groupRes = await page.request.post(`${api}/groups`, {
    data: {
      programVersionId: programDetail.latestVersionId,
      name: 'Live Morning Crew',
      mode: 'SYNC',
      startLocalDate: pastGroupStart,
    },
  })
  expect(groupRes.ok()).toBe(true)
  const group = (await groupRes.json()).data

  // Owner invites collaborator by handle in the Group Info drawer
  await page.goto(`/groups/${group.id}`)
  await page.getByRole('button', { name: 'Group Info' }).click()
  await page.getByLabel('Invite by handle').fill(collabHandle)
  await page.getByRole('button', { name: 'Invite user' }).click()
  await expect(page.getByText(`@${collabHandle}`)).toBeVisible()

  // 4. Collaborator receives GROUP_INVITE notification, opens it -> confirms schedule & accepts by ID -> opens personal calendar
  const collabContext = await browser.newContext()
  const collabPage = await collabContext.newPage()
  await login(collabPage, collabEmail, password)

  // Poll until worker emits GROUP_INVITE for collaborator
  await expect
    .poll(
      async () => {
        const res = await collabPage.request.get(`${api}/notifications`)
        if (!res.ok()) return []
        const body = await res.json()
        return (body.data as Array<{ type: string }>).map((n) => n.type)
      },
      { timeout: 15_000 },
    )
    .toEqual(expect.arrayContaining(['GROUP_INVITE']))

  await collabPage.goto('/notifications')
  await collabPage.getByRole('link', { name: /invited you/i }).click()
  await expect(collabPage).toHaveURL(
    new RegExp(`/groups/${group.id}/invitations/`),
  )

  // Driven by join.status === 'CONFIRM_ENROLLMENT', collaborator confirms schedule and accepts by invitation ID
  await expect(
    collabPage.getByRole('heading', { name: 'Live Morning Crew' }),
  ).toBeVisible()
  await expect(
    collabPage.getByRole('heading', { name: 'Confirm your schedule' }),
  ).toBeVisible()
  await collabPage.getByRole('button', { name: 'Accept invitation' }).click()

  // Transitions to active group stage -> open Group Info -> Your Personal Schedule -> Joined on label -> Open Calendar
  await expect(collabPage).toHaveURL(new RegExp(`/groups/${group.id}$`))
  await collabPage.getByRole('button', { name: 'Group Info' }).click()
  await expect(
    collabPage.getByRole('heading', { name: 'Your Personal Schedule' }),
  ).toBeVisible()
  await expect(
    collabPage.getByText(new RegExp(`Joined on .* \\(${clock.date}\\)`)),
  ).toBeVisible()
  await collabPage.getByRole('link', { name: 'Open Calendar' }).click()
  await expect(
    collabPage.getByRole('heading', { name: 'Calendar', exact: true }),
  ).toBeVisible()
  await expect(collabPage.getByText('Missed')).toHaveCount(0)

  // Verify collaborator's personal calendar has pre-join NOT_PARTICIPATING items and post-join PLANNED items
  const windowEnd = new Date(
    Date.parse(`${clock.date}T00:00:00Z`) + 14 * 86_400_000,
  )
    .toISOString()
    .slice(0, 10)
  const collabItemsBefore = (
    await (
      await collabPage.request.get(
        `${api}/calendar/items?start=${pastGroupStart}&end=${windowEnd}`,
      )
    ).json()
  ).data as Array<{ id: string; title: string; localDate: string; status: string }>
  expect(collabItemsBefore.length).toBeGreaterThan(0)
  const preJoinItems = collabItemsBefore.filter((i) => i.localDate < clock.date)
  expect(preJoinItems.length).toBeGreaterThan(0)
  expect(preJoinItems.every((i) => i.status === 'NOT_PARTICIPATING')).toBe(true)
  await collabPage.goto(`/?week=${pastGroupStart}&day=${preJoinItems[0]!.localDate}`)
  await expect(collabPage.getByRole('link', { name: /Not participating/ }).first()).toBeVisible()
  await expect(collabPage.getByText('Missed')).toHaveCount(0)

  // Collaborator leaves the group -> group access is revoked immediately while personal calendar items stay intact
  await collabPage.goto(`/groups/${group.id}`)
  await collabPage.getByRole('button', { name: 'Group Info' }).click()
  await collabPage.getByRole('button', { name: 'Leave group' }).click()
  await expect(
    collabPage.getByRole('heading', { name: 'Calendar', exact: true }),
  ).toBeVisible()

  // Group endpoints now return 404 for collaborator
  const afterLeaveGroupRes = await collabPage.request.get(`${api}/groups/${group.id}`)
  expect(afterLeaveGroupRes.status()).toBe(404)
  await collabPage.goto(`/groups/${group.id}`)
  await expect(
    collabPage.getByRole('heading', { name: 'Group Unavailable' }),
  ).toBeVisible()

  // Personal calendar history is untouched
  const collabItemsAfter = (
    await (
      await collabPage.request.get(
        `${api}/calendar/items?start=${pastGroupStart}&end=${windowEnd}`,
      )
    ).json()
  ).data as Array<{ id: string; title: string }>
  expect(collabItemsAfter.map((i) => i.id)).toEqual(
    collabItemsBefore.map((i) => i.id),
  )

  // Re-invite collaborator by handle -> now join.status === 'READY_TO_JOIN' (links existing enrollment)
  await page.goto(`/groups/${group.id}`)
  await page.getByRole('button', { name: 'Group Info' }).click()
  await page.getByLabel('Invite by handle').fill(collabHandle)
  await page.getByRole('button', { name: 'Invite user' }).click()
  await expect(page.getByText(`@${collabHandle}`)).toBeVisible()

  const receivedInvitesRes = await collabPage.request.get(
    `${api}/users/me/group-invitations`,
  )
  expect(receivedInvitesRes.ok()).toBe(true)
  const receivedInvites = (await receivedInvitesRes.json()).data as Array<{
    id: string
    groupId: string
    preview: { join: { status: string } }
  }>
  const rejoinInvite = receivedInvites.find((inv) => inv.groupId === group.id)
  expect(rejoinInvite?.preview.join.status).toBe('READY_TO_JOIN')

  await collabPage.goto(`/groups/${group.id}/invitations/${rejoinInvite!.id}`)
  await expect(
    collabPage.getByText(
      /Accepting links your existing personal calendar without changing your scheduled dates/i,
    ),
  ).toBeVisible()
  await collabPage.getByRole('button', { name: 'Accept invitation' }).click()
  await expect(collabPage).toHaveURL(new RegExp(`/groups/${group.id}$`))

  // Owner removes collaborator from the group -> group access revoked, personal calendar history intact
  await page.reload()
  await page
    .getByRole('button', { name: 'Remove Collaborator Tester' })
    .click()
  await expect(
    page.getByRole('button', { name: 'Remove Collaborator Tester' }),
  ).toHaveCount(0)

  const afterRemoveGroupRes = await collabPage.request.get(
    `${api}/groups/${group.id}`,
  )
  expect(afterRemoveGroupRes.status()).toBe(404)
  const collabItemsAfterRemove = (
    await (
      await collabPage.request.get(
        `${api}/calendar/items?start=${pastGroupStart}&end=${windowEnd}`,
      )
    ).json()
  ).data as Array<{ id: string; title: string }>
  expect(collabItemsAfterRemove.map((i) => i.id)).toEqual(
    collabItemsBefore.map((i) => i.id),
  )
  await collabContext.close()

  // 5. Poll until worker emits MEMBER_JOINED for participant and verify Inbox & Mark all read
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

  await page.goto('/notifications')
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible()

  await page.getByRole('tab', { name: 'Reminders' }).click()
  await expect(page.getByText(new RegExp(`Time for ${activity.title}`))).toBeVisible()

  await page.getByRole('tab', { name: 'Achievements' }).click()
  await expect(page.getByText(/First step/i)).toBeVisible()

  await page.getByRole('tab', { name: 'Groups' }).click()
  await expect(page.getByText(/joined/i).first()).toBeVisible()

  await page.getByRole('tab', { name: 'Unread' }).click()
  await page.getByRole('button', { name: 'Mark all read' }).click()
  await expect(page.getByText('No unread notifications.')).toBeVisible()

  // 6. Verify Preferences persistence on /settings against live API
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
