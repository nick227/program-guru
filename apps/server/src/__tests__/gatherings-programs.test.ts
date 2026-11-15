// G4 (10 §9.11): solo Program items join gatherings by reuse, Program-group items keep their own
// identity, repeated joins, leaving, Calendar adjustments, and Do It Again with personal invitations.
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@project/db'
import { asAuth, buildTestApp, testOtherUserId, testUserId , asOfItemDay } from './helpers'
import { carolId, World } from './helpers/contract'
import { seedPlace } from './helpers/fixtures'

const app = buildTestApp()
const alice = testUserId
const bob = testOtherUserId
const carol = carolId
let world: World
beforeEach(() => {
  world = new World(app)
})

let n = 0
const key = () => `g4-key-${++n}-${Date.now()}`
const req = (userId: string | null, method: string, url: string, payload?: unknown) =>
  app.inject({ method: method as any, url, headers: userId ? asAuth(userId) : {}, ...(payload !== undefined ? { payload: payload as any } : {}) })
const ok = async (userId: string | null, method: string, url: string, payload?: unknown) => {
  const res = await req(userId, method, url, payload)
  if (res.statusCode >= 300) throw new Error(`${method} ${url} → ${res.statusCode}: ${res.body}`)
  return res.json().data
}
const iso = (d: Date) => d.toISOString().slice(0, 10)
const createAt = async (owner: string, activityId: string, localDate: string, extra: Record<string, unknown> = {}) =>
  (await ok(owner, 'POST', `/activities/${activityId}/gatherings`, { localDate, localTime: '18:00', listPublicly: true, idempotencyKey: key(), ...extra })).gathering

/** Carol follows Alice's Program on her own (no Program group). */
async function soloProgramItem() {
  const program = await world.program()
  const c = await world.cat()
  const e = await ok(carol, 'POST', `/programs/${program.id}/enrollments`, { programVersionId: program.versionId, startLocalDate: '2027-02-01', timezone: 'America/Chicago', idempotencyKey: key() })
  const item = await db.calendarItem.findFirstOrThrow({ where: { enrollmentId: e.id, activityId: c.squats.activity.id }, orderBy: { localDate: 'asc' } })
  return { enrollmentId: e.id as string, item, activityId: c.squats.activity.id as string }
}

describe('solo Program items join gatherings (10 §9.11)', () => {
  it('reuses the Program item: enrollment, Program day and progress intact; repeated joins; leave keeps it', async () => {
    const { enrollmentId, item, activityId } = await soloProgramItem()
    const barton = await seedPlace()
    const g = await createAt(alice, activityId, iso(item.localDate), { placeId: barton.id })

    const joinKey = key()
    const joined = await ok(carol, 'POST', `/gatherings/${g.id}/join`, { calendarItemId: item.id, idempotencyKey: joinKey })
    expect(joined.calendarItemId).toBe(item.id)
    const linked = await db.calendarItem.findUniqueOrThrow({ where: { id: item.id } })
    expect(linked).toMatchObject({ enrollmentId, programDayIndex: item.programDayIndex, gatheringId: g.id, localDate: item.localDate, localTime: '18:00', placeId: barton.id })
    // Repeat-safe, and a second join without the id still returns the same item.
    expect((await ok(carol, 'POST', `/gatherings/${g.id}/join`, { calendarItemId: item.id, idempotencyKey: joinKey })).calendarItemId).toBe(item.id)
    expect((await ok(carol, 'POST', `/gatherings/${g.id}/join`, { idempotencyKey: key() })).calendarItemId).toBe(item.id)
    expect(await db.calendarItem.count({ where: { ownerId: carol, activityId, localDate: item.localDate, status: { not: 'CANCELLED' } } })).toBe(1)

    // Completing it counts for the Program as before, and shares to the gathering.
    const s = await ok(carol, 'POST', '/sessions', { calendarItemId: item.id, idempotencyKey: key() })
    await asOfItemDay(item.id, () => ok(carol, 'POST', `/sessions/${s.id}/actions`, { action: 'FINISH', expectedRevision: s.revision }))
    expect((await db.calendarItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe('DONE')
    expect(await db.completionShare.count({ where: { groupId: g.id, userId: carol, revokedAt: null } })).toBe(1)
    const library = await ok(carol, 'GET', '/me/program-library')
    expect(JSON.stringify(library)).toContain(enrollmentId)

    // Leaving keeps the item in the Program.
    await ok(carol, 'POST', `/gatherings/${g.id}/leave`)
    expect(await db.calendarItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ enrollmentId, gatheringId: null, status: 'DONE' })
  })

  it('joins automatically by reusing the Program item on that date', async () => {
    const { item, activityId } = await soloProgramItem()
    const g = await createAt(alice, activityId, iso(item.localDate))
    const joined = await ok(carol, 'POST', `/gatherings/${g.id}/join`, { idempotencyKey: key() })
    expect(joined.calendarItemId).toBe(item.id)
  })

  it('never moves a Program day to another date', async () => {
    const { item, activityId } = await soloProgramItem()
    const other = new Date(item.localDate.getTime() + 86_400_000 * 3)
    const g = await createAt(alice, activityId, iso(other))
    expect((await req(carol, 'POST', `/gatherings/${g.id}/join`, { calendarItemId: item.id, idempotencyKey: key() })).statusCode).toBe(400)
    expect(iso((await db.calendarItem.findUniqueOrThrow({ where: { id: item.id } })).localDate)).toBe(iso(item.localDate))
  })

  it('a Calendar adjustment of a Program gathering item leaves the gathering and keeps the enrollment', async () => {
    const { enrollmentId, item, activityId } = await soloProgramItem()
    const g = await createAt(alice, activityId, iso(item.localDate))
    await ok(carol, 'POST', `/gatherings/${g.id}/join`, { calendarItemId: item.id, idempotencyKey: key() })
    const current = await db.calendarItem.findUniqueOrThrow({ where: { id: item.id } })
    await ok(carol, 'PATCH', `/calendar-items/${item.id}`, { localTime: '07:00', expectedUpdatedAt: current.updatedAt.toISOString() })
    expect(await db.calendarItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ enrollmentId, gatheringId: null, localTime: '07:00' })
    expect((await db.groupMember.findUniqueOrThrow({ where: { groupId_userId: { groupId: g.id, userId: carol } } })).status).toBe('LEFT')
  })
})

