import { test, expect, type Page } from '@playwright/test'
import { setup } from './participant-activity-fixture'
import { activityId, itemId } from './fixtures'
import type { components } from '@project/sdk'
type Place = components['schemas']['Place']

async function directory(page: Page) {
  const state = await setup(page, { simple: true })
  const me = await page.evaluate(async () => (await (await fetch('http://localhost:3001/auth/me', { credentials: 'include' })).json()).data)
  const business = { ...me.profile, handle: 'business-a', displayName: 'Business A', businessPhone: null, businessWebsite: null, locations: [] as Place[] }
  let viewer = 'business'
  let place: Place | null = null
  const writes: { path: string; body: any }[] = []
  await page.route('http://localhost:3001/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname
    if (req.method() === 'OPTIONS') return route.fallback()
    const send = (data: unknown, status = 200) => route.fulfill({ status, json: { data } })
    const body = req.method() === 'GET' ? null : req.postDataJSON()
    if (path === '/auth/me') return send({ ...me, id: viewer === 'business' ? me.id : 'user-b', profile: viewer === 'business' ? business : { ...me.profile, id: 'user-b', handle: 'user-b' } })
    if (path === '/users/me/profile' && req.method() === 'PATCH') { Object.assign(business, body); return send(business) }
    if (path === '/users/business-a') return send(business)
    if (path.startsWith('/users/business-a/')) return route.fulfill({ json: { data: [], meta: { hasMore: false, nextCursor: null } } })
    if (path === '/activities/participation') return send([])
    if (path === '/catalog/places' && req.method() === 'POST') {
      writes.push({ path, body })
      place = { id: '00000000-0000-4000-8000-000000000910', slug: 'studio', kind: 'other', sourceUrl: null, accessNote: null, ...body,
        businessProfile: body.linkToMyBusiness ? { handle: business.handle, displayName: business.displayName, profileUrl: '/@business-a' } : null,
        isActive: true, updatedAt: '2026-11-16T12:00:00Z', canManage: !!body.linkToMyBusiness }
      if (body.linkToMyBusiness) business.locations = [place!]
      return send(place, 201)
    }
    if (path === '/catalog/places' && req.method() === 'GET') {
      const q = url.searchParams.get('q')?.toLowerCase() ?? ''
      const rows = place && [place.name, place.addressLine].join(' ').toLowerCase().includes(q) ? [place] : []
      return route.fulfill({ json: { data: rows, meta: { hasMore: false, nextCursor: null } } })
    }
    if (path === '/calendar/items' && req.method() === 'POST') {
      writes.push({ path, body }); state.o.item.place = place
      return send({ item: state.o.item, recurrence: null, createdCount: 1 }, 201)
    }
    if (path === `/calendar-items/${itemId}` && req.method() === 'PATCH') {
      writes.push({ path, body }); state.o.item.place = place; return send(state.o.item)
    }
    return route.fallback()
  })
  return { ...state, business, writes, switchViewer: () => { viewer = 'participant' } }
}
async function fillLocation(page: Page) {
  await page.getByLabel('Location name', { exact: true }).fill('Creative Studio')
  await page.getByLabel('Street address', { exact: true }).fill('123 Creative Way')
  await page.getByLabel('City', { exact: true }).fill('Austin')
}

test('business creates a location; another user finds it and follows the activity location to its profile', async ({ page }) => {
  const state = await directory(page)
  await page.goto('/settings')
  await page.getByLabel('Business phone', { exact: true }).fill('+1 512 555 0100')
  await page.getByLabel('Business website', { exact: true }).fill('https://studio.example')
  await page.getByRole('button', { name: 'Save business information', exact: true }).click()
  await page.getByRole('button', { name: 'Add business location', exact: true }).click()
  await fillLocation(page)
  await page.getByRole('button', { name: 'Save location', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Manage business location' })).toHaveCount(0)
  expect(state.writes[0]!.body).toMatchObject({ linkToMyBusiness: true, visibility: 'PUBLIC', name: 'Creative Studio' })
  state.switchViewer()
  await page.goto(`/activities/${activityId}`)
  await page.getByRole('button', { name: 'Add Location', exact: true }).click()
  await page.getByLabel('Search by name or address').fill('123 Creative')
  await page.getByRole('radio', { name: /Creative Studio/ }).check()
  await page.getByRole('button', { name: 'Use location', exact: true }).click()
  await page.getByRole('button', { name: 'Add to Schedule', exact: true }).click()
  await page.getByRole('button', { name: /^Save to / }).click()
  await expect.poll(() => state.writes.length).toBe(2)
  expect(state.writes[1]!.body.placeId).toBe(state.business.locations[0]!.id)
  await page.goto(`/occurrences/${itemId}`)
  await page.getByRole('link', { name: 'Creative Studio', exact: true }).click()
  await expect(page).toHaveURL(/\/@business-a/)
  await expect(page.getByRole('link', { name: '+1 512 555 0100', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Business website', exact: true })).toHaveAttribute('href', 'https://studio.example')
  await expect(page.getByText('123 Creative Way, Austin', { exact: false })).toBeVisible()
})

test('a new personal address stays separate from business association and requires explicit assignment', async ({ page }) => {
  const state = await directory(page)
  await page.reload()
  await page.getByRole('button', { name: 'Add Location', exact: true }).click()
  await page.getByRole('button', { name: 'Add a new location', exact: true }).click()
  await fillLocation(page)
  await page.getByRole('checkbox', { name: /Private address/ }).check()
  await page.getByRole('button', { name: 'Save location', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Use location', exact: true })).toBeVisible()
  expect(state.writes).toHaveLength(1)
  expect(state.writes[0]!.body).toMatchObject({ visibility: 'PRIVATE', linkToMyBusiness: false })
  await page.getByRole('button', { name: 'Use location', exact: true }).click()
  await expect.poll(() => state.writes.length).toBe(2)
  await page.getByRole('button', { name: 'Creative Studio', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Creative Studio', exact: true })).toContainText('123 Creative Way')
  await expect(page.getByRole('dialog').getByRole('link')).toHaveCount(0)
})
