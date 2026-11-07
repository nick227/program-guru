// Reports and audited moderation actions (12-SOCIAL.md §7). Publishing is not pre-approved;
// reporting and moderation are the safeguard. Historical personal records are never deleted.
import { db, type Prisma } from '@project/db'
import { badRequest, notFound } from '../../lib/errors'
import { enqueue } from '../../lib/outbox'
import { offsetArgs, toOffsetPage, type PageQuery } from '../../lib/paging'
import { toUserSummary } from '../users/mapper'

type TargetType = 'PROGRAM' | 'ACTIVITY' | 'MEDIA' | 'COMMENT' | 'USER'

async function targetExists(type: TargetType, id: string) {
  switch (type) {
    case 'PROGRAM':
      return !!(await db.program.findUnique({ where: { id }, select: { id: true } }))
    case 'ACTIVITY':
      return !!(await db.activity.findUnique({ where: { id }, select: { id: true } }))
    case 'MEDIA':
      return !!(await db.mediaPublication.findUnique({ where: { id }, select: { id: true } }))
    case 'COMMENT':
      return !!(await db.mediaComment.findUnique({ where: { id }, select: { id: true } }))
    case 'USER':
      return !!(await db.user.findUnique({ where: { id }, select: { id: true } }))
  }
}

const include = { reporter: { include: { profile: true } } } satisfies Prisma.ContentReportInclude
const toReport = (r: Prisma.ContentReportGetPayload<{ include: typeof include }>, forModerator: boolean) => ({
  id: r.id,
  target: { type: r.targetType, id: r.targetId },
  reason: r.reason,
  details: r.details,
  status: r.status,
  reporter: forModerator && r.reporter.profile ? toUserSummary(r.reporter.profile) : null,
  createdAt: r.createdAt.toISOString(),
  resolvedAt: r.resolvedAt?.toISOString() ?? null,
})

export async function report(userId: string, input: { target: { type: TargetType; id: string }; reason: Prisma.ContentReportCreateInput['reason']; details?: string }) {
  if (!(await targetExists(input.target.type, input.target.id))) throw notFound('Content')
  const r = await db.contentReport.create({
    data: { reporterId: userId, targetType: input.target.type, targetId: input.target.id, reason: input.reason, details: input.details?.trim() || null },
    include,
  })
  return toReport(r, false)
}

export async function listReports(query: PageQuery & { status?: 'OPEN' | 'RESOLVED' | 'DISMISSED' }) {
  const { limit, skip, take } = offsetArgs(query)
  const rows = await db.contentReport.findMany({ where: { status: query.status ?? 'OPEN' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip, take, include })
  return toOffsetPage(rows, limit, skip, (r) => toReport(r, true))
}

type ActionKind = 'HIDE' | 'RESTORE' | 'UNLIST' | 'RESTRICT_PUBLISHING' | 'SUSPEND_USER' | 'REVOKE_ACCESS'

async function apply(tx: Prisma.TransactionClient, action: ActionKind, type: TargetType, id: string) {
  const now = new Date()
  const hide = action === 'HIDE'
  switch (`${type}:${action}`) {
    case 'PROGRAM:HIDE':
    case 'PROGRAM:RESTORE':
      return tx.program.update({ where: { id }, data: { moderatedAt: hide ? now : null } })
    case 'PROGRAM:UNLIST':
      return tx.program.update({ where: { id }, data: { visibility: 'UNLISTED' } })
    case 'ACTIVITY:HIDE':
    case 'ACTIVITY:RESTORE':
      return tx.activity.update({ where: { id }, data: { moderatedAt: hide ? now : null } })
    case 'MEDIA:HIDE':
      return tx.mediaPublication.update({ where: { id }, data: { status: 'REVOKED' } })
    case 'MEDIA:RESTORE':
      return tx.mediaPublication.update({ where: { id }, data: { status: 'APPROVED' } })
    case 'COMMENT:HIDE':
    case 'COMMENT:RESTORE':
      return tx.mediaComment.update({ where: { id }, data: { status: hide ? 'HIDDEN' : 'VISIBLE' } })
    case 'USER:SUSPEND_USER':
      await tx.session.deleteMany({ where: { userId: id } })
      return tx.user.update({ where: { id }, data: { status: 'SUSPENDED' } })
    case 'USER:RESTORE':
      return tx.user.update({ where: { id }, data: { status: 'ACTIVE' } })
    case 'USER:RESTRICT_PUBLISHING':
      return null // recorded as an action; PublishingPolicy checks active restrictions
    default:
      throw badRequest(`${action} does not apply to ${type.toLowerCase()}`, { action: 'not applicable to this target' })
  }
}

export async function resolve(moderatorId: string, reportId: string, input: { status: 'RESOLVED' | 'DISMISSED' | 'OPEN'; action?: ActionKind; reason: string; expiresAt?: string | null }) {
  const r = await db.contentReport.findUnique({ where: { id: reportId } })
  if (!r) throw notFound('Report')
  const updated = await db.$transaction(async (tx) => {
    if (input.action) {
      await apply(tx, input.action, r.targetType, r.targetId)
      // Every action is audited (12 §7).
      await tx.moderationAction.create({
        data: { moderatorId, reportId: r.id, targetType: r.targetType, targetId: r.targetId, action: input.action, reason: input.reason, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null },
      })
    }
    return tx.contentReport.update({ where: { id: r.id }, data: { status: input.status, resolvedAt: input.status === 'OPEN' ? null : new Date() }, include })
  })
  return toReport(updated, true)
}

export async function isPublishingRestricted(userId: string) {
  const a = await db.moderationAction.findFirst({
    where: { targetType: 'USER', targetId: userId, action: 'RESTRICT_PUBLISHING', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    orderBy: { createdAt: 'desc' },
  })
  return !!a
}

export async function grantAccess(moderatorId: string, programId: string, input: { userId: string; expiresAt?: string | null; reason: string }) {
  const p = await db.program.findUnique({ where: { id: programId } })
  if (!p) throw notFound('Program')
  if (!(await db.user.findUnique({ where: { id: input.userId } }))) throw notFound('User')
  const g = await db.$transaction(async (tx) => {
    const grant = await tx.programAccessGrant.create({
      // The grant itself is the audit record: source ADMIN, granting moderator in sourceRef.
      data: { userId: input.userId, programId, source: 'ADMIN', sourceRef: `admin:${moderatorId}:${crypto.randomUUID()}`, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null },
    })
    await enqueue(tx, 'ProgramAccessGranted', { userId: input.userId, programId, source: 'ADMIN' })
    return grant
  })
  return { id: g.id, userId: g.userId, programId: g.programId, source: g.source, grantedAt: g.grantedAt.toISOString(), expiresAt: g.expiresAt?.toISOString() ?? null, revokedAt: null }
}

export async function revokeAccess(moderatorId: string, grantId: string) {
  const g = await db.programAccessGrant.findUnique({ where: { id: grantId } })
  if (!g) throw notFound('Grant')
  await db.$transaction([
    db.programAccessGrant.update({ where: { id: g.id }, data: { revokedAt: new Date() } }),
    db.moderationAction.create({ data: { moderatorId, targetType: 'PROGRAM', targetId: g.programId, action: 'REVOKE_ACCESS', reason: `Grant ${g.id} revoked for ${g.userId}` } }),
  ])
}
