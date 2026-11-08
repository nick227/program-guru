/**
 * Live acceptance for Activity history, account-switch isolation, and the full author → publish →
 * join → Finish/Undo journey. Runs the unmodified API and worker against the dedicated database
 * programs_app_history_live (migrated and seeded, never reset; every run creates fresh accounts).
 * Run: pnpm exec tsx apps/web/scripts/history-live.ts
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const DB = 'programs_app_history_live'
const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)))
function defaultUrl() {
  const cnf = join(homedir(), '.local/share/programs-app-mysql/root.cnf')
  const pw = existsSync(cnf) ? readFileSync(cnf, 'utf8').match(/^password=(.+)$/m)?.[1] : undefined
  return pw ? `mysql://root:${encodeURIComponent(pw.trim())}@127.0.0.1:3307/${DB}` : 'mysql://invalid/invalid'
}
const url = new URL(process.env.HISTORY_TEST_DATABASE_URL ?? defaultUrl())
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '3307' || url.pathname !== `/${DB}`) {
  throw new Error(`HISTORY_TEST_DATABASE_URL must name local MySQL :3307/${DB}`)
}
const work = mkdtempSync(join(tmpdir(), 'history-live-'))
const apiPort = process.env.HISTORY_TEST_API_PORT ?? '3047'
const webPort = process.env.E2E_PORT ?? '5197'
const api = `http://localhost:${apiPort}`
const suffix = crypto.randomUUID().slice(0, 8)
const accounts = {
  author: { email: `journey-author-${suffix}@test.local`, password: `Journey-author-${suffix}!`, handle: `journey_author_${suffix}`, displayName: 'Journey Author' },
  participant: { email: `journey-part-${suffix}@test.local`, password: `Journey-part-${suffix}!`, handle: `journey_part_${suffix}`, displayName: 'Journey Participant' },
}
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  NODE_ENV: 'development',
  STORAGE_PROVIDER: 'local',
  STORAGE_DIR: join(work, 'storage'),
  PORT: apiPort,
  PUBLIC_API_URL: api,
  PUBLIC_APP_URL: `http://localhost:${webPort}`,
  CORS_ORIGIN: `http://localhost:${webPort}`,
  SESSION_SECRET: 'local-history-acceptance-only',
  MEDIA_URL_SECRET: 'local-history-acceptance-media-only',
  EMAIL_LINK_SECRET: 'local-history-acceptance-email-only',
  EMAIL_PROVIDER: 'capture',
  WORKER_TICK_MS: '250',
  // Loopback stands in for Railway's proxy: each Playwright project sends its own X-Real-IP.
  CLIENT_IP_HEADER: 'x-real-ip',
  TRUSTED_PROXY_CIDRS: '127.0.0.1/32,::1/128',
  VITE_API_URL: api,
  E2E_PORT: webPort,
  HISTORY_TEST_API: api,
  E2E_AUTHOR_EMAIL: accounts.author.email,
  E2E_AUTHOR_PASSWORD: accounts.author.password,
  E2E_PARTICIPANT_EMAIL: accounts.participant.email,
  E2E_PARTICIPANT_PASSWORD: accounts.participant.password,
}
Object.assign(process.env, env)
const serverRequire = createRequire(resolve(root, 'apps/server/package.json'))
const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: root, env, stdio: 'pipe' })
/** Refuses to run if something already answers on the API port: never talk to another agent's server. */
async function assertPortFree(base: string) {
  try {
    await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) })
  } catch {
    return
  }
  throw new Error(`${base} is already in use; set a free port (no requests were sent to it beyond /health)`)
}
const children: ChildProcess[] = []
const logs: string[] = []
try {
  await assertPortFree(api)
  console.log(`Preparing dedicated database ${DB}…`)
  run('bash', ['scripts/local-mysql.sh', 'create-database', DB])
  run('pnpm', ['--filter', '@project/db', 'exec', 'prisma', 'generate'])
  run('pnpm', ['--filter', '@project/db', 'exec', 'prisma', 'migrate', 'deploy'])
  run('pnpm', ['--filter', '@project/db', 'exec', 'tsx', 'prisma/seed.ts'])
  console.log('Starting isolated API and worker…')
  for (const entry of ['src/index.ts', 'src/worker.ts']) {
    const child = spawn(process.execPath, [serverRequire.resolve('tsx/cli'), entry], { cwd: resolve(root, 'apps/server'), env, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout?.on('data', (d) => logs.push(String(d)))
    child.stderr?.on('data', (d) => logs.push(String(d)))
    children.push(child)
  }
  const deadline = Date.now() + 30_000
  for (;;) {
    if (children.some((c) => c.exitCode !== null)) throw new Error(`API or worker exited early:\n${logs.join('')}`)
    try {
      if ((await fetch(`${api}/health`)).ok) break
    } catch {
      /* starting */
    }
    if (Date.now() > deadline) throw new Error('API did not become ready')
    await new Promise((r) => setTimeout(r, 200))
  }
  // Journey accounts: registered through the API; the author is verified so publishing is allowed.
  for (const a of Object.values(accounts)) {
    const res = await fetch(`${api}/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(a) })
    if (res.status !== 201) throw new Error(`register ${a.email}: ${res.status} ${await res.text()}`)
  }
  const { PrismaClient } = createRequire(resolve(root, 'packages/db/package.json'))('@prisma/client')
  const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } })
  await prisma.user.update({ where: { email: accounts.author.email }, data: { emailVerifiedAt: new Date() } })
  await prisma.$disconnect()
  const code = await new Promise<number>((done, fail) => {
    const t = spawn('pnpm', ['--filter', 'web', 'exec', 'playwright', 'test', '--config', 'activity-media-history.live.config.ts', ...process.argv.slice(2)], { cwd: root, env, stdio: 'inherit' })
    t.on('error', fail)
    t.on('exit', (c) => done(c ?? 1))
  })
  if (code) throw new Error(`Live history suite failed (${code})`)
  console.log('Live Activity history, account switch and journey passed.')
} finally {
  for (const c of children) c.kill('SIGTERM')
  await Promise.all(children.map((c) => (c.exitCode !== null ? undefined : new Promise<void>((r) => { const t = setTimeout(() => { c.kill('SIGKILL'); r() }, 5000); c.once('exit', () => { clearTimeout(t); r() }) }))))
}
