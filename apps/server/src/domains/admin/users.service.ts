// Admin accounts (12-SOCIAL §7a): search, inspect, change role, suspend and reactivate.
import { db, type Prisma } from '@project/db'
import { badRequest, conflict, notFound } from '../../lib/errors'
import { offsetArgs, toOffsetPage, type PageQuery } from '../../lib/paging'
import { mediaUrl } from '../media/urls'
import { audit } from './audit'

type Tx = Prisma.TransactionClient
type Role = 'USER' | 'MODERATOR' | 'ADMIN'
type Status = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED'

/**
 * Refuses a change that would leave no active ADMIN. Locks every active ADMIN row first, so two
 * concurrent demotions serialize and the second sees the first (InnoDB locking reads).
 * Call inside the transaction that makes the change, for every path that can remove an admin.
 */
export async function assertAdminRemains(tx: Tx, leavingUserId: string) {
  const admins = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM \`User\` WHERE role = 'ADMIN' AND status = 'ACTIVE' FOR UPDATE`
  if (admins.some((a) => a.id === leavingUserId) && admins.length <= 1) {
    throw conflict('This is the last active admin. Make another admin first.')
  }
}

const include = { profile: true } satisfies Prisma.UserInclude
type Row = Prisma.UserGetPayload<{ include: typeof include }>

export const toAdminUser = (u: Row) => ({
  id: u.id,
  email: u.email,
  handle: u.profile?.handle ?? null,
  displayName: u.profile?.displayName ?? u.email,
  avatarUrl: mediaUrl(u.profile?.avatarMediaId ?? null),
  role: u.role,
  status: u.status,
  emailVerified: !!u.emailVerifiedAt,
  createdAt: u.createdAt.toISOString(),
})

export async function list(query: PageQuery & { q?: string; role?: Role; status?: Status }) {
  const { limit, skip, take } = offsetArgs(query)
  const q = query.q?.trim()
  const rows = await db.user.findMany({
    where: {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(q ? { OR: [{ email: { contains: q } }, { profile: { handle: { contains: q } } }, { profile: { displayName: { contains: q } } }] } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include,
    skip,
    take,
  })
  return toOffsetPage(rows, limit, skip, toAdminUser)
}

export async function get(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, include })
  if (!u) throw notFound('User')
  const [programs, activities, enrollments, purchases, subscriptions, grants] = await Promise.all([
    db.program.count({ where: { creatorId: userId, deletedAt: null } }),
    db.activity.count({ where: { creatorId: userId } }),
    db.programEnrollment.count({ where: { userId } }),
    db.programPurchase.count({ where: { userId } }),
    db.billingSubscription.count({ where: { userId } }),
    db.programAccessGrant.count({ where: { userId } }),
  ])
  return { ...toAdminUser(u), deactivatedAt: u.deactivatedAt?.toISOString() ?? null, counts: { programs, activities, enrollments, purchases, subscriptions, grants } }
}

export async function update(actorId: string, userId: string, input: { role?: Role; status?: 'ACTIVE' | 'SUSPENDED'; reason: string }) {
  const reason = input.reason.trim()
  if (!reason) throw badRequest('Give a reason', { reason: 'is required' })
  if (!input.role && !input.status) throw badRequest('Nothing to change', { role: 'or status is required' })
  if (actorId === userId && input.status === 'SUSPENDED') throw badRequest('You cannot suspend your own account', { status: 'is your own account' })
  await db.$transaction(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: userId } })
    if (!u) throw notFound('User')
    if (input.status && u.status === 'DEACTIVATED') throw badRequest('Deactivated accounts are reactivated by their owner', { status: 'account is deactivated' })
    const losesAdmin = u.role === 'ADMIN' && ((input.role && input.role !== 'ADMIN') || input.status === 'SUSPENDED')
    if (losesAdmin) await assertAdminRemains(tx, userId)
    if (input.role && input.role !== u.role) {
      await tx.user.update({ where: { id: userId }, data: { role: input.role } })
      await audit(tx, actorId, 'USER', userId, 'ROLE_CHANGE', `${u.role} → ${input.role}: ${reason}`)
    }
    if (input.status && input.status !== u.status) {
      await tx.user.update({ where: { id: userId }, data: { status: input.status } })
      // Suspension signs the account out everywhere, as moderation does (12 §7).
      if (input.status === 'SUSPENDED') await tx.session.deleteMany({ where: { userId } })
      await audit(tx, actorId, 'USER', userId, input.status === 'SUSPENDED' ? 'SUSPEND_USER' : 'RESTORE', reason)
    }
  })
  return get(userId)
}

/**
 * Initial admins (12 §7a): promote or demote an existing account from a server-side command.
 * Idempotent; never creates accounts; audited with no actor.
 */
export async function setAdminByEmail(email: string, makeAdmin: boolean) {
  const normalized = email.trim().toLowerCase()
  return db.$transaction(async (tx) => {
    const u = await tx.user.findUnique({ where: { email: normalized } })
    if (!u) throw notFound('Account')
    if (makeAdmin && u.status !== 'ACTIVE') throw badRequest('Only active accounts can become admins', { email: `account is ${u.status.toLowerCase()}` })
    const target: Role = makeAdmin ? 'ADMIN' : 'USER'
    if (makeAdmin ? u.role === 'ADMIN' : u.role !== 'ADMIN') return { email: normalized, role: u.role, changed: false }
    if (!makeAdmin) await assertAdminRemains(tx, u.id)
    await tx.user.update({ where: { id: u.id }, data: { role: target } })
    await audit(tx, null, 'USER', u.id, 'ROLE_CHANGE', `${u.role} → ${target}: server command`)
    return { email: normalized, role: target, changed: true }
  })
}
