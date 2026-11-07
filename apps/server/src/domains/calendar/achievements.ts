// Achievements derived from actual completions (09-CALENDARS.md §9a). Idempotent: evaluation can
// run any number of times and only ever creates each milestone once per scope; an undo revokes.
import type { Prisma } from '@project/db'

type Tx = Prisma.TransactionClient

const DONE_UNSCHEDULED = (userId: string) => ({ userId, status: 'FINISHED' as const, calendarItemId: null })

/** Completed Activities: DONE calendar items plus finished unscheduled sessions. Attempts don't count. */
export async function completionCount(tx: Tx, userId: string) {
  const [items, unscheduled] = await Promise.all([
    tx.calendarItem.count({ where: { ownerId: userId, status: 'DONE' } }),
    tx.activitySession.count({ where: DONE_UNSCHEDULED(userId) }),
  ])
  return items + unscheduled
}

async function programProgress(tx: Tx, enrollmentId: string) {
  const e = await tx.programEnrollment.findUnique({ where: { id: enrollmentId }, include: { version: true } })
  if (!e) return null
  const items = await tx.calendarItem.findMany({
    where: { enrollmentId, status: { not: 'CANCELLED' } },
    select: { status: true, programDayIndex: true },
  })
  const finite = e.version.durationDays !== null
  const total = finite ? items.length : null
  const done = items.filter((i) => i.status === 'DONE').length
  const firstWeek = items.filter((i) => (i.programDayIndex ?? 99) < 7)
  return {
    enrollment: e,
    firstWeekDone: firstWeek.length > 0 && firstWeek.every((i) => i.status === 'DONE'),
    halfway: total !== null && total > 0 && done * 2 >= total,
    completed: total !== null && total > 0 && done === total,
  }
}

/**
 * Re-evaluates every milestone that can depend on this completion. Returns newly earned ones.
 * `sourceCalendarItemId` attributes the milestone to the occurrence that triggered it.
 */
export async function evaluate(tx: Tx, userId: string, ctx: { enrollmentId: string | null; sourceCalendarItemId: string | null }) {
  const defs = await tx.achievementDefinition.findMany({ orderBy: { position: 'asc' } })
  if (!defs.length) return []
  const total = await completionCount(tx, userId)
  const progress = ctx.enrollmentId ? await programProgress(tx, ctx.enrollmentId) : null
  const earned: string[] = []

  for (const d of defs) {
    let holds: boolean
    let scopeKey = d.id
    let enrollmentId: string | null = null
    if (d.ruleKind === 'TOTAL_COMPLETIONS') {
      holds = total >= (d.threshold ?? 1)
    } else {
      if (!progress) continue
      scopeKey = `${d.id}:${progress.enrollment.id}`
      enrollmentId = progress.enrollment.id
      holds = d.ruleKind === 'PROGRAM_FIRST_WEEK' ? progress.firstWeekDone : d.ruleKind === 'PROGRAM_HALFWAY' ? progress.halfway : progress.completed
    }
    const existing = await tx.userAchievement.findUnique({ where: { userId_scopeKey: { userId, scopeKey } } })
    if (holds && (!existing || existing.revokedAt)) {
      const row = existing
        ? await tx.userAchievement.update({ where: { id: existing.id }, data: { revokedAt: null, earnedAt: new Date(), sourceCalendarItemId: ctx.sourceCalendarItemId } })
        : await tx.userAchievement.create({ data: { userId, definitionId: d.id, enrollmentId, scopeKey, sourceCalendarItemId: ctx.sourceCalendarItemId } })
      earned.push(row.id)
    } else if (!holds && existing && !existing.revokedAt) {
      await tx.userAchievement.update({ where: { id: existing.id }, data: { revokedAt: new Date() } })
    }
  }

  if (progress) {
    const status = progress.completed ? 'COMPLETED' : progress.enrollment.status === 'COMPLETED' ? 'ACTIVE' : null
    if (status && status !== progress.enrollment.status) {
      await tx.programEnrollment.update({
        where: { id: progress.enrollment.id },
        data: { status, activeKey: status === 'COMPLETED' ? null : `${progress.enrollment.userId}:${progress.enrollment.programId}` },
      })
    }
  }
  return earned
}

export const achievementInclude = { definition: true, enrollment: { include: { version: true } } } satisfies Prisma.UserAchievementInclude
type Row = Prisma.UserAchievementGetPayload<{ include: typeof achievementInclude }>

export const toAchievement = (a: Row) => ({
  id: a.id,
  key: a.definition.key,
  label: a.definition.label,
  description: a.definition.description,
  icon: a.definition.icon,
  programTitle: a.enrollment?.version.title ?? null,
  earnedAt: a.earnedAt.toISOString(),
  isShared: a.isShared,
})
