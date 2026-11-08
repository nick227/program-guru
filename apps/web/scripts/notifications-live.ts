/** Isolated frontend live acceptance runner for notifications, reminders, and inbox. Starts unmodified API/worker; no shared database reset. */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)))
function resolveDefaultDatabaseUrl() {
  const rootCnf = join(homedir(), '.local/share/programs-app-mysql/root.cnf')
  if (existsSync(rootCnf)) {
    const match = readFileSync(rootCnf, 'utf8').match(/^password=(.+)$/m)
    if (match?.[1]) {
      return `mysql://root:${encodeURIComponent(match[1].trim())}@127.0.0.1:3307/programs_app_notifications_live`
    }
  }
  return 'mysql://invalid/invalid'
}
const url = new URL(
  process.env.NOTIFICATIONS_TEST_DATABASE_URL ?? resolveDefaultDatabaseUrl(),
)
if (
  !['127.0.0.1', 'localhost'].includes(url.hostname) ||
  url.port !== '3307' ||
  url.pathname !== '/programs_app_notifications_live'
) {
  throw new Error(
    'NOTIFICATIONS_TEST_DATABASE_URL must name local MySQL :3307/programs_app_notifications_live',
  )
}

const work = mkdtempSync(join(tmpdir(), 'notifications-live-'))
const apiPort = process.env.NOTIFICATIONS_TEST_API_PORT ?? '3039'
const webPort = process.env.E2E_PORT ?? '5189'
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
  SESSION_SECRET: 'local-notifications-acceptance-only',
  MEDIA_URL_SECRET: 'local-notifications-acceptance-only',
  EMAIL_PROVIDER: 'capture',
  WORKER_TICK_MS: '250',
  WORKER_REMINDERS_EVERY_MS: '250',
  VITE_API_URL: api,
  E2E_PORT: webPort,
  E2E_NOTIFICATIONS_LIVE: '1',
  NOTIFICATIONS_TEST_API: api,
}
Object.assign(process.env, env)

const serverRequire = createRequire(resolve(root, 'apps/server/package.json'))
const children: ChildProcess[] = []
const logs: string[] = []
const run = (command: string, args: string[], cwd = root) =>
  execFileSync(command, args, { cwd, env, stdio: 'pipe' })

let db: (typeof import('../../../packages/db/src/client'))['db'] | undefined

try {
  console.log('Preparing dedicated database programs_app_notifications_live…')
  run('bash', ['scripts/local-mysql.sh', 'create-database', 'programs_app_notifications_live'])
  run('pnpm', ['--filter', '@project/db', 'exec', 'prisma', 'generate'])
  run('pnpm', ['--filter', '@project/db', 'exec', 'prisma', 'migrate', 'deploy'])
  run('pnpm', ['--filter', '@project/db', 'exec', 'tsx', 'prisma/seed.ts'])

  db = (await import('../../../packages/db/src/client')).db
  const suffix = crypto.randomUUID().slice(0, 8)
  const participantEmail = `notif-user-${suffix}@test.local`
  const collaboratorEmail = `notif-collab-${suffix}@test.local`
  const password = `Test-${crypto.randomUUID()}`
  const bcrypt = serverRequire('bcryptjs') as {
    hash: (value: string, rounds: number) => Promise<string>
  }
  const passwordHash = await bcrypt.hash(password, 10)

  await db.user.create({
    data: {
      email: participantEmail,
      emailVerifiedAt: new Date(),
      profile: {
        create: {
          handle: `notif_${suffix}`,
          displayName: 'Notification Tester',
        },
      },
      preferences: { create: { timezone: 'UTC' } },
      credential: { create: { passwordHash } },
    },
  })

  await db.user.create({
    data: {
      email: collaboratorEmail,
      emailVerifiedAt: new Date(),
      profile: {
        create: {
          handle: `collab_${suffix}`,
          displayName: 'Collaborator Tester',
        },
      },
      preferences: { create: { timezone: 'UTC' } },
      credential: { create: { passwordHash } },
    },
  })

  console.log('Starting isolated API and worker…')
  for (const entry of ['src/index.ts', 'src/worker.ts']) {
    const child = spawn(
      process.execPath,
      [serverRequire.resolve('tsx/cli'), entry],
      {
        cwd: resolve(root, 'apps/server'),
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    child.stdout?.on('data', (data) => logs.push(String(data)))
    child.stderr?.on('data', (data) => logs.push(String(data)))
    children.push(child)
  }

  const deadline = Date.now() + 30000
  while (true) {
    if (children.some((child) => child.exitCode !== null)) {
      throw new Error(`API or worker exited before readiness:\n${logs.join('')}`)
    }
    try {
      if ((await fetch(`${api}/health`)).ok) break
    } catch {
      /* startup */
    }
    if (Date.now() > deadline) throw new Error('API did not become ready')
    await new Promise((r) => setTimeout(r, 200))
  }

  const testEnv = {
    ...env,
    NOTIFICATIONS_TEST_EMAIL: participantEmail,
    NOTIFICATIONS_COLLAB_EMAIL: collaboratorEmail,
    NOTIFICATIONS_COLLAB_HANDLE: `collab_${suffix}`,
    NOTIFICATIONS_TEST_PASSWORD: password,
  }

  const code = await new Promise<number>((resolveExit, reject) => {
    const test = spawn(
      'pnpm',
      [
        '--filter',
        'web',
        'exec',
        'playwright',
        'test',
        '--project=notifications-live',
        '--workers=1',
      ],
      { cwd: root, env: testEnv, stdio: 'inherit' },
    )
    test.on('error', reject)
    test.on('exit', (code) => resolveExit(code ?? 1))
  })
  if (code) throw new Error(`Live notifications suite failed (${code})`)
  console.log('Live notifications, reminders, group invite, and preferences round-trips passed.')
} finally {
  for (const child of children) child.kill('SIGTERM')
  await Promise.all(
    children.map((child) =>
      child.exitCode !== null
        ? Promise.resolve()
        : new Promise<void>((resolveExit) => {
            const timer = setTimeout(() => {
              child.kill('SIGKILL')
              resolveExit()
            }, 5000)
            child.once('exit', () => {
              clearTimeout(timer)
              resolveExit()
            })
          }),
    ),
  )
  await db?.$disconnect()
  writeFileSync(join(work, 'server.log'), logs.join(''))
  console.log(`Isolated logs: ${work}`)
}
