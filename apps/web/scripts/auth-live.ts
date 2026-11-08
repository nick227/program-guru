/**
 * Live acceptance for account screens: registration, email verification, password reset, invalid and
 * expired links, and direct navigation/refresh. Runs the unmodified API and worker against the dedicated
 * database programs_app_auth_live (never reset), captures outgoing email to a log the spec reads links
 * from, and serves the production web build with `vite preview` (SPA fallback like the Vercel rewrite).
 * Run: pnpm --filter web test:e2e:auth
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { appendFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const DB = 'programs_app_auth_live'
const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)))
function defaultUrl() {
  const cnf = join(homedir(), '.local/share/programs-app-mysql/root.cnf')
  const pw = existsSync(cnf) ? readFileSync(cnf, 'utf8').match(/^password=(.+)$/m)?.[1] : undefined
  return pw ? `mysql://root:${encodeURIComponent(pw.trim())}@127.0.0.1:3307/${DB}` : 'mysql://invalid/invalid'
}
const url = new URL(process.env.AUTH_TEST_DATABASE_URL ?? defaultUrl())
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '3307' || url.pathname !== `/${DB}`) {
  throw new Error(`AUTH_TEST_DATABASE_URL must name local MySQL :3307/${DB}`)
}
const work = mkdtempSync(join(tmpdir(), 'auth-live-'))
const mailLog = join(work, 'mail.log')
writeFileSync(mailLog, '')
const apiPort = process.env.AUTH_TEST_API_PORT ?? '3043'
const webPort = process.env.E2E_PORT ?? '5191'
const api = `http://localhost:${apiPort}`
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
  SESSION_SECRET: 'local-auth-acceptance-only',
  MEDIA_URL_SECRET: 'local-auth-acceptance-only',
  EMAIL_LINK_SECRET: 'local-auth-acceptance-email-only',
  EMAIL_PROVIDER: 'capture',
  WORKER_TICK_MS: '250',
  VITE_API_URL: api,
  E2E_PORT: webPort,
  AUTH_LIVE_MAIL_LOG: mailLog,
  AUTH_LIVE_API: api,
}
Object.assign(process.env, env)
const serverRequire = createRequire(resolve(root, 'apps/server/package.json'))
const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: root, env, stdio: 'pipe' })
const children: ChildProcess[] = []
const logs: string[] = []
try {
  console.log(`Preparing dedicated database ${DB}…`)
  run('bash', ['scripts/local-mysql.sh', 'create-database', DB])
  run('pnpm', ['--filter', '@project/db', 'exec', 'prisma', 'generate'])
  run('pnpm', ['--filter', '@project/db', 'exec', 'prisma', 'migrate', 'deploy'])
  run('pnpm', ['--filter', '@project/db', 'exec', 'tsx', 'prisma/seed.ts'])
  console.log('Starting isolated API and worker…')
  for (const entry of ['src/index.ts', 'src/worker.ts']) {
    const child = spawn(process.execPath, [serverRequire.resolve('tsx/cli'), entry], { cwd: resolve(root, 'apps/server'), env, stdio: ['ignore', 'pipe', 'pipe'] })
    // The capture provider prints each email to stdout; the spec reads links from this log.
    child.stdout?.on('data', (d) => {
      logs.push(String(d))
      if (entry.endsWith('worker.ts')) appendFileSync(mailLog, String(d))
    })
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
  const code = await new Promise<number>((done, fail) => {
    const t = spawn('pnpm', ['--filter', 'web', 'exec', 'playwright', 'test', '--config', 'playwright.auth-live.config.ts', '--workers=1'], { cwd: root, env, stdio: 'inherit' })
    t.on('error', fail)
    t.on('exit', (c) => done(c ?? 1))
  })
  if (code) throw new Error(`Live account suite failed (${code})`)
  console.log('Live account journeys passed.')
} finally {
  for (const c of children) c.kill('SIGTERM')
  await Promise.all(children.map((c) => (c.exitCode !== null ? undefined : new Promise<void>((r) => { const t = setTimeout(() => { c.kill('SIGKILL'); r() }, 5000); c.once('exit', () => { clearTimeout(t); r() }) }))))
}
