import { defineConfig, devices } from '@playwright/test'
const port = process.env.E2E_PORT ?? '5192'
export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results/history-live',
  // Live specs needing only a running local API (HISTORY_TEST_API): history and account switch.
  testMatch: ['activity-media-history.live.ts', 'account-switch.live.ts'],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm dev --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
  },
})
