// Joining and following a Program (07-PROGRAMS.md §4–6, 09-CALENDARS.md §4).
// Enrollment = participation; AccessGrant = entitlement; billing lives elsewhere. Never conflated.
import { db, type Prisma, type ProgramEnrollment } from '@project/db'
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors'
import { withIdempotency } from '../../lib/idempotency'
import { enqueue } from '../../lib/outbox'
import { afterCursor, offsetArgs, pageArgs, pageOrder, toOffsetPage, toPage, type PageQuery } from '../../lib/paging'
import { addDays, fromDbDate, isValidTimeZone, todayIn, toDbDate, weekday, type LocalDate } from '../../lib/time'
import { HORIZON_DAYS, materializeEnrollment } from '../calendar/materialize'
import { activeGrantWhere, canSeeProgram, isProgramOwner, resolveAccess } from './access'
import { programInclude, toProgramSummary } from './mapper'
import { parseFrequency } from './schedule'
import { toUserSummary } from '../users/mapper'

const LIVE: ProgramEnrollment['status'][] = ['ACTIVE', 'PAUSED', 'PENDING_ACCESS']
const activeKey = (userId: string, programId: string) => `${userId}:${programId}`

async function toEnrollment(e: ProgramEnrollment) {
  const p = await db.program.findUniqueOrThrow({ where: { id: e.programId }, include: programInclude })
  const calendarItemCount = await db.calendarItem.count({ where: { enrollmentId: e.id, status: { not: 'CANCELLED' } } })
  return {
    id: e.id,
    program: toProgramSummary(p, await resolveAccess(e.userId, p)),
    programVersionId: e.programVersionId,
    pendingVersionId: e.pendingVersionId,
    groupId: e.groupId,
    startLocalDate: fromDbDate(e.startLocalDate),
    timezone: e.timezone,
    status: e.status,
    calendarItemCount,
  }
}

async function ownEnrollment(userId: string, enrollmentId: string) {
  const e = await db.programEnrollment.findUnique({ where: { id: enrollmentId } })
  if (!e || e.userId !== userId) throw notFound('Enrollment')
  return e
}

async function joinableVersion(viewerId: string, programId: string, versionId: string) {
  const p = await db.program.findUnique({ where: { id: programId }, include: { policy: true } })
  if (!p || !(await canSeeProgram(viewerId, p))) throw notFound('Program')
  if (p.status !== 'PUBLISHED') throw forbidden('This program is not open for new participants')
  const version = await db.programVersion.findFirst({
    where: { id: versionId, programId, publishedAt: { not: null } },
    include: { items: { orderBy: [{ relativeDay: 'asc' }, { position: 'asc' }] } },
  })
  if (!version) throw badRequest('Choose a published version of this program', { programVersionId: 'not found' })
  return { program: p, version }
}

/** WEEKDAYS programs start on a Monday by default (07 §7); others start today. */
function suggestedStart(frequency: unknown, today: LocalDate) {
  if (parseFrequency(frequency).kind !== 'WEEKDAYS') return today
  const wd = weekday(today)
  return wd === 1 ? today : addDays(today, (8 - wd) % 7)
}

export async function preview(userId: string, programId: string, input: { programVersionId: string; startLocalDate: string; timezone: string }) {
  if (!isValidTimeZone(input.timezone)) throw badRequest('Unknown timezone', { timezone: 'is not a valid IANA timezone' })
  const { version } = await joinableVersion(userId, programId, input.programVersionId)
  const start = input.startLocalDate
  const until = addDays(start, 13) // the first two weeks
  const cycle = version.durationDays ?? version.cycleDays ?? 7
  const occurrences: { localDate: string; localTime: string | null; activityRevisionId: string; programDayIndex: number; position: number }[] = []
  for (let c = 0; addDays(start, c * cycle) <= until; c++) {
    for (const i of version.items) {
      const d = addDays(start, c * cycle + i.relativeDay)
      if (d <= until) occurrences.push({ localDate: d, localTime: i.localTime, activityRevisionId: i.activityRevisionId, programDayIndex: c * cycle + i.relativeDay, position: i.position })
    }
    if (version.durationDays !== null) break
  }
  occurrences.sort((a, b) => a.localDate.localeCompare(b.localDate) || (a.localTime ?? '').localeCompare(b.localTime ?? '') || a.position - b.position)
  const titles = new Map(
    (await db.activityRevision.findMany({ where: { id: { in: [...new Set(version.items.map((i) => i.activityRevisionId))] } }, select: { id: true, titleSnapshot: true } })).map((r) => [r.id, r.titleSnapshot]),
  )
  // 03 §5: overlap is allowed; timed items sharing a local time are flagged.
  const existing = await db.calendarItem.findMany({
    where: { ownerId: userId, status: { in: ['PLANNED', 'DONE'] }, localTime: { not: null }, localDate: { gte: toDbDate(start), lte: toDbDate(until) } },
    select: { localDate: true, localTime: true },
  })
  const busy = new Set(existing.map((e) => `${fromDbDate(e.localDate)} ${e.localTime}`))
  const total = version.durationDays !== null ? version.items.length : null
  return {
    suggestedStartDate: suggestedStart(version.frequency, todayIn(input.timezone)),
    itemCount: total ?? occurrences.length,
    items: occurrences.map((o) => ({
      localDate: o.localDate,
      localTime: o.localTime,
      title: titles.get(o.activityRevisionId) ?? 'Activity',
      programDayIndex: o.programDayIndex,
      conflict: !!o.localTime && busy.has(`${o.localDate} ${o.localTime}`),
    })),
  }
}

