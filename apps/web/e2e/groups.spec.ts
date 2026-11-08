import { expect, test } from '@playwright/test'
import { groupId, mockApi, programId } from './fixtures'
import { login } from './journey'

test('create a Program group, enroll the owner, and open contextual group management', async ({
  page,
}) => {
  const { requests } = await mockApi(page)

  await login(page, 'author@test.local', 'password')
  await page.goto(`/programs/${programId}`)
  await expect(page.getByRole('heading', { name: 'Program groups' })).toBeVisible()

  await page.getByRole('button', { name: 'Start a group' }).click()
  await page.getByLabel('Group name (optional)').fill('Morning group')
  await page.getByRole('button', { name: 'Create group' }).click()

  await expect(
    page.getByRole('heading', { name: 'When do you want to start?' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Preview my calendar' }).click()
  await expect(
    page.getByText('12 Activities will be scheduled automatically.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Confirm & add to Calendar' }).click()

  const createRequest = requests.find(
    (request) => request.path === '/groups' && request.method === 'POST',
  )
  expect(createRequest?.body).toMatchObject({
    programVersionId: expect.any(String),
    mode: 'SYNC',
    name: 'Morning group',
    startLocalDate: expect.any(String),
    timezone: 'America/Chicago',
  })

  const enrollmentRequest = requests.find(
    (request) =>
      request.path === `/programs/${programId}/enrollments` &&
      request.method === 'POST',
  )
  expect(enrollmentRequest?.body.groupId).toBe(groupId)
  expect(enrollmentRequest?.body.startLocalDate).toBe(
    createRequest?.body.startLocalDate,
  )

  await page.goto(`/groups/${groupId}`)
  await expect(
    page.getByRole('heading', { name: 'Morning group', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Manage group' })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Group Completions' }),
  ).toBeVisible()

  await page.getByLabel('Invite by handle').fill('participant')
  await page.getByRole('button', { name: 'Invite user' }).click()
  await expect(page.getByText('Invitation sent')).toBeVisible()
  expect(
    requests.find(
      (request) =>
        request.path === `/groups/${groupId}/invitations` &&
        request.method === 'POST',
    )?.body,
  ).toMatchObject({ kind: 'USER', handle: 'participant' })
})
