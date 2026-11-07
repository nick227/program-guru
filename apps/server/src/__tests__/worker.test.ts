import { describe, it, expect, beforeEach } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { db } from '@project/db'
import { buildTestApp, asAuth, testUserId, testOtherUserId, seedUser } from './helpers'
import { makeMedia, seedCatalog } from './helpers/fixtures'
import { drain } from '../worker/outbox'
import { dailySummaries, extendHorizons, programStats, timedReminders } from '../worker/jobs'
import { CapturingProvider, setEmailProvider } from '../infrastructure/email'
import { storage } from '../infrastructure/storage'

const app = buildTestApp()
let mail: CapturingProvider
let cat: Awaited<ReturnType<typeof seedCatalog>>
beforeEach(async () => {
  mail = new CapturingProvider()
  setEmailProvider(mail)
  cat = await seedCatalog()
})
const req = (method: string, url: string, payload?: unknown, userId = testUserId) =>
  app.inject({ method: method as any, url, headers: asAuth(userId), ...(payload !== undefined ? { payload: payload as any } : {}) })
const carolId = '00000000-0000-4000-8000-0000000000c0'

describe('outbox delivery', () => {
  it('turns events into notifications exactly once, even when redelivered', async () => {
    await seedUser(carolId, 'carol', { visibility: 'PRIVATE' })
    await req('POST', `/follow-users/${carolId}`)
    expect(await drain()).toBe(1)
    const n = await db.notification.findMany({ where: { recipientId: carolId } })
    expect(n).toEqual([expect.objectContaining({ type: 'FOLLOW_REQUEST', title: 'New follow request', actorId: testUserId })])
    // Force a redelivery of the same event: the dedupe key holds.
    await db.outboxEvent.updateMany({ data: { status: 'PENDING', availableAt: new Date(0) } })
    await drain()
    expect(await db.notification.count({ where: { recipientId: carolId } })).toBe(1)
  })

  it('emails the verification link and scrubs the raw token from the event afterward', async () => {
    const reg = await app.inject({ method: 'POST', url: '/auth/register', payload: { email: 'dana@example.com', password: 'a long password', handle: 'dana', displayName: 'Dana' } })
    expect(reg.statusCode).toBe(201)
    await drain()
    expect(mail.sent).toHaveLength(1)
    expect(mail.sent[0]).toMatchObject({ to: 'dana@example.com', subject: 'Confirm your email' })
    expect(mail.sent[0]!.text).toMatch(/\/verify-email\?token=/)
    const ev = await db.outboxEvent.findFirstOrThrow({ where: { type: 'EmailVerificationRequested' } })
    expect(ev.status).toBe('DONE')
    expect((ev.payload as any).token).toBeUndefined()
  })

  it('backs off and retries a failing event instead of losing it', async () => {
    await db.outboxEvent.create({ data: { type: 'NoSuchEvent', payload: {} } })
    await drain()
    const ev = await db.outboxEvent.findFirstOrThrow({ where: { type: 'NoSuchEvent' } })
    expect(ev).toMatchObject({ status: 'PENDING', attempts: 1 })
    expect(ev.availableAt.getTime()).toBeGreaterThan(Date.now())
    expect(ev.lastError).toMatch(/No handler/)
  })
})

describe('media processing', () => {
  async function uploadAndProcess(bytes: Buffer, mime: string) {
    const t = (await req('POST', '/media/uploads', { filename: 'f', mime, sizeBytes: bytes.length })).json().data
    await app.inject({ method: 'PUT', url: t.uploadUrl.replace(/^https?:\/\/[^/]+/, ''), headers: { 'content-type': 'application/octet-stream' }, payload: bytes })
    await req('POST', `/media/uploads/${t.uploadId}/complete`)
    await drain()
    return db.mediaAsset.findUniqueOrThrow({ where: { id: t.mediaId }, include: { variants: true } })
  }

  it('makes web and thumbnail renditions of a photo', async () => {
    const m = await uploadAndProcess(makeMedia('png'), 'image/png')
    expect(m).toMatchObject({ state: 'READY', width: 96, height: 64 })
    expect(m.variants.map((v) => v.kind).sort()).toEqual(['THUMB', 'WEB'])
  })

  it('transcodes video to H.264 MP4 with poster and thumbnail, and strips location metadata', async () => {
    const m = await uploadAndProcess(makeMedia('mp4-with-gps'), 'video/mp4')
    expect(m.state).toBe('READY')
    expect(m.variants.map((v) => v.kind).sort()).toEqual(['POSTER', 'STREAM', 'THUMB'])
    expect(m.durationMs).toBeGreaterThan(1000)
    const stream = m.variants.find((v) => v.kind === 'STREAM')!
    const dir = mkdtempSync(join(tmpdir(), 'probe-'))
    const file = join(dir, 's.mp4')
    const chunks: Buffer[] = []
    for await (const c of await storage().read(stream.storageKey)) chunks.push(c as Buffer)
    writeFileSync(file, Buffer.concat(chunks))
    const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]).toString())
    expect(info.streams.find((s: any) => s.codec_type === 'video').codec_name).toBe('h264')
    expect(JSON.stringify(info.format.tags ?? {})).not.toMatch(/location|40\.6892/i)
  })

  it('marks undecodable content FAILED without retry storms', async () => {
    const m = await db.mediaAsset.create({ data: { ownerId: testUserId, type: 'VIDEO', originalStorageKey: `u/${testUserId}/bad/original`, mime: 'video/mp4', byteSize: 10, state: 'PROCESSING' } })
    const { Readable } = await import('stream')
    await storage().write(m.originalStorageKey, Readable.from([Buffer.from('not a video at all')]), 1000)
    await db.outboxEvent.create({ data: { type: 'MediaUploaded', payload: { mediaId: m.id } } })
    await drain()
    expect((await db.mediaAsset.findUniqueOrThrow({ where: { id: m.id } })).state).toBe('FAILED')
    expect((await db.outboxEvent.findFirstOrThrow({ where: { type: 'MediaUploaded' } })).status).toBe('DONE')
  })
})

