import { expect, test } from '@playwright/test'
import { groupId, mockApi } from './fixtures'
import { login } from './journey'

// Groups are no longer created from the Program page; an existing group is managed on its own page.
test('group page: the owner manages the group and invites by handle', async ({ page }) => {
  const { requests } = await mockApi(page)
  await login(page, 'author@test.local', 'password')
  await page.goto(`/groups/${groupId}`)
  await expect(page.getByRole('heading', { name: 'Manage group' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Group Completions' })).toBeVisible()

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

test('group page: owner invite link controls', async ({ page }) => {
  const { requests } = await mockApi(page)
  await login(page, 'author@test.local', 'password')
  await page.goto(`/groups/${groupId}`)
  await page.getByRole('button', { name: 'Invite people', exact: true }).click()
  await page.getByRole('button', { name: 'Create invite link', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Invite link', exact: true })).toHaveValue('http://localhost/join/link-1')
  await expect(page.getByRole('button', { name: 'Copy invite link', exact: true })).toBeVisible()
  // Server-confirmed toggle: it reflects the saved group setting once the update returns.
  const sharing = page.getByLabel('Allow members to create invite links')
  await sharing.click()
  await expect(sharing).toBeChecked()
  expect(requests.some((r) => r.method === 'PATCH' && r.body.memberLinkSharingEnabled === true)).toBe(true)
  await page.getByRole('button', { name: 'Replace all invite links' }).click()
  await expect(page.getByRole('textbox', { name: 'Invite link', exact: true })).toHaveValue('http://localhost/join/link-2')
  expect(requests.some((r) => r.body?.rotate === true)).toBe(true)
  await page.getByRole('button', { name: 'Revoke all invite links' }).click()
  await expect(page.getByRole('textbox', { name: 'Invite link', exact: true })).toHaveCount(0)
  expect(requests.some((r) => r.method === 'PATCH' && r.body.joinLinkEnabled === false)).toBe(true)
})
