// Verified Stripe events → purchases, subscriptions, grants, payout accounts (ADR 0001).
// Every event is stored once (BillingEvent, unique provider event id) and processed idempotently,
// so Stripe's retries and out-of-order deliveries converge on the same state.
import { Prisma, db } from '@project/db'
import { badRequest } from '../../lib/errors'
import { webhookClient } from '../../infrastructure/stripe'
import { invoiceSubscriptionId, syncPayoutAccount } from './billing.service'

const GRACE_MS = 3 * 86_400_000
type Tx = Prisma.TransactionClient

/** Verifies the signature over the raw body: snapshot events first, then Accounts v2 thin events. */
export function verify(rawBody: string, signature: string | undefined): { id: string; type: string; payload: any; thin: boolean } {
  if (!signature) throw badRequest('Missing Stripe signature')
  const stripe = webhookClient()
  const snapshot = process.env.STRIPE_WEBHOOK_SECRET
  const thin = process.env.STRIPE_THIN_WEBHOOK_SECRET
  if (snapshot) {
    try {
      const e = stripe.webhooks.constructEvent(rawBody, signature, snapshot)
      return { id: e.id, type: e.type, payload: e, thin: false }
    } catch {
      /* fall through to the thin-event secret */
    }
  }
  if (thin) {
    try {
      const n = stripe.parseEventNotification(rawBody, signature, thin) as any
      return { id: n.id, type: n.type, payload: JSON.parse(rawBody), thin: true }
    } catch {
      /* invalid for both */
    }
  }
  throw badRequest('Invalid Stripe signature')
}

async function grantPurchase(tx: Tx, purchaseId: string) {
  const p = await tx.programPurchase.findUniqueOrThrow({ where: { id: purchaseId } })
  await tx.programAccessGrant.upsert({
    where: { source_sourceRef: { source: 'PURCHASE', sourceRef: p.id } },
    create: { userId: p.userId, programId: p.programId, source: 'PURCHASE', sourceRef: p.id },
    update: { revokedAt: null },
  })
  await tx.outboxEvent.create({ data: { type: 'ProgramAccessGranted', payload: { userId: p.userId, programId: p.programId, source: 'PURCHASE' } } })
}

async function revokePurchase(tx: Tx, purchaseId: string) {
  await tx.programAccessGrant.updateMany({ where: { source: 'PURCHASE', sourceRef: purchaseId, revokedAt: null }, data: { revokedAt: new Date() } })
}

/** Subscription grant: one row per subscription, expiry moved to period end + grace on each renewal. */
async function extendSubscriptionGrant(tx: Tx, subscriptionId: string, periodEnd: Date) {
  const s = await tx.billingSubscription.findUniqueOrThrow({ where: { id: subscriptionId } })
  const expiresAt = new Date(periodEnd.getTime() + GRACE_MS)
  const existing = await tx.programAccessGrant.findUnique({ where: { source_sourceRef: { source: 'SUBSCRIPTION', sourceRef: s.id } } })
  await tx.programAccessGrant.upsert({
    where: { source_sourceRef: { source: 'SUBSCRIPTION', sourceRef: s.id } },
    create: { userId: s.userId, programId: s.programId, source: 'SUBSCRIPTION', sourceRef: s.id, expiresAt },
    // Never shorten an expiry because an older event arrived late.
    update: { revokedAt: null, expiresAt: existing?.expiresAt && existing.expiresAt > expiresAt ? existing.expiresAt : expiresAt },
  })
  if (!existing) await tx.outboxEvent.create({ data: { type: 'ProgramAccessGranted', payload: { userId: s.userId, programId: s.programId, source: 'SUBSCRIPTION' } } })
}

const subscriptionStatus = (status: string) =>
  (({ active: 'ACTIVE', trialing: 'ACTIVE', past_due: 'PAST_DUE', unpaid: 'PAST_DUE', canceled: 'CANCELED', incomplete: 'INCOMPLETE', incomplete_expired: 'EXPIRED' }) as const)[status] ?? 'INCOMPLETE'

