// Media verification against a real API process and a real worker process over HTTP
// (11-MEDIA.md, 05-ARCHITECTURE.md §10). Isolated: its own database (programs_app_e2e), its own
// ports, and its own storage directory shared by both processes. Never touches the dev database.
//
//   pnpm --filter server media:e2e
//
// Requires the local MySQL (scripts/local-mysql.sh create-database programs_app_e2e) and ffmpeg.
import { spawn, execFileSync, type ChildProcess } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { PrismaClient } from '@prisma/client'

const ROOT = resolve(__dirname, '../../..')
const PORT = Number(process.env.E2E_PORT ?? 3021)
const API = `http://127.0.0.1:${PORT}`
const STORAGE = mkdtempSync(join(tmpdir(), 'programs-e2e-storage-'))
const WORK = mkdtempSync(join(tmpdir(), 'programs-e2e-work-'))

function envUrl(name: string) {
  const m = readFileSync(join(ROOT, '.env'), 'utf8').match(new RegExp(`^${name}=(.*)$`, 'm'))
  return m?.[1]?.trim()
}
const base = (envUrl('DATABASE_URL') ?? '').replace(/\/[^/]+$/, '')
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? `${base}/programs_app_e2e`
if (!/\/programs_app_e2e$/.test(DATABASE_URL) || !/@(127\.0\.0\.1|localhost)[:/]/.test(DATABASE_URL)) {
  throw new Error(`Refusing to run: E2E database must be a local programs_app_e2e, got ${DATABASE_URL}`)
}
const db = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } })

const childEnv = {
  ...process.env,
  NODE_ENV: 'development',
  DATABASE_URL,
  PORT: String(PORT),
  STORAGE_PROVIDER: 'local',
  STORAGE_DIR: STORAGE,
  PUBLIC_API_URL: API,
  PUBLIC_APP_URL: 'http://127.0.0.1:5999',
  MEDIA_URL_SECRET: 'e2e-media-secret',
  SESSION_SECRET: 'e2e-session-secret',
  EMAIL_PROVIDER: 'capture',
  WORKER_TICK_MS: '400',
  CORS_ORIGIN: 'http://127.0.0.1:5999',
}

// ── Reporting ───────────────────────────────────────────────────────────────

const results: { name: string; ok: boolean; detail?: string }[] = []
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    results.push({ name, ok: true })
    console.log(`  ✓ ${name}`)
  } catch (err) {
    results.push({ name, ok: false, detail: (err as Error).message })
    console.log(`  ✗ ${name}\n      ${(err as Error).message}`)
  }
}
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message)
}
const eq = (a: unknown, b: unknown, what: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)

async function waitFor<T>(what: string, fn: () => Promise<T | null | undefined | false>, ms = 90_000): Promise<T> {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v) return v as T
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`)
    await new Promise((r) => setTimeout(r, 300))
  }
}

// ── Processes ───────────────────────────────────────────────────────────────

const procs: Record<string, ChildProcess> = {}
const logs: Record<string, string> = { api: '', worker: '' }
function start(name: 'api' | 'worker', extraEnv: Record<string, string> = {}) {
  const entry = name === 'api' ? 'src/index.ts' : 'src/worker.ts'
  const p = spawn(process.execPath, [require.resolve('tsx/cli'), entry], { cwd: resolve(__dirname, '..'), env: { ...childEnv, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  p.stdout!.on('data', (d) => (logs[name] += d))
  p.stderr!.on('data', (d) => (logs[name] += d))
  procs[name] = p
  return p
}
async function stop(name: 'api' | 'worker') {
  const p = procs[name]
  if (!p || p.exitCode !== null) return
  const done = new Promise((r) => p.once('exit', r))
  process.kill(-p.pid!, 'SIGTERM')
  await Promise.race([done, new Promise((r) => setTimeout(r, 8000))])
  if (p.exitCode === null) process.kill(-p.pid!, 'SIGKILL')
}

// ── HTTP ────────────────────────────────────────────────────────────────────

type User = { id: string; handle: string; cookie: string }
async function http(user: User | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    method,
    redirect: 'manual',
    headers: { ...(user ? { cookie: user.cookie } : {}), ...(body !== undefined && !(body instanceof Buffer) ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : body instanceof Buffer ? new Uint8Array(body) : JSON.stringify(body),
  })
  const buf = Buffer.from(await res.arrayBuffer())
  let json: any = null
  try {
    json = JSON.parse(buf.toString('utf8'))
  } catch {}
  return { status: res.status, json, buf, headers: res.headers }
}
async function ok(user: User | null, method: string, path: string, body?: unknown) {
  const r = await http(user, method, path, body)
  assert(r.status < 300, `${method} ${path} → ${r.status} ${r.buf.toString('utf8').slice(0, 300)}`)
  return r.json?.data
}
async function register(handle: string): Promise<User> {
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${handle}@e2e.local`, password: 'e2e long password', handle, displayName: handle, timezone: 'America/Chicago' }),
  })
  assert(res.status === 201, `register ${handle} → ${res.status}`)
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!
  const body = (await res.json()) as any
  await db.user.update({ where: { id: body.data.id }, data: { emailVerifiedAt: new Date() } })
  return { id: body.data.id, handle, cookie }
}

