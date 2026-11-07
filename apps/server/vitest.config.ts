import { defineConfig } from 'vitest/config'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// Tests always run against TEST_DATABASE_URL (programs_app_test), never the dev database.
function testDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL
  const envFile = resolve(__dirname, '../../.env')
  if (existsSync(envFile)) {
    const m = readFileSync(envFile, 'utf8').match(/^TEST_DATABASE_URL=(.*)$/m)
    if (m) return m[1]!.trim()
  }
  return process.env.CI ? process.env.DATABASE_URL : undefined
}

const url = testDatabaseUrl()
if (!url) throw new Error('Set TEST_DATABASE_URL (pnpm db:local:setup writes it to .env)')
// Global setup runs in this process, so the test database must be set here too.
process.env.DATABASE_URL = url

export default defineConfig({
  test: {
    environment: 'node',
    env: { DATABASE_URL: url, NODE_ENV: 'test' },
    globalSetup: ['./src/__tests__/helpers/global-setup.ts'],
    setupFiles: ['./src/__tests__/helpers/setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 120_000,
  },
})