export async function join(
  userId: string,
  programId: string,
  input: { programVersionId: string; startLocalDate: string; timezone: string; groupId?: string | null; groupInviteToken?: string; idempotencyKey: string },
) {
  if (!isValidTimeZone(input.timezone)) throw badRequest('Unknown timezone', { timezone: 'is not a valid IANA timezone' })
  const { idempotencyKey, ...request } = input
  return withIdempotency({
    userId,
    scope: `join:${programId}`,
    key: idempotencyKey,
    request,
    load: async (id) => toEnrollment(await db.programEnrollment.findUniqueOrThrow({ where: { id } })),
    run: async () => {
      const { program, version } = await joinableVersion(userId, programId, input.programVersionId)
      const owner = isProgramOwner(program, userId)
      const mode = program.policy?.accessMode ?? 'OPEN'
      if (input.groupId) {
        const member = await db.groupMember.findUnique({ where: { groupId_userId: { groupId: input.groupId, userId } }, include: { group: true } })
        if (!member || member.status !== 'ACTIVE' || member.group.status !== 'ACTIVE') throw badRequest('Join the group first', { groupId: 'not a member' })
        if (member.group.programVersionId !== version.id) throw badRequest('This group follows a different version', { groupId: 'version mismatch' })
      }
      const enrollment = await db.$transaction(async (tx) => {
        if (!owner && mode !== 'OPEN') {
          const grant = await tx.programAccessGrant.findFirst({ where: { userId, programId, ...activeGrantWhere() } })
          if (!grant) throw new AppError(mode === 'PAID' ? 'PAYMENT_REQUIRED' : 'ACCESS_REQUIRED', mode === 'PAID' ? 'Unlock this program to join' : 'Request access to join')
        }
        if (!owner && mode === 'OPEN') {
          // Joining an open Program is its entitlement (07 §5); one grant per user and Program.
          await tx.programAccessGrant.upsert({
            where: { source_sourceRef: { source: 'OPEN', sourceRef: activeKey(userId, programId) } },
            create: { userId, programId, source: 'OPEN', sourceRef: activeKey(userId, programId) },
            update: { revokedAt: null },
          })
        }
        let e: ProgramEnrollment
        try {
          e = await tx.programEnrollment.create({
            data: {
              userId,
              programId,
              programVersionId: version.id,
              groupId: input.groupId ?? null,
              startLocalDate: toDbDate(input.startLocalDate),
              timezone: input.timezone,
              status: 'ACTIVE',
              activeKey: activeKey(userId, programId),
            },
          })
        } catch (err: any) {
          if (err?.code === 'P2002') throw conflict('You are already following this program')
          throw err
        }
        await materializeEnrollment(tx, e, version, version.items, { through: addDays(todayIn(input.timezone), HORIZON_DAYS) })
        await enqueue(tx, 'EnrollmentCreated', { enrollmentId: e.id, userId, programId, groupId: e.groupId })
        return e
      }, { timeout: 30_000 })
      return { ref: enrollment.id, result: await toEnrollment(enrollment) }
    },
  })
}

export async function list(userId: string, query: PageQuery & { status?: ProgramEnrollment['status'] }) {
  const { limit, take } = pageArgs(query)
  const rows = await db.programEnrollment.findMany({
    where: { userId, ...(query.status ? { status: query.status } : {}), ...afterCursor(query.cursor) },
    orderBy: pageOrder,
    take,
  })
  const page = toPage(rows, limit, (e) => e)
  return { data: await Promise.all(page.data.map(toEnrollment)), meta: page.meta }
}

export async function get(userId: string, enrollmentId: string) {
  return toEnrollment(await ownEnrollment(userId, enrollmentId))
}

export async function setStatus(userId: string, enrollmentId: string, status: ProgramEnrollment['status']) {
  const e = await ownEnrollment(userId, enrollmentId)
  if (!['ACTIVE', 'PAUSED'].includes(status) || !['ACTIVE', 'PAUSED'].includes(e.status)) {
    throw badRequest('You can pause or resume an active program', { status: 'must be ACTIVE or PAUSED' })
  }
  return toEnrollment(await db.programEnrollment.update({ where: { id: e.id }, data: { status } }))
}

