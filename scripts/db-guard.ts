// Refuses destructive database commands unless DATABASE_URL points at this machine.
// Used by db:migrate, db:seed, and db:reset. db:deploy (prisma migrate deploy) is
// non-destructive and is the only database command Railway runs.
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(__dirname, '../.env')
if (!process.env.DATABASE_URL && existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/)
    if (m) process.env.DATABASE_URL = m[1]!.replace(/^["']|["']$/g, '')
  }
}

const action = process.argv[2] ?? 'this command'
const fail = (why: string) => {
  console.error(`✖ Refusing to run ${action}: ${why}`)
  console.error('  Destructive database commands only run against a local database.')
  process.exit(1)
}

if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID) fail('running on Railway')
if (process.env.NODE_ENV === 'production') fail('NODE_ENV is production')
const url = process.env.DATABASE_URL
if (!url) fail('DATABASE_URL is not set (copy .env.example to .env)')

let host = ''
try {
  host = new URL(url!).hostname
} catch {
  fail('DATABASE_URL is not a valid URL')
}
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) fail(`database host is "${host}", not localhost`)

console.log(`✓ ${action}: local database at ${host}`)
