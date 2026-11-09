/**
 * Hosted UAT journey with media, over real HTTPS against a deployed origin (web + /api proxy):
 * author uploads a cover and an illustration → worker makes them READY → creates and publishes an
 * Activity and a Program → participant sees the media, joins, records a result with a video →
 * worker transcodes it → playback with Range → shares it with the author's group → the author plays it,
 * a stranger cannot. Creates fresh @example.com accounts on the target; never deletes anything.
 *
 *   UAT_BASE_URL=https://program-guru.up.railway.app pnpm exec tsx scripts/uat/hosted-media-journey.ts
 *
 * Needs ffmpeg locally (test media is generated, not downloaded).
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = (process.env.UAT_BASE_URL ?? '').replace(/\/$/, '')
if (!/^https:\/\//.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) {
  throw new Error('Set UAT_BASE_URL to the deployed https origin (or a local http://localhost:port)')
}
const api = `${base}/api`
const run = Date.now().toString(36)
let step = 0
const ok = (what: string) => console.log(`  ✓ ${String(++step).padStart(2)} ${what}`)
function assert(cond: unknown, what: string): asserts cond {
  if (!cond) throw new Error(`✗ ${what}`)
}

type Res = { status: number; headers: Headers; json: any; bytes: Buffer }
class Client {
  cookie = ''
  constructor(readonly name: string) {}
  async call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res> {
    const url = path.startsWith('http') ? path : `${api}${path}`
    const isBinary = Buffer.isBuffer(body)
    const r = await fetch(url, {
      method,
      headers: { ...(this.cookie ? { cookie: this.cookie } : {}), ...(body !== undefined ? { 'content-type': isBinary ? 'application/octet-stream' : 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : isBinary ? (body as Buffer) : JSON.stringify(body),
    })
    const set = r.headers.get('set-cookie')
    if (set?.startsWith('session=')) this.cookie = set.split(';')[0]!
    const bytes = Buffer.from(await r.arrayBuffer())
    let json: any = null
    if ((r.headers.get('content-type') ?? '').includes('json')) json = JSON.parse(bytes.toString() || 'null')
    return { status: r.status, headers: r.headers, json, bytes }
  }
  async ok(method: string, path: string, body?: unknown) {
    const r = await this.call(method, path, body)
    if (r.status >= 300) throw new Error(`${this.name} ${method} ${path} → ${r.status} ${JSON.stringify(r.json)?.slice(0, 300)}`)
    return r.json?.data
  }
  async register() {
    const id = `${this.name}_${run}`
    await this.ok('POST', '/auth/register', { email: `uat-${this.name}-${run}@example.com`, password: `Uat-${id}-pw!`, handle: `uat_${id}`.slice(0, 30), displayName: `UAT ${this.name}` })
    return (await this.ok('GET', '/auth/me')) as { id: string; profile: { handle: string }; emailVerified: boolean }
  }
  /** Upload via the ticket (API route or presigned URL), complete, and wait for the worker. */
  async upload(file: string, mime: string, alt: string, timeoutMs = 180_000) {
    const bytes = readFileSync(file)
    const t = await this.ok('POST', '/media/uploads', { filename: file.split('/').pop(), mime, sizeBytes: bytes.length, alt })
    const put = await fetch(t.uploadUrl, { method: 'PUT', headers: t.headers, body: bytes })
    assert(put.ok, `${this.name} PUT upload → ${put.status}`)
    await this.ok('POST', `/media/uploads/${t.uploadId}/complete`)
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const m = await this.ok('GET', `/media/${t.mediaId}`)
      if (m.state === 'READY') return m
      assert(m.state !== 'FAILED', `${this.name} ${mime} processing FAILED`)
      assert(Date.now() < deadline, `${this.name} ${mime} still ${m.state} after ${timeoutMs / 1000}s (is the worker running?)`)
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
}

const work = mkdtempSync(join(tmpdir(), 'uat-media-'))
const ffmpeg = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'pipe' })
const coverFile = join(work, 'cover.jpg')
const illustrationFile = join(work, 'illustration.png')
const videoFile = join(work, 'result.webm')
ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=1280x720', '-frames:v', '1', '-q:v', '3', coverFile])
ffmpeg(['-f', 'lavfi', '-i', 'mandelbrot=s=800x600', '-frames:v', '1', illustrationFile])
// Like a browser MediaRecorder capture: WebM, VP8 video + Opus audio.
ffmpeg(['-f', 'lavfi', '-i', 'testsrc=s=640x360:r=25', '-f', 'lavfi', '-i', 'sine=f=440', '-t', '3', '-c:v', 'libvpx', '-b:v', '600k', '-c:a', 'libopus', '-shortest', videoFile])