/** 09 §4.6: past results are never erased. Future planned items are removed or kept as standalone. */
export async function leave(userId: string, enrollmentId: string, futureItems: 'REMOVE' | 'KEEP_STANDALONE') {
  const e = await ownEnrollment(userId, enrollmentId)
  if (!LIVE.includes(e.status)) return toEnrollment(e)
  const today = toDbDate(todayIn(e.timezone))
  const future: Prisma.CalendarItemWhereInput = { enrollmentId: e.id, status: 'PLANNED', localDate: { gte: today } }
  await db.$transaction([
    futureItems === 'REMOVE'
      ? db.calendarItem.updateMany({ where: future, data: { status: 'CANCELLED' } })
      : db.calendarItem.updateMany({ where: future, data: { enrollmentId: null, sourceScheduleItemId: null, groupOccurrenceKey: null, programDayIndex: null } }),
    db.programEnrollment.update({ where: { id: e.id }, data: { status: 'LEFT', activeKey: null, pendingVersionId: null } }),
  ])
  return toEnrollment(await ownEnrollment(userId, enrollmentId))
}

/**
 * 07 §6: moving to the pending version replaces only future, unadjusted, untouched planned items.
 * Done, adjusted, past, and in-progress items stay exactly as they are.
 */
export async function acceptUpdate(userId: string, enrollmentId: string) {
  const e = await ownEnrollment(userId, enrollmentId)
  if (!e.pendingVersionId) throw badRequest('There is no update to accept')
  const next = await db.programVersion.findUniqueOrThrow({ where: { id: e.pendingVersionId }, include: { items: true } })
  const today = todayIn(e.timezone)
  await db.$transaction(async (tx) => {
    await tx.calendarItem.deleteMany({
      where: { enrollmentId: e.id, status: 'PLANNED', isUserAdjusted: false, localDate: { gte: toDbDate(today) }, sessions: { none: {} } },
    })
    const updated = await tx.programEnrollment.update({ where: { id: e.id }, data: { programVersionId: next.id, pendingVersionId: null } })
    await materializeEnrollment(tx, updated, next, next.items, { from: today, through: addDays(today, HORIZON_DAYS) })
  }, { timeout: 30_000 })
  return toEnrollment(await ownEnrollment(userId, enrollmentId))
}

export async function dismissUpdate(userId: string, enrollmentId: string) {
  const e = await ownEnrollment(userId, enrollmentId)
  return toEnrollment(await db.programEnrollment.update({ where: { id: e.id }, data: { pendingVersionId: null } }))
}

// ── Approval access ─────────────────────────────────────────────────────────

const toRequest = (r: Prisma.ProgramApprovalRequestGetPayload<{ include: { user: { include: { profile: true } } } }>) => ({
  id: r.id,
  user: toUserSummary(r.user.profile!),
  programId: r.programId,
  status: r.status,
  requestedAt: r.requestedAt.toISOString(),
  resolvedAt: r.resolvedAt?.toISOString() ?? null,
})

export async function requestAccess(userId: string, programId: string) {
  const p = await db.program.findUnique({ where: { id: programId }, include: { policy: true } })
  if (!p || !(await canSeeProgram(userId, p))) throw notFound('Program')
  if (isProgramOwner(p, userId)) throw badRequest('You own this program')
  if ((p.policy?.accessMode ?? 'OPEN') !== 'APPROVAL') throw badRequest('This program does not need approval')
  if ((await resolveAccess(userId, p)) === 'GRANTED') throw badRequest('You already have access')
  const req = await db.programApprovalRequest.upsert({
    where: { activeKey: activeKey(userId, programId) },
    create: { userId, programId, activeKey: activeKey(userId, programId) },
    update: {},
    include: { user: { include: { profile: true } } },
  })
  return toRequest(req)
}

export async function listAccessRequests(userId: string, programId: string, query: PageQuery) {
  const p = await db.program.findUnique({ where: { id: programId } })
  if (!p || !isProgramOwner(p, userId)) throw notFound('Program')
  const { limit, skip, take } = offsetArgs(query)
  const rows = await db.programApprovalRequest.findMany({
    where: { programId, status: 'PENDING' },
    orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
    skip,
    take,
    include: { user: { include: { profile: true } } },
  })
  return toOffsetPage(rows, limit, skip, toRequest)
}

export async function resolveAccessRequest(userId: string, requestId: string, decision: 'APPROVED' | 'DECLINED') {
  const r = await db.programApprovalRequest.findUnique({ where: { id: requestId }, include: { program: true } })
  if (!r || !isProgramOwner(r.program, userId)) throw notFound('Access request')
  if (r.status !== 'PENDING') return toRequest(await db.programApprovalRequest.findUniqueOrThrow({ where: { id: requestId }, include: { user: { include: { profile: true } } } }))
  const updated = await db.$transaction(async (tx) => {
    const row = await tx.programApprovalRequest.update({
      where: { id: requestId },
      data: { status: decision, resolvedAt: new Date(), activeKey: null },
      include: { user: { include: { profile: true } } },
    })
    if (decision === 'APPROVED') {
      await tx.programAccessGrant.upsert({
        where: { source_sourceRef: { source: 'APPROVAL', sourceRef: requestId } },
        create: { userId: r.userId, programId: r.programId, source: 'APPROVAL', sourceRef: requestId },
        update: {},
      })
      await enqueue(tx, 'ProgramAccessGranted', { userId: r.userId, programId: r.programId, source: 'APPROVAL' })
    }
    return row
  })
  return toRequest(updated)
}
