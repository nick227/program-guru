// Applies committed migrations to the test database once per run (same path as production).
import { execFileSync } from 'child_process'
import { resolve } from 'path'

export default function setup() {
  const url = process.env.DATABASE_URL ?? ''
  const host = (() => { try { return new URL(url).hostname } catch { return '' } })()
  if (!process.env.CI && !['localhost', '127.0.0.1'].includes(host)) {
    throw new Error(`Refusing to run tests against non-local database host "${host}"`)
  }
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: resolve(__dirname, '../../../../../packages/db'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  })
}
