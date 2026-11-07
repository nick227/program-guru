// Activity Sessions (09-CALENDARS.md §3). One Calendar Item = one Activity; its sessions and results
// are independent of every other Activity on the same Program Day. Server time is authoritative.
import { Prisma, db, type ActivitySession, type MetricDefinition } from '@project/db'
import { badRequest, conflict, notFound, versionConflict } from '../../lib/errors'
import { withIdempotency } from '../../lib/idempotency'
import { enqueue } from '../../lib/outbox'
import { canUseActivity, isOwner as isActivityOwner } from '../activities/access'
import { achievementInclude, evaluate, toAchievement } from './achievements'
import { itemDto } from './calendar.service'
import { mediaUrl } from '../media/urls'

type Tx = Prisma.TransactionClient
type Action = 'START' | 'PAUSE' | 'RESUME' | 'FINISH' | 'ABANDON'
const OPEN: ActivitySession['status'][] = ['READY', 'ACTIVE', 'PAUSED']

export const toSession = (s: ActivitySession) => ({
  id: s.id,
  calendarItemId: s.calendarItemId,
  activityRevisionId: s.activityRevisionId,
  status: s.status,
  startedAt: s.startedAt?.toISOString() ?? null,
  endedAt: s.endedAt?.toISOString() ?? null,
  // While running, include the live interval so a reloaded page shows the right elapsed time.
  activeSeconds: s.activeSeconds + (s.status === 'ACTIVE' && s.lastResumedAt ? Math.floor((Date.now() - s.lastResumedAt.getTime()) / 1000) : 0),
  isManualCompletion: s.isManualCompletion,
  revision: s.revision,
})

async function ownSession(tx: Tx, userId: string, sessionId: string) {
  const s = await tx.activitySession.findUnique({ where: { id: sessionId } })
  if (!s || s.userId !== userId) throw notFound('Session')
  return s
}

export async function create(userId: string, input: { calendarItemId?: string; activityId?: string; revisionId?: string; idempotencyKey: string }) {
  if (!input.calendarItemId && !input.activityId) throw badRequest('Choose an activity', { activityId: 'or calendarItemId is required' })
  const { idempotencyKey, ...request } = input
  return withIdempotency({
    userId,
    scope: 'session:create',
    key: idempotencyKey,
    request,
    load: async (id) => toSession(await db.activitySession.findUniqueOrThrow({ where: { id } })),
    run: async () => {
      if (input.calendarItemId) {
        const item = await db.calendarItem.findUnique({ where: { id: input.calendarItemId } })
        if (!item || item.ownerId !== userId) throw notFound('Calendar item')
        if (item.status === 'CANCELLED') throw badRequest('Restore this activity first', { calendarItemId: 'is cancelled' })
        // Reuse the open attempt rather than starting a parallel one.
        const open = await db.activitySession.findFirst({ where: { calendarItemId: item.id, status: { in: OPEN } }, orderBy: { createdAt: 'desc' } })
        const s = open ?? (await db.activitySession.create({ data: { userId, calendarItemId: item.id, activityRevisionId: item.activityRevisionId } }))
        return { ref: s.id, result: toSession(s) }
      }
      const a = await db.activity.findUnique({ where: { id: input.activityId! } })
      if (!a || !canUseActivity(a, userId)) throw notFound('Activity')
      const revisionId =
        input.revisionId ??
        (isActivityOwner(a, userId) ? (await db.activityRevision.findFirstOrThrow({ where: { activityId: a.id }, orderBy: { revisionNumber: 'desc' } })).id : a.latestPublishedRevisionId!)
      const s = await db.activitySession.create({ data: { userId, activityRevisionId: revisionId } })
      return { ref: s.id, result: toSession(s) }
    },
  })
}

const elapsed = (s: ActivitySession, now: Date) => (s.lastResumedAt ? Math.max(0, Math.floor((now.getTime() - s.lastResumedAt.getTime()) / 1000)) : 0)

