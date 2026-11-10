// Admin membership (12-SOCIAL §7a): read-only views over existing billing and access records.
// Grants and revocations use the existing audited moderation operations; refunds stay in Stripe.
import { db, type Prisma } from '@project/db'
import { offsetArgs, toOffsetPage, type PageQuery } from '../../lib/paging'
import { activeGrantWhere } from '../programs/access'
import { toUserSummary } from '../users/mapper'

type Filters = PageQuery & { userId?: string; programId?: string }

const person = { include: { profile: true } } as const
const program = { select: { id: true, title: true, creatorId: true } } as const
const userOf = (u: { id: string; email: string; profile: Parameters<typeof toUserSummary>[0] | null }) =>
  u.profile ? { ...toUserSummary(u.profile), email: u.email } : { id: u.id, handle: null, displayName: u.email, avatarUrl: null, email: u.email }
const programOf = (p: { id: string; title: string; creatorId: string | null }) => ({ id: p.id, title: p.title, isPlatform: p.creatorId === null })
const order = [{ createdAt: 'desc' as const }, { id: 'desc' as const }]
const scope = (f: Filters) => ({ ...(f.userId ? { userId: f.userId } : {}), ...(f.programId ? { programId: f.programId } : {}) })

export async function prices(query: PageQuery & { programId?: string; active?: boolean }) {
  const { limit, skip, take } = offsetArgs(query)
  const rows = await db.programPrice.findMany({
    where: { ...(query.programId ? { programId: query.programId } : {}), ...(query.active === undefined ? {} : { active: query.active }) },
    orderBy: order,
    include: { program: program, _count: { select: { purchases: true, subscriptions: true } } },
    skip,
    take,
  })
  return toOffsetPage(rows, limit, skip, (r) => ({
    id: r.id,
    program: programOf(r.program),
    kind: r.kind,
    amountMinor: r.amountMinor,
    currency: r.currency,
    active: r.active,
    purchaseCount: r._count.purchases,
    subscriptionCount: r._count.subscriptions,
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function purchases(query: Filters & { status?: Prisma.ProgramPurchaseWhereInput['status'] & string }) {
  const { limit, skip, take } = offsetArgs(query)
  const rows = await db.programPurchase.findMany({
    where: { ...scope(query), ...(query.status ? { status: query.status } : {}) },
    orderBy: order,
    include: { user: person, program },
    skip,
    take,
  })
  return toOffsetPage(rows, limit, skip, (r) => ({
    id: r.id,
    user: userOf(r.user),
    program: programOf(r.program),
    amountMinor: r.amountMinor,
    platformFeeMinor: r.platformFeeMinor,
    currency: r.currency,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function subscriptions(query: Filters & { status?: Prisma.BillingSubscriptionWhereInput['status'] & string }) {
  const { limit, skip, take } = offsetArgs(query)
  const rows = await db.billingSubscription.findMany({
    where: { ...scope(query), ...(query.status ? { status: query.status } : {}) },
    orderBy: order,
    include: { user: person, program, price: true },
    skip,
    take,
  })
  return toOffsetPage(rows, limit, skip, (r) => ({
    id: r.id,
    user: userOf(r.user),
    program: programOf(r.program),
    amountMinor: r.price.amountMinor,
    currency: r.price.currency,
    status: r.status,
    currentPeriodEnd: r.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: r.cancelAtPeriodEnd,
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function grants(query: Filters & { source?: Prisma.ProgramAccessGrantWhereInput['source'] & string; active?: boolean }) {
  const { limit, skip, take } = offsetArgs(query)
  const now = new Date()
  const active = activeGrantWhere(now)
  const rows = await db.programAccessGrant.findMany({
    where: {
      ...scope(query),
      ...(query.source ? { source: query.source } : {}),
      ...(query.active === true ? active : query.active === false ? { NOT: active } : {}),
    },
    orderBy: [{ grantedAt: 'desc' }, { id: 'desc' }],
    include: { user: person, program },
    skip,
    take,
  })
  return toOffsetPage(rows, limit, skip, (g) => ({
    id: g.id,
    user: userOf(g.user),
    program: programOf(g.program),
    source: g.source,
    active: !g.revokedAt && (!g.expiresAt || g.expiresAt > now),
    grantedAt: g.grantedAt.toISOString(),
    expiresAt: g.expiresAt?.toISOString() ?? null,
    revokedAt: g.revokedAt?.toISOString() ?? null,
  }))
}
