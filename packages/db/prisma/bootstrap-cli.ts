import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { db } from '../src/client'
import { repoRoot } from './platform-media'
import { bootstrapDatabase, type BootstrapFixturesMode } from './seed/bootstrap'

function loadRootDotEnvIfNeeded() {
  if (process.env.DATABASE_URL) return
  const envPath = join(repoRoot(), '.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!(key in process.env)) process.env[key] = value
  }
}

function parseArgs(rawArgv: string[]) {
  const argv = rawArgv.filter((a) => a !== '--').map((a) => a.replace(/\\=/g, '='))
  const args = new Set(argv)
  const check = args.has('--check') || process.env.BOOTSTRAP_MODE === 'check'
  const reset = args.has('--reset') || process.env.BOOTSTRAP_MODE === 'reset'
  const skipMigrate = args.has('--skip-migrate')
  const fixtureArg = argv.find((a) => a.startsWith('--fixtures='))?.split('=')[1]
  const withDemo = args.has('--with-demo') || fixtureArg === 'demo' || process.env.BOOTSTRAP_FIXTURES === 'demo'
  const fixtures: BootstrapFixturesMode = withDemo ? 'demo' : 'none'
  const mode = check ? ('check' as const) : reset ? ('reset' as const) : ('sync' as const)
  return { mode, fixtures, skipMigrate }
}

async function main() {
  loadRootDotEnvIfNeeded()
  const { mode, fixtures, skipMigrate } = parseArgs(process.argv.slice(2))
  const started = Date.now()
  const summary = await bootstrapDatabase({ prisma: db, mode, fixtures, skipMigrate })
  console.log(JSON.stringify({ bootstrap: 'ok', ...summary, ms: Date.now() - started }, null, 2))
}

main()
  .catch((err) => {
    console.error('[db:bootstrap] failed:', err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