// ── Media fixtures (made with ffmpeg, like a browser recording would be) ────

function make(name: string, args: string[]) {
  const out = join(WORK, name)
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args, out])
  return readFileSync(out)
}
const fixtures = {
  png: () => make('photo.png', ['-f', 'lavfi', '-i', 'color=c=0x2a6f97:s=640x480', '-frames:v', '1']),
  webmRecording: () => make('recording.webm', ['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=330', '-t', '3', '-c:v', 'libvpx', '-b:v', '600k', '-c:a', 'libopus', '-metadata', 'location=+40.6892-074.0445/']),
  mp4WithGps: () => make('phone.mp4', ['-f', 'lavfi', '-i', 'testsrc=size=480x270:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-metadata', 'location=+40.6892-074.0445/', '-movflags', '+use_metadata_tags']),
  webmAudio: () => make('voice.webm', ['-f', 'lavfi', '-i', 'sine=frequency=220', '-t', '2', '-c:a', 'libopus']),
  m4aAudio: () => make('voice.m4a', ['-f', 'lavfi', '-i', 'sine=frequency=260', '-t', '2', '-c:a', 'aac']),
  mp3Audio: () => make('voice.mp3', ['-f', 'lavfi', '-i', 'sine=frequency=300', '-t', '2', '-c:a', 'libmp3lame']),
  broken: () => Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypisom'), Buffer.alloc(4000, 7)]),
}

