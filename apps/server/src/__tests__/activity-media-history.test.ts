// Activity media history (11-MEDIA.md §5): the viewer's own result attachments for one Activity,
// across every session, with the IDs needed to manage them. Authorization, paging, historical detach.
import { describe, it, expect, beforeEach } from 'vitest'
import { randomUUID } from 'crypto'
import { db } from '@project/db'
import { buildTestApp, asAuth, validateResponse, seedUser, testUserId, testOtherUserId } from './helpers'
import { seedCatalog } from './helpers/fixtures'

const app = buildTestApp()
const carolId = '00000000-0000-4000-8000-000000000009'
let cat: Awaited<ReturnType<typeof seedCatalog>>
beforeEach(async () => {
  cat = await seedCatalog()
  await seedUser(carolId, 'carol')
})

const req = (method: string, url: string, payload?: unknown, userId: string | null = testUserId) =>
  app.inject({ method: method as any, url, headers: userId ? asAuth(userId) : {}, ...(payload !== undefined ? { payload: payload as any } : {}) })

const readyPhoto = (ownerId: string) =>
  db.mediaAsset.create({ data: { ownerId, type: 'PHOTO', originalStorageKey: `users/${ownerId}/${randomUUID()}`, mime: 'image/jpeg', byteSize: 10n, state: 'READY' } })

/** A new attempt on the Activity with one result entry carrying `count` attached photos. */
async function attempt(userId: string, activityId: string, count: number) {
  const session = (await req('POST', '/sessions', { activityId, idempotencyKey: `attempt-${randomUUID()}` }, userId)).json().data
  const entry = (await req('POST', `/sessions/${session.id}/results`, { values: [{ metricDefinitionId: cat.reps.id, value: 10 }] }, userId)).json().data
  const attachments: { id: string; mediaId: string }[] = []
  for (let i = 0; i < count; i++) {
    const media = await readyPhoto(userId)
    const res = await req('POST', '/media-attachments', { mediaId: media.id, target: { kind: 'RESULT_ENTRY', id: entry.id }, purpose: 'JOURNAL' }, userId)
    expect(res.statusCode).toBe(201)
    attachments.push({ id: res.json().data.id, mediaId: media.id })
  }
  return { sessionId: session.id as string, entryId: entry.id as string, attachments }
}

async function allPages(url: string, userId = testUserId) {
  const seen: any[] = []
  let cursor: string | null = null
  let pages = 0
  do {
    const res = await req('GET', `${url}${url.includes('?') ? '&' : '?'}limit=2${cursor ? `&cursor=${cursor}` : ''}`, undefined, userId)
    expect(res.statusCode).toBe(200)
    await validateResponse('listActivityMyMedia', 200, res.json())
    seen.push(...res.json().data)
    cursor = res.json().meta.nextCursor
    pages++
  } while (cursor && pages < 10)
  return { items: seen, pages }
}

