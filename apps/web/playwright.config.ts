import { defineConfig, devices } from '@playwright/test'
const port = process.env.E2E_PORT ?? '5173'
const baseURL = `http://localhost:${port}`
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `pnpm dev --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
  projects: process.env.E2E_LIVE
    ? [
        {
          name: 'live',
          testMatch: 'live.spec.ts',
          use: { ...devices['Desktop Chrome'] },
        },
      ]
    : [
        {
          name: 'desktop',
          testIgnore: 'live.spec.ts',
          use: {
            ...devices['Desktop Chrome'],
            viewport: { width: 1280, height: 900 },
          },
        },
        {
          name: 'mobile',
          testIgnore: 'live.spec.ts',
          use: {
            ...devices['iPhone 13'],
            defaultBrowserType: 'chromium',
            viewport: { width: 360, height: 780 },
          },
        },
      ],
})
