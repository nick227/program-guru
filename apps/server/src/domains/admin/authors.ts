// Who may author a Program or Activity (12-SOCIAL §7a). The owner always may. Platform content
// (creatorId = null) is authored by any active ADMIN through the same operations and rules.
// Viewer-facing checks (canSeeProgram, resolveAccess, canReadRevision) stay owner-only, so an
// admin's own participant experience never changes.
import { db, type Activity, type Prisma, type Program } from '@project/db'
import { isProgramOwner } from '../programs/access'
import { isOwner as isActivityOwner } from '../activities/access'

type Client = Prisma.TransactionClient | typeof db

export async function isActiveAdmin(userId: string | null, client: Client = db) {
  if (!userId) return false
  const u = await client.user.findUnique({ where: { id: userId }, select: { role: true, status: true } })
  return u?.role === 'ADMIN' && u.status === 'ACTIVE'
}

export type Author = {
  userId: string
  /** True when this user may author platform content. */
  platform: boolean
  program: (p: Pick<Program, 'creatorId' | 'deletedAt'>) => boolean
  activity: (a: Pick<Activity, 'creatorId'>) => boolean
}

/** Resolve once per operation, then use the synchronous predicates. */
export async function authorFor(userId: string, client: Client = db): Promise<Author> {
  const platform = await isActiveAdmin(userId, client)
  return {
    userId,
    platform,
    program: (p) => isProgramOwner(p, userId) || (platform && p.creatorId === null && !p.deletedAt),
    activity: (a) => isActivityOwner(a, userId) || (platform && a.creatorId === null),
  }
}
