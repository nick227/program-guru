/** Isolated frontend acceptance runner. Starts unmodified API/worker; no database reset. */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)))
const url = new URL(
  process.env.MEDIA_TEST_DATABASE_URL ?? 'mysql://invalid/invalid',
)
if (
  !['127.0.0.1', 'localhost'].includes(url.hostname) ||
  url.port !== '3307' ||
  url.pathname !== '/programs_app_codex_media_roundtrip'
)
  throw new Error(
    'MEDIA_TEST_DATABASE_URL must name local MySQL :3307/programs_app_codex_media_roundtrip',
  )
const work = mkdtempSync(join(tmpdir(), 'codex-media-live-'))
const apiPort = process.env.MEDIA_TEST_API_PORT ?? '3037'
const webPort = process.env.E2E_PORT ?? '5187'
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
  SESSION_SECRET: 'local-media-acceptance-only',
  MEDIA_URL_SECRET: 'local-media-acceptance-only',
  EMAIL_PROVIDER: 'capture',
  WORKER_TICK_MS: '300',
  VITE_API_URL: api,
  E2E_PORT: webPort,
  E2E_MEDIA_LIVE: '1',
  MEDIA_TEST_API: api,
}
Object.assign(process.env, env)
const serverRequire = createRequire(resolve(root, 'apps/server/package.json'))
const children: ChildProcess[] = []
const logs: string[] = []
const run = (command: string, args: string[], cwd = root) =>
  execFileSync(command, args, { cwd, env, stdio: 'pipe' })
let db: (typeof import('../../../packages/db/src/client'))['db'] | undefined
try {
  console.log('Preparing dedicated database and fixture storage…')
  run('pnpm', ['--filter', '@project/db', 'exec', 'prisma', 'generate'])
  run('pnpm', [
    '--filter',
    '@project/db',
    'exec',
    'prisma',
    'migrate',
    'deploy',
  ])
  run('pnpm', ['--filter', '@project/db', 'exec', 'tsx', 'prisma/seed.ts'])
  db = (await import('../../../packages/db/src/client')).db
  const suffix = crypto.randomUUID().slice(0, 8)
  const email = `media-${suffix}@test.local`
  const password = `Test-${crypto.randomUUID()}`
  const bcrypt = serverRequire('bcryptjs') as {
    hash: (value: string, rounds: number) => Promise<string>
  }
  await db.user.create({
    data: {
      email,
      emailVerifiedAt: new Date(),
      profile: {
        create: { handle: `media_${suffix}`, displayName: 'Media tester' },
      },
      preferences: { create: { timezone: 'America/Chicago' } },
      credential: { create: { passwordHash: await bcrypt.hash(password, 10) } },
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
    if (children.some((child) => child.exitCode !== null))
      throw new Error('API or worker exited before readiness')
    try {
      if ((await fetch(`${api}/health`)).ok) break
    } catch {
      /* startup */
    }
    if (Date.now() > deadline) throw new Error('API did not become ready')
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  // Media files are test fixtures only. The existing worker performs all application processing.
  const photo = join(work, 'photo.png'),
    video = join(work, 'video.mp4')
  run('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=teal:s=64x64',
    '-frames:v',
    '1',
    photo,
  ])
  run('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=teal:s=160x120:r=25',
    '-t',
    '1',
    '-an',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    video,
  ])
  const testEnv = {
    ...env,
    MEDIA_TEST_EMAIL: email,
    MEDIA_TEST_PASSWORD: password,
    MEDIA_TEST_PHOTO: photo,
    MEDIA_TEST_VIDEO: video,
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
        '--project=media-live',
        '--workers=1',
      ],
      { cwd: root, env: testEnv, stdio: 'inherit' },
    )
    test.on('error', reject)
    test.on('exit', (code) => resolveExit(code ?? 1))
  })
  if (code) throw new Error(`Live browser suite failed (${code})`)
  console.log('Live media round trips passed against the real API and worker.')
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
  console.log(`Isolated logs and media fixtures: ${work}`)
}
