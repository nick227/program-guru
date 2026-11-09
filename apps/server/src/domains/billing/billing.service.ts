// Billing (docs/adr/0001-billing-stripe-connect.md, 05-ARCHITECTURE.md §12).
// Money state changes only through verified webhooks; this module never trusts the client.
import { passesEmailVerification } from '../../lib/verification'
import { db, type Prisma } from '@project/db'
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors'
import { withIdempotency } from '../../lib/idempotency'
import { afterCursor, pageArgs, pageOrder, toPage, type PageQuery } from '../../lib/paging'
import { billingGateway } from '../../infrastructure/stripe'
import { activeGrantWhere, isProgramOwner, marketplaceEnabled } from '../programs/access'
import { programInclude, toPrice, toProgramSummary } from '../programs/mapper'

const appUrl = (path: string) => `${(process.env.PUBLIC_APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')}${path}`
export const platformFeeBps = () => Math.min(Math.max(Number(process.env.PLATFORM_FEE_BPS ?? 1000), 0), 5000)

function assertMarketplace() {
  if (!marketplaceEnabled()) throw forbidden('Paid programs are not available yet')
}

// ── Creator payouts ─────────────────────────────────────────────────────────

const toPayout = (a: { status: 'ONBOARDING' | 'ACTIVE' | 'RESTRICTED'; chargesEnabled: boolean; payoutsEnabled: boolean }) => ({
  status: a.status,
  chargesEnabled: a.chargesEnabled,
  payoutsEnabled: a.payoutsEnabled,
})

export async function getPayoutAccount(userId: string) {
  const a = await db.creatorPayoutAccount.findUnique({ where: { userId } })
  return a ? toPayout(a) : null
}

/** Stripe-hosted onboarding for an Accounts v2 recipient account (ADR: creator account configuration). */
export async function startOnboarding(userId: string) {
  assertMarketplace()
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true } })
  if (!passesEmailVerification(user)) throw forbidden('Verify your email before setting up payouts')
  let account = await db.creatorPayoutAccount.findUnique({ where: { userId } })
  if (!account) {
    const created = await billingGateway().createRecipientAccount({ email: user.email, displayName: user.profile?.displayName ?? user.email })
    account = await db.creatorPayoutAccount.create({ data: { userId, providerAccountId: created.id, status: 'ONBOARDING' } })
  }
  return billingGateway().createOnboardingLink(account.providerAccountId, appUrl('/settings/payouts?refresh=1'), appUrl('/settings/payouts?return=1'))
}

/** Maps v2 transfers capability status to our payout account status. */
export async function syncPayoutAccount(providerAccountId: string) {
  const account = await db.creatorPayoutAccount.findUnique({ where: { providerAccountId } })
  if (!account) return
  const status = await billingGateway().transfersStatus(providerAccountId)
  const active = status === 'active'
  await db.creatorPayoutAccount.update({
    where: { userId: account.userId },
    data: { status: active ? 'ACTIVE' : status === 'pending' || status === 'unknown' ? 'ONBOARDING' : 'RESTRICTED', chargesEnabled: active, payoutsEnabled: active },
  })
}

// ── Checkout ────────────────────────────────────────────────────────────────

async function stripePriceFor(price: { id: string; programId: string; kind: 'ONE_TIME' | 'MONTHLY'; amountMinor: number; currency: string; providerPriceId: string | null }, programTitle: string) {
  if (price.providerPriceId) return price.providerPriceId
  const sibling = await db.programPrice.findFirst({ where: { programId: price.programId, providerPriceId: { not: null } } })
  const existingProductId = sibling ? await billingGateway().productOfPrice(sibling.providerPriceId!) : null
  const { priceId } = await billingGateway().ensurePrice({ programId: price.programId, programTitle, existingProductId, kind: price.kind, amountMinor: price.amountMinor, currency: price.currency })
  await db.programPrice.update({ where: { id: price.id }, data: { providerPriceId: priceId } })
  return priceId
}

