// Go-live performance hardening: regression + query-budget coverage for the five P0 paths.
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@project/db'
import { buildTestApp, asAuth, testUserId, testOtherUserId, seedUser } from './helpers'
import { withQueryCount } from './helpers/queryCount'
import { makeMedia, seedCatalog } from './helpers/fixtures'
import { calendarVisual, loadCalendarRevisions, loadRevisions, summarizeRevision } from '../domains/activities/mapper'
import { listMine } from '../domains/media/media.service'
import { dailySummaries, extendHorizons, programStats } from '../worker/jobs'
import { addDays, todayIn, toDbDate } from '../lib/time'

const app = buildTestApp()
let cat: Awaited<ReturnType<typeof seedCatalog>>
beforeEach(async () => {
  cat = await seedCatalog()
})
const req = (method: string, url: string, payload?: unknown, userId = testUserId) =>
  app.inject({ method: method as any, url, headers: asAuth(userId), ...(payload !== undefined ? { payload: payload as any } : {}) })

/** Pre-optimization programStats algorithm (per-program fan-out) for result parity checks. */
async function programStatsLegacy(now = new Date()) {
  const MIN_SAMPLE = 5
  const programs = await db.program.findMany({ where: { status: 'PUBLISHED' }, select: { id: true } })
  const thirtyAgo = new Date(now.getTime() - 30 * 86_400_000)
  const out = new Map<string, { enrollmentCount: number; completionRate: number | null; retention30d: number | null; rankScore: number }>()
  for (const { id } of programs) {
    const enrollmentCount = await db.programEnrollment.count({ where: { programId: id } })
    let due = 0
    let done = 0
    const zones = await db.programEnrollment.findMany({ where: { programId: id }, distinct: ['timezone'], select: { timezone: true } })
    for (const { timezone } of zones) {
      const [counts] = await db.$queryRaw<{ due: bigint; done: bigint | null }[]>`
        SELECT COUNT(*) AS due, SUM(ci.status = 'DONE') AS done
        FROM CalendarItem ci JOIN ProgramEnrollment e ON e.id = ci.enrollmentId
        WHERE e.programId = ${id} AND e.timezone = ${timezone} AND ci.status NOT IN ('CANCELLED', 'NOT_PARTICIPATING')
          AND ci.localDate < ${toDbDate(todayIn(timezone, now))}
          AND (e.participationStartDate IS NULL OR ci.localDate >= e.participationStartDate)`
      due += Number(counts?.due ?? 0)
      done += Number(counts?.done ?? 0)
    }
    const mature = await db.programEnrollment.findMany({ where: { programId: id, createdAt: { lte: thirtyAgo } }, select: { id: true } })
    const retained = mature.length
      ? await db.programEnrollment.count({ where: { id: { in: mature.map((m) => m.id) }, calendarItems: { some: { status: 'DONE', updatedAt: { gte: thirtyAgo } } } } })
      : 0
    const completionRate = due >= MIN_SAMPLE ? done / due : null
    const retention30d = mature.length >= MIN_SAMPLE ? retained / mature.length : null
    const rankScore = enrollmentCount >= MIN_SAMPLE ? (completionRate ?? 0) * 50 + (retention30d ?? 0) * 40 + Math.log10(1 + enrollmentCount) * 10 : 0
    out.set(id, { enrollmentCount, completionRate, retention30d, rankScore })
  }
  return out
}

describe('P0.1 slim calendar revisions', () => {
  it('calendarVisual matches summarizeRevision thumbnail/privacy for the same revision', async () => {
    const revId = cat.squats.revision.id
    const [full, slim] = await Promise.all([loadRevisions([revId]), loadCalendarRevisions([revId])])
    const a = summarizeRevision(full.get(revId)!)
    const b = calendarVisual(slim.get(revId)!)
    expect(b.thumbnailUrl).toBe(a.thumbnailUrl)
    expect(b.hasPrivateAttachment).toBe(false)
  })

  it('GET /calendar stays under a fixed query budget as item count grows', async () => {
    for (let i = 0; i < 12; i++) {
      expect((await req('POST', '/calendar/items', { activityId: cat.squats.activity.id, localDate: `2026-11-${String(10 + (i % 7)).padStart(2, '0')}`, idempotencyKey: `cal-budget-${i}` })).statusCode).toBe(201)
    }
    const { queries: q12 } = await withQueryCount(() => req('GET', '/calendar/items?start=2026-11-10&end=2026-11-16'))
    for (let i = 12; i < 24; i++) {
      expect((await req('POST', '/calendar/items', { activityId: cat.legRaises.activity.id, localDate: `2026-11-${String(10 + (i % 7)).padStart(2, '0')}`, localTime: `0${i % 5}:00`, idempotencyKey: `cal-budget-${i}` })).statusCode).toBe(201)
    }
    const { result, queries: q24 } = await withQueryCount(() => req('GET', '/calendar/items?start=2026-11-10&end=2026-11-16'))
    expect(result.statusCode).toBe(200)
    expect(result.json().data.length).toBeGreaterThanOrEqual(12)
    // Projection helpers are O(1) queries in item count (items + revisions + grants/unread/members).
    expect(q24).toBeLessThanOrEqual(q12 + 3)
    expect(q24).toBeLessThan(25)
  })
})

