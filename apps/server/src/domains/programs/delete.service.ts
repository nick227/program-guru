// Owner Program deletion (07-PROGRAMS.md §6). Permanent for the owner; other people's records stay.
import { db, type Prisma } from '@project/db'
import { notFound } from '../../lib/errors'
import { isProgramOwner } from './access'

type Tx = Prisma.TransactionClient

/** Anything another person holds that depends on this Program, so it must be tombstoned instead. */
async function othersInvolved(tx: Tx, ownerId: string, programId: string, versionIds: string[]) {
  const others = { not: ownerId }
  const counts = await Promise.all([
    tx.programEnrollment.count({ where: { programId, userId: others } }),
    tx.programAccessGrant.count({ where: { programId, userId: others } }),
    tx.programPurchase.count({ where: { programId } }),
    tx.billingSubscription.count({ where: { programId } }),
    tx.programSource.count({ where: { sourceProgramVersionId: { in: versionIds } } }),
    tx.groupMember.count({ where: { group: { programVersionId: { in: versionIds } }, userId: others } }),
  ])
  return counts.some((n) => n > 0)
}

/**
 * Deletes the owner's own runs: Calendar Items (never detached into standalone entries), sessions,
 * results, completion shares and result-media attachments. Media assets stay in their library.
 */
async function deleteOwnRuns(tx: Tx, ownerId: string, programId: string) {
  const enrollmentIds = (await tx.programEnrollment.findMany({ where: { programId, userId: ownerId }, select: { id: true } })).map((e) => e.id)
  const itemIds = (await tx.calendarItem.findMany({ where: { enrollmentId: { in: enrollmentIds } }, select: { id: true } })).map((i) => i.id)
  const sessionIds = (await tx.activitySession.findMany({ where: { calendarItemId: { in: itemIds } }, select: { id: true } })).map((s) => s.id)
  const entryIds = (await tx.resultEntry.findMany({ where: { sessionId: { in: sessionIds } }, select: { id: true } })).map((r) => r.id)
  await tx.mediaAttachment.deleteMany({ where: { resultEntryId: { in: entryIds } } })
  await tx.resultEntry.deleteMany({ where: { id: { in: entryIds } } })
  await tx.activitySession.deleteMany({ where: { id: { in: sessionIds } } })
  await tx.completionShare.deleteMany({ where: { calendarItemId: { in: itemIds } } })
  await tx.calendarItem.deleteMany({ where: { id: { in: itemIds } } })
  await tx.programEnrollment.deleteMany({ where: { id: { in: enrollmentIds } } })
  await tx.programLibraryState.deleteMany({ where: { userId: ownerId, programId } })
}

export async function deleteProgram(userId: string, programId: string) {
  const program = await db.program.findUnique({ where: { id: programId } })
  if (!program || !isProgramOwner(program, userId)) throw notFound('Program')
  return db.$transaction(
    async (tx) => {
      const versionIds = (await tx.programVersion.findMany({ where: { programId }, select: { id: true } })).map((v) => v.id)
      const retained = await othersInvolved(tx, userId, programId, versionIds)
      await deleteOwnRuns(tx, userId, programId)
      if (retained) {
        // Tombstone: no discovery, joins, purchases or copies, and no owner controls; participants keep everything.
        await tx.program.update({ where: { id: programId }, data: { deletedAt: new Date(), status: program.status === 'DRAFT' ? 'DRAFT' : 'ARCHIVED' } })
      } else {
        const groupIds = (await tx.programGroup.findMany({ where: { programVersionId: { in: versionIds } }, select: { id: true } })).map((g) => g.id)
        await tx.completionShare.deleteMany({ where: { groupId: { in: groupIds } } })
        await tx.programGroup.deleteMany({ where: { id: { in: groupIds } } })
        await tx.programApprovalRequest.deleteMany({ where: { programId } })
        await tx.programAccessGrant.deleteMany({ where: { programId } })
        await tx.programPrice.deleteMany({ where: { programId } })
        await tx.programLibraryState.deleteMany({ where: { programId } })
        await tx.mediaAttachment.deleteMany({ where: { programId } })
        await tx.program.update({ where: { id: programId }, data: { latestPublishedVersionId: null } })
        await tx.programVersion.deleteMany({ where: { programId } })
        await tx.program.delete({ where: { id: programId } })
      }
      return { programId, retainedForParticipants: retained }
    },
    { timeout: 30_000 },
  )
}
