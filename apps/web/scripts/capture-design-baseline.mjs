// Captures the design comparison board screenshots from a running app.
// Usage (from apps/web, with the API on :3001 and web on :5173):
//   node scripts/capture-design-baseline.mjs ../../docs/design/baseline/<date>/shots
// IDs default to the local dev database used for the 2026-11-09 baseline; override per environment.
import { chromium } from '@playwright/test'

const base = process.env.BASE_URL ?? 'http://localhost:5173'
const out = process.argv[2] ?? 'baseline-shots'
const ids = {
  program: process.env.PROGRAM_ID ?? 'c48a96c6-411b-408a-87e1-e2db7ea776ef',
  occurrence: process.env.OCCURRENCE_ID ?? '23d485bd-b2d5-4826-ba3b-b6089dd870f9',
  workspace: process.env.WORKSPACE_ID ?? '26c9ae20-b6ca-447c-adc0-b9e6535e0a86',
}
const accounts = {
  participant: [process.env.E2E_PARTICIPANT_EMAIL ?? 'e2e-participant@test.local', process.env.E2E_PARTICIPANT_PASSWORD ?? 'e2e-participant-pass-ok'],
  author: [process.env.E2E_AUTHOR_EMAIL ?? 'e2e-author@test.local', process.env.E2E_AUTHOR_PASSWORD ?? 'e2e-author-pass-ok'],
}
const widths = { desktop: [1280, 860], tablet: [768, 1024], mobile: [390, 844] }
// [name, path, fullPage]; overlays (the library sheet) are captured at viewport height.
const plans = {
  participant: [
    ['program', `/programs/${ids.program}`, true],
    ['discover', '/discover', true],
    ['browse', '/discover/browse', false],
    ['my-programs', '/library', true],
    ['activity', `/occurrences/${ids.occurrence}`, true],
    ['calendar', '/?view=week', true],
  ],
  author: [
    ['editor-1-new', '/programs/new', true],
    ['editor-2-details', `/programs/${ids.workspace}/workspace?step=details`, true],
    ['editor-3-activities', `/programs/${ids.workspace}/workspace?step=activities`, true],
    ['editor-4-publish', `/programs/${ids.workspace}/workspace?step=publish`, true],
  ],
}

const browser = await chromium.launch()
for (const [who, pages] of Object.entries(plans)) {
  for (const [label, [width, height]] of Object.entries(widths)) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: 'dark' })
    await context.addInitScript(() => localStorage.setItem('theme', 'dark'))
    const page = await context.newPage()
    await page.goto(`${base}/login`)
    await page.getByLabel('Email', { exact: true }).fill(accounts[who][0])
    await page.getByLabel('Password', { exact: true }).fill(accounts[who][1])
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.waitForURL((url) => !url.pathname.startsWith('/login'))
    for (const [name, path, fullPage] of pages) {
      await page.goto(base + path, { waitUntil: 'networkidle' }).catch(() => {})
      await page.waitForTimeout(1800)
      const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight)
      await page.screenshot({
        path: `${out}/${name}-${label}.jpg`,
        type: 'jpeg',
        quality: 72,
        ...(fullPage
          ? { fullPage: true, clip: { x: 0, y: 0, width, height: Math.min(scrollHeight, 4200) } }
          : {}),
      })
      console.log(name, label)
    }
    await context.close()
  }
}
await browser.close()