export async function act(userId: string, sessionId: string, input: { action: Action; expectedRevision: number; manualDurationSeconds?: number | null }) {
  const earned: string[] = []
  const session = await db.$transaction(async (tx) => {
    const s = await ownSession(tx, userId, sessionId)
    if (s.revision !== input.expectedRevision) throw versionConflict('This activity changed on another screen. Reload to continue.')
    const now = new Date()
    let data: Prisma.ActivitySessionUpdateInput
    switch (`${s.status}:${input.action}`) {
      case 'READY:START':
        data = { status: 'ACTIVE', startedAt: now, lastResumedAt: now }
        break
      case 'ACTIVE:PAUSE':
        data = { status: 'PAUSED', activeSeconds: s.activeSeconds + elapsed(s, now), lastResumedAt: null }
        break
      case 'PAUSED:RESUME':
        data = { status: 'ACTIVE', lastResumedAt: now }
        break
      case 'ACTIVE:FINISH':
      case 'PAUSED:FINISH':
        data = { status: 'FINISHED', endedAt: now, activeSeconds: s.activeSeconds + elapsed(s, now), lastResumedAt: null }
        break
      case 'READY:FINISH':
        // Quick "Mark finished": measured time is unknown unless the user supplies it (03 §6).
        data = { status: 'FINISHED', endedAt: now, isManualCompletion: true, activeSeconds: input.manualDurationSeconds ?? 0 }
        break
      case 'READY:ABANDON':
      case 'PAUSED:ABANDON':
      case 'ACTIVE:ABANDON':
        data = { status: 'ABANDONED', endedAt: now, activeSeconds: s.activeSeconds + elapsed(s, now), lastResumedAt: null }
        break
      default:
        throw conflict(`Cannot ${input.action.toLowerCase()} a session that is ${s.status.toLowerCase()}`)
    }
    // CAS on revision: a double-tap or a second tab loses cleanly instead of double-counting time.
    const r = await tx.activitySession.updateMany({ where: { id: s.id, revision: s.revision }, data: { ...(data as any), revision: { increment: 1 } } })
    if (r.count === 0) throw versionConflict()
    const updated = await tx.activitySession.findUniqueOrThrow({ where: { id: s.id } })
    if (updated.status === 'FINISHED') earned.push(...(await onFinished(tx, userId, updated)))
    return updated
  })
  const achievements = earned.length
    ? (await db.userAchievement.findMany({ where: { id: { in: earned } }, include: achievementInclude })).map(toAchievement)
    : []
  return { session: toSession(session), item: session.calendarItemId ? await itemDto(userId, session.calendarItemId) : null, achievementsEarned: achievements }
}

/** Completion side effects, all in the finishing transaction. */
async function onFinished(tx: Tx, userId: string, s: ActivitySession) {
  let enrollmentId: string | null = null
  if (s.calendarItemId) {
    const item = await tx.calendarItem.update({ where: { id: s.calendarItemId }, data: { status: 'DONE' }, include: { enrollment: true } })
    enrollmentId = item.enrollmentId
    // Group completion share: activity, day, and status only, never metric values (10 §3).
    if (item.enrollment?.groupId && item.groupOccurrenceKey) {
      const member = await tx.groupMember.findUnique({ where: { groupId_userId: { groupId: item.enrollment.groupId, userId } } })
      if (member?.status === 'ACTIVE' && member.sharedCompletionEnabled) {
        const share = await tx.completionShare.upsert({
          where: { calendarItemId: item.id },
          create: { groupId: item.enrollment.groupId, occurrenceKey: item.groupOccurrenceKey, calendarItemId: item.id, userId, activityId: item.activityId, programDayIndex: item.programDayIndex, completedAt: new Date() },
          update: { revokedAt: null, completedAt: new Date() },
        })
        await enqueue(tx, 'CompletionShared', {
          shareId: share.id,
          groupId: item.enrollment.groupId,
          occurrenceKey: item.groupOccurrenceKey,
          calendarItemId: item.id,
          userId,
          activityId: item.activityId,
        })
      }
    }
  }
  await enqueue(tx, 'SessionFinished', { userId, sessionId: s.id, calendarItemId: s.calendarItemId })
  return evaluate(tx, userId, { enrollmentId, sourceCalendarItemId: s.calendarItemId })
}

// ── Results ─────────────────────────────────────────────────────────────────

type Value = number | string | boolean

