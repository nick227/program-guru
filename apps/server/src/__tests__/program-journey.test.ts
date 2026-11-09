// The POC journey end to end (docs/poc-program-journey.md): a creator publishes a public Program,
// ten people discover and start it independently, some of them follow each other and form a group
// through every invitation path, share completions, react, share media and comment, and then the
// creator publishes a new version. Participants see "Update available"; accepting keeps past
// results and personal adjustments, declining keeps the pinned version.
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@project/db'
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildTestApp, asAuth, seedUser, validateResponse, testUserId as alice } from './helpers'
import { seedCatalog } from './helpers/fixtures'
import { drain } from '../worker/outbox'
import { programStats } from '../worker/jobs'
import { participationSummaries, participationSummary } from '../domains/programs/participation.service'
import { addDays, todayIn } from '../lib/time'

const app = buildTestApp()
const TZ = 'America/Chicago'
const id = (n: number) => `00000000-0000-4000-8000-0000000010${String(n).padStart(2, '0')}`
// Ten participants. bob (from buildTestApp) is the first; the others are seeded here.
const bob = '00000000-0000-4000-8000-000000000002'
const names = ['carol', 'dave', 'erin', 'frank', 'grace', 'heidi', 'ivan', 'judy', 'ken'] as const
const U = Object.fromEntries(names.map((h, i) => [h, id(i + 1)])) as Record<(typeof names)[number], string>
const participants = [bob, ...names.map((h) => U[h])]
let cat: Awaited<ReturnType<typeof seedCatalog>>
let n = 0
const key = () => `journey-${++n}-${Date.now()}`

beforeEach(async () => {
  cat = await seedCatalog()
  for (const h of names) await seedUser(U[h], h, { visibility: h === 'frank' ? 'PRIVATE' : 'PUBLIC' })
})

async function call(userId: string | null, method: string, url: string, payload?: unknown) {
  const res = await app.inject({ method: method as any, url, headers: userId ? asAuth(userId) : {}, ...(payload !== undefined ? { payload: payload as any } : {}) })
  return { status: res.statusCode, body: res.body ? res.json() : null }
}
async function ok(userId: string | null, method: string, url: string, payload?: unknown) {
  const res = await call(userId, method, url, payload)
  if (res.status >= 300) throw new Error(`${method} ${url} → ${res.status} ${JSON.stringify(res.body)}`)
  return res.body?.data
}
const tokenOf = (inv: { joinUrl: string }) => inv.joinUrl.split('/join/')[1]!
let journeyProgramId = ''
/** The participant's live items for the journey Program (a second Program is used for sampling). */
const liveItems = (userId: string) =>
  db.calendarItem.findMany({
    where: { ownerId: userId, status: { not: 'CANCELLED' }, enrollment: { programId: journeyProgramId } },
    orderBy: [{ localDate: 'asc' }, { activityId: 'asc' }, { id: 'asc' }],
  })
async function finish(userId: string, itemId: string, reps: number, notes?: string) {
  const s = await ok(userId, 'POST', '/sessions', { calendarItemId: itemId, idempotencyKey: key() })
  await ok(userId, 'POST', `/sessions/${s.id}/results`, { values: [{ metricDefinitionId: cat.reps.id, value: reps }], ...(notes ? { notes } : {}) })
  await ok(userId, 'POST', `/sessions/${s.id}/actions`, { action: 'FINISH', expectedRevision: s.revision })
  return s.id as string
}
const dayItem = (userId: string, day: number, activityId: string) =>
  db.calendarItem.findFirstOrThrow({ where: { ownerId: userId, programDayIndex: day, activityId, status: { not: 'CANCELLED' }, enrollment: { programId: journeyProgramId } } })