describe('listActivityMyMedia', () => {
  it('lists every own attachment across sessions with attachment, ResultEntry and session IDs, newest first', async () => {
    const activityId = cat.squats.activity.id
    const first = await attempt(testUserId, activityId, 2)
    const second = await attempt(testUserId, activityId, 2)
    const third = await attempt(testUserId, activityId, 1)

    const { items, pages } = await allPages(`/activities/${activityId}/my-media`)
    expect(pages).toBe(3) // 2 + 2 + 1: no gaps, no repeats
    const ids = items.map((i) => i.attachment.id)
    expect(new Set(ids).size).toBe(5)
    expect(ids.sort()).toEqual([...first.attachments, ...second.attachments, ...third.attachments].map((a) => a.id).sort())
    const byEntry = Object.fromEntries(items.map((i) => [i.attachment.id, i]))
    for (const run of [first, second, third]) {
      for (const a of run.attachments) {
        expect(byEntry[a.id]).toMatchObject({
          resultEntryId: run.entryId,
          sessionId: run.sessionId,
          calendarItemId: null,
          occurrenceDate: null,
          attachment: { mediaId: a.mediaId, target: { kind: 'RESULT_ENTRY', id: run.entryId }, purpose: 'JOURNAL', mediaDeleted: false },
        })
      }
    }
    // Newest attachment first.
    const created = await db.mediaAttachment.findMany({ where: { id: { in: ids } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })
    expect(items.map((i) => i.attachment.id)).toEqual(created.map((c) => c.id))
  })

  it('never includes another participant’s results, even on the same Activity or occurrence filter', async () => {
    const activityId = cat.squats.activity.id
    const alice = await attempt(testUserId, activityId, 1)
    const bob = await attempt(testOtherUserId, activityId, 2)

    const aliceView = (await req('GET', `/activities/${activityId}/my-media`)).json()
    expect(aliceView.data.map((i: any) => i.attachment.id)).toEqual(alice.attachments.map((a) => a.id))
    const bobView = (await req('GET', `/activities/${activityId}/my-media`, undefined, testOtherUserId)).json()
    expect(bobView.data.map((i: any) => i.attachment.id).sort()).toEqual(bob.attachments.map((a) => a.id).sort())
    expect(JSON.stringify(bobView)).not.toContain(alice.entryId)
    expect(JSON.stringify(bobView)).not.toContain(alice.attachments[0]!.mediaId)

    // Carol, signed in with no history on a readable Activity: an empty page, not someone else's.
    const carol = await req('GET', `/activities/${activityId}/my-media`, undefined, carolId)
    expect(carol.statusCode).toBe(200)
    expect(carol.json()).toEqual({ data: [], meta: { hasMore: false, nextCursor: null } })
    // Anonymous: 401.
    expect((await req('GET', `/activities/${activityId}/my-media`, undefined, null)).statusCode).toBe(401)
  })

  it('filters by occurrence and media type, scoped to the viewer’s own sessions', async () => {
    const activityId = cat.squats.activity.id
    const item = (await req('POST', '/calendar/items', { activityId, localDate: '2026-11-10', idempotencyKey: 'history-occurrence' })).json().data.item
    const session = (await req('POST', '/sessions', { calendarItemId: item.id, idempotencyKey: 'history-occurrence-session' })).json().data
    const entry = (await req('POST', `/sessions/${session.id}/results`, { values: [{ metricDefinitionId: cat.reps.id, value: 12 }] })).json().data
    const photo = await readyPhoto(testUserId)
    const linked = (await req('POST', '/media-attachments', { mediaId: photo.id, target: { kind: 'RESULT_ENTRY', id: entry.id }, purpose: 'JOURNAL' })).json().data
    await attempt(testUserId, activityId, 1) // an unscheduled attempt, outside the occurrence

    const scoped = (await req('GET', `/activities/${activityId}/my-media?calendarItemId=${item.id}`)).json().data
    expect(scoped).toHaveLength(1)
    expect(scoped[0]).toMatchObject({ attachment: { id: linked.id }, calendarItemId: item.id, occurrenceDate: '2026-11-10', sessionId: session.id })
    expect((await req('GET', `/activities/${activityId}/my-media?type=VIDEO`)).json().data).toEqual([])
    expect((await req('GET', `/activities/${activityId}/my-media?type=PHOTO`)).json().data).toHaveLength(2)
    // Bob naming Alice's occurrence sees nothing of hers.
    expect((await req('GET', `/activities/${activityId}/my-media?calendarItemId=${item.id}`, undefined, testOtherUserId)).json().data).toEqual([])
  })

  it('does not reveal a private Activity to someone without history; its owner gets an empty page', async () => {
    const draft = await req('POST', '/activities', { title: 'Private drill', categoryId: cat.fitness.id, focusIds: [cat.strength.id] }, testOtherUserId)
    expect(draft.statusCode).toBe(201)
    const privateId = draft.json().data.id
    expect((await req('GET', `/activities/${privateId}/my-media`)).statusCode).toBe(404)
    expect((await req('GET', `/activities/${randomUUID()}/my-media`)).statusCode).toBe(404)
    const owner = await req('GET', `/activities/${privateId}/my-media`, undefined, testOtherUserId)
    expect(owner.statusCode).toBe(200)
    expect(owner.json().data).toEqual([])
  })

  it('keeps own history listable after the Activity becomes unreadable (lapse, archive, moderation), and only for its owner', async () => {
    const activityId = cat.squats.activity.id
    const alice = await attempt(testUserId, activityId, 1)
    await db.activity.update({ where: { id: activityId }, data: { visibility: 'PRIVATE', moderatedAt: new Date() } })
    const res = await req('GET', `/activities/${activityId}/my-media`)
    expect(res.statusCode).toBe(200)
    expect(res.json().data.map((i: any) => i.attachment.id)).toEqual(alice.attachments.map((a) => a.id))
    // Without history the restriction applies.
    expect((await req('GET', `/activities/${activityId}/my-media`, undefined, carolId)).statusCode).toBe(404)
  })

  it('detaches historical media: gone from history and My Media row, asset kept; nobody else can detach it', async () => {
    const activityId = cat.squats.activity.id
    const old = await attempt(testUserId, activityId, 2)
    const recent = await attempt(testUserId, activityId, 1)
    const target = old.attachments[0]!

    expect((await req('DELETE', `/media-attachments/${target.id}`, undefined, testOtherUserId)).statusCode).toBe(404)
    expect((await req('DELETE', `/media-attachments/${target.id}`)).statusCode).toBe(200)

    const after = (await req('GET', `/activities/${activityId}/my-media`)).json().data.map((i: any) => i.attachment.id)
    expect(after).not.toContain(target.id)
    expect(after.sort()).toEqual([old.attachments[1]!.id, recent.attachments[0]!.id].sort())
    // Detaching never deletes the asset: it stays in the library and can be attached again.
    const mine = (await req('GET', '/media/mine')).json().data.map((m: any) => m.id)
    expect(mine).toContain(target.mediaId)
    const again = await req('POST', '/media-attachments', { mediaId: target.mediaId, target: { kind: 'RESULT_ENTRY', id: old.entryId }, purpose: 'JOURNAL' })
    expect(again.statusCode).toBe(201)
    expect((await req('GET', `/activities/${activityId}/my-media`)).json().data.map((i: any) => i.attachment.id)).toContain(again.json().data.id)
  })

  it('still lists links whose asset was deleted, so they can be detached', async () => {
    const activityId = cat.squats.activity.id
    const run = await attempt(testUserId, activityId, 1)
    await db.mediaAsset.update({ where: { id: run.attachments[0]!.mediaId }, data: { deletedAt: new Date() } })
    const [item] = (await req('GET', `/activities/${activityId}/my-media`)).json().data
    expect(item.attachment).toMatchObject({ id: run.attachments[0]!.id, mediaDeleted: true, media: { thumbnailUrl: null, canSelect: false } })
    expect((await req('DELETE', `/media-attachments/${item.attachment.id}`)).statusCode).toBe(200)
    expect((await req('GET', `/activities/${activityId}/my-media`)).json().data).toEqual([])
  })
})

// Attempts are a separate stable read projection: removing a link must never remove its target.
describe('listActivityMyAttempts', () => {
  it('keeps sessions without results and entries without media; a read creates nothing', async () => {
    const activityId = cat.squats.activity.id
    const blank = (await req('POST', '/sessions', { activityId, idempotencyKey: randomUUID() })).json().data
    const saved = await attempt(testUserId, activityId, 1)
    await req('DELETE', `/media-attachments/${saved.attachments[0]!.id}`)
    const before = { sessions: await db.activitySession.count(), entries: await db.resultEntry.count() }
    const res = await req('GET', `/activities/${activityId}/my-attempts`)
    expect(res.statusCode).toBe(200)
    await validateResponse('listActivityMyAttempts', 200, res.json())
    expect(res.json().data).toEqual(expect.arrayContaining([
      expect.objectContaining({ sessionId: blank.id, entries: [], calendarItemId: null, occurrenceDate: null }),
      expect.objectContaining({ sessionId: saved.sessionId, entries: [expect.objectContaining({ resultEntryId: saved.entryId, instructionId: null })] }),
    ]))
    expect({ sessions: await db.activitySession.count(), entries: await db.resultEntry.count() }).toEqual(before)
  })

  it('returns only own target metadata, never private values, notes or instructional content', async () => {
    const activityId = cat.squats.activity.id
    const own = await attempt(testUserId, activityId, 0)
    const other = await attempt(testOtherUserId, activityId, 1)
    await db.resultEntry.update({ where: { id: own.entryId }, data: { notes: 'PRIVATE NOTE MUST NOT LEAK' } })
    const instruction = await db.instruction.findFirstOrThrow({ where: { activityRevisionId: cat.squats.revision.id } })
    const entry = (await req('POST', `/sessions/${own.sessionId}/results`, { instructionId: instruction.id, values: [] })).json().data
    const res = await req('GET', `/activities/${activityId}/my-attempts`)
    expect(res.json().data).toHaveLength(1)
    expect(res.json().data[0].entries).toHaveLength(2)
    expect(res.json().data[0].entries).toContainEqual({ resultEntryId: entry.id, instructionId: instruction.id, recordedAt: entry.recordedAt })
    expect(res.body).not.toContain('PRIVATE NOTE')
    expect(res.body).not.toContain('values')
    expect(res.body).not.toContain(other.sessionId)
    expect((await req('GET', `/activities/${activityId}/my-attempts`, undefined, carolId)).json().data).toEqual([])
    expect((await req('GET', `/activities/${activityId}/my-attempts`, undefined, null)).statusCode).toBe(401)
  })

  it('pages stable sessions with timestamp ties, unchanged when the last attachment is removed', async () => {
    const activityId = cat.squats.activity.id
    const sessions = []
    for (let i = 0; i < 5; i++) sessions.push(await attempt(testUserId, activityId, 1))
    await db.activitySession.updateMany({ where: { userId: testUserId }, data: { createdAt: new Date('2026-11-01T12:00:00Z') } })
    const expected = sessions.map(s => s.sessionId).sort().reverse()
    const first = (await req('GET', `/activities/${activityId}/my-attempts?limit=2`)).json()
    expect(first.data.map((s: any) => s.sessionId)).toEqual(expected.slice(0, 2))
    for (const s of sessions) await req('DELETE', `/media-attachments/${s.attachments[0]!.id}`)
    // A new attempt before the cursor must not shift or duplicate the older pages.
    await attempt(testUserId, activityId, 0)
    let cursor = first.meta.nextCursor
    const all = [...first.data]
    while (cursor) {
      const response = await req('GET', `/activities/${activityId}/my-attempts?limit=2&cursor=${encodeURIComponent(cursor)}`)
      expect(response.statusCode).toBe(200)
      await validateResponse('listActivityMyAttempts', 200, response.json())
      all.push(...response.json().data)
      cursor = response.json().meta.nextCursor
    }
    expect(all.map(s => s.sessionId)).toEqual(expected)
    expect(new Set(all.map(s => s.sessionId)).size).toBe(5)
    expect((await req('GET', `/activities/${activityId}/my-attempts?limit=0`)).statusCode).toBe(400)
    expect((await req('GET', `/activities/${activityId}/my-attempts?cursor=bad-cursor`)).statusCode).toBe(400)
  })

  it('filters occurrence, preserves date/status/revision, and does not expose another occurrence owner', async () => {
    const activityId = cat.squats.activity.id
    const item = (await req('POST', '/calendar/items', { activityId, localDate: '2026-11-10', idempotencyKey: randomUUID() })).json().data.item
    const session = (await req('POST', '/sessions', { calendarItemId: item.id, idempotencyKey: randomUUID() })).json().data
    await req('POST', `/sessions/${session.id}/actions`, { action: 'FINISH', expectedRevision: 0 })
    await attempt(testUserId, activityId, 0)
    const res = await req('GET', `/activities/${activityId}/my-attempts?calendarItemId=${item.id}`)
    expect(res.json().data).toHaveLength(1)
    expect(res.json().data[0]).toMatchObject({ sessionId: session.id, status: 'FINISHED', activityRevisionId: session.activityRevisionId, calendarItemId: item.id, occurrenceDate: '2026-11-10', entries: [] })
    expect(res.json().data[0].endedAt).toBeTruthy()
    expect((await req('GET', `/activities/${activityId}/my-attempts?calendarItemId=${item.id}`, undefined, testOtherUserId)).json().data).toEqual([])
    expect((await req('GET', `/activities/${cat.legRaises.activity.id}/my-attempts`)).json().data).toEqual([])
  })

  it('does not disclose unreadable activities without history, but preserves own history after archive/moderation', async () => {
    const draft = (await req('POST', '/activities', { title: 'Private', categoryId: cat.fitness.id }, testOtherUserId)).json().data
    expect((await req('GET', `/activities/${draft.id}/my-attempts`)).statusCode).toBe(404)
    expect((await req('GET', `/activities/${randomUUID()}/my-attempts`)).statusCode).toBe(404)
    expect((await req('GET', `/activities/${draft.id}/my-attempts`, undefined, testOtherUserId)).json().data).toEqual([])
    const old = await attempt(testUserId, cat.squats.activity.id, 0)
    await db.activity.update({ where: { id: cat.squats.activity.id }, data: { status: 'ARCHIVED', visibility: 'PRIVATE', moderatedAt: new Date() } })
    const res = await req('GET', `/activities/${cat.squats.activity.id}/my-attempts`)
    expect(res.statusCode).toBe(200)
    expect(res.json().data[0].entries[0].resultEntryId).toBe(old.entryId)
    expect((await req('GET', `/activities/${cat.squats.activity.id}/my-attempts`, undefined, carolId)).statusCode).toBe(404)
  })

  it('reattaches to the original ResultEntry after Program access expires without a new session or result', async () => {
    const act = (await req('POST', `/activities/${cat.squats.activity.id}/copy`, {})).json().data
    await req('POST', `/activities/${act.id}/publish`, { visibility: 'PRIVATE', expectedRevision: act.draftRevision })
    let ws = (await req('POST', '/programs', { programTypeId: cat.workout.id })).json().data
    ws = (await req('POST', `/programs/${ws.id}/draft/activities`, { activityIds: [act.id], expectedRevision: ws.draftRevision })).json().data
    ws = (await req('POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'APPROVAL', expectedRevision: ws.draftRevision })).json().data
    const approval = (await req('POST', `/programs/${ws.id}/access-requests`, undefined, testOtherUserId)).json().data
    await req('POST', `/access-requests/${approval.id}/approve`)
    const joined = await req('POST', `/programs/${ws.id}/enrollments`, { programVersionId: ws.latestPublishedVersionId, startLocalDate: '2026-11-10', timezone: 'UTC', idempotencyKey: randomUUID() }, testOtherUserId)
    expect(joined.statusCode).toBe(201)
    const item = (await req('GET', '/calendar/items?start=2026-11-10&end=2026-11-16', undefined, testOtherUserId)).json().data[0]
    const session = (await req('POST', '/sessions', { calendarItemId: item.id, idempotencyKey: randomUUID() }, testOtherUserId)).json().data
    const entry = (await req('POST', `/sessions/${session.id}/results`, { values: [{ metricDefinitionId: cat.reps.id, value: 12 }], notes: 'Keep me' }, testOtherUserId)).json().data
    const media = await readyPhoto(testOtherUserId)
    const payload = { mediaId: media.id, target: { kind: 'RESULT_ENTRY', id: entry.id }, purpose: 'JOURNAL' }
    const attachment = (await req('POST', '/media-attachments', payload, testOtherUserId)).json().data
    await db.programAccessGrant.updateMany({ where: { userId: testOtherUserId, programId: ws.id }, data: { expiresAt: new Date('2000-01-01') } })
    expect((await req('GET', `/activities/${act.id}`, undefined, testOtherUserId)).statusCode).toBe(404)
    expect((await req('GET', `/calendar-items/${item.id}/occurrence`, undefined, testOtherUserId)).json().data.item.locked).toBe(true)
    expect((await req('DELETE', `/media-attachments/${attachment.id}`, undefined, testOtherUserId)).statusCode).toBe(200)
    const history = await req('GET', `/activities/${act.id}/my-attempts`, undefined, testOtherUserId)
    expect(history.statusCode).toBe(200)
    expect(history.json().data[0].entries[0].resultEntryId).toBe(entry.id)
    expect((await req('POST', '/media-attachments', { ...payload, mediaId: cat.illustration.id })).statusCode).toBe(404)
    expect((await req('POST', '/media-attachments', payload, testOtherUserId)).statusCode).toBe(201)
    expect(await db.activitySession.count({ where: { userId: testOtherUserId } })).toBe(1)
    expect(await db.resultEntry.count({ where: { sessionId: session.id } })).toBe(1)
    const after = (await req('GET', `/sessions/${session.id}`, undefined, testOtherUserId)).json().data
    expect(after.session).toEqual(session)
    expect(after.entries[0].values).toEqual(entry.values)
    expect(after.entries[0].notes).toBe('Keep me')
  })
})
