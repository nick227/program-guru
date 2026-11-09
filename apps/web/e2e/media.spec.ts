// The participant uses direct uploads; picker/attachment-manager scenarios were retired.
// Media authorization, ownership and publication controls are covered in participant-activity.spec.ts.
import { test, expect } from '@playwright/test'
import { setup } from './participant-activity-fixture'
import { itemId } from './fixtures'
const file = { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('photo') }

test('upload failure stays in its tile and retries against the same result target', async ({ page }) => {
  const state = await setup(page, { failUpload: true })
  await page.locator('#related-media input[type=file]').setInputFiles(file)
  await expect(page.getByText('Upload failed (503). Try again.')).toBeVisible()
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByText('Processing…', { exact: true })).toBeVisible()
  state.ready()
  await expect(page.getByRole('button', { name: 'Uploaded photo', exact: true })).toBeVisible()
  const uploads = state.calls.filter(c => c.path === '/media/uploads')
  expect(uploads).toHaveLength(2)
  expect(uploads[0]?.body.target).toEqual(uploads[1]?.body.target)
  expect(state.calls.filter(c => c.path === '/sessions' && c.method === 'POST')).toHaveLength(1)
})

test('processing attachments survive navigation and refresh without another upload', async ({ page }) => {
  const state = await setup(page)
  await page.locator('#related-media input[type=file]').setInputFiles(file)
  await expect(page.getByText('Processing…', { exact: true })).toBeVisible()
  await page.goto('/')
  await page.goto(`/occurrences/${itemId}`)
  await expect(page.getByText('Processing…', { exact: true })).toBeVisible()
  state.ready()
  await expect(page.getByRole('button', { name: 'Uploaded photo', exact: true })).toBeVisible()
  expect(state.calls.filter(c => c.path === '/media/uploads')).toHaveLength(1)
})

test('upload is disabled offline and unsupported files do not create an attempt', async ({ page, context }) => {
  const state = await setup(page, { simple: true })
  await page.locator('#related-media input[type=file]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('notes') })
  await expect(page.getByRole('alert')).toContainText('Choose images or videos.')
  expect(state.calls.filter(c => c.path === '/sessions' && c.method === 'POST')).toHaveLength(0)
  await context.setOffline(true)
  await expect(page.getByRole('button', { name: 'Add media', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Complete', exact: true })).toBeDisabled()
})
