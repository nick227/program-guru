import { defineConfig, devices } from '@playwright/test'
// Live account journeys (scripts/auth-live.ts starts the API and worker). The web app is the production
// build served by `vite preview`, which answers every path with index.html like the Vercel rewrite.
const port = process.env.E2E_PORT ?? '5191'
export default defineConfig({
  // Own folder, so the default mocked suite (playwright.config.ts, testDir ./e2e) never picks it up.
  testDir: './e2e-live',
  outputDir: 'test-results/auth-live',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure', screenshot: 'only-on-failure', ...devices['Desktop Chrome'] },
  webServer: {
    command: `pnpm build && pnpm exec vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