describe('POC journey: publish → discover → join → group → share → update', () => {
  it('ten people follow one public Program on their own calendars, together, through an update', async () => {
    const today = todayIn(TZ)

    // ── 1. The creator publishes a PUBLIC Program ────────────────────────────────────────────
    let ws = await ok(alice, 'POST', '/programs', { programTypeId: cat.workout.id })
    ws = await ok(alice, 'POST', `/programs/${ws.id}/draft/activities`, { activityIds: [cat.squats.activity.id, cat.legRaises.activity.id], expectedRevision: ws.draftRevision })
    ws = await ok(alice, 'PATCH', `/programs/${ws.id}/draft`, { title: '30 Day Core', durationDays: 30, frequency: { kind: 'DAILY' }, expectedRevision: ws.draftRevision })
    const published = await ok(alice, 'POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision })
    const programId = ws.id as string
    journeyProgramId = programId
    const v1 = published.latestPublishedVersionId as string
    expect(published.status).toBe('PUBLISHED')
    const templateBefore = await db.programScheduleItem.findMany({ where: { programVersionId: v1 }, orderBy: { id: 'asc' } })
    expect(templateBefore).toHaveLength(60)

    // ── 2. Others discover it and start it independently ─────────────────────────────────────
    const found = await call(null, 'GET', '/discover?kind=PROGRAM&q=Core')
    await validateResponse('discover', 200, found.body)
    expect(found.body.data.map((d: any) => d.program.id)).toContain(programId)
    const preview = await ok(bob, 'GET', `/programs/${programId}`)
    expect(preview).toMatchObject({ latestVersionId: v1, canJoin: true, myEnrollmentId: null })

    const enrollment: Record<string, string> = {}
    for (const [i, userId] of participants.entries()) {
      // Personal start dates: most start today, ken starts in two days.
      const start = userId === U.ken ? addDays(today, 2) : today
      const res = await call(userId, 'POST', `/programs/${programId}/enrollments`, { programVersionId: v1, startLocalDate: start, timezone: TZ, idempotencyKey: key() })
      expect(res.status, `join #${i}`).toBe(201)
      expect(res.body.data).toMatchObject({ status: 'ACTIVE', programVersionId: v1, calendarItemCount: 60 })
      enrollment[userId] = res.body.data.id
    }
    // Independent calendars: no shared item ids, and the template is untouched.
    const all = await db.calendarItem.findMany({ where: { ownerId: { in: participants } }, select: { id: true, ownerId: true } })
    expect(all).toHaveLength(600)
    expect(new Set(all.map((i) => i.id)).size).toBe(600)
    expect(await db.programScheduleItem.findMany({ where: { programVersionId: v1 }, orderBy: { id: 'asc' } })).toEqual(templateBefore)

    // Follows: bob follows carol and dave; carol follows bob; ivan (never in the group) follows bob.
    for (const [from, to] of [[bob, U.carol], [bob, U.dave], [U.carol, bob], [U.ivan, bob]] as const) await ok(from, 'POST', `/follow-users/${to}`)

    // ── 4. Invite friends: one group, all three invitation paths ─────────────────────────────
    // ASYNC because members already started on their own dates (10 §2).
    const group = await ok(bob, 'POST', '/groups', { programVersionId: v1, mode: 'ASYNC', name: 'Core crew' })
    // USER (handle): carol finds it in the app and links her existing enrollment.
    const forCarol = await ok(bob, 'POST', `/groups/${group.id}/invitations`, { kind: 'USER', handle: 'carol' })
    const carolInbox = await ok(U.carol, 'GET', '/users/me/group-invitations')
    expect(carolInbox.map((i: any) => i.id)).toEqual([forCarol.id])
    expect(carolInbox[0].preview.join).toMatchObject({ status: 'READY_TO_JOIN', enrollmentId: enrollment[U.carol] })
    const carolCalendar = (await liveItems(U.carol)).map((i) => i.id)
    await ok(U.carol, 'POST', `/users/me/group-invitations/${forCarol.id}/accept`)
    expect((await liveItems(U.carol)).map((i) => i.id)).toEqual(carolCalendar) // calendar unchanged
    // EMAIL: frank (private profile) finds it by his verified address.
    const forFrank = await ok(bob, 'POST', `/groups/${group.id}/invitations`, { kind: 'EMAIL', email: 'frank@test.local' })
    expect((await ok(U.frank, 'GET', '/users/me/group-invitations')).map((i: any) => i.id)).toEqual([forFrank.id])
    await ok(U.frank, 'POST', `/users/me/group-invitations/${forFrank.id}/accept`)
    // LINK: dave, erin and grace join an existing group from a shared link.
    const link = await ok(bob, 'POST', `/groups/${group.id}/invitations`, { kind: 'LINK' })
    for (const userId of [U.dave, U.erin, U.grace]) {
      expect((await ok(userId, 'GET', `/group-invitations/${tokenOf(link)}`)).join.status).toBe('READY_TO_JOIN')
      await ok(userId, 'POST', `/group-invitations/${tokenOf(link)}/accept`)
    }
    const detail = await ok(bob, 'GET', `/groups/${group.id}`)
    expect(detail.memberCount).toBe(6)
    // Grace blocks bob afterwards: blocks take precedence over membership signals.
    await ok(U.grace, 'POST', `/blocked-users/${bob}`)

    // ── 5. Completions, reactions, group media, comments ─────────────────────────────────────
    const bobSquats0 = await dayItem(bob, 0, cat.squats.activity.id)
    const bobSession = await finish(bob, bobSquats0.id, 25, 'bob private note')
    await finish(U.carol, (await dayItem(U.carol, 0, cat.squats.activity.id)).id, 30)
    await finish(U.dave, (await dayItem(U.dave, 0, cat.squats.activity.id)).id, 12)
    // heidi is not in the group: her completion is personal only.
    await finish(U.heidi, (await dayItem(U.heidi, 0, cat.squats.activity.id)).id, 8)

    const feed = await call(U.carol, 'GET', `/groups/${group.id}/completions`)
    await validateResponse('listGroupCompletions', 200, feed.body)
    expect(feed.body.data.map((c: any) => c.user.handle).sort()).toEqual(['bob', 'carol', 'dave'])
    expect(JSON.stringify(feed.body)).not.toContain('bob private note')
    expect(JSON.stringify(feed.body)).not.toContain(bobSession)

    const carolOcc = await ok(U.carol, 'GET', `/calendar-items/${(await dayItem(U.carol, 0, cat.squats.activity.id)).id}/occurrence`)
    const bobRow = carolOcc.collaborators.members.find((m: any) => m.user.handle === 'bob')
    expect(bobRow.status).toBe('DONE')
    expect(carolOcc.resultInputs[0].recorded).toBe(30) // her own, never bob's 25
    const reacted = await ok(U.carol, 'POST', `/completion-shares/${bobRow.completionShareId}/reactions`, { emoji: '🔥', idempotencyKey: key() })
    expect(reacted).toEqual([{ emoji: '🔥', count: 1, reactedByMe: true }])
    expect((await call(U.heidi, 'POST', `/completion-shares/${bobRow.completionShareId}/reactions`, { emoji: '👏' })).status).toBe(404)

    // Bob explicitly shares one photo with the group; carol comments; outsiders see nothing.
    const photo = await db.mediaAsset.create({ data: { ownerId: bob, type: 'PHOTO', originalStorageKey: `u/${bob}/day1`, mime: 'image/jpeg', byteSize: 10, state: 'READY' } })
    const pub = await ok(bob, 'POST', '/media-publications', { mediaId: photo.id, audience: 'GROUP', groupId: group.id, occurrenceKey: bobSquats0.groupOccurrenceKey })
    expect(pub.status).toBe('APPROVED')
    expect((await ok(U.dave, 'GET', `/groups/${group.id}/media`)).map((m: any) => m.publicationId ?? m.id)).toContain(pub.id)
    await ok(U.carol, 'POST', `/media-publications/${pub.id}/comments`, { body: 'Strong start!', idempotencyKey: key() })
    for (const outsider of [U.heidi, U.ivan]) {
      expect((await call(outsider, 'GET', `/groups/${group.id}/media`)).status).toBe(404)
      expect((await call(outsider, 'GET', `/media-publications/${pub.id}/comments`)).status).toBe(404)
    }

    await drain()
    const bobNotes = await db.notification.findMany({ where: { recipientId: bob } })
    expect(bobNotes.map((x) => x.type)).toEqual(expect.arrayContaining(['COMPLETION_REACTION', 'GROUP_MEDIA_COMMENT', 'MEMBER_JOINED']))

    // ── 3. My Programs data: personal status/progress, participation counts, friends ─────────
    const library = await call(bob, 'GET', '/me/program-library')
    await validateResponse('getPersonalProgramLibrary', 200, library.body)
    const mine = library.body.data.find((p: any) => p.program.id === programId)
    expect(mine).toMatchObject({ owned: false, status: 'Active', current: { id: enrollment[bob], versionId: v1, completed: 1, pendingVersionId: null } })

    await programStats()
    expect((await ok(bob, 'GET', `/programs/${programId}`)).enrollmentCount).toBe(10)

    const forBob = await participationSummary(bob, programId)
    expect(forBob).toMatchObject({ participantCount: 10, activeMemberCount: 4, friendCount: 4 })
    // Followed first (carol, dave), then the other fellow members; grace is hidden by her block.
    expect(forBob.friends.slice(0, 2).map((f) => [f.handle, f.viewerFollows])).toEqual([['carol', true], ['dave', true]])
    expect(forBob.friends.slice(2).map((f) => [f.handle, f.viewerFollows]).sort()).toEqual([['erin', false], ['frank', false]])
    expect(forBob.friends.every((f) => f.id && 'avatarUrl' in f && 'displayName' in f)).toBe(true)
    // A follower outside the group learns nothing about bob's participation (10 §4).
    expect((await participationSummary(U.ivan, programId)).friends).toEqual([])
    expect((await participationSummary(U.heidi, programId)).friendCount).toBe(0)
    // The creator, not in the group, gets the same aggregates and no names.
    expect(await participationSummary(alice, programId)).toMatchObject({ participantCount: 10, activeMemberCount: 4, friends: [] })
    // Small samples are suppressed for everyone (12 §10): a second Program with two participants.
    let small = await ok(alice, 'POST', '/programs', { programTypeId: cat.workout.id })
    small = await ok(alice, 'POST', `/programs/${small.id}/draft/activities`, { activityIds: [cat.squats.activity.id], expectedRevision: small.draftRevision })
    small = await ok(alice, 'PATCH', `/programs/${small.id}/draft`, { title: 'Small Squats', durationDays: 7, frequency: { kind: 'DAILY' }, expectedRevision: small.draftRevision })
    const smallV = (await ok(alice, 'POST', `/programs/${small.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: small.draftRevision })).latestPublishedVersionId
    for (const userId of [bob, U.carol]) await ok(userId, 'POST', `/programs/${small.id}/enrollments`, { programVersionId: smallV, startLocalDate: today, timezone: TZ, idempotencyKey: key() })
    const both = await participationSummaries(bob, [programId, small.id])
    expect(both.get(small.id)).toEqual({ participantCount: null, activeMemberCount: null, friends: [], friendCount: 0 })
    expect(both.get(programId)!.participantCount).toBe(10)

    // ── Personal customizations before the update ────────────────────────────────────────────
    // bob moves day-2 Leg Raises to day 5's date and removes day-3 Squats.
    const legs2 = await dayItem(bob, 2, cat.legRaises.activity.id)
    await ok(bob, 'PATCH', `/calendar-items/${legs2.id}`, { localDate: addDays(today, 5), expectedUpdatedAt: legs2.updatedAt.toISOString() })
    const squats3 = await dayItem(bob, 3, cat.squats.activity.id)
    await ok(bob, 'DELETE', `/calendar-items/${squats3.id}`)

    // ── 6. The creator publishes a new version (drops Leg Raises) ─────────────────────────────
    ws = await ok(alice, 'GET', `/programs/${programId}/workspace`)
    ws = await ok(alice, 'DELETE', `/programs/${programId}/draft/activities/${cat.legRaises.activity.id}?expectedRevision=${ws.draftRevision}`)
    ws = await ok(alice, 'PATCH', `/programs/${programId}/draft`, { title: '30 Day Core v2', expectedRevision: ws.draftRevision })
    const v2 = (await ok(alice, 'POST', `/programs/${programId}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision })).latestPublishedVersionId as string
    expect(v2).not.toBe(v1)

    // ── 7. Everyone sees "Update available"; nothing changes until they choose ──────────────
    const bobBefore = await liveItems(bob)
    const carolBefore = await liveItems(U.carol)
    for (const userId of participants) {
      const e = await call(userId, 'GET', `/enrollments/${enrollment[userId]}`)
      await validateResponse('getEnrollment', 200, e.body)
      expect(e.body.data).toMatchObject({ programVersionId: v1, pendingVersionId: v2 })
    }
    await drain()
    const updates = await db.notification.findMany({ where: { type: 'PROGRAM_UPDATE' } })
    expect(updates.map((x) => x.recipientId).sort()).toEqual([...participants].sort())
    expect(updates.every((x) => x.title.startsWith('Update available'))).toBe(true)
    const bobFeed = await ok(bob, 'GET', '/notifications')
    expect(bobFeed.some((x: any) => x.type === 'PROGRAM_UPDATE')).toBe(true)
    expect((await liveItems(bob)).map((i) => i.id)).toEqual(bobBefore.map((i) => i.id))
    // A newcomer after the update is offered v2 directly.
    expect((await ok(U.ivan, 'GET', `/programs/${programId}`)).latestVersionId).toBe(v2)
    const libraryPending = (await ok(bob, 'GET', '/me/program-library')).find((p: any) => p.program.id === programId)
    expect(libraryPending.current.pendingVersionId).toBe(v2)

    // bob accepts: past result, the moved item and the removal survive; future unadjusted items follow v2.
    const accepted = await call(bob, 'POST', `/enrollments/${enrollment[bob]}/accept-update`)
    await validateResponse('acceptEnrollmentUpdate', 200, accepted.body)
    expect(accepted.body.data).toMatchObject({ programVersionId: v2, pendingVersionId: null })
    const done = await db.calendarItem.findUniqueOrThrow({ where: { id: bobSquats0.id } })
    expect(done.status).toBe('DONE')
    expect((await ok(bob, 'GET', `/calendar-items/${bobSquats0.id}/occurrence`)).resultInputs[0].recorded).toBe(25)
    expect(await db.resultEntry.count({ where: { sessionId: bobSession } })).toBe(1)
    const moved = await db.calendarItem.findUniqueOrThrow({ where: { id: legs2.id } })
    expect([moved.status, moved.isUserAdjusted, moved.localDate.toISOString().slice(0, 10)]).toEqual(['PLANNED', true, addDays(today, 5)])
    expect((await db.calendarItem.findUniqueOrThrow({ where: { id: squats3.id } })).status).toBe('CANCELLED')
    const after = await liveItems(bob)
    // v2 has no Leg Raises: only the moved one remains.
    expect(after.filter((i) => i.activityId === cat.legRaises.activity.id).map((i) => i.id)).toEqual([legs2.id])
    // One Squats per Program Day: the done day 0 is not duplicated, the removed day 3 is not re-added.
    const squatDays = after.filter((i) => i.activityId === cat.squats.activity.id).map((i) => i.programDayIndex)
    expect(squatDays.sort((a, b) => a! - b!)).toEqual([...Array(30).keys()].filter((d) => d !== 3))
    // Group completion for the done item is still visible to the group.
    expect((await ok(U.carol, 'GET', `/groups/${group.id}/completions`)).map((c: any) => c.user.handle)).toContain('bob')

    // carol declines: pinned to v1, calendar untouched, no offer left.
    const dismissed = await ok(U.carol, 'POST', `/enrollments/${enrollment[U.carol]}/dismiss-update`)
    expect(dismissed).toMatchObject({ programVersionId: v1, pendingVersionId: null })
    expect((await liveItems(U.carol)).map((i) => i.id)).toEqual(carolBefore.map((i) => i.id))
    expect((await ok(U.carol, 'GET', `/calendar-items/${(await dayItem(U.carol, 0, cat.squats.activity.id)).id}/occurrence`)).resultInputs[0].recorded).toBe(30)

    // ── Mixed-version group: v1 and v2 members stay together ─────────────────────────────────
    // dave accepts too; carol declined; erin and frank leave the offer pending (still v1).
    await ok(U.dave, 'POST', `/enrollments/${enrollment[U.dave]}/accept-update`)
    const versionOf = async (userId: string) => (await db.programEnrollment.findUniqueOrThrow({ where: { id: enrollment[userId] } })).programVersionId
    expect([await versionOf(bob), await versionOf(U.dave), await versionOf(U.carol), await versionOf(U.erin), await versionOf(U.frank)]).toEqual([v2, v2, v1, v1, v1])
    // Accepting removed nobody: same six members, enrollments still linked to the group.
    expect((await ok(U.erin, 'GET', `/groups/${group.id}`)).memberCount).toBe(6)
    for (const userId of [bob, U.dave, U.carol, U.erin, U.frank]) {
      expect((await db.programEnrollment.findUniqueOrThrow({ where: { id: enrollment[userId] } })).groupId).toBe(group.id)
    }
    // No duplicate items after acceptance: one per (Activity, Program Day) for each accepting member.
    for (const userId of [bob, U.dave]) {
      const slots = (await liveItems(userId)).map((i) => `${i.activityId}:${i.programDayIndex}`)
      expect(new Set(slots).size, userId).toBe(slots.length)
    }

    // New invitees join on the version available now (v2), by USER invitation and by the link.
    const leo = '00000000-0000-4000-8000-000000001020'
    const mia = '00000000-0000-4000-8000-000000001021'
    await seedUser(leo, 'leo')
    await seedUser(mia, 'mia')
    const forLeo = await ok(bob, 'POST', `/groups/${group.id}/invitations`, { kind: 'USER', handle: 'leo' })
    expect((await ok(leo, 'GET', `/group-invitations/${tokenOf(forLeo)}`)).join.status).toBe('SELECT_SCHEDULE')
    await ok(leo, 'POST', `/users/me/group-invitations/${forLeo.id}/accept`, { enrollment: { startLocalDate: today, timezone: TZ, idempotencyKey: key() } })
    await ok(mia, 'POST', `/group-invitations/${tokenOf(link)}/accept`, { enrollment: { startLocalDate: addDays(today, 1), timezone: TZ, idempotencyKey: key() } })
    for (const userId of [leo, mia]) {
      const e = await db.programEnrollment.findFirstOrThrow({ where: { userId, programId } })
      expect([e.programVersionId, e.groupId, e.pendingVersionId]).toEqual([v2, group.id, null])
      enrollment[userId] = e.id
    }
    // A v1 participant outside the group (judy, offer pending) joins through the link: linked as is.
    const judyBefore = (await liveItems(U.judy)).map((i) => [i.id, i.localDate.toISOString(), i.status])
    expect((await ok(U.judy, 'GET', `/group-invitations/${tokenOf(link)}`)).join).toMatchObject({ status: 'READY_TO_JOIN', enrollmentId: enrollment[U.judy] })
    await ok(U.judy, 'POST', `/group-invitations/${tokenOf(link)}/accept`)
    expect((await liveItems(U.judy)).map((i) => [i.id, i.localDate.toISOString(), i.status])).toEqual(judyBefore) // calendar untouched
    expect(await versionOf(U.judy)).toBe(v1)
    expect((await ok(bob, 'GET', `/groups/${group.id}`)).memberCount).toBe(9)

    // Compatible across versions: Squats on Program Day 1 is the same occurrence for v1 and v2.
    const occOf = async (userId: string, day: number, activityId: string) => ok(userId, 'GET', `/calendar-items/${(await dayItem(userId, day, activityId)).id}/occurrence`)
    await finish(bob, (await dayItem(bob, 1, cat.squats.activity.id)).id, 26) // v2
    await finish(U.carol, (await dayItem(U.carol, 1, cat.squats.activity.id)).id, 31) // v1
    const carolDay1 = await occOf(U.carol, 1, cat.squats.activity.id)
    const statusIn = (occ: any) => Object.fromEntries(occ.collaborators.members.map((m: any) => [m.user.handle, m.status]))
    expect(statusIn(carolDay1)).toMatchObject({ bob: 'DONE', carol: 'DONE', dave: 'PENDING', leo: 'PENDING', erin: 'PENDING', judy: 'PENDING' })
    const leoDay1 = await occOf(leo, 1, cat.squats.activity.id)
    expect(leoDay1.collaborators.occurrenceKey).toBe(carolDay1.collaborators.occurrenceKey)
    const carolShare = leoDay1.collaborators.members.find((m: any) => m.user.handle === 'carol')
    expect(carolShare.status).toBe('DONE')
    expect(await ok(leo, 'POST', `/completion-shares/${carolShare.completionShareId}/reactions`, { emoji: '💪', idempotencyKey: key() })).toEqual([{ emoji: '💪', count: 1, reactedByMe: true }])
    expect(JSON.stringify(leoDay1)).not.toMatch(/"recorded":\s*31/) // carol's reps stay hers
    // The day tile counts shared completions across versions too.
    const leoTile = (await ok(leo, 'GET', `/calendar/items?start=${addDays(today, 1)}&end=${addDays(today, 1)}`)).find((i: any) => i.activityId === cat.squats.activity.id || i.title === 'Squats')
    expect(leoTile.sharedCompletionCount).toBe(2)

    // An Activity v2 doesn't schedule: v2 members are left out, never "missing" it.
    const carolLegs1 = await occOf(U.carol, 1, cat.legRaises.activity.id)
    const legsRow = statusIn(carolLegs1)
    expect(Object.keys(legsRow).sort()).toEqual(['carol', 'erin', 'frank', 'grace', 'judy'])
    expect(carolLegs1.collaborators.totalCount).toBe(5)
    // bob's moved Leg Raises (kept from v1 on Program Day 2) keeps him in that day's row.
    expect(Object.keys(statusIn(await occOf(U.carol, 2, cat.legRaises.activity.id)))).toContain('bob')

    // Pre-update shared history stays: day-0 completions, carol's 🔥, bob's photo and its comment.
    const feedNow = (await ok(leo, 'GET', `/groups/${group.id}/completions`)).map((c: any) => `${c.user.handle}:${c.programDayIndex}`)
    expect(feedNow).toEqual(expect.arrayContaining(['bob:0', 'carol:0', 'dave:0', 'bob:1', 'carol:1']))
    const leoDay0 = await occOf(leo, 0, cat.squats.activity.id)
    expect(leoDay0.collaborators.members.find((m: any) => m.user.handle === 'bob')).toMatchObject({ status: 'DONE', reactions: [{ emoji: '🔥', count: 1, reactedByMe: false }] })
    expect(leoDay0.sharedMedia).toEqual([expect.objectContaining({ publicationId: pub.id, commentCount: 1 })])
    expect((await ok(leo, 'GET', `/groups/${group.id}/media`)).length).toBe(1)
    expect((await ok(leo, 'GET', `/media-publications/${pub.id}/comments`)).map((c: any) => c.body)).toEqual(['Strong start!'])
    // bob (now v2) still sees his kept day-0 item's group row, with carol's share.
    expect(statusIn(await ok(bob, 'GET', `/calendar-items/${bobSquats0.id}/occurrence`))).toMatchObject({ bob: 'DONE', carol: 'DONE', dave: 'DONE' })

    // Non-members still get 404 for everything group-scoped.
    for (const outsider of [U.heidi, U.ivan]) {
      for (const path of [`/groups/${group.id}`, `/groups/${group.id}/completions`, `/groups/${group.id}/media`, `/media-publications/${pub.id}/comments`]) {
        expect((await call(outsider, 'GET', path)).status, path).toBe(404)
      }
      expect((await call(outsider, 'POST', `/completion-shares/${carolShare.completionShareId}/reactions`, { emoji: '👏' })).status).toBe(404)
    }

    // The template of v1 never changed; participants' calendars are independent of it.
    expect(await db.programScheduleItem.findMany({ where: { programVersionId: v1 }, orderBy: { id: 'asc' } })).toEqual(templateBefore)
  })

  it('the data migration turns legacy version-bound keys into the same keys the server now writes', async () => {
    // A Program with a repeated placement (Squats twice on day 1) and a group with a share and media.
    let ws = await ok(alice, 'POST', '/programs', { programTypeId: cat.workout.id })
    ws = await ok(alice, 'POST', `/programs/${ws.id}/draft/activities`, { activityIds: [cat.squats.activity.id, cat.legRaises.activity.id], expectedRevision: ws.draftRevision })
    ws = await ok(alice, 'PATCH', `/programs/${ws.id}/draft`, { title: 'Doubles', durationDays: 7, frequency: { kind: 'DAILY' }, expectedRevision: ws.draftRevision })
    await ok(alice, 'POST', `/programs/${ws.id}/draft/placements`, { activityId: cat.squats.activity.id, relativeDay: 1, localTime: '18:00', expectedRevision: ws.draftRevision })
    ws = await ok(alice, 'GET', `/programs/${ws.id}/workspace`)
    const v = (await ok(alice, 'POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'OPEN', expectedRevision: ws.draftRevision })).latestPublishedVersionId
    const today = todayIn(TZ)
    for (const userId of [bob, U.carol]) await ok(userId, 'POST', `/programs/${ws.id}/enrollments`, { programVersionId: v, startLocalDate: today, timezone: TZ, idempotencyKey: key() })
    const group = await ok(bob, 'POST', '/groups', { programVersionId: v, mode: 'ASYNC' })
    const link = await ok(bob, 'POST', `/groups/${group.id}/invitations`, { kind: 'LINK' })
    await ok(U.carol, 'POST', `/group-invitations/${tokenOf(link)}/accept`)
    const bobItems = await db.calendarItem.findMany({ where: { ownerId: bob, programDayIndex: 1, activityId: cat.squats.activity.id } })
    expect(bobItems).toHaveLength(2)
    expect(new Set(bobItems.map((i) => i.groupOccurrenceKey)).size).toBe(2) // ordinals 0 and 1
    await finish(bob, bobItems[0]!.id, 10)
    const photo = await db.mediaAsset.create({ data: { ownerId: bob, type: 'PHOTO', originalStorageKey: `u/${bob}/m`, mime: 'image/jpeg', byteSize: 10, state: 'READY' } })
    await ok(bob, 'POST', '/media-publications', { mediaId: photo.id, audience: 'GROUP', groupId: group.id, occurrenceKey: bobItems[0]!.groupOccurrenceKey })
    await db.notification.create({ data: { recipientId: U.carol, type: 'COMPLETION_SHARED', title: 'x', deepLink: '/', entityKind: 'CALENDAR_ITEM', entityId: bobItems[0]!.id, groupOccurrenceKey: bobItems[0]!.groupOccurrenceKey, dedupeKey: key() } })

    const snapshot = async () => ({
      items: (await db.calendarItem.findMany({ where: { groupOccurrenceKey: { not: null } }, orderBy: { id: 'asc' }, select: { id: true, groupOccurrenceKey: true } })),
      shares: (await db.completionShare.findMany({ orderBy: { id: 'asc' }, select: { id: true, occurrenceKey: true } })),
      pubs: (await db.mediaPublication.findMany({ where: { occurrenceKey: { not: null } }, orderBy: { id: 'asc' }, select: { id: true, occurrenceKey: true } })),
      notes: (await db.notification.findMany({ where: { groupOccurrenceKey: { not: null } }, orderBy: { id: 'asc' }, select: { id: true, groupOccurrenceKey: true } })),
    })
    const expected = await snapshot()
    expect(expected.items.length).toBeGreaterThan(20)

    // Rewrite every key back to the legacy `versionId:scheduleItemId:cycleIndex` form.
    const legacy = new Map<string, string>()
    for (const i of await db.calendarItem.findMany({ where: { groupOccurrenceKey: { not: null } } })) {
      const cycle = Number(i.idempotencyKey.split(':')[2])
      const old = `${v}:${i.sourceScheduleItemId}:${cycle}`
      legacy.set(i.groupOccurrenceKey!, old)
      await db.calendarItem.update({ where: { id: i.id }, data: { groupOccurrenceKey: old } })
    }
    for (const r of expected.shares) await db.completionShare.update({ where: { id: r.id }, data: { occurrenceKey: legacy.get(r.occurrenceKey)! } })
    for (const r of expected.pubs) await db.mediaPublication.update({ where: { id: r.id }, data: { occurrenceKey: legacy.get(r.occurrenceKey!)! } })
    for (const r of expected.notes) await db.notification.update({ where: { id: r.id }, data: { groupOccurrenceKey: legacy.get(r.groupOccurrenceKey!)! } })
    expect((await snapshot()).items).not.toEqual(expected.items)

    const sql = readFileSync(join(__dirname, '../../../../packages/db/prisma/migrations/20261109000000_version_independent_occurrence_keys/migration.sql'), 'utf8')
    const statements = sql.split(';').map((x) => x.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean)
    expect(statements).toHaveLength(4)
    for (const st of statements) await db.$executeRawUnsafe(st)
    expect(await snapshot()).toEqual(expected)
    // Idempotent: a second run changes nothing.
    for (const st of statements) await db.$executeRawUnsafe(st)
    expect(await snapshot()).toEqual(expected)
  })
})