export async function createCheckout(userId: string, programId: string, input: { priceId: string; idempotencyKey: string }) {
  assertMarketplace()
  const { idempotencyKey, ...request } = input
  return withIdempotency({
    userId,
    scope: `checkout:${programId}`,
    key: idempotencyKey,
    request,
    load: async (ref) => {
      const [kind, id] = ref.split(':')
      const row = kind === 'p' ? await db.programPurchase.findUniqueOrThrow({ where: { id } }) : await db.billingSubscription.findUniqueOrThrow({ where: { id } })
      // A replay returns the same session rather than opening a second one.
      return { checkoutUrl: checkoutUrls.get(ref) ?? appUrl(`/programs/${programId}?checkout=pending`), purchaseId: kind === 'p' ? row.id : null, subscriptionId: kind === 's' ? row.id : null }
    },
    run: async () => {
      const program = await db.program.findUnique({ where: { id: programId }, include: { policy: true, creator: { include: { profile: true } } } })
      if (!program || program.status !== 'PUBLISHED' || program.moderatedAt || program.visibility === 'PRIVATE') throw notFound('Program')
      if ((program.policy?.accessMode ?? 'OPEN') !== 'PAID') throw badRequest('This program is not sold')
      if (isProgramOwner(program, userId)) throw badRequest('You own this program')
      const price = await db.programPrice.findFirst({ where: { id: input.priceId, programId, active: true } })
      if (!price) throw badRequest('That price is not available', { priceId: 'not available' })
      if (await db.programAccessGrant.findFirst({ where: { userId, programId, ...activeGrantWhere() } })) throw conflict('You already have access to this program')
      if (price.kind === 'MONTHLY' && (await db.billingSubscription.findFirst({ where: { userId, programId, status: { in: ['ACTIVE', 'PAST_DUE'] } } }))) {
        throw conflict('You already subscribe to this program')
      }
      const payout = program.creatorId ? await db.creatorPayoutAccount.findUnique({ where: { userId: program.creatorId } }) : null
      // Re-check the creator's transfers capability before taking money (ADR: creator readiness).
      if (!payout || (await billingGateway().transfersStatus(payout.providerAccountId)) !== 'active') {
        throw new AppError('PAYMENT_REQUIRED', 'This creator cannot accept payments right now')
      }
      const buyer = await db.user.findUniqueOrThrow({ where: { id: userId } })
      const stripePriceId = await stripePriceFor(price, program.title)
      const mode = price.kind === 'ONE_TIME' ? ('payment' as const) : ('subscription' as const)
      const row =
        mode === 'payment'
          ? await db.programPurchase.create({ data: { userId, programId, priceId: price.id, amountMinor: price.amountMinor, platformFeeMinor: Math.round((price.amountMinor * platformFeeBps()) / 10_000), currency: price.currency } })
          : await db.billingSubscription.create({ data: { userId, programId, priceId: price.id } })
      const ref = mode === 'payment' ? `p:${row.id}` : `s:${row.id}`
      const session = await billingGateway().createCheckout({
        mode,
        stripePriceId,
        destinationAccountId: payout.providerAccountId,
        platformFeeBps: platformFeeBps(),
        amountMinor: price.amountMinor,
        customerEmail: buyer.email,
        successUrl: appUrl(`/programs/${programId}?checkout=success&session_id={CHECKOUT_SESSION_ID}`),
        cancelUrl: appUrl(`/programs/${programId}?checkout=cancelled`),
        metadata: { userId, programId, priceId: price.id, ref },
        idempotencyKey: `${userId}:${idempotencyKey}`,
      })
      if (mode === 'payment') await db.programPurchase.update({ where: { id: row.id }, data: { providerCheckoutId: session.id } })
      else await db.billingSubscription.update({ where: { id: row.id }, data: { providerCheckoutId: session.id } })
      checkoutUrls.set(ref, session.url)
      return { ref, result: { checkoutUrl: session.url, purchaseId: mode === 'payment' ? row.id : null, subscriptionId: mode === 'subscription' ? row.id : null } }
    },
  })
}

// Session URLs are short-lived and not stored; a replay inside this process reuses it.
const checkoutUrls = new Map<string, string>()

// ── Buyer views ─────────────────────────────────────────────────────────────