describe('Program-group items keep their shared occurrence identity', () => {
  it('is never attached; joining creates a separate standalone item by choice', async () => {
    await world.group()
    const c = await world.cat()
    const today = iso(new Date())
    const groupItem = await db.calendarItem.findFirstOrThrow({
      where: { ownerId: bob, activityId: c.squats.activity.id, groupOccurrenceKey: { not: null }, localDate: { gt: new Date(`${today}T00:00:00Z`) } },
      orderBy: { localDate: 'asc' },
    })
    const g = await createAt(alice, c.squats.activity.id, iso(groupItem.localDate))
    expect((await req(bob, 'POST', `/gatherings/${g.id}/join`, { calendarItemId: groupItem.id, idempotencyKey: key() })).statusCode).toBe(400)
    const joined = await ok(bob, 'POST', `/gatherings/${g.id}/join`, { idempotencyKey: key() })
    expect(joined.calendarItemId).not.toBe(groupItem.id)
    const untouched = await db.calendarItem.findUniqueOrThrow({ where: { id: groupItem.id } })
    expect(untouched).toMatchObject({ groupOccurrenceKey: groupItem.groupOccurrenceKey, gatheringId: null, localTime: groupItem.localTime })
    expect(await db.calendarItem.findUniqueOrThrow({ where: { id: joined.calendarItemId } })).toMatchObject({ enrollmentId: null, gatheringId: g.id })
  })
})

describe('Do It Again (10 §9.11)', () => {
  it('repeats with the same settings for the repeater and invites prior members, who can see and join it', async () => {
    const c = await world.cat()
    const barton = await seedPlace()
    const g = (await ok(alice, 'POST', `/activities/${c.squats.activity.id}/gatherings`, { localDate: '2027-03-06', localTime: '19:00', placeId: barton.id, capacity: 6, idempotencyKey: key() })).gathering
    const link = await ok(alice, 'POST', `/gatherings/${g.id}/link`)
    await ok(bob, 'POST', `/gatherings/${g.id}/join`, { invite: new URL(link.url).searchParams.get('invite'), idempotencyKey: key() })

    // Bob repeats it a week later and invites the others.
    const again = await ok(bob, 'POST', `/gatherings/${g.id}/repeat`, { localDate: '2027-03-13', inviteParticipants: true, idempotencyKey: key() })
    expect(again.gathering).toMatchObject({ localDate: '2027-03-13', localTime: '19:00', capacity: 6, visibility: 'PRIVATE', joinPolicy: 'INVITE_ONLY', viewerIsOwner: true, memberCount: 1 })
    expect(again.gathering.place.id).toBe(barton.id)
    expect(await db.calendarItem.findUniqueOrThrow({ where: { id: again.calendarItemId } })).toMatchObject({ ownerId: bob, gatheringId: again.gathering.id })
    expect(await db.calendarRecurrence.count()).toBe(0)

    // Alice was invited by name: she can see and join the private repeat without a link.
    const invitation = await db.groupInvitation.findFirstOrThrow({ where: { groupId: again.gathering.id, invitedUserId: alice } })
    expect(invitation.status).toBe('PENDING')
    expect((await ok(alice, 'GET', `/gatherings/${again.gathering.id}`)).viewerIsMember).toBe(false)
    await ok(alice, 'POST', `/gatherings/${again.gathering.id}/join`, { idempotencyKey: key() })
    expect((await db.groupInvitation.findUniqueOrThrow({ where: { id: invitation.id } })).status).toBe('ACCEPTED')
    // Carol was never a member: still invisible.
    await world.cat()
    expect((await req(carol, 'GET', `/gatherings/${again.gathering.id}`)).statusCode).toBe(404)
    // Non-members cannot repeat.
    expect((await req(carol, 'POST', `/gatherings/${g.id}/repeat`, { localDate: '2027-03-20', idempotencyKey: key() })).statusCode).toBe(404)
  })
})

describe('joining on another date says so (10 §9.11)', () => {
  it('names the Program day that stays put when the join creates a separate item', async () => {
    const { item, activityId, enrollmentId } = await soloProgramItem()
    const programDate = item.localDate.toISOString().slice(0, 10)
    const otherDay = new Date(item.localDate.getTime() + 3 * 86_400_000).toISOString().slice(0, 10)
    const g = await createAt(alice, activityId, otherDay)
    const joined = await ok(carol, 'POST', `/gatherings/${g.id}/join`, { idempotencyKey: key() })
    expect(joined.calendarItemId).not.toBe(item.id)
    expect(joined.otherProgramItemDate).toBe(programDate)
    // The Program item did not move.
    expect(await db.calendarItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ enrollmentId, localDate: item.localDate, gatheringId: null })

    // Same-day join reuses the Program item, so there is nothing elsewhere to mention.
    const same = await createAt(bob, activityId, programDate)
    const reused = await ok(carol, 'POST', `/gatherings/${same.id}/join`, { idempotencyKey: key() })
    expect(reused.calendarItemId).toBe(item.id)
    expect(reused.otherProgramItemDate).toBeNull()
  })
})
