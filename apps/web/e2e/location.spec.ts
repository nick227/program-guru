import { test, expect, type Page } from '@playwright/test'
import { setup } from './participant-activity-fixture'
import { activityId, itemId } from './fixtures'
import type { components } from '@project/sdk'

const place: components['schemas']['Place'] = {
  id: '00000000-0000-4000-8000-000000000901', slug: 'lake', name: 'Lakeside Park',
  addressLine: '123 Lake Street', locality: 'Austin', region: 'TX', countryCode: 'US',
  kind: 'park', sourceUrl: 'https://example.com/park', accessNote: null,
}
async function locationSetup(page: Page) {
  const state = await setup(page, { simple: true })
  state.o.item.place = null
  state.o.item.enrollmentId = null
  state.o.item.gatheringId = null
  const writes: { method: string; body: any }[] = []
  let reuse = false
  let fail = false
  let split = false
  let failCalendar = false
  await page.route('http://localhost:3001/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname
    if (req.method() === 'OPTIONS') return route.fallback()
    if (path === '/catalog/places') return route.fulfill({ json: { data: [place] } })
    if (path === '/activities/participation') return route.fulfill({ json: { data: [] } })
    if (path === `/calendar-items/${itemId}` && req.method() === 'PATCH') {
      const body = req.postDataJSON()
      writes.push({ method: 'PATCH', body })
      if (fail) return route.fulfill({ status: 409, json: { code: 'CONFLICT', message: 'This item changed. Reload and try again.' } })
      state.o.item.place = body.placeId ? place : null
      return route.fulfill({ json: { data: { ...state.o.item, ...(split ? { status: 'CANCELLED' } : {}) } } })
    }
    if (path === '/calendar/items' && req.method() === 'GET') {
      if (failCalendar) return route.fulfill({ status: 503, json: { code: 'UNAVAILABLE', message: 'Calendar unavailable' } })
      return route.fulfill({ json: { data: reuse ? [state.o.item] : [] } })
    }
    if (path === '/calendar/items' && req.method() === 'POST') {
      const body = req.postDataJSON()
      writes.push({ method: 'POST', body })
      state.o.item.place = body.placeId ? place : null
      return route.fulfill({ json: { data: { item: state.o.item, recurrence: null, createdCount: 1 } } })
    }
    return route.fallback()
  })
  await page.reload()
  return { ...state, writes, reuse: () => { reuse = true }, fail: () => { fail = true }, split: () => { split = true }, failCalendar: () => { failCalendar = true } }
}
async function selectPlace(page: Page) {
  const modal = page.getByRole('dialog', { name: 'Choose location' })
  await modal.getByLabel('Search by name or address').fill('123 Lake')
  await modal.getByRole('radio', { name: /Lakeside Park/ }).check()
  await modal.getByRole('button', { name: 'Use location' }).click()
  await expect(modal).toHaveCount(0)
}

