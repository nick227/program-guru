// Program visibility and access (07-PROGRAMS.md §5). Visibility decides who may discover or preview;
// AccessPolicy plus authoritative grants decide who gets full content. Independent axes (02 §4).
import { db, type Program, type ProgramAccessPolicy } from '@project/db'

export type ViewerAccess = 'OWNER' | 'GRANTED' | 'PREVIEW' | 'REQUESTED' | 'LAPSED'

export const isProgramOwner = (p: Pick<Program, 'creatorId'>, viewerId: string | null) => !!viewerId && p.creatorId === viewerId

export const activeGrantWhere = (now = new Date()) => ({ revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] })

export async function hasActiveGrant(userId: string, programId: string) {
  return !!(await db.programAccessGrant.findFirst({ where: { userId, programId, ...activeGrantWhere() }, select: { id: true } }))
}

export async function resolveAccess(viewerId: string | null, program: Program): Promise<ViewerAccess> {
  if (isProgramOwner(program, viewerId)) return 'OWNER'
  if (!viewerId) return 'PREVIEW'
  if (await hasActiveGrant(viewerId, program.id)) return 'GRANTED'
  const lapsed = await db.programAccessGrant.findFirst({
    where: { userId: viewerId, programId: program.id, source: 'SUBSCRIPTION', revokedAt: null, expiresAt: { lte: new Date() } },
    select: { id: true },
  })
  if (lapsed) return 'LAPSED'
  const pending = await db.programApprovalRequest.findFirst({ where: { userId: viewerId, programId: program.id, status: 'PENDING' }, select: { id: true } })
  return pending ? 'REQUESTED' : 'PREVIEW'
}

/**
 * May this viewer see the Program at all (preview)? Owner always. Otherwise it must be published
 * or archived and not moderated; PRIVATE also requires an existing grant or enrollment (an invitation).
 * Callers return 404 when this is false so private Programs are not revealed (05 §3).
 */
export async function canSeeProgram(viewerId: string | null, program: Program) {
  if (isProgramOwner(program, viewerId)) return true
  if (program.status === 'DRAFT' || program.moderatedAt || !program.latestPublishedVersionId) return false
  if (program.visibility !== 'PRIVATE') return true
  if (!viewerId) return false
  const tie = await db.programEnrollment.findFirst({ where: { userId: viewerId, programId: program.id }, select: { id: true } })
  return !!tie || (await hasActiveGrant(viewerId, program.id))
}

/** Discovery listing rule (12 §7): published, PUBLIC, not moderated. */
export const discoverableProgramWhere = {
  status: 'PUBLISHED' as const,
  visibility: 'PUBLIC' as const,
  moderatedAt: null,
  latestPublishedVersionId: { not: null },
}

export function canJoinWithoutGrant(policy: ProgramAccessPolicy | null) {
  return (policy?.accessMode ?? 'OPEN') === 'OPEN'
}

export const marketplaceEnabled = () => process.env.MARKETPLACE_ENABLED === 'true'
