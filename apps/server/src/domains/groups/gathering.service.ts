// Standalone Activity gatherings (10-COLLABORATION §9): a ProgramGroup with kind GATHERING and no Program.
// It reuses membership, link invitations, completion shares, GROUP media, presence and the occurrence
// room; this file holds only what is specific to one shared, dated occurrence of one Activity.
import { randomUUID } from 'crypto'
import { db, Prisma } from '@project/db'
import { newToken, sha256 } from '../../lib/auth'
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors'
import { withIdempotency } from '../../lib/idempotency'
import { enqueue } from '../../lib/outbox'
import { addDays, fromDbDate, localToUtc, todayIn, toDbDate, type LocalDate } from '../../lib/time'
import { activityInclude, loadRevisions, toActivitySummary } from '../activities/mapper'
import { assertActivePlace, toPlace } from '../catalog/catalog.service'
import { blockedIds, isBlockedEitherWay } from '../users/follow.service'
import { toUserSummary } from '../users/mapper'

type Tx = Prisma.TransactionClient
const INVITE_TTL_MS = 14 * 24 * 3600_000
const MEMBERS_SHOWN = 8
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const appBase = () => (process.env.PUBLIC_APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')

/** The occurrence key shared by every member's item; cannot collide with Program or check-in keys. */
export const gatheringKey = (groupId: string) => `gathering:${groupId}`

const gatheringInclude = {
  activity: { include: activityInclude },
  place: true,
  owner: { include: { profile: true } },
} satisfies Prisma.ProgramGroupInclude
type GatheringRow = Prisma.ProgramGroupGetPayload<{ include: typeof gatheringInclude }>

// ── Time: the gathering's moment, in the creator's timezone, shown in each member's own ─────────────

/** Local date and HH:mm of an instant in a timezone. */
export function utcToLocal(instant: Date, timeZone: string): { localDate: LocalDate; localTime: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const part = (t: string) => parts.find((p) => p.type === t)!.value
  return { localDate: `${part('year')}-${part('month')}-${part('day')}`, localTime: `${part('hour')}:${part('minute')}` }
}

type Moment = { startLocalDate: Date | null; startLocalTime: string | null; timezone: string | null }

/** Where a member's item sits: the same instant in the member's timezone, or the same date when date-only. */
function memberSlot(g: Moment, memberTz: string) {
  const date = fromDbDate(g.startLocalDate!)
  if (!g.startLocalTime) return { localDate: date, localTime: null as string | null, scheduledAtUtc: null as Date | null }
  const instant = localToUtc(date, g.startLocalTime, g.timezone ?? memberTz)
  return { ...utcToLocal(instant, memberTz), scheduledAtUtc: instant }
}

/** Past = after its start, or after its date when date-only. Joins close then (10 §9.6). */
export function isPast(g: Moment, now = new Date()) {
  const date = fromDbDate(g.startLocalDate!)
  if (g.startLocalTime) return localToUtc(date, g.startLocalTime, g.timezone ?? 'UTC') < now
  return date < todayIn(g.timezone ?? 'UTC', now)
}

async function timezoneOf(userId: string, tx: Tx | typeof db = db) {
  return (await tx.userPreference.findUnique({ where: { userId } }))?.timezone ?? 'UTC'
}

// ── Reading ─────────────────────────────────────────────────────────────────

async function load(groupId: string, tx: Tx | typeof db = db) {
  const g = await tx.programGroup.findUnique({ where: { id: groupId }, include: gatheringInclude })
  if (!g || g.kind !== 'GATHERING' || !g.activity) throw notFound('Gathering')
  return g
}

async function validInvite(groupId: string, token: string | undefined) {
  if (!token) return false
  const inv = await db.groupInvitation.findUnique({ where: { tokenHash: sha256(token) } })
  return !!inv && inv.groupId === groupId && inv.kind === 'LINK' && inv.status === 'PENDING' && inv.expiresAt > new Date()
}

/** Members, holders of a valid link, and (for public gatherings) everyone not blocked by the owner. */
async function canView(viewerId: string | null, g: GatheringRow, invite?: string) {
  if (viewerId && g.ownerId !== viewerId && (await isBlockedEitherWay(viewerId, g.ownerId))) return false
  const a = g.activity!
  if (a.moderatedAt || a.status !== 'PUBLISHED') return false
  if (viewerId) {
    const m = await db.groupMember.findUnique({ where: { groupId_userId: { groupId: g.id, userId: viewerId } } })
    if (m?.status === 'ACTIVE') return true
  }
  if (g.status !== 'ACTIVE') return false
  if (g.visibility === 'PUBLIC') return true
  return validInvite(g.id, invite)
}

export async function toGathering(g: GatheringRow, viewerId: string | null) {
  const [members, items, blocked, revs] = await Promise.all([
    db.groupMember.findMany({
      where: { groupId: g.id, status: 'ACTIVE' },
      include: { user: { include: { profile: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    db.calendarItem.findMany({
      where: { gatheringId: g.id },
      select: { id: true, ownerId: true, status: true, sessions: { where: { status: { in: ['ACTIVE', 'PAUSED'] } }, select: { id: true }, take: 1 } },
    }),
    blockedIds(viewerId),
    loadRevisions([g.activity!.latestPublishedRevisionId!]),
  ])
  const memberIds = new Set(members.map((m) => m.userId))
  const linked = items.filter((i) => memberIds.has(i.ownerId))
  const completed = linked.filter((i) => i.status === 'DONE').length
  const active = linked.filter((i) => i.status !== 'DONE' && i.sessions.length > 0).length
  const visible = members.filter((m) => m.user.profile && !blocked.includes(m.userId))
  const me = viewerId ? members.find((m) => m.userId === viewerId) : undefined
  const mine = viewerId ? items.find((i) => i.ownerId === viewerId) : undefined
  return {
    id: g.id,
    activity: toActivitySummary(g.activity!, revs.get(g.activity!.latestPublishedRevisionId!) ?? null),
    localDate: fromDbDate(g.startLocalDate!),
    localTime: g.startLocalTime,
    timezone: g.timezone ?? 'UTC',
    place: g.place && g.place.isActive ? toPlace(g.place) : null,
    capacity: g.capacity,
    visibility: g.visibility,
    joinPolicy: g.joinPolicy,
    status: g.status,
    owner: toUserSummary(g.owner.profile!),
    memberCount: members.length,
    members: visible.slice(0, MEMBERS_SHOWN).map((m) => toUserSummary(m.user.profile!)),
    scheduledCount: linked.length - completed - active,
    activeCount: active,
    completedCount: completed,
    isFull: g.capacity !== null && members.length >= g.capacity,
    isPast: isPast(g),
    viewerIsMember: !!me,
    viewerIsOwner: !!viewerId && g.ownerId === viewerId,
    viewerCalendarItemId: me && mine ? mine.id : null,
  }
}

export async function get(viewerId: string | null, groupId: string, invite?: string) {
  const g = await load(groupId)
  if (!(await canView(viewerId, g, invite))) throw notFound('Gathering')
  return toGathering(g, viewerId)
}

/** Upcoming gatherings for an Activity: public open ones and any the viewer belongs to (10 §9.7). */
export async function listForActivity(viewerId: string | null, activityId: string, now = new Date()) {
  const blocked = await blockedIds(viewerId)
  const rows = await db.programGroup.findMany({
    where: {
      kind: 'GATHERING',
      activityId,
      status: 'ACTIVE',
      startLocalDate: { gte: toDbDate(addDays(todayIn('UTC', now), -1)) },
      ...(blocked.length ? { ownerId: { notIn: blocked } } : {}),
      OR: [
        { visibility: 'PUBLIC', joinPolicy: 'OPEN' },
        ...(viewerId ? [{ members: { some: { userId: viewerId, status: 'ACTIVE' as const } } }] : []),
      ],
    },
    include: gatheringInclude,
    orderBy: [{ startLocalDate: 'asc' }, { startLocalTime: 'asc' }, { id: 'asc' }],
    take: 50,
  })
  const visible = rows.filter((g) => g.activity && !g.activity.moderatedAt && g.activity.status === 'PUBLISHED' && !isPast(g, now))
  return Promise.all(visible.map((g) => toGathering(g, viewerId)))
}

/**
 * Public gatherings. NOW: at least one member's Activity session is running or paused (authoritative
 * session records, never presence). UPCOMING: not yet started. City match only, never proximity.
 */
export async function listPublic(viewerId: string | null, query: { when?: 'NOW' | 'UPCOMING'; locality?: string }, now = new Date()) {
  const blocked = await blockedIds(viewerId)
  const when = query.when ?? 'UPCOMING'
  const locality = query.locality?.trim()
  const rows = await db.programGroup.findMany({
    where: {
      kind: 'GATHERING',
      status: 'ACTIVE',
      visibility: 'PUBLIC',
      joinPolicy: 'OPEN',
      activity: { status: 'PUBLISHED', moderatedAt: null },
      ...(blocked.length ? { ownerId: { notIn: blocked } } : {}),
      ...(locality ? { place: { isActive: true, locality } } : {}),
      ...(when === 'NOW'
        ? { gatheringItems: { some: { sessions: { some: { status: { in: ['ACTIVE', 'PAUSED'] } } } } } }
        : { startLocalDate: { gte: toDbDate(addDays(todayIn('UTC', now), -1)) } }),
    },
    include: gatheringInclude,
    orderBy: [{ startLocalDate: 'asc' }, { startLocalTime: 'asc' }, { id: 'asc' }],
    take: 50,
  })
  const list = await Promise.all(rows.map((g) => toGathering(g, viewerId)))
  return when === 'NOW' ? list.filter((g) => g.activeCount > 0) : list.filter((g) => !g.isPast)
}

// ── Linking a member's Calendar Item ────────────────────────────────────────

/**
 * Links exactly one Calendar Item for this member: the named item, else a compatible personal item on
 * the same date (same Activity, PLANNED, not in a Program or another gathering), else a new one.
 */
async function linkItem(tx: Tx, g: GatheringRow, userId: string, calendarItemId?: string | null) {
  const existing = await tx.calendarItem.findFirst({ where: { gatheringId: g.id, ownerId: userId } })
  if (existing) return existing.id
  const tz = await timezoneOf(userId, tx)
  const slot = memberSlot(g, tz)
  const compatible = { ownerId: userId, activityId: g.activityId!, status: 'PLANNED' as const, enrollmentId: null, gatheringId: null }
  const reuse = calendarItemId
    ? await tx.calendarItem.findFirst({ where: { id: calendarItemId, ...compatible } })
    : await tx.calendarItem.findFirst({ where: { ...compatible, localDate: toDbDate(slot.localDate) }, orderBy: { createdAt: 'asc' } })
  if (calendarItemId && !reuse) throw badRequest('That item cannot become this gathering', { calendarItemId: 'must be your own planned item of this Activity, not in a Program or another gathering' })
  const link = {
    gatheringId: g.id,
    groupOccurrenceKey: gatheringKey(g.id),
    localDate: toDbDate(slot.localDate),
    localTime: slot.localTime,
    scheduledAtUtc: slot.scheduledAtUtc,
    placeId: g.placeId,
    reminderSentAt: null,
  }
  if (reuse) {
    // A recurrence-generated item is detached so later recurrence edits never touch the gathering.
    await tx.calendarItem.update({ where: { id: reuse.id }, data: { ...link, recurrenceId: null, isUserAdjusted: true } })
    return reuse.id
  }
  const item = await tx.calendarItem.create({
    data: {
      ownerId: userId,
      activityId: g.activityId!,
      activityRevisionId: g.activity!.latestPublishedRevisionId!,
      idempotencyKey: `gathering:${g.id}:${userId}:${randomUUID()}`,
      ...link,
    },
  })
  return item.id
}

/** Leaves a gathering: the member's item stays on their Calendar as a personal occurrence (decision 2). */
export async function departInTx(tx: Tx, groupId: string, userId: string) {
  const m = await tx.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } })
  if (!m || m.status !== 'ACTIVE') return null
  if (m.role === 'OWNER') {
    const next = await tx.groupMember.findFirst({ where: { groupId, status: 'ACTIVE', userId: { not: userId } }, orderBy: { createdAt: 'asc' } })
    if (next) {
      await tx.groupMember.update({ where: { groupId_userId: { groupId, userId: next.userId } }, data: { role: 'OWNER' } })
      await tx.programGroup.update({ where: { id: groupId }, data: { ownerId: next.userId } })
    } else {
      await tx.programGroup.update({ where: { id: groupId }, data: { status: 'CLOSED' } })
    }
  }
  await tx.groupMember.update({ where: { groupId_userId: { groupId, userId } }, data: { status: 'LEFT', role: 'MEMBER' } })
  await tx.completionShare.updateMany({ where: { groupId, userId, revokedAt: null }, data: { revokedAt: new Date() } })
  await tx.groupInvitation.updateMany({ where: { groupId, createdById: userId, status: 'PENDING' }, data: { status: 'REVOKED' } })
  const item = await tx.calendarItem.findFirst({ where: { gatheringId: groupId, ownerId: userId } })
  if (item) await tx.calendarItem.update({ where: { id: item.id }, data: { gatheringId: null, groupOccurrenceKey: null } })
  return item?.id ?? null
}

// ── Writing ─────────────────────────────────────────────────────────────────

function checkMoment(localDate: string, localTime: string | null | undefined) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) throw badRequest('Choose a date', { localDate: 'must be YYYY-MM-DD' })
  if (localTime != null && !HHMM.test(localTime)) throw badRequest('Time must be HH:MM', { localTime: 'must be HH:MM' })
}

function checkCapacity(capacity: number | null | undefined) {
  if (capacity == null) return
  if (!Number.isInteger(capacity) || capacity < 1) throw badRequest('Capacity must be at least 1', { capacity: 'must be a whole number of at least 1' })
}

export async function create(
  userId: string,
  activityId: string,
  input: { localDate: string; localTime?: string | null; placeId?: string | null; calendarItemId?: string | null; listPublicly?: boolean; capacity?: number | null; idempotencyKey: string },
) {
  const { idempotencyKey, ...request } = input
  return withIdempotency({
    userId,
    scope: 'gathering:create',
    key: idempotencyKey,
    request: { activityId, ...request },
    load: async (ref) => {
      const [groupId, calendarItemId] = ref.split('|')
      return { gathering: await get(userId, groupId!), calendarItemId: calendarItemId! }
    },
    run: async () => {
      checkMoment(input.localDate, input.localTime)
      checkCapacity(input.capacity)
      const activity = await db.activity.findUnique({ where: { id: activityId } })
      // Only published Activities others can read can be gathered around (10 §9.4).
      if (!activity || activity.moderatedAt || activity.status !== 'PUBLISHED' || !activity.latestPublishedRevisionId) throw notFound('Activity')
      if (activity.visibility === 'PRIVATE') throw badRequest('Only shared Activities can have gatherings', { activityId: 'is private' })
      if (input.listPublicly && activity.visibility !== 'PUBLIC') throw badRequest('Only public Activities can be listed publicly', { listPublicly: 'requires a public Activity' })
      if (input.placeId) await assertActivePlace(input.placeId)
      const placeId = input.placeId === undefined ? activity.placeId : input.placeId
      const timezone = await timezoneOf(userId)
      if (isPast({ startLocalDate: toDbDate(input.localDate), startLocalTime: input.localTime ?? null, timezone })) {
        throw badRequest('Choose a time that has not passed', { localDate: 'is in the past' })
      }
      const result = await db.$transaction(async (tx) => {
        const created = await tx.programGroup.create({
          data: {
            kind: 'GATHERING',
            activityId,
            ownerId: userId,
            startLocalDate: toDbDate(input.localDate),
            startLocalTime: input.localTime ?? null,
            timezone,
            placeId,
            capacity: input.capacity ?? null,
            // Private and invite-only unless listing publicly was chosen (decision 3).
            visibility: input.listPublicly ? 'PUBLIC' : 'PRIVATE',
            joinPolicy: input.listPublicly ? 'OPEN' : 'INVITE_ONLY',
            joinLinkEnabled: true,
            memberLinkSharingEnabled: true,
            members: { create: { userId, role: 'OWNER', status: 'ACTIVE', joinedAt: new Date() } },
          },
        })
        const g = await load(created.id, tx)
        const calendarItemId = await linkItem(tx, g, userId, input.calendarItemId)
        return { groupId: g.id, calendarItemId }
      })
      return {
        ref: `${result.groupId}|${result.calendarItemId}`,
        result: { gathering: await get(userId, result.groupId), calendarItemId: result.calendarItemId },
      }
    },
  })
}

export async function join(userId: string, groupId: string, input: { invite?: string; idempotencyKey: string }) {
  const { idempotencyKey, ...request } = input
  return withIdempotency({
    userId,
    scope: 'gathering:join',
    key: idempotencyKey,
    request: { groupId, ...request },
    load: async (ref) => ({ gathering: await get(userId, groupId), calendarItemId: ref }),
    run: async () => {
      const g = await load(groupId)
      if (!(await canView(userId, g, input.invite))) throw notFound('Gathering')
      const member = await db.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } })
      if (member?.status !== 'ACTIVE') {
        if (g.status !== 'ACTIVE') throw conflict('This gathering is closed')
        if (member?.status === 'REMOVED') throw notFound('Gathering')
        const viaLink = await validInvite(groupId, input.invite)
        if (!viaLink && (g.visibility !== 'PUBLIC' || g.joinPolicy !== 'OPEN')) throw notFound('Gathering')
        if (isPast(g)) throw conflict('This gathering has already started')
        const count = await db.groupMember.count({ where: { groupId, status: 'ACTIVE' } })
        if (g.capacity !== null && count >= g.capacity) throw conflict('This gathering is full')
      }
      const calendarItemId = await db.$transaction(async (tx) => {
        if (member?.status !== 'ACTIVE') {
          await tx.groupMember.upsert({
            where: { groupId_userId: { groupId, userId } },
            create: { groupId, userId, role: 'MEMBER', status: 'ACTIVE', joinedAt: new Date() },
            update: { status: 'ACTIVE', role: 'MEMBER', joinedAt: new Date() },
          })
          await enqueue(tx, 'GroupMemberJoined', { groupId, userId })
        }
        return linkItem(tx, g, userId)
      })
      return { ref: calendarItemId, result: { gathering: await get(userId, groupId), calendarItemId } }
    },
  })
}

