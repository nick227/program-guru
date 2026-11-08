import { expect, test } from '@playwright/test'
import { groupId, mockApi, programId } from './fixtures'
import { login } from './journey'

test('create a Program group, enroll the owner, and open contextual group management', async ({
  page,
}) => {
  const { requests } = await mockApi(page)

  await login(page, 'author@test.local', 'password')
  await page.goto(`/programs/${programId}`)
  await expect(page.getByRole('heading', { name: 'Do this together' })).toBeVisible()

  await page.getByRole('button', { name: 'Invite people' }).click()
  await page.getByLabel('Group name (optional)').fill('Morning group')
  await page.getByLabel('Schedule', { exact: true }).selectOption('SYNC')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()

  await page.getByRole('link', { name: 'Add to my Calendar', exact: true }).click()
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

test('contextual flexible participation and owner link controls stay on the Program', async ({ page }) => {
  const { requests } = await mockApi(page)
  await login(page, 'author@test.local', 'password')
  await page.goto(`/programs/${programId}`)
  await page.getByRole('button', { name: 'Invite people', exact: true }).click()
  await expect(page.getByLabel('Schedule', { exact: true })).toHaveValue('ASYNC')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByText('1 participant · Flexible pace')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Author', exact: true })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/programs/${programId}$`))
  expect(requests.find((r) => r.path === '/groups' && r.method === 'POST')?.body).toMatchObject({ mode: 'ASYNC' })
  await page.getByRole('button', { name: 'Invite people', exact: true }).click()
  await page.getByRole('button', { name: 'Create invite link', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Invite link', exact: true })).toHaveValue('http://localhost/join/link-1')
  await expect(page.getByRole('button', { name: 'Copy invite link', exact: true })).toBeVisible()
  await page.getByLabel('Allow members to create invite links').check()
  expect(requests.some((r) => r.method === 'PATCH' && r.body.memberLinkSharingEnabled === true)).toBe(true)
  await page.getByRole('button', { name: 'Replace all invite links' }).click()
  await expect(page.getByRole('textbox', { name: 'Invite link', exact: true })).toHaveValue('http://localhost/join/link-2')
  expect(requests.some((r) => r.body?.rotate === true)).toBe(true)
  await page.getByRole('button', { name: 'Revoke all invite links' }).click()
  await expect(page.getByRole('textbox', { name: 'Invite link', exact: true })).toHaveCount(0)
  expect(requests.some((r) => r.method === 'PATCH' && r.body.joinLinkEnabled === false)).toBe(true)
})
