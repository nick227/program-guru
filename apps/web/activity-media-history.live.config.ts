import { defineConfig, devices } from '@playwright/test'
// Live specs needing only a running local API (HISTORY_TEST_API): Activity history, account switch,
// the author → publish → join → Finish/Undo journey, and Calendar direct scheduling. Run them with scripts/history-live.ts, which provides
// an isolated API and worker on a dedicated database.
//
// Each spec is its own client: a distinct X-Real-IP per project, which the runner's API trusts from
// loopback (as production trusts Railway's proxy). Specs therefore do not share one rate-limit bucket,
// exactly like independent users behind the proxy. Calls made through playwright.request.newContext()
// carry no header and count as the runner itself.
const port = process.env.E2E_PORT ?? '5197'
const client = (ip: string) => ({ ...devices['Desktop Chrome'], baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' as const, extraHTTPHeaders: { 'x-real-ip': ip } })
export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results/history-live',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  projects: [
    { name: 'history-live', testMatch: 'activity-media-history.live.ts', use: client('198.51.100.11') },
    { name: 'account-switch-live', testMatch: 'account-switch.live.ts', use: client('198.51.100.12') },
    { name: 'journey-live', testMatch: 'live.spec.ts', use: client('198.51.100.13') },
    // Calendar direct scheduling (03-UX §5): mouse on a tall desktop (whole Month grid in view), touch on phone and tablet.
    { name: 'calendar-live', testMatch: 'calendar-direct.live.ts', use: { ...client('198.51.100.14'), viewport: { width: 1440, height: 1400 } } },
    { name: 'calendar-touch-live', testMatch: 'calendar-touch.live.ts', use: { ...client('198.51.100.15'), hasTouch: true, isMobile: true } },
    { name: 'calendar-bulk-live', testMatch: 'calendar-bulk.live.ts', grepInvert: /@touch/, use: { ...client('198.51.100.16'), viewport: { width: 1440, height: 1400 } } },
    { name: 'calendar-bulk-touch-live', testMatch: 'calendar-bulk.live.ts', grep: /@touch/, use: { ...client('198.51.100.17'), hasTouch: true, isMobile: true } },
    { name: 'calendar-inline-live', testMatch: 'calendar-inline.live.ts', grepInvert: /@touch/, use: { ...client('198.51.100.18'), viewport: { width: 1440, height: 1000 } } },
    { name: 'calendar-inline-touch-live', testMatch: 'calendar-inline.live.ts', grep: /@touch/, use: { ...client('198.51.100.19'), hasTouch: true, isMobile: true } },
    // Home's inline execution (the same shared ActivityExecution, stage layout).
    { name: 'home-execution-live', testMatch: 'home-execution.live.ts', grepInvert: /@touch/, use: { ...client('198.51.100.20'), viewport: { width: 1280, height: 900 } } },
    { name: 'home-execution-touch-live', testMatch: 'home-execution.live.ts', grep: /@touch/, use: { ...client('198.51.100.21'), hasTouch: true, isMobile: true } },
  ],
  webServer: {
    command: `pnpm dev --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
  },
})