/** Typed validation against the metric definition (08 §4); returns the column to write. */
function typedValue(def: MetricDefinition, value: Value) {
  const v = (def.validation as { min?: number; max?: number; maxLength?: number } | null) ?? {}
  const range = (n: number) => {
    if (v.min !== undefined && n < v.min) throw badRequest(`${def.label} must be at least ${v.min}`, { [def.key]: 'below minimum' })
    if (v.max !== undefined && n > v.max) throw badRequest(`${def.label} must be at most ${v.max}`, { [def.key]: 'above maximum' })
  }
  switch (def.valueType) {
    case 'INTEGER':
      if (typeof value !== 'number' || !Number.isInteger(value)) throw badRequest(`${def.label} must be a whole number`, { [def.key]: 'must be an integer' })
      if (value < 0 && (v.min ?? 0) >= 0) throw badRequest(`${def.label} cannot be negative`, { [def.key]: 'must be 0 or more' })
      range(value)
      return { intValue: value }
    case 'DECIMAL':
      if (typeof value !== 'number' || !Number.isFinite(value)) throw badRequest(`${def.label} must be a number`, { [def.key]: 'must be a number' })
      range(value)
      return { decimalValue: new Prisma.Decimal(value) }
    case 'DURATION':
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw badRequest(`${def.label} must be seconds`, { [def.key]: 'must be whole seconds' })
      range(value)
      return { durationSeconds: value }
    case 'BOOLEAN':
      if (typeof value !== 'boolean') throw badRequest(`${def.label} must be yes or no`, { [def.key]: 'must be true or false' })
      return { boolValue: value }
    case 'TEXT':
      if (typeof value !== 'string' || value.length > (v.maxLength ?? 5000)) throw badRequest(`${def.label} is too long`, { [def.key]: 'must be text' })
      return { textValue: value }
  }
}

const entryInclude = { values: { include: { metric: true } }, attachments: { include: { media: true } } } satisfies Prisma.ResultEntryInclude
type EntryRow = Prisma.ResultEntryGetPayload<{ include: typeof entryInclude }>

export function valueOf(v: EntryRow['values'][number]): Value | null {
  return v.intValue ?? (v.decimalValue != null ? Number(v.decimalValue) : null) ?? v.boolValue ?? v.textValue ?? v.durationSeconds ?? null
}

const toEntry = (e: EntryRow) => ({
  id: e.id,
  sessionId: e.sessionId,
  instructionId: e.instructionId,
  recordedAt: e.recordedAt.toISOString(),
  notes: e.notes,
  values: e.values.map((v) => ({ metricDefinitionId: v.metricDefinitionId, key: v.metric.key, label: v.metric.label, value: valueOf(v)!, unit: v.unit ?? v.metric.unit })),
  media: e.attachments.map((a) => ({ id: a.media.id, thumbnailUrl: a.media.state === 'READY' ? mediaUrl(a.media.id) : null, type: a.media.type, durationMs: a.media.durationMs, alt: a.media.alt ?? '', canSelect: true })),
})

export async function get(userId: string, sessionId: string) {
  const s = await ownSession(db, userId, sessionId)
  const entries = await db.resultEntry.findMany({ where: { sessionId }, orderBy: { recordedAt: 'asc' }, include: entryInclude })
  return { session: toSession(s), entries: entries.map(toEntry) }
}

export async function saveResult(
  userId: string,
  sessionId: string,
  input: { instructionId?: string | null; values: { metricDefinitionId: string; value: Value; unit?: string }[]; notes?: string | null },
) {
  const s = await ownSession(db, userId, sessionId)
  if (s.status === 'ABANDONED') throw badRequest('This attempt was discarded')
  // Only metrics this Activity (or the named Instruction) declares may be recorded.
  const bindings = await db.activityMetric.findMany({
    where: input.instructionId ? { instructionId: input.instructionId, instruction: { activityRevisionId: s.activityRevisionId } } : { activityRevisionId: s.activityRevisionId },
    include: { metric: true },
  })
  if (input.instructionId && !(await db.instruction.findFirst({ where: { id: input.instructionId, activityRevisionId: s.activityRevisionId } }))) {
    throw badRequest('That instruction is not part of this activity', { instructionId: 'not found' })
  }
  const byDef = new Map(bindings.map((b) => [b.metricDefinitionId, b.metric]))
  const rows = input.values.map((v) => {
    const def = byDef.get(v.metricDefinitionId)
    if (!def) throw badRequest('That measurement is not part of this activity', { metricDefinitionId: v.metricDefinitionId })
    return { metricDefinitionId: def.id, unit: v.unit ?? def.unit, ...typedValue(def, v.value) }
  })
  const entry = await db.resultEntry.create({
    data: { sessionId, instructionId: input.instructionId ?? null, notes: input.notes?.trim() || null, values: { create: rows } },
    include: entryInclude,
  })
  return toEntry(entry)
}