async function main() {
  console.log(`Hosted media journey against ${base}`)
  const health = await new Client('probe').call('GET', '/health')
  assert(health.status === 200, `/api/health → ${health.status}`)
  ok(`API healthy (commit ${health.json?.commit ?? '?'})`)

  // ── Author: media first, then Activity and Program ──────────────────────────
  const author = new Client('author')
  const authorMe = await author.register()
  ok(`author registered (emailVerified=${authorMe.emailVerified})`)
  const [cover, illustration] = await Promise.all([author.upload(coverFile, 'image/jpeg', 'Program cover'), author.upload(illustrationFile, 'image/png', 'How to hold the position')])
  ok('cover photo and illustration uploaded and processed to READY by the worker')

  const categories = await author.ok('GET', '/catalog/categories')
  const fitness = categories.find((c: any) => c.slug === 'fitness') ?? categories[0]
  const activity = await author.ok('POST', '/activities', { title: `UAT Plank ${run}`, categoryId: fitness.id })
  await author.ok('POST', '/media-attachments', { mediaId: illustration.id, target: { kind: 'ACTIVITY_REVISION', id: activity.revisionId }, purpose: 'ILLUSTRATION' })
  const draft = await author.ok('GET', `/activities/${activity.id}`)
  const pubActivity = await author.call('POST', `/activities/${activity.id}/publish`, { visibility: 'PUBLIC', expectedRevision: draft.draftRevision ?? 0 })
  assert(pubActivity.status === 200, `publish Activity → ${pubActivity.status} ${JSON.stringify(pubActivity.json)}`)
  ok('Activity created with the illustration attached and published publicly')

  const types = await author.ok('GET', '/catalog/program-types')
  const type = types.find((t: any) => t.categoryId === fitness.id) ?? types[0]
  let ws = await author.ok('POST', '/programs', { programTypeId: type.id })
  ws = await author.ok('POST', `/programs/${ws.id}/draft/activities`, { activityIds: [activity.id], expectedRevision: ws.draftRevision })
  ws = await author.ok('PATCH', `/programs/${ws.id}/draft`, { title: `UAT Media Program ${run}`, durationDays: 7, frequency: { kind: 'DAILY' }, coverMediaId: cover.id, expectedRevision: ws.draftRevision })
  const published = await author.ok('POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision })
  assert(published.latestPublishedVersionId, 'Program has a published version')
  ok('Program created with the cover and the Activity, scheduled daily for 7 days, published publicly')

  // ── Participant: sees media, joins, records a video result ──────────────────
  const participant = new Client('participant')
  const partMe = await participant.register()
  const preview = await participant.ok('GET', `/programs/${ws.id}`)
  assert(preview.coverUrl, 'participant sees a cover URL')
  const coverFetch = await participant.call('GET', preview.coverUrl.replace(/^https?:\/\/[^/]+\/api/, ''))
  assert(coverFetch.status === 200 && (coverFetch.headers.get('content-type') ?? '').startsWith('image/'), `cover delivery → ${coverFetch.status}`)
  const seenActivity = await participant.ok('GET', `/activities/${activity.id}`)
  const thumb = seenActivity.media?.[0]?.thumbnailUrl
  assert(thumb, 'participant sees the Activity illustration')
  const thumbFetch = await participant.call('GET', thumb.replace(/^https?:\/\/[^/]+\/api/, ''))
  assert(thumbFetch.status === 200, `illustration delivery → ${thumbFetch.status}`)
  ok(`participant sees the Program cover (${coverFetch.bytes.length} B) and the Activity illustration (${thumbFetch.bytes.length} B)`)

  const today = new Date().toISOString().slice(0, 10)
  const enrollment = await participant.ok('POST', `/programs/${ws.id}/enrollments`, { programVersionId: published.latestPublishedVersionId, startLocalDate: today, timezone: 'UTC', idempotencyKey: `uat-join-${run}` })
  const items = await participant.ok('GET', `/calendar/items?start=${today}&end=${today}`)
  const item = items.find((i: any) => i.title === activity.title) ?? items[0]
  assert(item, 'today has the Program Activity on the participant calendar')
  ok(`participant joined (enrollment ${enrollment.id.slice(0, 8)}) and today's Activity is on their calendar`)

  const session = await participant.ok('POST', '/sessions', { calendarItemId: item.id, idempotencyKey: `uat-session-${run}` })
  const entry = await participant.ok('POST', `/sessions/${session.id}/results`, { values: [], notes: 'Held it for 45 seconds' })
  const video = await participant.upload(videoFile, 'video/webm;codecs=vp8,opus', 'My plank')
  await participant.ok('POST', '/media-attachments', { mediaId: video.id, target: { kind: 'RESULT_ENTRY', id: entry.id }, purpose: 'JOURNAL' })
  const finished = await participant.ok('POST', `/sessions/${session.id}/actions`, { action: 'FINISH', expectedRevision: session.revision })
  assert(finished.item?.status === 'DONE', 'occurrence marked DONE')
  ok('participant recorded a result, uploaded a WebM video (transcoded to READY), attached it, finished: DONE')

  const occurrence = await participant.ok('GET', `/calendar-items/${item.id}/occurrence`)
  assert(occurrence.myMedia.some((m: any) => m.id === video.id), 'video appears in My Media for the occurrence')
  const play = await participant.ok('GET', `/media/${video.id}/url`)
  const part = await participant.call('GET', play.url.replace(/^https?:\/\/[^/]+\/api/, ''), undefined, { range: 'bytes=0-1023' })
  assert(part.status === 206 && part.headers.get('content-type') === 'video/mp4', `video range → ${part.status} ${part.headers.get('content-type')}`)
  const poster = await participant.call('GET', play.posterUrl.replace(/^https?:\/\/[^/]+\/api/, ''))
  assert(poster.status === 200, `poster → ${poster.status}`)
  ok(`video plays as MP4 with Range (206, ${part.headers.get('content-range')}) and has a poster`)

  // ── Group: share with the author; a stranger cannot see it ──────────────────
  const group = await author.ok('POST', '/groups', { programVersionId: published.latestPublishedVersionId, mode: 'ASYNC', name: `UAT crew ${run}` })
  const inv = await author.ok('POST', `/groups/${group.id}/invitations`, { kind: 'USER', handle: partMe.profile.handle })
  const received = await participant.ok('GET', '/users/me/group-invitations')
  const mine = received.find((r: any) => r.id === inv.id)
  assert(mine?.preview.join.status === 'READY_TO_JOIN', `participant join state ${mine?.preview.join.status}`)
  await participant.ok('POST', `/users/me/group-invitations/${inv.id}/accept`)
  const linked = await participant.ok('GET', `/calendar-items/${item.id}/occurrence`)
  assert(linked.collaborators?.occurrenceKey, 'occurrence is linked to the group')
  await participant.ok('POST', '/media-publications', { mediaId: video.id, audience: 'GROUP', groupId: group.id, occurrenceKey: linked.collaborators.occurrenceKey })
  const groupMedia = await author.ok('GET', `/groups/${group.id}/media`)
  assert(groupMedia.some((m: any) => m.id === video.id), 'author sees the shared video in group media')
  const authorPlay = await author.ok('GET', `/media/${video.id}/url`)
  const authorPart = await author.call('GET', authorPlay.url.replace(/^https?:\/\/[^/]+\/api/, ''), undefined, { range: 'bytes=0-99' })
  assert(authorPart.status === 206, `author playback → ${authorPart.status}`)
  ok('participant accepted the group invitation and shared the video; the author (group owner) plays it')

  const stranger = new Client('stranger')
  await stranger.register()
  const denied = await stranger.call('GET', `/media/${video.id}/url`)
  assert(denied.status === 404, `stranger media URL → ${denied.status}`)
  const anonymous = await new Client('anon').call('GET', `/media/${video.id}/url`)
  assert(anonymous.status === 404, `anonymous media URL → ${anonymous.status}`)
  ok('a stranger and an anonymous visitor cannot get the private video (404)')

  console.log(`\nHosted media journey passed: ${step} steps. Program ${ws.id}, accounts uat-*-${run}@example.com`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