export async function listPurchases(userId: string, query: PageQuery) {
  const { limit, take } = pageArgs(query)
  const rows = await db.programPurchase.findMany({ where: { userId, status: { not: 'PENDING' }, ...afterCursor(query.cursor) }, orderBy: pageOrder, take, include: { program: { include: programInclude } } })
  return toPage(rows, limit, (p) => ({
    id: p.id,
    program: toProgramSummary(p.program, 'GRANTED'),
    amountMinor: p.amountMinor,
    currency: p.currency,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
  }))
}

const subscriptionInclude = { program: { include: programInclude }, price: true } satisfies Prisma.BillingSubscriptionInclude
const toSubscription = (s: Prisma.BillingSubscriptionGetPayload<{ include: typeof subscriptionInclude }>) => ({
  id: s.id,
  program: toProgramSummary(s.program, s.status === 'ACTIVE' || s.status === 'PAST_DUE' ? 'GRANTED' : 'LAPSED'),
  price: toPrice(s.price),
  status: s.status,
  currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
  cancelAtPeriodEnd: s.cancelAtPeriodEnd,
  createdAt: s.createdAt.toISOString(),
})

export async function listSubscriptions(userId: string, query: PageQuery) {
  const { limit, take } = pageArgs(query)
  const rows = await db.billingSubscription.findMany({ where: { userId, status: { not: 'INCOMPLETE' }, ...afterCursor(query.cursor) }, orderBy: pageOrder, take, include: subscriptionInclude })
  return toPage(rows, limit, toSubscription)
}

async function ownSubscription(userId: string, id: string) {
  const s = await db.billingSubscription.findUnique({ where: { id }, include: subscriptionInclude })
  if (!s || s.userId !== userId || !s.providerSubscriptionId) throw notFound('Subscription')
  return s
}

/** Cancels at period end: access continues until then (07 §8). Webhooks confirm the change. */
export async function setCancel(userId: string, id: string, cancel: boolean) {
  const s = await ownSubscription(userId, id)
  if (!['ACTIVE', 'PAST_DUE'].includes(s.status)) throw badRequest('This subscription has ended')
  await billingGateway().setCancelAtPeriodEnd(s.providerSubscriptionId!, cancel)
  return toSubscription(await db.billingSubscription.update({ where: { id: s.id }, data: { cancelAtPeriodEnd: cancel }, include: subscriptionInclude }))
}

export async function portalLink(userId: string) {
  const s = await db.billingSubscription.findFirst({ where: { userId, providerSubscriptionId: { not: null } }, orderBy: { createdAt: 'desc' } })
  if (!s) throw notFound('Subscription')
  const { customerId } = await billingGateway().subscription(s.providerSubscriptionId!)
  return billingGateway().portalLink(customerId, appUrl('/settings/billing'))
}

/** Aggregates only, never participant data (07 §2). */
export async function earnings(userId: string) {
  const purchases = await db.programPurchase.findMany({ where: { program: { creatorId: userId }, status: 'PAID' } })
  const subs = await db.billingSubscription.findMany({ where: { program: { creatorId: userId } }, select: { providerSubscriptionId: true, status: true } })
  const subIds = new Set(subs.map((s) => s.providerSubscriptionId).filter(Boolean))
  const invoices = subIds.size
    ? (await db.billingEvent.findMany({ where: { type: 'invoice.paid', processedAt: { not: null } } })).filter((e) => subIds.has(invoiceSubscriptionId((e.payload as any)?.data?.object)))
    : []
  const invoiceGross = invoices.reduce((n, e) => n + Number((e.payload as any).data.object.amount_paid ?? 0), 0)
  const gross = purchases.reduce((n, p) => n + p.amountMinor, 0) + invoiceGross
  const fees = purchases.reduce((n, p) => n + p.platformFeeMinor, 0) + Math.round((invoiceGross * platformFeeBps()) / 10_000)
  return { currency: 'USD', grossMinor: gross, platformFeesMinor: fees, netMinor: gross - fees, activeSubscriptions: subs.filter((s) => s.status === 'ACTIVE').length, purchases: purchases.length }
}

/** Newer API versions moved invoice.subscription under parent.subscription_details. */
export function invoiceSubscriptionId(invoice: any): string | null {
  const s = invoice?.parent?.subscription_details?.subscription ?? invoice?.subscription ?? null
  return typeof s === 'string' ? s : s?.id ?? null
}