describe('reminders', () => {
  it('sends one in-app reminder when a timed item comes due, and never for old items', async () => {
    const now = new Date('2026-11-10T13:05:00Z') // 07:05 in Chicago
    const add = (localDate: string, localTime: string) =>
      req('POST', '/calendar/items', { activityId: cat.squats.activity.id, localDate, localTime, idempotencyKey: `${localDate}-${localTime}` })
    await add('2026-11-10', '07:00')
    await add('2026-11-10', '05:00') // more than 30 minutes past
    expect(await timedReminders(now)).toBe(1)
    expect(await timedReminders(now)).toBe(0)
    const n = await db.notification.findMany({ where: { recipientId: testUserId, type: 'ACTIVITY_REMINDER' } })
    expect(n).toHaveLength(1)
    expect(n[0]!.title).toBe('Time for Squats')
  })

  it('daily summary: in-app by default, email only when opted in, once per day, never on empty days', async () => {
    const added = await req('POST', '/calendar/items', { activityId: cat.squats.activity.id, localDate: '2026-11-10', idempotencyKey: 'daily-summary-item' })
    expect(added.statusCode).toBe(201)
    await req('PATCH', '/users/me/preferences', { notifications: { dailyEmail: true, dailyReminderTime: '07:30' } })
    const before = new Date('2026-11-10T13:00:00Z') // 07:00 Chicago, before the chosen time
    expect(await dailySummaries(before)).toBe(0)
    const at = new Date('2026-11-10T13:31:00Z')
    expect(await dailySummaries(at)).toBe(2) // in-app + email for Alice; Bob has nothing scheduled
    expect(await dailySummaries(at)).toBe(0)
    expect(mail.sent).toHaveLength(1)
    expect(mail.sent[0]!.subject).toBe('1 activity today')
    expect(mail.sent[0]!.text).toContain('Squats')
    expect(mail.sent[0]!.headers?.['List-Unsubscribe']).toMatch(/unsubscribe\?token=/)
    expect(await db.notification.count({ where: { recipientId: testOtherUserId } })).toBe(0)
  })
})

describe('horizons and statistics', () => {
  it('extends long programs and personal recurrences beyond the first 12 weeks', async () => {
    let ws = (await req('POST', '/programs', { programTypeId: cat.workout.id })).json().data
    ws = (await req('POST', `/programs/${ws.id}/draft/activities`, { activityIds: [cat.squats.activity.id], expectedRevision: ws.draftRevision })).json().data
    ws = (await req('PATCH', `/programs/${ws.id}/draft`, { durationDays: 180, frequency: { kind: 'DAILY' }, expectedRevision: ws.draftRevision })).json().data
    const v = (await req('POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision })).json().data.latestPublishedVersionId
    const today = new Date().toISOString().slice(0, 10)
    await req('POST', `/programs/${ws.id}/enrollments`, { programVersionId: v, startLocalDate: today, timezone: 'UTC', idempotencyKey: 'long-program' }, testOtherUserId)
    const first = await db.calendarItem.count({ where: { ownerId: testOtherUserId } })
    expect(first).toBeLessThan(180)
    const later = new Date(Date.now() + 120 * 86_400_000)
    await extendHorizons(later)
    expect(await db.calendarItem.count({ where: { ownerId: testOtherUserId } })).toBe(180)
    await extendHorizons(later)
    expect(await db.calendarItem.count({ where: { ownerId: testOtherUserId } })).toBe(180) // idempotent
  })

  it('computes program stats and suppresses small samples', async () => {
    let ws = (await req('POST', '/programs', { programTypeId: cat.workout.id })).json().data
    ws = (await req('POST', `/programs/${ws.id}/draft/activities`, { activityIds: [cat.squats.activity.id], expectedRevision: ws.draftRevision })).json().data
    await req('POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision })
    await programStats()
    const stat = await db.programStat.findUniqueOrThrow({ where: { programId: ws.id } })
    expect(stat).toMatchObject({ enrollmentCount: 0, completionRate: null, retention30d: null })
    expect(Number(stat.rankScore)).toBe(0)
  })
})