test('empty occurrence can add, cancel, change and remove a location without changing its schedule', async ({ page }) => {
  const { writes } = await locationSetup(page)
  await page.getByRole('button', { name: 'Add Location', exact: true }).click()
  await page.getByRole('dialog').getByRole('radio', { name: /Lakeside Park/ }).check()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(writes).toHaveLength(0)
  await page.getByRole('button', { name: 'Add Location', exact: true }).click()
  await selectPlace(page)
  expect(writes[0]!.body).toMatchObject({ placeId: place.id, expectedUpdatedAt: '2026-11-07T12:00:00Z' })
  expect(writes[0]!.body).not.toHaveProperty('localDate')
  expect(writes[0]!.body).not.toHaveProperty('localTime')
  await page.reload()
  await page.getByRole('button', { name: 'Change Location', exact: true }).click()
  await page.getByRole('radio', { name: 'No location', exact: true }).check()
  await page.getByRole('button', { name: 'Remove location', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Add Location', exact: true })).toBeVisible()
  expect(writes[1]!.body.placeId).toBeNull()
})

test('activity selection persists through scheduling a recurrence, and explicit removal sends null', async ({ page }) => {
  const { writes } = await locationSetup(page)
  await page.goto(`/activities/${activityId}`)
  await expect(page.getByText('Do it with others', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Open to others', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Add Location', exact: true }).click()
  await selectPlace(page)
  expect(writes).toHaveLength(0)
  await page.getByRole('button', { name: 'Add to Schedule', exact: true }).click()
  await page.getByRole('radio', { name: 'Daily', exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0]!.body).toMatchObject({ activityId, placeId: place.id, recurrence: { kind: 'DAILY' }, localTime: null })
  await page.getByRole('button', { name: 'Add to Schedule', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Change Location/ }).click()
  await page.getByRole('dialog', { name: 'Choose location' }).getByRole('radio', { name: 'No location', exact: true }).check()
  await page.getByRole('button', { name: 'Remove location', exact: true }).click()
  await page.getByRole('button', { name: /^Save to / }).click()
  await expect.poll(() => writes.length).toBe(2)
  expect(writes[1]!.body.placeId).toBeNull()
})

for (const reuse of [false, true]) test(`Start ${reuse ? 'reuses and updates' : 'creates'} the item with the selected location`, async ({ page }) => {
  const state = await locationSetup(page)
  if (reuse) state.reuse()
  await page.goto(`/activities/${activityId}`)
  await page.getByRole('button', { name: 'Add Location', exact: true }).click()
  await selectPlace(page)
  await page.getByRole('button', { name: 'Start now', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/occurrences/${itemId}`))
  expect(state.writes).toHaveLength(1)
  expect(state.writes[0]!.method).toBe(reuse ? 'PATCH' : 'POST')
  expect(state.writes[0]!.body.placeId).toBe(place.id)
})

test('recurrence edits carry explicit scope and failed saves keep the modal open', async ({ page }) => {
  const state = await locationSetup(page)
  state.o.item.recurrenceId = '00000000-0000-4000-8000-000000000902'
  await page.reload()
  await page.getByRole('button', { name: 'Add Location', exact: true }).click()
  await page.getByLabel('Apply location to').selectOption('THIS_AND_FUTURE')
  await selectPlace(page)
  expect(state.writes[0]!.body.scope).toBe('THIS_AND_FUTURE')
  state.fail()
  await page.getByRole('button', { name: 'Change Location', exact: true }).click()
  await page.getByRole('radio', { name: 'No location', exact: true }).check()
  await page.getByRole('button', { name: 'Remove location', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('This item changed')
  expect(state.writes[1]!.body.scope).toBe('THIS_ONE')
})

test('unchanged gathering location is a no-op; a change explains the membership consequence', async ({ page }) => {
  const state = await locationSetup(page)
  state.o.item.place = place
  state.o.item.gatheringId = '00000000-0000-4000-8000-000000000903'
  await page.reload()
  await page.getByRole('button', { name: 'Change Location', exact: true }).click()
  await page.getByRole('button', { name: 'Use location', exact: true }).click()
  expect(state.writes).toHaveLength(0)
  await page.getByRole('button', { name: 'Change Location', exact: true }).click()
  await page.getByRole('radio', { name: 'No location', exact: true }).check()
  await expect(page.getByText('Changing this location leaves the gathering.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(state.writes).toHaveLength(0)
})


test('future occurrence replacement returns to its calendar day', async ({ page }) => {
  const state = await locationSetup(page)
  state.o.item.recurrenceId = '00000000-0000-4000-8000-000000000902'
  state.split()
  await page.reload()
  await page.getByRole('button', { name: 'Add Location', exact: true }).click()
  await page.getByLabel('Apply location to').selectOption('THIS_AND_FUTURE')
  await selectPlace(page)
  await expect(page).toHaveURL(new RegExp(`/calendar\\?day=${state.o.item.localDate}`))
})

test('untouched location stays omitted, and a failed Calendar read never creates a duplicate', async ({ page }) => {
  const state = await locationSetup(page)
  await page.goto(`/activities/${activityId}`)
  await page.getByRole('button', { name: 'Add to Schedule', exact: true }).click()
  await page.getByRole('button', { name: /^Save to / }).click()
  await expect.poll(() => state.writes.length).toBe(1)
  expect(state.writes[0]!.body).not.toHaveProperty('placeId')
  state.failCalendar()
  await page.getByRole('button', { name: 'Start now', exact: true }).click()
  await expect(page.getByText('Calendar unavailable', { exact: true })).toBeVisible()
  expect(state.writes).toHaveLength(1)
})
