// Owner Program deletion (07-PROGRAMS.md §6). Permanent for the owner; other people's records stay.
import { db, type Prisma } from '@project/db'
import { notFound } from '../../lib/errors'
import { enqueue } from '../../lib/outbox'
import { authorFor } from '../admin/authors'
import { audit } from '../admin/audit'

type Tx = Prisma.TransactionClient

/** Anything another person holds that depends on this Program, so it must be tombstoned instead. */
async function othersInvolved(tx: Tx, ownerId: string | null, programId: string, versionIds: string[]) {
  // Platform Programs have no owner: everyone tied to them is someone else.
  const others = ownerId ? { not: ownerId } : undefined
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
  const author = await authorFor(userId)
  if (!program || !author.program(program)) throw notFound('Program')
  const ownerId = program.creatorId
  return db.$transaction(
    async (tx) => {
      const versionIds = (await tx.programVersion.findMany({ where: { programId }, select: { id: true } })).map((v) => v.id)
      const retained = await othersInvolved(tx, ownerId, programId, versionIds)
      if (ownerId) await deleteOwnRuns(tx, ownerId, programId)
      if (ownerId === null) await audit(tx, userId, 'PROGRAM', programId, 'DELETE', retained ? 'Deleted; kept for participants' : 'Deleted')
      if (retained) {
        // Tombstone: no discovery, joins, purchases or copies, and no owner controls; participants keep everything.
        await tx.program.update({ where: { id: programId }, data: { deletedAt: new Date(), status: program.status === 'DRAFT' ? 'DRAFT' : 'ARCHIVED' } })
        // A deleted offering stops renewing; paid-through access and payment history stay (07 §6).
        if (await tx.billingSubscription.count({ where: { programId, status: { in: ['INCOMPLETE', 'ACTIVE', 'PAST_DUE'] } } })) {
          await enqueue(tx, 'ProgramSubscriptionsCancel', { programId })
        }
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
