import { db } from '@project/db'
import { badRequest, notFound } from '../../lib/errors'
import { addDays, fromDbDate, toDbDate, todayIn } from '../../lib/time'
import { resolveAccess } from './access'
import { programInclude, toProgramSummary } from './mapper'
import { enrollInTx, joinableVersion, notInProgress } from './enrollment.service'
import { participationSummaries } from './participation.service'

const live = ['ACTIVE', 'PAUSED', 'PENDING_ACCESS'] as const
export async function library(userId: string, programId?: string) {
  const programs = await db.program.findMany({
    where: {
      ...(programId ? { id: programId } : {}),
      OR: [{ creatorId: userId }, { enrollments: { some: { userId } } }],
    },
    include: {
      ...programInclude,
      source: {
        include: {
          sourceVersion: {
            include: {
              program: { include: { creator: { include: { profile: true } } } },
            },
          },
        },
      },
      versions: { where: { publishedAt: null }, take: 1 },
      libraryStates: { where: { userId } },
      enrollments: {
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: {
          version: true,
          calendarItems: {
            include: { revision: true, sessions: true },
            orderBy: [{ localDate: 'asc' }, { localTime: 'asc' }],
          },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })
  if (programId && !programs.length) throw notFound('Personal Program')
  const participation = await participationSummaries(userId, programs.map((p) => p.id))
  return Promise.all(
    programs.map(async (p) => {
      const runs = p.enrollments.map((e) => {
        const today = todayIn(e.timezone)
        const eligible = e.calendarItems.filter(
          (i) =>
            (i.status !== 'CANCELLED' || i.pausedByEnrollment) &&
            i.status !== 'NOT_PARTICIPATING',
        )
        const completed = eligible.filter((i) => i.status === 'DONE').length
        const due = eligible.filter(
          (i) => !i.pausedByEnrollment && fromDbDate(i.localDate) < today,
        )
        const sessions = e.calendarItems
          .flatMap((i) => i.sessions)
          .filter((s) => s.startedAt || s.endedAt)
        const last = sessions
          .map((s) => s.endedAt ?? s.startedAt!)
          .sort((a, b) => b.getTime() - a.getTime())[0]
        const activity = (i: (typeof eligible)[number]) => ({
          id: i.id,
          title: i.revision.titleSnapshot,
          date: fromDbDate(i.localDate),
          time: i.localTime,
          status: i.status,
          adjusted: i.isUserAdjusted,
        })
        return {
          id: e.id,
          status: e.status,
          versionId: e.programVersionId,
          versionNumber: e.version.versionNumber,
          pendingVersionId: e.pendingVersionId,
          startDate: fromDbDate(e.startLocalDate),
          createdAt: e.createdAt.toISOString(),
          durationDays: e.version.durationDays,
          week: Math.max(
            1,
            Math.floor(
              (toDbDate(today).getTime() - e.startLocalDate.getTime()) /
                604800000,
            ) + 1,
          ),
          planned: eligible.length,
          completed,
          due: due.length,
          dueCompleted: due.filter((i) => i.status === 'DONE').length,
          activeSeconds: sessions.some((s) => !s.isManualCompletion)
            ? sessions
                .filter((s) => !s.isManualCompletion)
                .reduce((n, s) => n + s.activeSeconds, 0)
            : null,
          lastParticipation: last?.toISOString() ?? null,
          upcoming: eligible
            .filter(
              (i) => i.status === 'PLANNED' && fromDbDate(i.localDate) >= today,
            )
            .slice(0, 10)
            .map(activity),
          history: eligible
            .filter(
              (i) =>
                !i.pausedByEnrollment &&
                (i.status !== 'PLANNED' || fromDbDate(i.localDate) < today),
            )
            .slice(-30)
            .reverse()
            .map(activity),
          customizedCount: e.calendarItems.filter((i) => i.isUserAdjusted)
            .length,
        }
      })
      const current =
        runs.find((r) => live.includes(r.status as (typeof live)[number])) ??
        runs[0] ??
        null
      const status = p.libraryStates[0]?.archivedAt
        ? 'Archived'
        : current?.status === 'PAUSED'
          ? 'Paused'
          : current?.status === 'COMPLETED' ||
              (current?.status === 'ACTIVE' && current.planned &&
                current.completed === current.planned &&
                current.durationDays !== null &&
                p.enrollments.find((e) => e.id === current.id)!
                  .generatedThroughDate! >=
                  toDbDate(
                    addDays(current.startDate, current.durationDays - 1),
                  ))
            ? 'Completed'
            : current?.status === 'ACTIVE'
              ? current.startDate >
                todayIn(
                  p.enrollments.find((e) => e.id === current.id)!.timezone,
                )
                ? 'Not Started'
                : 'Active'
              : 'Not Started'
      return {
        program: toProgramSummary(
          p,
          await resolveAccess(userId, p),
          p.enrollments.find((e) => e.id === current?.id)?.version ??
            (p.creatorId === userId
              ? (p.versions[0] ?? p.latestPublished)
              : p.latestPublished),
        ),
        owned: p.creatorId === userId,
        publicationStatus: p.status,
        sourceVersionId: p.source?.sourceProgramVersionId ?? null,
        sourceLabel: p.source
          ? `${p.source.sourceVersion.title} · Version ${p.source.sourceVersion.versionNumber} · ${p.source.sourceVersion.program.creator?.profile?.displayName ?? 'Programs'}`
          : null,
        status,
        current,
        runs,
        participation: participation.get(p.id)!,
      }
    }),
  )
}

export async function manageLibrary(
  userId: string,
  programId: string,
  input: { action: string; expectedRunId?: string },
) {
  const [entry] = await library(userId, programId)
  const current = entry!.current
  if (input.action === 'ARCHIVE' || input.action === 'RESTORE') {
    await db.$transaction(async (tx) => {
      if (
        input.action === 'ARCHIVE' &&
        current &&
        live.includes(current.status as (typeof live)[number])
      ) {
        const e = await tx.programEnrollment.findUniqueOrThrow({
          where: { id: current.id },
        })
        await tx.calendarItem.updateMany({
          where: {
            enrollmentId: e.id,
            status: 'PLANNED',
            localDate: { gte: toDbDate(todayIn(e.timezone)) },
            ...notInProgress,
          },
          data: { status: 'CANCELLED', pausedByEnrollment: true },
        })
        await tx.programEnrollment.update({
          where: { id: e.id },
          data: { status: 'PAUSED' },
        })
      }
      await tx.programLibraryState.upsert({
        where: { userId_programId: { userId, programId } },
        create: {
          userId,
          programId,
          archivedAt: input.action === 'ARCHIVE' ? new Date() : null,
        },
        update: { archivedAt: input.action === 'ARCHIVE' ? new Date() : null },
      })
    })
  } else if (input.action === 'RESTART') {
    if (!current) throw badRequest('Start this Program from its overview first')
    if (input.expectedRunId !== current.id)
      throw badRequest('This run changed. Refresh before restarting.')
    const old = await db.programEnrollment.findUniqueOrThrow({
      where: { id: current.id },
    })
    const { program, version } = await joinableVersion(
      userId,
      programId,
      old.programVersionId,
    )
    // Restart the pinned version, preserving prior run results and customized placements.
    await db.$transaction(
      async (tx) => {
        const locked = await tx.programEnrollment.updateMany({
          where: { id: old.id, updatedAt: old.updatedAt },
          data: { status: 'LEFT', activeKey: null, pendingVersionId: null },
        })
        if (!locked.count)
          throw badRequest('This run changed. Refresh before restarting.')
        await tx.calendarItem.updateMany({
          where: {
            enrollmentId: old.id,
            status: 'PLANNED',
            localDate: { gte: toDbDate(todayIn(old.timezone)) },
            ...notInProgress,
          },
          data: { status: 'CANCELLED' },
        })
        // A restart keeps the person in their Program Group: the existing membership (and its
        // sharing preference) is reused, never duplicated, and the new run is linked to it. The
        // group's own start date and other members' calendars are untouched. Leaving the group is
        // a separate action.
        const keepGroup = old.groupId
          ? await tx.groupMember.findFirst({
              where: { groupId: old.groupId, userId, status: 'ACTIVE', group: { status: 'ACTIVE' } },
              select: { groupId: true },
            })
          : null
        await enrollInTx(tx, userId, program, version, {
          startLocalDate: todayIn(old.timezone),
          timezone: old.timezone,
          groupId: keepGroup?.groupId ?? null,
        })
        await tx.programLibraryState.updateMany({
          where: { userId, programId },
          data: { archivedAt: null },
        })
      },
      { timeout: 30000 },
    )
  } else throw badRequest('Unknown library action')
  return (await library(userId, programId))[0]
}
