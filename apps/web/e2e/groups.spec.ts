import { expect, test } from '@playwright/test'
import { groupId, itemId, mockApi, programId } from './fixtures'
import { login } from './journey'

test('create group, accept invitation, enroll, and share Activity completion', async ({
  page,
}) => {
  const { requests } = await mockApi(page, { authorNotEnrolled: true })

  await login(page, 'author@test.local', 'password')
  await page.goto(`/programs/${programId}`)
  await expect(page.getByRole('heading', { name: 'My Strength Workout' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Program groups' })).toBeVisible()
  await page.getByRole('button', { name: 'Start a group' }).click()
  await page.getByLabel('Group name (optional)').fill('Morning group')
  await page.getByRole('button', { name: 'Create group' }).click()
  await expect(
    page.getByRole('heading', { name: 'Morning group', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Confirm your Program schedule' })).toBeVisible()
  await page.getByRole('button', { name: 'Preview my calendar' }).click()
  await page.getByRole('button', { name: 'Confirm and add to Calendar' }).click()
  await expect(
    page.getByRole('status').filter({
      hasText: 'Your personal Program schedule is connected to this group.',
    }),
  ).toBeVisible()

  await page.getByLabel('Invite by').selectOption('LINK')
  await page.getByRole('button', { name: 'Create share link' }).click()
  const shareUrl = await page.getByLabel('Share invitation link').inputValue()
  const token = new URL(shareUrl).pathname.split('/').at(-1)
  expect(token).toBeTruthy()

  await login(page, 'participant@test.local', 'password')
  await page.goto(`/join/${token}`)
  await page.getByRole('button', { name: 'Accept and continue' }).click()
  await expect(
    page.getByRole('heading', { name: 'Morning group', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Confirm your Program schedule' })).toBeVisible()
  await page.getByRole('button', { name: 'Preview my calendar' }).click()
  await expect(page.getByText('12 Activities will be scheduled automatically.')).toBeVisible()
  await page.getByRole('button', { name: 'Confirm and add to Calendar' }).click()
  await expect(
    page.getByRole('status').filter({
      hasText: 'Your personal Program schedule is connected to this group.',
    }),
  ).toBeVisible()

  await page.goto(`/occurrences/${itemId}`)
  await expect(page.getByRole('heading', { name: "Today's Results" })).toBeVisible()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('button', { name: 'Finish', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Your week', exact: true }),
  ).toBeVisible()

  await page.goto(`/programs/${programId}/groups/${groupId}`)
  await expect(page.getByText('Participant completed Squats')).toBeVisible()
  expect(
    requests.filter(
      (request) =>
        request.path === `/group-invitations/${token}/accept` &&
        request.method === 'POST',
    ),
  ).toHaveLength(1)
  expect(
    requests.find(
      (request) =>
        request.path === `/programs/${programId}/enrollments` &&
        request.method === 'POST',
    )?.body.groupId,
  ).toBe(groupId)
  expect(
    requests.filter(
      (request) =>
        request.path.endsWith('/actions') &&
        request.body.action === 'FINISH',
    ),
  ).toHaveLength(1)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})
