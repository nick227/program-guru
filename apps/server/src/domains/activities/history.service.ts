// Personal attempt metadata survives loss of access to the instructional Activity.
import { db } from '@project/db'
import { notFound } from '../../lib/errors'
import { afterCursor, pageArgs, pageOrder, toPage, type PageQuery } from '../../lib/paging'
import { fromDbDate } from '../../lib/time'
import { canReadRevision } from './access'

/** Shared with media history: never disclose an unreadable Activity to someone without history. */
export async function assertHistoryReadable(userId: string, activityId: string) {
  const activity = await db.activity.findUnique({ where: { id: activityId } })
  if (!activity) throw notFound('Activity')
  const hasHistory = await db.activitySession.findFirst({
    where: { userId, activityRevision: { activityId } }, select: { id: true },
  })
  if (hasHistory || activity.creatorId === userId) return
  const latest = activity.latestPublishedRevisionId
    ? await db.activityRevision.findUnique({ where: { id: activity.latestPublishedRevisionId } })
    : null
  if (!latest || !(await canReadRevision(userId, activity, latest))) throw notFound('Activity')
}

export async function listAttempts(userId: string, activityId: string, query: PageQuery & { calendarItemId?: string }) {
  await assertHistoryReadable(userId, activityId)
  const { limit, take } = pageArgs(query)
  const rows = await db.activitySession.findMany({
    where: {
      userId,
      activityRevision: { activityId },
      ...(query.calendarItemId ? { calendarItemId: query.calendarItemId } : {}),
      ...afterCursor(query.cursor),
    },
    orderBy: pageOrder,
    take,
    select: {
      id: true, activityRevisionId: true, status: true, createdAt: true,
      startedAt: true, endedAt: true, calendarItemId: true,
      calendarItem: { select: { localDate: true } },
      entries: {
        orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
        select: { id: true, instructionId: true, recordedAt: true },
      },
    },
  })
  return toPage(rows, limit, session => ({
    sessionId: session.id,
    activityRevisionId: session.activityRevisionId,
    status: session.status,
    createdAt: session.createdAt.toISOString(),
    startedAt: session.startedAt?.toISOString() ?? null,
    endedAt: session.endedAt?.toISOString() ?? null,
    calendarItemId: session.calendarItemId,
    occurrenceDate: session.calendarItem ? fromDbDate(session.calendarItem.localDate) : null,
    entries: session.entries.map(entry => ({
      resultEntryId: entry.id, instructionId: entry.instructionId, recordedAt: entry.recordedAt.toISOString(),
    })),
  }))
}
