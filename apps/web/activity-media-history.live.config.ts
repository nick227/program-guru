import { defineConfig, devices } from '@playwright/test'
// Live specs needing only a running local API (HISTORY_TEST_API): Activity history, account switch, and
// the author → publish → join → Finish/Undo journey. Run them with scripts/history-live.ts, which provides
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
  ],
  webServer: {
    command: `pnpm dev --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
  },
})
