// Personal calendar (09-CALENDARS.md). Every item is one dated occurrence of one Activity.
import { db, type CalendarItem, type Prisma } from '@project/db'
import { badRequest, conflict, notFound, versionConflict } from '../../lib/errors'
import { withIdempotency } from '../../lib/idempotency'
import { addDays, diffDays, fromDbDate, localToUtc, todayIn, toDbDate, type LocalDate } from '../../lib/time'
import { canUseActivity, isOwner as isActivityOwner } from '../activities/access'
import { calendarVisual, loadCalendarRevisions } from '../activities/mapper'
import { activeGrantWhere } from '../programs/access'
import { mediaUrl } from '../media/urls'
import { HORIZON_DAYS, materializeEnrollment } from './materialize'
import { materializeRecurrence, parseRule, type RecurrenceRule } from './recurrence'
import { evaluate } from './achievements'

type Tx = Prisma.TransactionClient
const MAX_RANGE_DAYS = 62

export async function userTimezone(userId: string) {
  return (await db.userPreference.findUnique({ where: { userId } }))?.timezone ?? 'UTC'
}

const itemInclude = {
  enrollment: { include: { program: { include: { policy: true } }, version: true, group: true } },
} satisfies Prisma.CalendarItemInclude
type ItemRow = Prisma.CalendarItemGetPayload<{ include: typeof itemInclude }>

/** Projects items for display: titles, thumbnails, conflicts, lock state, group signals. */
export async function toCalendarItems(userId: string, items: ItemRow[]) {
  const revs = await loadCalendarRevisions(items.map((i) => i.activityRevisionId))
  // Locked: Program content requires an entitlement the user no longer has (subscription lapsed).
  const lockedProgramIds = new Set(
    items
      .map((i) => i.enrollment?.program)
      .filter((p): p is NonNullable<typeof p> => !!p && p.creatorId !== userId && (p.policy?.accessMode ?? 'OPEN') !== 'OPEN')
      .map((p) => p.id),
  )
  const granted = new Set(
    lockedProgramIds.size
      ? (await db.programAccessGrant.findMany({ where: { userId, programId: { in: [...lockedProgramIds] }, ...activeGrantWhere() }, select: { programId: true } })).map((g) => g.programId)
      : [],
  )
  const keys = [...new Set(items.map((i) => i.groupOccurrenceKey).filter(Boolean))] as string[]
  const unread = keys.length
    ? await db.notification.groupBy({ by: ['groupOccurrenceKey'], where: { recipientId: userId, readAt: null, groupOccurrenceKey: { in: keys } }, _count: { _all: true } })
    : []
  const unreadByKey = new Map(unread.map((u) => [u.groupOccurrenceKey!, u._count._all]))
  const groupIds = [...new Set(items.map((i) => i.enrollment?.groupId).filter(Boolean))] as string[]
  const members = groupIds.length
    ? await db.groupMember.findMany({ where: { groupId: { in: groupIds }, status: 'ACTIVE', userId: { not: userId } }, include: { user: { include: { profile: true } } }, take: 50 })
    : []
  const membersByGroup = new Map<string, typeof members>()
  for (const m of members) {
    const list = membersByGroup.get(m.groupId)
    if (list) list.push(m)
    else membersByGroup.set(m.groupId, [m])
  }
  const sessions = await db.activitySession.findMany({
    where: { userId, calendarItemId: { in: items.map((i) => i.id) }, status: { in: ['ACTIVE', 'PAUSED', 'FINISHED'] } },
    orderBy: { createdAt: 'desc' },
  })
  const shares = keys.length ? await db.completionShare.findMany({
    where: {
      occurrenceKey: { in: keys },
      groupId: { in: groupIds },
      revokedAt: null,
      // Runs ended by leaving or restarting are history, not current participation (10 §3).
      OR: [{ calendarItemId: { in: items.map((i) => i.id) } }, { calendarItem: { enrollment: { status: { not: 'LEFT' } } } }],
    },
    select: { groupId: true, occurrenceKey: true, userId: true },
  }) : []
  // Timed items sharing a local date and time are flagged on both tiles (03 §5).
  const slots = new Map<string, number>()
  for (const i of items) {
    if (!i.localTime || i.status === 'CANCELLED') continue
    const slot = `${fromDbDate(i.localDate)} ${i.localTime}`
    slots.set(slot, (slots.get(slot) ?? 0) + 1)
  }

  return items.map((i) => {
    const rev = revs.get(i.activityRevisionId) ?? null
    const program = i.enrollment?.program ?? null
    const locked = !!program && lockedProgramIds.has(program.id) && !granted.has(program.id)
    const { thumbnailUrl, hasPrivateAttachment } = calendarVisual(rev)
    const date = fromDbDate(i.localDate)
    const groupMembers = i.enrollment?.groupId ? membersByGroup.get(i.enrollment.groupId) ?? [] : []
    const avatars = groupMembers
      .slice(0, 4)
      .map((m) => mediaUrl(m.user.profile?.avatarMediaId) ?? '')
      .filter(Boolean)
    const session = sessions.find((s) => s.calendarItemId === i.id)
    return {
      sessionStatus: session?.status ?? null,
      activeSeconds: session ? session.activeSeconds + (session.status === 'ACTIVE' && session.lastResumedAt ? Math.max(0, Math.floor((Date.now() - session.lastResumedAt.getTime()) / 1000)) : 0) : null,
      groupName: i.enrollment?.group ? i.enrollment.group.name ?? `${i.enrollment.version.title} group` : null,
      sharedCompletionCount: i.enrollment?.groupId ? shares.filter((s) => s.groupId === i.enrollment!.groupId && s.occurrenceKey === i.groupOccurrenceKey).length : null,
      id: i.id,
      localDate: date,
      localTime: i.localTime,
      status: i.status,
      title: rev?.titleSnapshot ?? 'Activity',
      activityId: i.activityId,
      activityRevisionId: i.activityRevisionId,
      programTitle: i.enrollment?.version.title ?? null,
      enrollmentId: i.enrollmentId,
      programDayIndex: i.programDayIndex,
      recurrenceId: i.recurrenceId,
      conflict: !!i.localTime && (slots.get(`${date} ${i.localTime}`) ?? 0) > 1,
      locked,
      thumbnailUrl: locked && hasPrivateAttachment ? null : thumbnailUrl,
      participantAvatars: avatars,
      unreadCount: i.groupOccurrenceKey ? unreadByKey.get(i.groupOccurrenceKey) ?? 0 : 0,
      updatedAt: i.updatedAt.toISOString(),
    }
  })
}