describe('P0.2 aggregated programStats', () => {
  async function publishMany(n: number) {
    const ids: string[] = []
    for (let i = 0; i < n; i++) {
      let ws = (await req('POST', '/programs', { programTypeId: cat.workout.id })).json().data
      ws = (await req('POST', `/programs/${ws.id}/draft/activities`, { activityIds: [cat.squats.activity.id], expectedRevision: ws.draftRevision })).json().data
      await req('POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision })
      ids.push(ws.id)
    }
    return ids
  }

  it('matches the legacy per-program algorithm and stays O(timezones) not O(programs)', async () => {
    const ids = await publishMany(8)
    const today = todayIn('America/Chicago')
    const v = await db.programVersion.findFirstOrThrow({ where: { programId: ids[0]!, publishedAt: { not: null } } })
    await req('POST', `/programs/${ids[0]}/enrollments`, { programVersionId: v.id, startLocalDate: addDays(today, -10), timezone: 'America/Chicago', idempotencyKey: 'stats-enroll' }, testOtherUserId)
    const now = new Date()
    const { result: expected, queries: legacyQueries } = await withQueryCount(() => programStatsLegacy(now))
    const { queries } = await withQueryCount(() => programStats(now))
    for (const id of ids) {
      const row = await db.programStat.findUniqueOrThrow({ where: { programId: id } })
      const exp = expected.get(id)!
      expect(row.enrollmentCount).toBe(exp.enrollmentCount)
      expect(row.completionRate == null ? null : Number(row.completionRate)).toEqual(exp.completionRate)
      expect(row.retention30d == null ? null : Number(row.retention30d)).toEqual(exp.retention30d)
      expect(Number(row.rankScore)).toBeCloseTo(exp.rankScore, 4)
    }
    // Legacy is ~5+ queries per program; aggregated must stay well below that for 8 programs.
    expect(queries).toBeLessThan(legacyQueries)
    expect(queries).toBeLessThan(25)
    expect(queries).toBeLessThan(ids.length * 3)
  })
})

describe('P0.3 bounded dailySummaries', () => {
  it('skips idle users, sends once, and stays bounded with many reminder-enabled accounts', async () => {
    const idle: string[] = []
    for (let i = 0; i < 30; i++) {
      const id = `00000000-0000-4000-8000-000000000d${String(i).padStart(2, '0')}`
      await seedUser(id, `idle${i}`)
      await db.userPreference.update({ where: { userId: id }, data: { dailyReminderTime: '07:00', inAppRemindersEnabled: true, dailyEmailEnabled: false } })
      idle.push(id)
    }
    await req('POST', '/calendar/items', { activityId: cat.squats.activity.id, localDate: '2026-11-10', idempotencyKey: 'daily-bound' })
    await req('PATCH', '/users/me/preferences', { notifications: { dailyEmail: true, dailyReminderTime: '07:30' } })
    const at = new Date('2026-11-10T13:31:00Z')
    const { result: first, queries } = await withQueryCount(() => dailySummaries(at))
    expect(first).toBe(2)
    expect(await dailySummaries(at)).toBe(0)
    // Must not scan/load all 30 idle users' calendars (old path: 1 prefs + N item queries).
    expect(queries).toBeLessThan(40)
    expect(await db.notification.count({ where: { type: 'DAILY_SUMMARY', recipientId: { in: idle } } })).toBe(0)
  })

  it('drains a backlog larger than the 200-user batch without misses or duplicates', async () => {
    const BACKLOG = 250
    const ids: string[] = []
    for (let i = 0; i < BACKLOG; i++) {
      const id = `00000000-0000-4000-8000-00000000a${String(i).padStart(3, '0')}`
      await seedUser(id, `back${i}`)
      await db.userPreference.update({
        where: { userId: id },
        data: { timezone: 'America/Chicago', dailyReminderTime: '07:00', inAppRemindersEnabled: true, dailyEmailEnabled: false },
      })
      await db.calendarItem.create({
        data: {
          ownerId: id,
          activityId: cat.squats.activity.id,
          activityRevisionId: cat.squats.revision.id,
          idempotencyKey: `backlog-${id}`,
          localDate: toDbDate('2026-11-10'),
          status: 'PLANNED',
        },
      })
      ids.push(id)
    }
    const at = new Date('2026-11-10T13:31:00Z')
    expect(await dailySummaries(at)).toBe(BACKLOG)
    expect(await dailySummaries(at)).toBe(0)
    const notices = await db.notification.findMany({ where: { type: 'DAILY_SUMMARY', recipientId: { in: ids } }, select: { recipientId: true } })
    expect(notices).toHaveLength(BACKLOG)
    expect(new Set(notices.map((n) => n.recipientId)).size).toBe(BACKLOG)
    expect(await db.reminderDispatch.count({ where: { userId: { in: ids }, channel: 'IN_APP' } })).toBe(BACKLOG)
  })
})

describe('P0.4 DB-filtered extendHorizons', () => {
  it('is idempotent and does not reload already-current enrollments', async () => {
    let ws = (await req('POST', '/programs', { programTypeId: cat.workout.id })).json().data
    ws = (await req('POST', `/programs/${ws.id}/draft/activities`, { activityIds: [cat.squats.activity.id], expectedRevision: ws.draftRevision })).json().data
    ws = (await req('PATCH', `/programs/${ws.id}/draft`, { durationDays: 180, frequency: { kind: 'DAILY' }, expectedRevision: ws.draftRevision })).json().data
    const published = await req('POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision })
    expect(published.statusCode).toBe(200)
    const v = published.json().data.latestPublishedVersionId
    const today = new Date().toISOString().slice(0, 10)
    await req('POST', `/programs/${ws.id}/enrollments`, { programVersionId: v, startLocalDate: today, timezone: 'UTC', idempotencyKey: 'horizon-filter' }, testOtherUserId)
    const later = new Date(Date.now() + 120 * 86_400_000)
    expect(await extendHorizons(later)).toBeGreaterThan(0)
    const afterFirst = await db.calendarItem.count({ where: { ownerId: testOtherUserId } })
    expect(afterFirst).toBe(180)
    const { result: second, queries } = await withQueryCount(() => extendHorizons(later))
    expect(second).toBe(0)
    expect(await db.calendarItem.count({ where: { ownerId: testOtherUserId } })).toBe(afterFirst)
    // Fully generated finite enrollments fall outside the WHERE pad — no materialize work.
    expect(queries).toBeLessThan(8)
  })
})

describe('P0.5 batched media attachment counts', () => {
  it('listMine attachmentCount matches per-row counts with O(1) queries in page size', async () => {
    const mediaIds: string[] = []
    for (let i = 0; i < 10; i++) {
      const bytes = makeMedia('png')
      const t = (await req('POST', '/media/uploads', { filename: `p${i}.png`, mime: 'image/png', sizeBytes: bytes.length })).json().data
      await app.inject({ method: 'PUT', url: t.uploadUrl.replace(/^https?:\/\/[^/]+/, ''), headers: { 'content-type': 'application/octet-stream' }, payload: bytes })
      await req('POST', `/media/uploads/${t.uploadId}/complete`)
      mediaIds.push(t.mediaId)
      if (i % 2 === 0) {
        await db.mediaAttachment.create({
          data: { mediaId: t.mediaId, activityRevisionId: cat.squats.revision.id, purpose: 'ILLUSTRATION', position: i },
        })
      }
    }
    await db.mediaAsset.updateMany({ where: { id: { in: mediaIds } }, data: { state: 'READY' } })
    const { result, queries } = await withQueryCount(() => listMine(testUserId, { limit: 20 }))
    expect(result.data).toHaveLength(10)
    for (const row of result.data) {
      const expected = await db.mediaAttachment.count({ where: { mediaId: row.id } })
      expect(row.attachmentCount).toBe(expected)
    }
    // findMany + one groupBy (+ paging) — not 1+N counts.
    expect(queries).toBeLessThan(6)
  })
})