export async function leave(userId: string, groupId: string) {
  await load(groupId)
  const calendarItemId = await db.$transaction((tx) => departInTx(tx, groupId, userId))
  if (calendarItemId === null) {
    const m = await db.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } })
    if (!m || m.status !== 'ACTIVE') throw notFound('Gathering')
  }
  return { calendarItemId }
}

export async function update(
  userId: string,
  groupId: string,
  input: { localDate?: string; localTime?: string | null; placeId?: string | null; capacity?: number | null; listPublicly?: boolean; close?: boolean },
) {
  const g = await load(groupId)
  if (g.ownerId !== userId) throw forbidden('Only the gathering owner can do that')
  if (g.status !== 'ACTIVE') throw conflict('This gathering is closed')
  if (input.localDate !== undefined) checkMoment(input.localDate, input.localTime)
  else if (input.localTime != null && !HHMM.test(input.localTime)) throw badRequest('Time must be HH:MM', { localTime: 'must be HH:MM' })
  checkCapacity(input.capacity)
  if (input.placeId) await assertActivePlace(input.placeId)
  if (input.listPublicly && g.activity!.visibility !== 'PUBLIC') throw badRequest('Only public Activities can be listed publicly', { listPublicly: 'requires a public Activity' })
  const memberCount = await db.groupMember.count({ where: { groupId, status: 'ACTIVE' } })
  if (input.capacity != null && input.capacity < memberCount) throw badRequest(`${memberCount} people have already joined`, { capacity: 'is below the current member count' })

  const moved = input.localDate !== undefined || input.localTime !== undefined || input.placeId !== undefined
  const next = {
    startLocalDate: input.localDate !== undefined ? toDbDate(input.localDate) : g.startLocalDate,
    startLocalTime: input.localTime !== undefined ? input.localTime : g.startLocalTime,
    timezone: g.timezone,
  }
  if (moved && isPast(next)) throw badRequest('Choose a time that has not passed', { localDate: 'is in the past' })

  await db.$transaction(async (tx) => {
    await tx.programGroup.update({
      where: { id: groupId },
      data: {
        startLocalDate: next.startLocalDate,
        startLocalTime: next.startLocalTime,
        placeId: input.placeId,
        capacity: input.capacity,
        ...(input.listPublicly === undefined
          ? {}
          : input.listPublicly
            ? { visibility: 'PUBLIC', joinPolicy: 'OPEN' }
            : { visibility: 'PRIVATE', joinPolicy: 'INVITE_ONLY' }),
        ...(input.close ? { status: 'CLOSED' } : {}),
      },
    })
    const items = await tx.calendarItem.findMany({ where: { gatheringId: groupId } })
    if (input.close) {
      // Closing keeps every member's item as a personal occurrence (10 §9.6).
      await tx.calendarItem.updateMany({ where: { gatheringId: groupId }, data: { gatheringId: null, groupOccurrenceKey: null } })
    } else if (moved) {
      // Linked items move with the gathering, each in its member's own timezone.
      const placeId = input.placeId !== undefined ? input.placeId : g.placeId
      for (const item of items) {
        const slot = memberSlot(next, await timezoneOf(item.ownerId, tx))
        await tx.calendarItem.update({
          where: { id: item.id },
          data: { localDate: toDbDate(slot.localDate), localTime: slot.localTime, scheduledAtUtc: slot.scheduledAtUtc, placeId, reminderSentAt: null },
        })
      }
    }
    if (moved || input.close) {
      await enqueue(tx, 'GatheringChanged', { groupId, actorId: userId, closed: !!input.close, itemIds: items.map((i) => i.id) })
    }
  })
  return get(userId, groupId)
}

/** A share link for this exact occurrence: an existing LINK invitation, token shown once (10 §9.7). */
export async function createLink(userId: string, groupId: string) {
  const g = await load(groupId)
  const m = await db.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } })
  if (!m || m.status !== 'ACTIVE') throw notFound('Gathering')
  if (g.status !== 'ACTIVE') throw conflict('This gathering is closed')
  const token = newToken()
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
  await db.groupInvitation.create({ data: { groupId, kind: 'LINK', createdById: userId, tokenHash: sha256(token), expiresAt } })
  return { url: `${appBase()}/gatherings/${groupId}?invite=${encodeURIComponent(token)}`, expiresAt: expiresAt.toISOString() }
}
