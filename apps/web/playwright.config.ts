import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1',
    url: 'http://localhost:5173',
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
