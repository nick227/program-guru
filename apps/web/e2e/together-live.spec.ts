// Real API + worker (run through apps/web/scripts/together-live.ts). A group whose members follow
// different Program versions: bob accepted v2, carol and dave stayed on v1. They stay connected on
// the Activity they share and are never compared on one their version doesn't schedule.
import { test, expect, type Browser } from '@playwright/test'
import { login } from './journey'

const env = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`Run apps/web/scripts/together-live.ts (missing ${name}).`)
  return value
}

async function signedIn(browser: Browser, email: string) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  await login(page, email, env('TOGETHER_PASSWORD'))
  return page
}

test('mixed-version group: presence, reactions, My Programs, Program page and Group page', async ({ browser }) => {
  const bob = await signedIn(browser, env('TOGETHER_BOB_EMAIL'))

  // ── The Activity is where the group shows up: faces, states, reactions ─────────────────────
  await bob.goto(`/occurrences/${env('TOGETHER_BOB_ITEM')}`)
  const together = bob.getByRole('region', { name: 'Together' })
  await expect(together).toBeVisible()
  await expect(together.getByLabel('Group progress')).toHaveText('1 of 3 finished')
  const recent = together.getByRole('list', { name: 'Recent group activity' })
  await expect(recent.getByRole('listitem').filter({ hasText: 'Carol Chen' })).toContainText('finished just now')
  await expect(recent.getByRole('listitem').filter({ hasText: 'Dave Okafor' })).toContainText('started')
  // Rows sit in the redesigned order: Today → Together → Related Media.
  const headings = await bob.getByRole('heading', { level: 2 }).allTextContents()
  expect(headings.slice(0, 3)).toEqual(['Today', 'Together', 'Related Media'])

  const fire = together.getByRole('button', { name: 'React 🔥 to Carol Chen' })
  await fire.click()
  await expect(fire).toHaveAttribute('aria-pressed', 'true')
  await expect(fire).toHaveText('🔥 1')
  await together.screenshot({ path: test.info().outputPath('bob-activity-together.png') })

  // bob (v2) finishes the same Activity carol finished on v1 and stays on the page.
  await bob.getByRole('button', { name: 'Complete', exact: true }).click()
  await expect(bob.getByRole('status').filter({ hasText: 'Completed' })).toBeVisible()

  // ── My Programs summarizes who you're doing it with (no counts below the sample) ────────────
  await bob.goto('/library')
  const row = bob.getByRole('row').filter({ hasText: env('TOGETHER_PROGRAM_TITLE') })
  await expect(row.locator('td[data-label="People"]')).toContainText('with Carol +1')
  await expect(row.locator('td[data-label="People"]')).not.toContainText('participants')
  await row.screenshot({ path: test.info().outputPath('bob-my-programs-row.png') })

  // ── Program page keeps showing the v1-created group to a v2 member ──────────────────────────
  await bob.goto(`/programs/${env('TOGETHER_PROGRAM_ID')}`)
  await expect(bob.getByRole('link', { name: 'View group' })).toBeVisible()
  // The "no group yet" prompt (which would create a second group) is not offered.
  await expect(bob.getByText('Invite people')).toHaveCount(0)

  // ── Group page loads for everyone, whatever their version ──────────────────────────────────
  await bob.goto(`/groups/${env('TOGETHER_GROUP_ID')}`)
  await expect(bob.getByText('Morning crew').first()).toBeVisible()
  await expect(bob.getByText('Something went wrong')).toHaveCount(0)

  // ── carol (still v1) sees bob's v2 completion and the reaction on her own ──────────────────
  const carol = await signedIn(browser, env('TOGETHER_CAROL_EMAIL'))
  await carol.goto(`/occurrences/${env('TOGETHER_CAROL_ITEM')}`)
  const hers = carol.getByRole('region', { name: 'Together' })
  await expect(hers.getByLabel('Group progress')).toHaveText('2 of 3 finished')
  const carolRecent = hers.getByRole('list', { name: 'Recent group activity' })
  await expect(carolRecent.getByRole('listitem').filter({ hasText: 'Bob Rivera' })).toContainText('finished just now')
  await expect(carolRecent.getByRole('button', { name: '1 🔥 on your completion' })).toBeVisible()
  await expect(carolRecent.getByRole('button', { name: 'React 👏 to Bob Rivera' })).toBeVisible()
  await hers.screenshot({ path: test.info().outputPath('carol-activity-together.png') })

  // ── An Activity v2 dropped: bob is left out, not shown as missing it ───────────────────────
  await carol.goto(`/occurrences/${env('TOGETHER_CAROL_PLANK')}`)
  const plank = carol.getByRole('region', { name: 'Together' })
  await expect(plank.getByLabel('Group progress')).toHaveText('0 of 2 finished')
  await expect(plank.getByRole('list', { name: 'Group members on this Activity' })).not.toContainText('Bob')
  await expect(plank).toContainText('Nobody else has started yet. You could be first.')
  await expect(plank).toContainText('Not yet: Dave')
})
