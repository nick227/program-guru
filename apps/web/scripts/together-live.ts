/**
 * Live acceptance for "doing it together" across Program versions (docs/poc-program-journey.md).
 * Dedicated database (programs_app_together_live), unmodified API and worker, real HTTP for all
 * setup; the browser suite then checks the Activity row, My Programs, the Program page and the
 * Group page for a group whose members follow different versions. No shared database is reset.
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const DB_NAME = 'programs_app_together_live'
const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)))
function defaultDatabaseUrl() {
  const rootCnf = join(homedir(), '.local/share/programs-app-mysql/root.cnf')
  const match = existsSync(rootCnf) && readFileSync(rootCnf, 'utf8').match(/^password=(.+)$/m)
  return match && match[1]
    ? `mysql://root:${encodeURIComponent(match[1].trim())}@127.0.0.1:3307/${DB_NAME}`
    : 'mysql://invalid/invalid'
}
const url = new URL(process.env.TOGETHER_TEST_DATABASE_URL ?? defaultDatabaseUrl())
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '3307' || url.pathname !== `/${DB_NAME}`) {
  throw new Error(`TOGETHER_TEST_DATABASE_URL must name local MySQL :3307/${DB_NAME}`)
}

const work = mkdtempSync(join(tmpdir(), 'together-live-'))
const apiPort = process.env.TOGETHER_TEST_API_PORT ?? '3041'
const webPort = process.env.E2E_PORT ?? '5191'
const api = `http://localhost:${apiPort}`
const TZ = 'America/Chicago'
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
  SESSION_SECRET: 'local-together-acceptance-only',
  MEDIA_URL_SECRET: 'local-together-acceptance-only',
  EMAIL_PROVIDER: 'capture',
  WORKER_TICK_MS: '250',
  VITE_API_URL: api,
  E2E_PORT: webPort,
  E2E_TOGETHER_LIVE: '1',
}
Object.assign(process.env, env)

const serverRequire = createRequire(resolve(root, 'apps/server/package.json'))
const children: ChildProcess[] = []
const logs: string[] = []
const run = (command: string, args: string[]) => execFileSync(command, args, { cwd: root, env, stdio: 'pipe' })
let db: (typeof import('../../../packages/db/src/client'))['db'] | undefined

/** A signed-in HTTP client for one user, talking to the real API. */
async function as(email: string, password: string) {
  const res = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`login ${email}: ${res.status} ${await res.text()}`)
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
  return async function call(method: string, path: string, body?: unknown) {
    const r = await fetch(`${api}${path}`, {
      method,
      headers: { cookie, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const text = await r.text()
    if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${text}`)
    return text ? JSON.parse(text).data : null
  }
}
const key = () => `together-${crypto.randomUUID()}`
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

try {
  console.log(`Preparing dedicated database ${DB_NAME}…`)
  run('bash', ['scripts/local-mysql.sh', 'create-database', DB_NAME])
  run('pnpm', ['--filter', '@project/db', 'exec', 'prisma', 'generate'])
  run('pnpm', ['--filter', '@project/db', 'exec', 'prisma', 'migrate', 'deploy'])
  run('pnpm', ['--filter', '@project/db', 'exec', 'tsx', 'prisma/seed.ts'])

  db = (await import('../../../packages/db/src/client')).db
  const suffix = crypto.randomUUID().slice(0, 6)
  const password = `Test-${crypto.randomUUID()}`
  const bcrypt = serverRequire('bcryptjs') as { hash: (v: string, rounds: number) => Promise<string> }
  const passwordHash = await bcrypt.hash(password, 10)
  const people = { alice: 'Alice Creator', bob: 'Bob Rivera', carol: 'Carol Chen', dave: 'Dave Okafor' } as const
  const emails = {} as Record<keyof typeof people, string>
  for (const [name, displayName] of Object.entries(people) as [keyof typeof people, string][]) {
    emails[name] = `${name}-${suffix}@test.local`
    await db.user.create({
      data: {
        email: emails[name],
        emailVerifiedAt: new Date(),
        profile: { create: { handle: `${name}_${suffix}`, displayName } },
        preferences: { create: { timezone: TZ } },
        credential: { create: { passwordHash } },
      },
    })
  }
  const workout = await db.programType.findFirstOrThrow({ where: { slug: 'workout' } })
  const squats = await db.activity.findFirstOrThrow({ where: { title: 'Squats', creatorId: null } })
  const plank = await db.activity.findFirstOrThrow({ where: { title: 'Plank', creatorId: null } })

  console.log('Starting isolated API and worker…')
  for (const entry of ['src/index.ts', 'src/worker.ts']) {
    const child = spawn(process.execPath, [serverRequire.resolve('tsx/cli'), entry], {
      cwd: resolve(root, 'apps/server'),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout?.on('data', (d) => logs.push(String(d)))
    child.stderr?.on('data', (d) => logs.push(String(d)))
    children.push(child)
  }
  const deadline = Date.now() + 30_000
  while (true) {
    if (children.some((c) => c.exitCode !== null)) throw new Error(`API or worker exited:\n${logs.join('')}`)
    try {
      if ((await fetch(`${api}/health`)).ok) break
    } catch {
      /* starting */
    }
    if (Date.now() > deadline) throw new Error('API did not become ready')
    await new Promise((r) => setTimeout(r, 200))
  }

  console.log('Setting up a mixed-version group over the real API…')
  const alice = await as(emails.alice, password)
  const bob = await as(emails.bob, password)
  const carol = await as(emails.carol, password)
  const dave = await as(emails.dave, password)
  // v1: Squats and Plank daily for 14 days.
  let ws = await alice('POST', '/programs', { programTypeId: workout.id })
  ws = await alice('POST', `/programs/${ws.id}/draft/activities`, { activityIds: [squats.id, plank.id], expectedRevision: ws.draftRevision })
  ws = await alice('PATCH', `/programs/${ws.id}/draft`, { title: `Morning Workout ${suffix}`, durationDays: 14, frequency: { kind: 'DAILY' }, expectedRevision: ws.draftRevision })
  const v1 = (await alice('POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision })).latestPublishedVersionId
  const programId = ws.id as string
  const enrollment: Record<string, string> = {}
  for (const [name, call] of [['bob', bob], ['carol', carol], ['dave', dave]] as const) {
    enrollment[name] = (await call('POST', `/programs/${programId}/enrollments`, { programVersionId: v1, startLocalDate: today(), timezone: TZ, idempotencyKey: key() })).id
  }
  const group = await bob('POST', '/groups', { programVersionId: v1, mode: 'ASYNC', name: 'Morning crew' })
  const link = await bob('POST', `/groups/${group.id}/invitations`, { kind: 'LINK' })
  const token = String(link.joinUrl).split('/join/')[1]
  for (const call of [carol, dave]) await call('POST', `/group-invitations/${token}/accept`)

  const day0Squats = async (userId: string) =>
    (await db!.calendarItem.findFirstOrThrow({
      where: { ownerId: userId, programDayIndex: 0, activityId: squats.id, status: { not: 'CANCELLED' }, enrollment: { programId } },
    })).id
  const ids = Object.fromEntries(
    await Promise.all(
      (['bob', 'carol', 'dave'] as const).map(async (n) => [n, (await db!.user.findUniqueOrThrow({ where: { email: emails[n] } })).id]),
    ),
  ) as Record<'bob' | 'carol' | 'dave', string>

  // carol finishes today's Squats on v1; dave starts his (in progress, not finished).
  const carolItem = await day0Squats(ids.carol)
  const cs = await carol('POST', '/sessions', { calendarItemId: carolItem, idempotencyKey: key() })
  await carol('POST', `/sessions/${cs.id}/actions`, { action: 'FINISH', expectedRevision: cs.revision })
  const ds = await dave('POST', '/sessions', { calendarItemId: await day0Squats(ids.dave), idempotencyKey: key() })
  await dave('POST', `/sessions/${ds.id}/actions`, { action: 'START', expectedRevision: ds.revision })

  // The creator publishes v2 (drops Plank). bob accepts now; carol and dave stay on v1.
  ws = await alice('GET', `/programs/${programId}/workspace`)
  ws = await alice('DELETE', `/programs/${programId}/draft/activities/${plank.id}?expectedRevision=${ws.draftRevision}`)
  const v2 = (await alice('POST', `/programs/${programId}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision })).latestPublishedVersionId
  if (v2 === v1) throw new Error('v2 was not published')
  await bob('POST', `/enrollments/${enrollment.bob}/accept-update`)
  const versions: Array<{ userId: string; programVersionId: string; groupId: string | null }> = await db.programEnrollment.findMany({ where: { programId, status: 'ACTIVE' }, select: { userId: true, programVersionId: true, groupId: true } })
  const mixed = versions.map((v) => `${v.userId === ids.bob ? 'bob' : v.userId === ids.carol ? 'carol' : 'dave'}:${v.programVersionId === v2 ? 'v2' : 'v1'}:${v.groupId === group.id}`).sort()
  if (mixed.join() !== 'bob:v2:true,carol:v1:true,dave:v1:true') throw new Error(`unexpected setup: ${mixed}`)

  const testEnv = {
    ...env,
    TOGETHER_PASSWORD: password,
    TOGETHER_BOB_EMAIL: emails.bob,
    TOGETHER_CAROL_EMAIL: emails.carol,
    TOGETHER_PROGRAM_ID: programId,
    TOGETHER_PROGRAM_TITLE: `Morning Workout ${suffix}`,
    TOGETHER_GROUP_ID: group.id,
    TOGETHER_BOB_ITEM: await day0Squats(ids.bob),
    TOGETHER_CAROL_ITEM: carolItem,
    TOGETHER_CAROL_PLANK: (await db.calendarItem.findFirstOrThrow({ where: { ownerId: ids.carol, programDayIndex: 0, activityId: plank.id, enrollment: { programId } } })).id,
  }
  const code = await new Promise<number>((done, fail) => {
    const test = spawn('pnpm', ['--filter', 'web', 'exec', 'playwright', 'test', '--project=together-live', '--workers=1'], {
      cwd: root,
      env: testEnv,
      stdio: 'inherit',
    })
    test.on('error', fail)
    test.on('exit', (c) => done(c ?? 1))
  })
  if (code) throw new Error(`Live together suite failed (${code})`)
  console.log('Live mixed-version group journey passed.')
} finally {
  for (const child of children) child.kill('SIGTERM')
  await Promise.all(
    children.map((child) =>
      child.exitCode !== null
        ? Promise.resolve()
        : new Promise<void>((done) => {
            const timer = setTimeout(() => {
              child.kill('SIGKILL')
              done()
            }, 5000)
            child.once('exit', () => {
              clearTimeout(timer)
              done()
            })
          }),
    ),
  )
  await db?.$disconnect()
  writeFileSync(join(work, 'server.log'), logs.join(''))
  console.log(`Isolated logs: ${work}`)
}