async function checkoutCompleted(tx: Tx, session: any) {
  // Fulfil only when paid: delayed methods complete while still unpaid (ADR: fulfillment).
  if (session.mode === 'payment') {
    const purchase = await tx.programPurchase.findUnique({ where: { providerCheckoutId: session.id } })
    if (!purchase) return
    const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null
    if (paymentIntent && !purchase.providerPaymentId) await tx.programPurchase.update({ where: { id: purchase.id }, data: { providerPaymentId: paymentIntent } })
    if (session.payment_status === 'unpaid' || purchase.status !== 'PENDING') return
    await tx.programPurchase.update({ where: { id: purchase.id }, data: { status: 'PAID' } })
    await grantPurchase(tx, purchase.id)
  } else if (session.mode === 'subscription') {
    const sub = await tx.billingSubscription.findUnique({ where: { providerCheckoutId: session.id } })
    const providerId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
    if (!sub || !providerId) return
    // Link only; access starts on invoice.paid.
    if (!sub.providerSubscriptionId) await tx.billingSubscription.update({ where: { id: sub.id }, data: { providerSubscriptionId: providerId } })
    // The Program was deleted while this checkout was open: never renew it (07 §6).
    const program = await tx.program.findUnique({ where: { id: sub.programId }, select: { deletedAt: true } })
    if (program?.deletedAt) await tx.outboxEvent.create({ data: { type: 'ProgramSubscriptionsCancel', payload: { programId: sub.programId } } })
  }
}

async function subscriptionFor(tx: Tx, providerSubscriptionId: string | null) {
  return providerSubscriptionId ? tx.billingSubscription.findUnique({ where: { providerSubscriptionId } }) : null
}

async function invoicePaid(tx: Tx, invoice: any) {
  const sub = await subscriptionFor(tx, invoiceSubscriptionId(invoice))
  if (!sub) return
  const periodEnd = Math.max(0, ...((invoice.lines?.data ?? []) as any[]).map((l) => Number(l.period?.end ?? 0)))
  if (!periodEnd) return
  await tx.billingSubscription.update({ where: { id: sub.id }, data: { status: 'ACTIVE', currentPeriodEnd: new Date(periodEnd * 1000) } })
  await extendSubscriptionGrant(tx, sub.id, new Date(periodEnd * 1000))
}

async function invoicePaymentFailed(tx: Tx, invoice: any) {
  const sub = await subscriptionFor(tx, invoiceSubscriptionId(invoice))
  if (!sub) return
  // Access continues through the grace window; Stripe's retries decide the outcome (ADR: lapse).
  await tx.billingSubscription.update({ where: { id: sub.id }, data: { status: 'PAST_DUE' } })
  await tx.outboxEvent.create({ data: { type: 'PaymentIssue', payload: { userId: sub.userId, title: 'Your payment did not go through', entityKind: 'SUBSCRIPTION', entityId: sub.id } } })
}

async function subscriptionChanged(tx: Tx, s: any, deleted: boolean) {
  const sub = await subscriptionFor(tx, s.id)
  if (!sub) return
  const periodEnd = s.items?.data?.[0]?.current_period_end ?? null
  await tx.billingSubscription.update({
    where: { id: sub.id },
    data: {
      status: deleted ? 'CANCELED' : subscriptionStatus(s.status),
      cancelAtPeriodEnd: !!s.cancel_at_period_end,
      ...(periodEnd ? { currentPeriodEnd: new Date(periodEnd * 1000) } : {}),
    },
  })
  // Ended: the grant runs to the paid-through date and then expires; history stays (07 §8).
  if (deleted || ['incomplete_expired'].includes(s.status)) {
    const end = sub.currentPeriodEnd ?? new Date()
    await tx.programAccessGrant.updateMany({ where: { source: 'SUBSCRIPTION', sourceRef: sub.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: end } }] }, data: { expiresAt: end } })
  }
}

async function purchaseForPaymentIntent(tx: Tx, paymentIntent: unknown) {
  const id = typeof paymentIntent === 'string' ? paymentIntent : (paymentIntent as any)?.id
  return id ? tx.programPurchase.findUnique({ where: { providerPaymentId: id } }) : null
}

