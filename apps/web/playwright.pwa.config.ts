import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './pwa-tests',
  outputDir: 'test-results/pwa-browser',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5197', serviceWorkers: 'allow', trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm exec tsx scripts/pwa-test-server.ts',
    url: 'http://127.0.0.1:5197/login',
    timeout: 120_000,
    reuseExistingServer: false,
  },
})