/** 09 §4.11: what an open (not done, not cancelled) item on `localDate` reads as. */
export function openStatus(enrollment: { participationStartDate: Date | null } | null | undefined, localDate: string) {
  const joined = enrollment?.participationStartDate
  return joined && localDate < fromDbDate(joined) ? ('NOT_PARTICIPATING' as const) : ('PLANNED' as const)
}

export async function ownItem(tx: Tx, userId: string, itemId: string) {
  const item = await tx.calendarItem.findUnique({ where: { id: itemId }, include: itemInclude })
  if (!item || item.ownerId !== userId) throw notFound('Calendar item')
  return item
}

export async function itemDto(userId: string, itemId: string) {
  return (await toCalendarItems(userId, [await ownItem(db, userId, itemId)]))[0]!
}

export async function list(userId: string, query: { start: string; end: string }) {
  if (query.end < query.start) throw badRequest('End must be on or after start', { end: 'is before start' })
  if (diffDays(query.end, query.start) > MAX_RANGE_DAYS) throw badRequest(`Ask for at most ${MAX_RANGE_DAYS} days`, { end: 'range too long' })
  await extendHorizons(userId, query.end)
  const items = await db.calendarItem.findMany({
    where: { ownerId: userId, status: { not: 'CANCELLED' }, localDate: { gte: toDbDate(query.start), lte: toDbDate(query.end) } },
    orderBy: [{ localDate: 'asc' }, { localTime: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    include: itemInclude,
  })
  return toCalendarItems(userId, items)
}

/**
 * Generates on demand when a user looks beyond the stored horizon (05 §9); the worker does the
 * same daily. Never explodes an ongoing rule into unbounded rows.
 */
async function extendHorizons(userId: string, through: LocalDate) {
  const tz = await userTimezone(userId)
  const limit = addDays(todayIn(tz), HORIZON_DAYS + 62)
  const target = through < limit ? through : limit
  const recurrences = await db.calendarRecurrence.findMany({ where: { ownerId: userId, status: 'ACTIVE', OR: [{ generatedThroughDate: null }, { generatedThroughDate: { lt: toDbDate(target) } }] } })
  for (const r of recurrences) {
    const from = r.generatedThroughDate ? addDays(fromDbDate(r.generatedThroughDate), 1) : fromDbDate(r.anchorDate)
    await db.$transaction((tx) => materializeRecurrence(tx, r, { from, through: target }))
  }
  const enrollments = await db.programEnrollment.findMany({
    where: { userId, status: { in: ['ACTIVE', 'PAUSED'] }, version: { durationDays: null }, OR: [{ generatedThroughDate: null }, { generatedThroughDate: { lt: toDbDate(target) } }] },
    include: { version: { include: { items: true } } },
  })
  for (const e of enrollments) {
    const from = e.generatedThroughDate ? addDays(fromDbDate(e.generatedThroughDate), 1) : fromDbDate(e.startLocalDate)
    await db.$transaction((tx) => materializeEnrollment(tx, e, e.version, e.version.items, { from, through: target }))
  }
}

async function pinRevision(userId: string, activityId: string, revisionId?: string) {
  const a = await db.activity.findUnique({ where: { id: activityId } })
  if (!a || !canUseActivity(a, userId) || a.status === 'ARCHIVED') throw badRequest('That activity is not available', { activityId: 'not available' })
  if (revisionId) {
    const r = await db.activityRevision.findFirst({ where: { id: revisionId, activityId } })
    if (!r || (!isActivityOwner(a, userId) && !r.publishedAt)) throw badRequest('That version is not available', { revisionId: 'not available' })
    return r.id
  }
  if (isActivityOwner(a, userId)) {
    return (await db.activityRevision.findFirstOrThrow({ where: { activityId }, orderBy: { revisionNumber: 'desc' } })).id
  }
  return a.latestPublishedRevisionId!
}

export async function add(
  userId: string,
  input: {
    activityId: string
    revisionId?: string
    localDate: string
    localTime?: string | null
    recurrence?: RecurrenceRule | null
    untilDate?: string | null
    targetOverrides?: Record<string, unknown> | null
    idempotencyKey: string
  },
) {
  const { idempotencyKey, ...request } = input
  if (input.untilDate && input.untilDate < input.localDate) throw badRequest('The end date is before the start', { untilDate: 'is before localDate' })
  if (input.recurrence?.kind === 'WEEKLY' && input.recurrence.weekdays?.some((d) => d < 0 || d > 6)) throw badRequest('Weekdays are 0–6', { 'recurrence.weekdays': 'out of range' })
  const tz = await userTimezone(userId)
  return withIdempotency({
    userId,
    scope: 'calendar:add',
    key: idempotencyKey,
    request,
    load: async (ref) => {
      const [itemId, recurrenceId] = ref.split('|')
      return result(userId, itemId!, recurrenceId || null)
    },
    run: async () => {
      const revisionId = await pinRevision(userId, input.activityId, input.revisionId)
      const { itemId, recurrenceId, createdCount } = await db.$transaction(async (tx) => {
        if (input.recurrence) {
          const r = await tx.calendarRecurrence.create({
            data: {
              ownerId: userId,
              activityId: input.activityId,
              activityRevisionId: revisionId,
              rule: input.recurrence as Prisma.InputJsonValue,
              anchorDate: toDbDate(input.localDate),
              localTime: input.localTime ?? null,
              timezone: tz,
              untilDate: input.untilDate ? toDbDate(input.untilDate) : null,
            },
          })
          const createdCount = await materializeRecurrence(tx, r, { from: input.localDate, through: addDays(todayIn(tz) > input.localDate ? todayIn(tz) : input.localDate, HORIZON_DAYS) })
          const first = await tx.calendarItem.findFirst({ where: { recurrenceId: r.id }, orderBy: { localDate: 'asc' } })
          if (!first) throw badRequest('That rule never happens in the chosen range', { recurrence: 'has no occurrences' })
          return { itemId: first.id, recurrenceId: r.id, createdCount }
        }
        const item = await tx.calendarItem.create({
          data: {
            ownerId: userId,
            activityId: input.activityId,
            activityRevisionId: revisionId,
            idempotencyKey: `add:${userId}:${idempotencyKey}`,
            localDate: toDbDate(input.localDate),
            localTime: input.localTime ?? null,
            scheduledAtUtc: input.localTime ? localToUtc(input.localDate, input.localTime, tz) : null,
            targetOverrides: (input.targetOverrides ?? undefined) as Prisma.InputJsonValue | undefined,
          },
        })
        return { itemId: item.id, recurrenceId: null, createdCount: 1 }
      })
      return { ref: `${itemId}|${recurrenceId ?? ''}`, result: { ...(await result(userId, itemId, recurrenceId)), createdCount } }
    },
  })
}

async function result(userId: string, itemId: string, recurrenceId: string | null) {
  const createdCount = recurrenceId ? await db.calendarItem.count({ where: { recurrenceId } }) : 1
  return { item: await itemDto(userId, itemId), recurrence: recurrenceId ? await recurrenceDto(userId, recurrenceId) : null, createdCount }
}

/** End a recurrence before `date` and cancel its future untouched items (This and future). */
async function splitRecurrence(tx: Tx, recurrenceId: string, date: LocalDate) {
  await tx.calendarRecurrence.update({ where: { id: recurrenceId }, data: { untilDate: toDbDate(addDays(date, -1)) } })
  await tx.calendarItem.updateMany({
    where: { recurrenceId, status: 'PLANNED', isUserAdjusted: false, localDate: { gte: toDbDate(date) }, sessions: { none: {} } },
    data: { status: 'CANCELLED' },
  })
}

export async function update(
  userId: string,
  itemId: string,
  input: { localDate?: string; localTime?: string | null; status?: CalendarItem['status']; targetOverrides?: Record<string, unknown> | null; scope?: 'THIS_ONE' | 'THIS_AND_FUTURE'; expectedUpdatedAt: string },
) {
  if (input.status === 'DONE') throw badRequest('Finish the activity to complete it', { status: 'DONE is set by finishing a session' })
  if (input.status === 'NOT_PARTICIPATING') throw badRequest('Not participating is set by the server', { status: 'is set by the server' })
  const tz = await userTimezone(userId)
  await db.$transaction(async (tx) => {
    const item = await ownItem(tx, userId, itemId)
    if (item.updatedAt.toISOString() !== new Date(input.expectedUpdatedAt).toISOString()) throw versionConflict()
    if (input.status && item.status === 'DONE') throw badRequest('Undo the completion first', { status: 'item is done' })

    if (input.scope === 'THIS_AND_FUTURE' && item.recurrenceId) {
      // Edit = end the old rule here and start a new one with the changes (09 §4.8).
      const r = await tx.calendarRecurrence.findUniqueOrThrow({ where: { id: item.recurrenceId } })
      const from = fromDbDate(item.localDate)
      await splitRecurrence(tx, r.id, from)
      if (input.status === 'CANCELLED' || input.status === 'SKIPPED') return
      const shift = input.localDate ? diffDays(input.localDate, from) : 0
      const next = await tx.calendarRecurrence.create({
        data: {
          ownerId: userId,
          activityId: r.activityId,
          activityRevisionId: r.activityRevisionId,
          rule: shiftRule(parseRule(r.rule), shift) as Prisma.InputJsonValue,
          anchorDate: toDbDate(input.localDate ?? from),
          localTime: input.localTime === undefined ? r.localTime : input.localTime,
          timezone: tz,
          untilDate: r.untilDate,
        },
      })
      await tx.calendarItem.update({ where: { id: item.id }, data: { status: 'CANCELLED' } })
      await materializeRecurrence(tx, next, { from: input.localDate ?? from, through: addDays(todayIn(tz), HORIZON_DAYS) })
      return
    }

    const localDate = input.localDate ?? fromDbDate(item.localDate)
    const localTime = input.localTime === undefined ? item.localTime : input.localTime
    const moved = input.localDate !== undefined || input.localTime !== undefined
    // Restoring or moving an open item re-derives PLANNED vs NOT_PARTICIPATING from its new date.
    const open = item.status === 'PLANNED' || item.status === 'NOT_PARTICIPATING'
    const status = input.status === 'PLANNED' || (input.status === undefined && open && moved) ? openStatus(item.enrollment, localDate) : input.status
    await tx.calendarItem.update({
      where: { id: item.id },
      data: {
        localDate: toDbDate(localDate),
        localTime,
        scheduledAtUtc: localTime ? localToUtc(localDate, localTime, tz) : null,
        status,
        targetOverrides: input.targetOverrides === undefined ? undefined : ((input.targetOverrides ?? undefined) as Prisma.InputJsonValue | undefined),
        ...(moved
          ? { isUserAdjusted: true, movedFromDate: item.movedFromDate ?? item.localDate, reminderSentAt: null }
          : input.status
            ? { isUserAdjusted: true }
            : {}),
      },
    })
  })
  return itemDto(userId, itemId)
}

function shiftRule(rule: RecurrenceRule, days: number): RecurrenceRule {
  if (rule.kind !== 'WEEKLY' || !rule.weekdays || days % 7 === 0) return rule
  return { ...rule, weekdays: rule.weekdays.map((d) => (((d + days) % 7) + 7) % 7) }
}

export async function cancel(userId: string, itemId: string, scope: 'THIS_ONE' | 'THIS_AND_FUTURE' = 'THIS_ONE') {
  await db.$transaction(async (tx) => {
    const item = await ownItem(tx, userId, itemId)
    if (item.status === 'DONE') throw badRequest('Undo the completion first', { status: 'item is done' })
    if (scope === 'THIS_AND_FUTURE' && item.recurrenceId) await splitRecurrence(tx, item.recurrenceId, fromDbDate(item.localDate))
    await tx.calendarItem.update({ where: { id: item.id }, data: { status: 'CANCELLED', isUserAdjusted: true } })
  })
  return itemDto(userId, itemId)
}

/** One-tap Move for a conflict: the next free half hour that day (until 22:00), else the next day. */
export async function moveToOpenSlot(userId: string, itemId: string) {
  const tz = await userTimezone(userId)
  await db.$transaction(async (tx) => {
    const item = await ownItem(tx, userId, itemId)
    const date = fromDbDate(item.localDate)
    let target = { date: addDays(date, 1), time: item.localTime }
    if (item.localTime) {
      const taken = new Set(
        (await tx.calendarItem.findMany({ where: { ownerId: userId, id: { not: item.id }, localDate: item.localDate, status: { not: 'CANCELLED' }, localTime: { not: null } }, select: { localTime: true } })).map((r) => r.localTime),
      )
      const [h, m] = item.localTime.split(':').map(Number) as [number, number]
      for (let t = h * 60 + m + 30; t <= 22 * 60; t += 30) {
        const time = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
        if (!taken.has(time)) {
          target = { date, time }
          break
        }
      }
    }
    await tx.calendarItem.update({
      where: { id: item.id },
      data: {
        localDate: toDbDate(target.date),
        localTime: target.time,
        scheduledAtUtc: target.time ? localToUtc(target.date, target.time, tz) : null,
        ...(item.status === 'PLANNED' || item.status === 'NOT_PARTICIPATING' ? { status: openStatus(item.enrollment, target.date) } : {}),
        isUserAdjusted: true,
        movedFromDate: item.movedFromDate ?? item.localDate,
        reminderSentAt: null,
      },
    })
  })
  return itemDto(userId, itemId)
}

/** Audited correction (09 §3): completion reverts, sessions and media stay, milestones re-evaluate. */
export async function undoCompletion(userId: string, itemId: string) {
  await db.$transaction(async (tx) => {
    const item = await ownItem(tx, userId, itemId)
    if (item.status !== 'DONE') throw conflict('This activity is not marked done')
    // A catch-up on a pre-join date returns to Not Participating, not Missed (09 §4.11).
    await tx.calendarItem.update({ where: { id: item.id }, data: { status: openStatus(item.enrollment, fromDbDate(item.localDate)) } })
    await tx.completionShare.updateMany({ where: { calendarItemId: item.id, revokedAt: null }, data: { revokedAt: new Date() } })
    await tx.outboxEvent.create({ data: { type: 'CompletionUndone', payload: { userId, calendarItemId: item.id } } })
    await evaluate(tx, userId, { enrollmentId: item.enrollmentId, sourceCalendarItemId: null })
  })
  return itemDto(userId, itemId)
}

// ── Recurrences ─────────────────────────────────────────────────────────────

async function recurrenceDto(userId: string, id: string) {
  const r = await db.calendarRecurrence.findUnique({ where: { id } })
  if (!r || r.ownerId !== userId) throw notFound('Recurring entry')
  const rev = await db.activityRevision.findUnique({ where: { id: r.activityRevisionId }, select: { titleSnapshot: true } })
  return {
    id: r.id,
    activityId: r.activityId,
    title: rev?.titleSnapshot ?? 'Activity',
    rule: parseRule(r.rule),
    anchorDate: fromDbDate(r.anchorDate),
    localTime: r.localTime,
    untilDate: r.untilDate ? fromDbDate(r.untilDate) : null,
    status: r.status,
  }
}

export async function listRecurrences(userId: string) {
  const rows = await db.calendarRecurrence.findMany({ where: { ownerId: userId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } })
  return Promise.all(rows.map((r) => recurrenceDto(userId, r.id)))
}

export async function updateRecurrence(
  userId: string,
  id: string,
  input: { rule?: RecurrenceRule; localTime?: string | null; untilDate?: string | null; effectiveFromDate: string },
) {
  const tz = await userTimezone(userId)
  const created = await db.$transaction(async (tx) => {
    const r = await tx.calendarRecurrence.findUnique({ where: { id } })
    if (!r || r.ownerId !== userId || r.status !== 'ACTIVE') throw notFound('Recurring entry')
    const from = input.effectiveFromDate < fromDbDate(r.anchorDate) ? fromDbDate(r.anchorDate) : input.effectiveFromDate
    await splitRecurrence(tx, r.id, from)
    if (from <= fromDbDate(r.anchorDate)) await tx.calendarRecurrence.update({ where: { id: r.id }, data: { status: 'ENDED' } })
    const next = await tx.calendarRecurrence.create({
      data: {
        ownerId: userId,
        activityId: r.activityId,
        activityRevisionId: r.activityRevisionId,
        rule: (input.rule ?? r.rule) as Prisma.InputJsonValue,
        anchorDate: toDbDate(from),
        localTime: input.localTime === undefined ? r.localTime : input.localTime,
        timezone: tz,
        untilDate: input.untilDate === undefined ? r.untilDate : input.untilDate ? toDbDate(input.untilDate) : null,
      },
    })
    await materializeRecurrence(tx, next, { from, through: addDays(todayIn(tz), HORIZON_DAYS) })
    return next
  })
  return recurrenceDto(userId, created.id)
}

export async function endRecurrence(userId: string, id: string, effectiveFromDate: string) {
  await db.$transaction(async (tx) => {
    const r = await tx.calendarRecurrence.findUnique({ where: { id } })
    if (!r || r.ownerId !== userId) throw notFound('Recurring entry')
    await splitRecurrence(tx, r.id, effectiveFromDate)
    await tx.calendarRecurrence.update({ where: { id }, data: { status: 'ENDED' } })
  })
  return recurrenceDto(userId, id)
}