async function chargeRefunded(tx: Tx, charge: any) {
  const purchase = await purchaseForPaymentIntent(tx, charge.payment_intent)
  // Full refunds end one-time access; partial refunds keep it (ADR: refunds).
  if (!purchase || !charge.refunded) return
  await tx.programPurchase.update({ where: { id: purchase.id }, data: { status: 'REFUNDED' } })
  await revokePurchase(tx, purchase.id)
}

async function disputeCreated(tx: Tx, dispute: any) {
  const purchase = await purchaseForPaymentIntent(tx, dispute.payment_intent)
  if (!purchase || purchase.status === 'REFUNDED') return
  await tx.programPurchase.update({ where: { id: purchase.id }, data: { status: 'DISPUTED' } })
  await revokePurchase(tx, purchase.id)
}

async function disputeClosed(tx: Tx, dispute: any) {
  const purchase = await purchaseForPaymentIntent(tx, dispute.payment_intent)
  if (!purchase || purchase.status !== 'DISPUTED' || dispute.status !== 'won') return
  await tx.programPurchase.update({ where: { id: purchase.id }, data: { status: 'PAID' } })
  await grantPurchase(tx, purchase.id)
}

async function earlyFraudWarning(tx: Tx, warning: any) {
  const purchase = await purchaseForPaymentIntent(tx, warning.payment_intent)
  const admins = await tx.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true } })
  for (const a of admins) {
    await tx.outboxEvent.create({ data: { type: 'PaymentIssue', payload: { userId: a.id, title: 'Early fraud warning on a purchase', entityKind: 'PURCHASE', entityId: purchase?.id ?? warning.id } } })
  }
}

/** Process one verified event. Returns false when it was already processed (a replay). */
export async function processEvent(e: { id: string; type: string; payload: any; thin: boolean }) {
  try {
    await db.billingEvent.create({ data: { providerEventId: e.id, type: e.type, payload: e.payload } })
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err
    const existing = await db.billingEvent.findUniqueOrThrow({ where: { providerEventId: e.id } })
    if (existing.processedAt) return false
  }
  try {
    if (e.thin) {
      // Accounts v2 thin events carry only a reference: re-read the account's current state.
      const accountId = e.payload?.related_object?.id
      if (e.type.startsWith('v2.core.account') && accountId) await syncPayoutAccount(accountId)
    } else {
      const object = e.payload.data?.object
      await db.$transaction(async (tx) => {
        switch (e.type) {
          case 'checkout.session.completed':
          case 'checkout.session.async_payment_succeeded':
            return checkoutCompleted(tx, object)
          case 'checkout.session.async_payment_failed': {
            const purchase = await tx.programPurchase.findUnique({ where: { providerCheckoutId: object.id } })
            if (purchase) await tx.outboxEvent.create({ data: { type: 'PaymentIssue', payload: { userId: purchase.userId, title: 'Your payment did not go through', entityKind: 'PURCHASE', entityId: purchase.id } } })
            return
          }
          case 'invoice.paid':
            return invoicePaid(tx, object)
          case 'invoice.payment_failed':
            return invoicePaymentFailed(tx, object)
          case 'customer.subscription.updated':
            return subscriptionChanged(tx, object, false)
          case 'customer.subscription.deleted':
            return subscriptionChanged(tx, object, true)
          case 'charge.refunded':
            return chargeRefunded(tx, object)
          case 'charge.dispute.created':
            return disputeCreated(tx, object)
          case 'charge.dispute.closed':
            return disputeClosed(tx, object)
          case 'radar.early_fraud_warning.created':
            return earlyFraudWarning(tx, object)
          default:
            return // stored for audit; not subscribed in production
        }
      })
    }
    await db.billingEvent.update({ where: { providerEventId: e.id }, data: { processedAt: new Date(), error: null } })
    return true
  } catch (err) {
    await db.billingEvent.update({ where: { providerEventId: e.id }, data: { error: String((err as Error).message).slice(0, 2000) } })
    throw err
  }
}