function probe(buf: Buffer) {
  const f = join(WORK, `probe-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  writeFileSync(f, buf)
  return JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', f]).toString()) as { streams: any[]; format: any }
}

async function upload(user: User, bytes: Buffer, mime: string) {
  const t = await ok(user, 'POST', '/media/uploads', { filename: 'f', mime, sizeBytes: bytes.length, alt: `e2e ${mime}` })
  const put = await fetch(t.uploadUrl, { method: 'PUT', headers: t.headers, body: new Uint8Array(bytes) })
  assert(put.status === 200, `upload PUT → ${put.status}`)
  await ok(user, 'POST', `/media/uploads/${t.uploadId}/complete`)
  return t.mediaId as string
}
const ready = (user: User, id: string) =>
  waitFor(`media ${id} READY`, async () => {
    const m = await ok(user, 'GET', `/media/${id}`)
    if (m.state === 'FAILED') throw new Error(`media ${id} FAILED`)
    return m.state === 'READY' ? m : null
  })

// ── Run ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Media E2E: API ${API}, storage ${STORAGE}, database programs_app_e2e`)
  // The seed writes platform media files too: they must land in the same storage the API reads.
  const dbEnv = { ...process.env, DATABASE_URL, STORAGE_PROVIDER: 'local', STORAGE_DIR: STORAGE }
  execFileSync('npx', ['prisma', 'migrate', 'reset', '--force', '--skip-seed', '--skip-generate'], { cwd: join(ROOT, 'packages/db'), env: dbEnv, stdio: 'pipe' })
  execFileSync('npx', ['tsx', 'prisma/seed.ts'], { cwd: join(ROOT, 'packages/db'), env: dbEnv, stdio: 'pipe' })

  start('api')
  start('worker')
  await waitFor('API health', async () => (await fetch(`${API}/health`).catch(() => null))?.ok, 60_000)
  await waitFor('worker start', async () => logs.worker.includes('[worker] started'), 60_000)

  const alice = await register('alice_e2e')
  const bob = await register('bob_e2e')
  const carol = await register('carol_e2e')
  const mod = await register('mod_e2e')
  await db.user.update({ where: { id: mod.id }, data: { role: 'MODERATOR' } })

  console.log('\nProcesses and storage')
  await check('API and worker are separate processes sharing one storage directory', async () => {
    assert(procs.api!.pid !== procs.worker!.pid, 'same pid')
    assert(logs.worker.includes(`at ${STORAGE}`), `worker storage not reported: ${logs.worker.slice(0, 200)}`)
  })
  await check('seeded platform media is served from the shared storage', async () => {
    const asset = await db.mediaAsset.findFirstOrThrow({ where: { ownerId: null, state: 'READY' } })
    const url = await ok(null, 'GET', `/media/${asset.id}/url`)
    const file = await http(null, 'GET', url.url)
    eq(file.status, 200, 'platform media status')
  })

  console.log('\nPhoto')
  let photoId = ''
  await check('photo: upload → worker → READY with WEB and THUMB renditions', async () => {
    photoId = await upload(alice, fixtures.png(), 'image/png')
    const m = await ready(alice, photoId)
    eq([m.width, m.height], [640, 480], 'dimensions')
    const variants = await db.mediaVariant.findMany({ where: { mediaId: photoId }, select: { kind: true } })
    eq(variants.map((v) => v.kind).sort(), ['THUMB', 'WEB'], 'variants')
    for (const v of await db.mediaVariant.findMany({ where: { mediaId: photoId } })) assert(existsSync(join(STORAGE, v.storageKey)), `worker-written ${v.kind} not visible at ${v.storageKey}`)
  })
  await check('photo: owner playback URL serves the re-encoded JPEG; thumbnail serves too', async () => {
    const url = await ok(alice, 'GET', `/media/${photoId}/url`)
    const file = await http(null, 'GET', url.url)
    eq(file.status, 200, 'status')
    eq(file.headers.get('content-type'), 'image/jpeg', 'content-type')
    eq(file.headers.get('x-content-type-options'), 'nosniff', 'nosniff')
    const mine = await ok(alice, 'GET', '/media/mine')
    const thumb = await http(null, 'GET', mine.find((m: any) => m.id === photoId).thumbnailUrl)
    eq([thumb.status, thumb.headers.get('content-type')], [200, 'image/jpeg'], 'thumbnail')
  })

  console.log('\nVideo')
  let videoId = ''
  await check('video: browser-style WebM (VP8/Opus, codec params in MIME) → H.264/AAC MP4, faststart, poster', async () => {
    videoId = await upload(alice, fixtures.webmRecording(), 'video/webm;codecs=vp8,opus')
    const m = await ready(alice, videoId)
    assert(m.durationMs >= 2500, `duration ${m.durationMs}`)
    const url = await ok(alice, 'GET', `/media/${videoId}/url`)
    eq(url.mime, 'video/mp4', 'mime')
    const file = await http(null, 'GET', url.url)
    eq([file.status, file.headers.get('content-type'), file.headers.get('accept-ranges')], [200, 'video/mp4', 'bytes'], 'stream response')
    const info = probe(file.buf)
    eq(info.streams.map((s) => s.codec_name).sort(), ['aac', 'h264'], 'codecs')
    assert(file.buf.indexOf('moov') < file.buf.indexOf('mdat'), 'moov atom is not before mdat (no faststart)')
    assert(!/location|40\.6892/i.test(JSON.stringify(info.format.tags ?? {})), `location metadata survived: ${JSON.stringify(info.format.tags)}`)
    const poster = await http(null, 'GET', url.posterUrl)
    eq([poster.status, poster.headers.get('content-type')], [200, 'image/jpeg'], 'poster')
  })
  await check('video: HTTP Range requests return 206 with the right bytes (seeking)', async () => {
    const url = await ok(alice, 'GET', `/media/${videoId}/url`)
    const full = await http(null, 'GET', url.url)
    const part = await http(null, 'GET', url.url, undefined, { range: 'bytes=100-1099' })
    eq(part.status, 206, 'status')
    eq(part.headers.get('content-range'), `bytes 100-1099/${full.buf.length}`, 'content-range')
    assert(part.buf.equals(full.buf.subarray(100, 1100)), 'partial bytes differ from the full file')
    const tail = await http(null, 'GET', url.url, undefined, { range: 'bytes=-500' })
    assert(tail.status === 206 && tail.buf.equals(full.buf.subarray(full.buf.length - 500)), 'suffix range')
    eq((await http(null, 'GET', url.url, undefined, { range: `bytes=${full.buf.length + 10}-` })).status, 416, 'unsatisfiable range')
  })
  await check('video: phone MP4 with GPS tag is stripped of location', async () => {
    const id = await upload(alice, fixtures.mp4WithGps(), 'video/mp4')
    await ready(alice, id)
    const file = await http(null, 'GET', (await ok(alice, 'GET', `/media/${id}/url`)).url)
    assert(!/location|40\.6892/i.test(JSON.stringify(probe(file.buf).format.tags ?? {})), 'location survived')
  })

  console.log('\nAudio')
  for (const [label, make, mime] of [
    ['WebM/Opus recording', fixtures.webmAudio, 'audio/webm;codecs=opus'],
    ['M4A/AAC', fixtures.m4aAudio, 'audio/mp4'],
    ['MP3', fixtures.mp3Audio, 'audio/mpeg'],
  ] as const) {
    await check(`audio: ${label} → AAC in MP4 container`, async () => {
      const id = await upload(alice, make(), mime)
      await ready(alice, id)
      const file = await http(null, 'GET', (await ok(alice, 'GET', `/media/${id}/url`)).url)
      eq([file.status, file.headers.get('content-type')], [200, 'audio/mp4'], 'response')
      eq(probe(file.buf).streams.map((s) => s.codec_name), ['aac'], 'codec')
    })
  }

  console.log('\nAccess boundaries')
  await check('PRIVATE: only the owner can get a URL or the asset; others and anonymous get 404', async () => {
    for (const who of [bob, carol, null]) eq((await http(who, 'GET', `/media/${photoId}/url`)).status, 404, `url for ${who?.handle ?? 'anonymous'}`)
    eq((await http(bob, 'GET', `/media/${photoId}`)).status, 404, 'asset for bob')
    assert(!(await ok(bob, 'GET', '/media/mine')).some((m: any) => m.id === photoId), 'listed in bob’s library')
  })
  await check('signed URLs: a tampered signature is refused', async () => {
    const url = (await ok(alice, 'GET', `/media/${photoId}/url`)).url as string
    eq((await http(null, 'GET', url.replace(/sig=[^&]+/, 'sig=forged'))).status, 404, 'forged')
    eq((await http(null, 'GET', url.replace(/exp=\d+/, 'exp=1000'))).status, 404, 'expired')
  })

  // A group on a seeded starter Program: Alice owns it, Bob joins, Carol stays outside.
  const starter = (await ok(alice, 'GET', '/discover?kind=PROGRAM')).find((d: any) => d.program.accessMode === 'OPEN').program
  const preview = await ok(alice, 'GET', `/programs/${starter.id}`)
  const today = new Date().toISOString().slice(0, 10)
  await ok(alice, 'POST', `/programs/${starter.id}/enrollments`, { programVersionId: preview.latestVersionId, startLocalDate: today, timezone: 'America/Chicago', idempotencyKey: 'e2e-alice-join' })
  const group = await ok(alice, 'POST', '/groups', { programVersionId: preview.latestVersionId, mode: 'SYNC' })
  const invite = await ok(alice, 'POST', `/groups/${group.id}/invitations`, { kind: 'USER', handle: bob.handle })
  await ok(bob, 'POST', `/group-invitations/${invite.joinUrl.split('/join/')[1]}/accept`)
  await ok(bob, 'POST', `/programs/${starter.id}/enrollments`, { programVersionId: preview.latestVersionId, startLocalDate: today, timezone: 'America/Chicago', groupId: group.id, idempotencyKey: 'e2e-bob-join' })
  const aliceItem = await db.calendarItem.findFirstOrThrow({ where: { ownerId: alice.id, groupOccurrenceKey: { not: null } }, orderBy: [{ localDate: 'asc' }] })
  const bobItem = await db.calendarItem.findFirstOrThrow({ where: { ownerId: bob.id, groupOccurrenceKey: aliceItem.groupOccurrenceKey } })

  await check('GROUP: shared media is visible to members only, in the occurrence and by URL', async () => {
    await ok(alice, 'POST', '/media-publications', { mediaId: photoId, audience: 'GROUP', groupId: group.id, occurrenceKey: aliceItem.groupOccurrenceKey })
    const url = await ok(bob, 'GET', `/media/${photoId}/url`)
    eq((await http(null, 'GET', url.url)).status, 200, 'bob plays it')
    const occ = await ok(bob, 'GET', `/calendar-items/${bobItem.id}/occurrence`)
    assert(occ.sharedMedia.some((m: any) => m.id === photoId), 'missing from bob’s Shared Media row')
    eq((await http(carol, 'GET', `/media/${photoId}/url`)).status, 404, 'carol (not a member)')
    eq((await http(null, 'GET', `/media/${photoId}/url`)).status, 404, 'anonymous')
  })
  await check('GROUP: a removed member loses access, including URLs issued before removal', async () => {
    const issued = await ok(bob, 'GET', `/media/${photoId}/url`)
    eq((await http(null, 'GET', issued.url)).status, 200, 'bob before removal')
    await ok(alice, 'DELETE', `/groups/${group.id}/members/${bob.id}`)
    eq((await http(bob, 'GET', `/media/${photoId}/url`)).status, 404, 'bob after removal')
    eq((await http(null, 'GET', issued.url)).status, 404, 'previously issued URL after removal')
  })

  await check('COMMUNITY: a public contribution is hidden while pending, public once approved, gone once revoked', async () => {
    const activityId = (await ok(alice, 'GET', `/programs/${starter.id}`)) && (await db.programScheduleItem.findFirstOrThrow({ where: { programVersionId: preview.latestVersionId } })).activityId
    const pub = await ok(alice, 'POST', '/media-publications', { mediaId: videoId, audience: 'PUBLIC', activityId, license: 'CC-BY-4.0', caption: 'Form demo' })
    eq(pub.status, 'PENDING', 'initial status')
    eq((await http(carol, 'GET', `/media/${videoId}/url`)).status, 404, 'carol while pending')
    eq((await http(null, 'GET', `/media-publications/${pub.id}`)).status, 404, 'publication while pending')
    eq((await http(carol, 'GET', '/moderation/publications')).status, 403, 'non-moderator queue')
    await ok(mod, 'POST', `/moderation/publications/${pub.id}`, { decision: 'APPROVE' })
    const issued: string[] = []
    for (const who of [carol, null]) {
      const url = await ok(who, 'GET', `/media/${videoId}/url`)
      const res = await http(null, 'GET', url.url)
      eq([res.status, res.headers.get('cache-control')], [200, 'private, no-store'], `playback for ${who?.handle ?? 'anonymous'}`)
      issued.push(url.url)
    }
    const hub = await ok(null, 'GET', `/activities/${activityId}/public-media`)
    assert(hub.some((m: any) => m.publicationId === pub.id), 'missing from the Activity’s community media')
    await ok(alice, 'DELETE', `/media-publications/${pub.id}`)
    eq((await http(null, 'GET', `/media/${videoId}/url`)).status, 404, 'anonymous after revoke')
    for (const url of issued) {
      eq((await http(null, 'GET', url)).status, 404, 'previously issued URL after revoke')
      eq((await http(null, 'GET', url, undefined, { range: 'bytes=0-99' })).status, 404, 'range request after revoke')
    }
  })

  console.log('\nFailures, retries, cleanup')
  await check('failure: undecodable content becomes FAILED once, without retry storms', async () => {
    const id = await upload(alice, fixtures.broken(), 'video/mp4')
    await waitFor('FAILED', async () => (await ok(alice, 'GET', `/media/${id}`)).state === 'FAILED')
    const ev = await db.outboxEvent.findFirstOrThrow({ where: { type: 'MediaUploaded', payload: { path: '$.mediaId', equals: id } } })
    eq([ev.status, ev.attempts], ['DONE', 1], 'event')
    eq((await http(alice, 'GET', `/media/${id}/url`)).status, 400, 'no URL for a failed asset')
  })
  await check('retry: a transient storage error is retried with backoff, then succeeds', async () => {
    await stop('worker')
    const id = await upload(alice, fixtures.png(), 'image/png')
    const asset = await db.mediaAsset.findUniqueOrThrow({ where: { id } })
    const file = join(STORAGE, asset.originalStorageKey)
    renameSync(file, `${file}.away`)
    start('worker')
    const ev = await waitFor('first failed attempt', async () => {
      const e = await db.outboxEvent.findFirst({ where: { type: 'MediaUploaded', payload: { path: '$.mediaId', equals: id } } })
      return e && e.attempts >= 1 && e.status === 'PENDING' && e.lastError ? e : null
    })
    assert(ev.availableAt.getTime() > Date.now(), 'no backoff scheduled')
    eq((await db.mediaAsset.findUniqueOrThrow({ where: { id } })).state, 'PROCESSING', 'asset state while retrying')
    renameSync(`${file}.away`, file)
    await db.outboxEvent.update({ where: { id: ev.id }, data: { availableAt: new Date() } }) // skip the wait
    await ready(alice, id)
    eq((await db.outboxEvent.findUniqueOrThrow({ where: { id: ev.id } })).status, 'DONE', 'event after retry')
  })
  await check('cleanup: abandoned uploads fail and deleted media past retention is purged from storage', async () => {
    const abandoned = await ok(alice, 'POST', '/media/uploads', { filename: 'never.png', mime: 'image/png', sizeBytes: 1000 })
    await db.mediaAsset.update({ where: { id: abandoned.mediaId }, data: { uploadExpiresAt: new Date(Date.now() - 2 * 3600_000) } })
    const doomed = await upload(alice, fixtures.png(), 'image/png')
    await ready(alice, doomed)
    const files = (await db.mediaVariant.findMany({ where: { mediaId: doomed } })).map((v) => join(STORAGE, v.storageKey))
    assert(files.length && files.every(existsSync), 'variants missing before delete')
    await ok(alice, 'DELETE', `/media/${doomed}`)
    eq((await http(alice, 'GET', `/media/${doomed}/url`)).status, 404, 'deleted media URL')
    await db.mediaAsset.update({ where: { id: doomed }, data: { deletedAt: new Date(Date.now() - 31 * 86_400_000) } })
    await stop('worker')
    start('worker', { WORKER_CLEANUP_EVERY_MS: '1000' })
    await waitFor('abandoned upload FAILED', async () => (await db.mediaAsset.findUniqueOrThrow({ where: { id: abandoned.mediaId } })).state === 'FAILED')
    await waitFor('purged files', async () => files.every((f) => !existsSync(f)) && (await db.mediaVariant.count({ where: { mediaId: doomed } })) === 0)
  })

  await check('no worker or API errors were logged unexpectedly', async () => {
    const unexpected = (logs.api + logs.worker).split('\n').filter((l) => /\b(error|unhandled)\b/i.test(l) && !/\[media\]|\[outbox\] MediaUploaded|ENOENT|outbox/i.test(l))
    assert(unexpected.length === 0, unexpected.slice(0, 3).join(' | '))
  })
}

main()
  .catch((err) => {
    console.error('\nE2E run aborted:', err)
    results.push({ name: 'run', ok: false, detail: String(err) })
  })
  .finally(async () => {
    await stop('worker').catch(() => {})
    await stop('api').catch(() => {})
    await db.$disconnect()
    const failed = results.filter((r) => !r.ok)
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
    if (failed.length) {
      writeFileSync(join(WORK, 'api.log'), logs.api)
      writeFileSync(join(WORK, 'worker.log'), logs.worker)
      console.log(`Logs: ${WORK}`)
      process.exitCode = 1
    }
  })
