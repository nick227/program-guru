// Required test 5 (01 §6): a creator sells through a one-time purchase or monthly subscription and
// server-verified entitlements control access. Stripe calls go to a fake gateway; webhooks are signed
// with the real SDK helper and verified exactly as in production.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Stripe from 'stripe'
import { db } from '@project/db'
import { buildTestApp, asAuth, validateResponse, testUserId, testOtherUserId, seedUser } from './helpers'
import { seedCatalog } from './helpers/fixtures'
import { setBillingGateway, type BillingGateway, type CheckoutRequest } from '../infrastructure/stripe'
import { contractCase } from './helpers/contract'

const app = buildTestApp()
const SECRET = 'whsec_test_snapshot'
const THIN_SECRET = 'whsec_test_thin'
const carolId = '00000000-0000-4000-8000-0000000000c0'
const signer = new Stripe('sk_test_signature_only')

class FakeGateway implements BillingGateway {
  transfers = 'pending'
  checkouts: (CheckoutRequest & { id: string })[] = []
  cancels: [string, boolean][] = []
  async createRecipientAccount() {
    return { id: 'acct_creator_1' }
  }
  async createOnboardingLink() {
    return { url: 'https://connect.stripe.test/onboarding/acct_creator_1' }
  }
  async transfersStatus() {
    return this.transfers
  }
  async ensurePrice(i: { kind: string; amountMinor: number }) {
    return { priceId: `price_${i.kind}_${i.amountMinor}`, productId: 'prod_1' }
  }
  async productOfPrice() {
    return 'prod_1'
  }
  async createCheckout(r: CheckoutRequest) {
    const id = `cs_test_${this.checkouts.length + 1}`
    this.checkouts.push({ ...r, id })
    return { id, url: `https://checkout.stripe.test/${id}` }
  }
  async setCancelAtPeriodEnd(id: string, cancel: boolean) {
    this.cancels.push([id, cancel])
  }
  async subscription() {
    return { status: 'active', customerId: 'cus_1', currentPeriodEnd: null, cancelAtPeriodEnd: false }
  }
  async portalLink() {
    return { url: 'https://billing.stripe.test/portal' }
  }
}

let gw: FakeGateway
let cat: Awaited<ReturnType<typeof seedCatalog>>
let n = 0
beforeEach(async () => {
  process.env.MARKETPLACE_ENABLED = 'true'
  process.env.STRIPE_WEBHOOK_SECRET = SECRET
  process.env.STRIPE_THIN_WEBHOOK_SECRET = THIN_SECRET
  gw = new FakeGateway()
  setBillingGateway(gw)
  cat = await seedCatalog()
  await seedUser(carolId, 'carol')
})
afterEach(() => {
  delete process.env.MARKETPLACE_ENABLED
  setBillingGateway(null)
})

const req = (method: string, url: string, payload?: unknown, userId = testUserId) =>
  app.inject({ method: method as any, url, headers: asAuth(userId), ...(payload !== undefined ? { payload: payload as any } : {}) })

function webhook(type: string, object: unknown, opts: { id?: string; secret?: string; signature?: string; thin?: boolean } = {}) {
  const id = opts.id ?? `evt_${++n}`
  const body = opts.thin
    ? JSON.stringify({ id, object: 'v2.core.event', type, related_object: object, created: new Date().toISOString(), livemode: false })
    : JSON.stringify({ id, object: 'event', type, api_version: '2026-10-28.endive', created: Math.floor(Date.now() / 1000), data: { object }, livemode: false })
  const signature = opts.signature ?? signer.webhooks.generateTestHeaderString({ payload: body, secret: opts.secret ?? (opts.thin ? THIN_SECRET : SECRET) })
  return app.inject({ method: 'POST', url: '/billing/webhooks/stripe', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, payload: body })
}

/** Alice onboards for payouts (activated by an Accounts v2 thin event) and publishes a PAID program. */
async function paidProgram() {
  const link = await req('POST', '/billing/payout-account/onboarding')
  expect(link.statusCode).toBe(200)
  await validateResponse('startPayoutOnboarding', 200, link.json())
  expect((await req('GET', '/billing/payout-account')).json().data.status).toBe('ONBOARDING')
  gw.transfers = 'active'
  const thin = await webhook('v2.core.account[configuration.recipient].capability_status_updated', { id: 'acct_creator_1', type: 'v2.core.account' }, { thin: true })
  expect(thin.statusCode).toBe(200)
  const payout = await req('GET', '/billing/payout-account')
  await validateResponse('getPayoutAccount', 200, payout.json())
  expect(payout.json().data).toMatchObject({ status: 'ACTIVE', payoutsEnabled: true })

  let ws = (await req('POST', '/programs', { programTypeId: cat.workout.id })).json().data
  ws = (await req('POST', `/programs/${ws.id}/draft/activities`, { activityIds: [cat.squats.activity.id], expectedRevision: ws.draftRevision })).json().data
  await req('PUT', `/programs/${ws.id}/prices`, { prices: [{ kind: 'ONE_TIME', amountMinor: 1900 }, { kind: 'MONTHLY', amountMinor: 500 }] })
  ws = (await req('GET', `/programs/${ws.id}/workspace`)).json().data
  const pub = await req('POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'PAID', expectedRevision: ws.draftRevision })
  expect(pub.statusCode).toBe(200)
  const preview = (await req('GET', `/programs/${ws.id}`, undefined, testOtherUserId)).json().data
  return { programId: ws.id as string, versionId: pub.json().data.latestPublishedVersionId as string, prices: preview.prices as { id: string; kind: string }[], preview }
}

const join = (programId: string, versionId: string, userId: string, key: string) =>
  req('POST', `/programs/${programId}/enrollments`, { programVersionId: versionId, startLocalDate: '2026-11-09', timezone: 'America/Chicago', idempotencyKey: key }, userId)

describe('feature flag (disabled by default)', () => {
  it('refuses onboarding, checkout, and PAID publishing while MARKETPLACE_ENABLED is off', async () => {
    delete process.env.MARKETPLACE_ENABLED
    expect((await req('POST', '/billing/payout-account/onboarding')).statusCode).toBe(403)
    let ws = (await req('POST', '/programs', { programTypeId: cat.workout.id })).json().data
    ws = (await req('POST', `/programs/${ws.id}/draft/activities`, { activityIds: [cat.squats.activity.id], expectedRevision: ws.draftRevision })).json().data
    const check = (await req('GET', `/programs/${ws.id}/publish-check`)).json().data
    expect(check.marketplaceEnabled).toBe(false)
    const res = await req('POST', `/programs/${ws.id}/publish`, { visibility: 'PUBLIC', accessMode: 'PAID', expectedRevision: ws.draftRevision })
    expect(res.statusCode).toBe(400)
    expect((await req('POST', `/programs/${ws.id}/checkout`, { priceId: crypto.randomUUID(), idempotencyKey: 'flag-off-key' }, testOtherUserId)).statusCode).toBe(403)
  })
})

describe('one-time purchase (required test 5)', () => {
  it('grants access only from a verified webhook; refunds revoke it and lock content while history stays', async () => {
    const { programId, versionId, prices, preview } = await paidProgram()
    expect(preview).toMatchObject({ canPurchase: true, canJoin: false, accessMode: 'PAID' })
    const oneTime = prices.find((p) => p.kind === 'ONE_TIME')!

    expect((await join(programId, versionId, testOtherUserId, 'join-before-pay')).statusCode).toBe(402)
    const checkout = await req('POST', `/programs/${programId}/checkout`, { priceId: oneTime.id, idempotencyKey: 'checkout-one-time' }, testOtherUserId)
    expect(checkout.statusCode).toBe(201)
    await validateResponse('createProgramCheckout', 201, checkout.json())
    expect(checkout.json().data.checkoutUrl).toBe('https://checkout.stripe.test/cs_test_1')
    const replay = await req('POST', `/programs/${programId}/checkout`, { priceId: oneTime.id, idempotencyKey: 'checkout-one-time' }, testOtherUserId)
    expect(replay.json().data.purchaseId).toBe(checkout.json().data.purchaseId)
    expect(gw.checkouts).toHaveLength(1)
    expect(gw.checkouts[0]).toMatchObject({ mode: 'payment', destinationAccountId: 'acct_creator_1', platformFeeBps: 1000, amountMinor: 1900 })

    // Returning from Checkout is not proof of payment: still locked.
    expect((await join(programId, versionId, testOtherUserId, 'join-after-redirect')).statusCode).toBe(402)
    // A forged event changes nothing.
    const forged = await webhook('checkout.session.completed', { id: 'cs_test_1', mode: 'payment', payment_status: 'paid', payment_intent: 'pi_1' }, { signature: 't=1,v1=deadbeef' })
    expect(forged.statusCode).toBe(400)
    expect(await db.programAccessGrant.count({ where: { userId: testOtherUserId, source: 'PURCHASE' } })).toBe(0)

    const event = { id: 'cs_test_1', mode: 'payment', payment_status: 'paid', payment_intent: 'pi_1' }
    expect((await webhook('checkout.session.completed', event, { id: 'evt_paid' })).statusCode).toBe(200)
    expect((await webhook('checkout.session.completed', event, { id: 'evt_paid' })).statusCode).toBe(200) // replay
    expect(await db.programAccessGrant.count({ where: { userId: testOtherUserId, source: 'PURCHASE', revokedAt: null } })).toBe(1)
    expect(await db.billingEvent.count({ where: { providerEventId: 'evt_paid' } })).toBe(1)
    const purchases = await req('GET', '/billing/purchases', undefined, testOtherUserId)
    await validateResponse('listMyPurchases', 200, purchases.json())
    expect(purchases.json().data[0]).toMatchObject({ status: 'PAID', amountMinor: 1900 })

    const joined = await join(programId, versionId, testOtherUserId, 'join-after-pay')
    expect(joined.statusCode).toBe(201)
    expect((await req('GET', `/program-versions/${versionId}`, undefined, testOtherUserId)).statusCode).toBe(200)
    const earnings = await req('GET', '/billing/earnings')
    await validateResponse('getCreatorEarnings', 200, earnings.json())
    expect(earnings.json().data).toMatchObject({ grossMinor: 1900, platformFeesMinor: 190, netMinor: 1710, purchases: 1 })

    // Full refund: access ends, history and calendar stay, content locks.
    const item = await db.calendarItem.findFirstOrThrow({ where: { ownerId: testOtherUserId } })
    const s = (await req('POST', '/sessions', { calendarItemId: item.id, idempotencyKey: 'session-paid-1' }, testOtherUserId)).json().data
    await req('POST', `/sessions/${s.id}/results`, { values: [{ metricDefinitionId: cat.reps.id, value: 15 }] }, testOtherUserId)
    await webhook('charge.refunded', { id: 'ch_1', payment_intent: 'pi_1', refunded: true, amount: 1900, amount_refunded: 1900 })
    expect((await db.programPurchase.findFirstOrThrow({ where: { userId: testOtherUserId } })).status).toBe('REFUNDED')
    expect((await req('GET', `/program-versions/${versionId}`, undefined, testOtherUserId)).statusCode).toBe(404)
    const occ = (await req('GET', `/calendar-items/${item.id}/occurrence`, undefined, testOtherUserId)).json().data
    expect(occ.item.locked).toBe(true)
    expect(occ.instructions).toEqual([])
    expect(occ.resultInputs[0].recorded).toBe(15) // the user's own record survives
  })

  it('a dispute revokes access and a won dispute restores it', async () => {
    const { programId, prices } = await paidProgram()
    await req('POST', `/programs/${programId}/checkout`, { priceId: prices.find((p) => p.kind === 'ONE_TIME')!.id, idempotencyKey: 'checkout-dispute' }, testOtherUserId)
    await webhook('checkout.session.completed', { id: 'cs_test_1', mode: 'payment', payment_status: 'paid', payment_intent: 'pi_d' })
    await webhook('charge.dispute.created', { id: 'dp_1', payment_intent: 'pi_d', status: 'needs_response' })
    expect((await db.programPurchase.findFirstOrThrow({ where: { userId: testOtherUserId } })).status).toBe('DISPUTED')
    expect(await db.programAccessGrant.count({ where: { userId: testOtherUserId, revokedAt: null } })).toBe(0)
    await webhook('charge.dispute.closed', { id: 'dp_1', payment_intent: 'pi_d', status: 'won' })
    expect((await db.programPurchase.findFirstOrThrow({ where: { userId: testOtherUserId } })).status).toBe('PAID')
    expect(await db.programAccessGrant.count({ where: { userId: testOtherUserId, revokedAt: null } })).toBe(1)
  })

  it('delayed payment methods are not fulfilled while unpaid', async () => {
    const { programId, prices } = await paidProgram()
    await req('POST', `/programs/${programId}/checkout`, { priceId: prices.find((p) => p.kind === 'ONE_TIME')!.id, idempotencyKey: 'checkout-delayed' }, testOtherUserId)
    await webhook('checkout.session.completed', { id: 'cs_test_1', mode: 'payment', payment_status: 'unpaid', payment_intent: 'pi_ach' })
    expect(await db.programAccessGrant.count({ where: { userId: testOtherUserId } })).toBe(0)
    await webhook('checkout.session.async_payment_succeeded', { id: 'cs_test_1', mode: 'payment', payment_status: 'paid', payment_intent: 'pi_ach' })
    expect(await db.programAccessGrant.count({ where: { userId: testOtherUserId, revokedAt: null } })).toBe(1)
  })
})

describe('monthly subscription (required test 5)', () => {
  it('access follows invoice.paid; cancel keeps access to period end; then it lapses and content locks', async () => {
    const { programId, versionId, prices } = await paidProgram()
    const monthly = prices.find((p) => p.kind === 'MONTHLY')!
    const checkout = await req('POST', `/programs/${programId}/checkout`, { priceId: monthly.id, idempotencyKey: 'checkout-monthly' }, carolId)
    expect(checkout.statusCode).toBe(201)
    expect(gw.checkouts[0]).toMatchObject({ mode: 'subscription', destinationAccountId: 'acct_creator_1' })
    await webhook('checkout.session.completed', { id: 'cs_test_1', mode: 'subscription', payment_status: 'paid', subscription: 'sub_1' })
    expect(await db.programAccessGrant.count({ where: { userId: carolId } })).toBe(0) // linked, not yet paid

    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400
    await webhook('invoice.paid', { id: 'in_1', amount_paid: 500, parent: { subscription_details: { subscription: 'sub_1' } }, lines: { data: [{ period: { start: Math.floor(Date.now() / 1000), end: periodEnd } }] } })
    const grant = await db.programAccessGrant.findFirstOrThrow({ where: { userId: carolId, source: 'SUBSCRIPTION' } })
    expect(grant.expiresAt!.getTime()).toBe(periodEnd * 1000 + 3 * 86_400_000)
    expect((await join(programId, versionId, carolId, 'join-subscriber')).statusCode).toBe(201)
    const subs = await req('GET', '/billing/subscriptions', undefined, carolId)
    await validateResponse('listMySubscriptions', 200, subs.json())
    const subId = subs.json().data[0].id
    expect(subs.json().data[0]).toMatchObject({ status: 'ACTIVE', cancelAtPeriodEnd: false })

    const cancelled = await req('POST', `/billing/subscriptions/${subId}/cancel`, undefined, carolId)
    expect(cancelled.json().data.cancelAtPeriodEnd).toBe(true)
    expect(gw.cancels).toEqual([['sub_1', true]])
    expect((await req('POST', `/billing/subscriptions/${subId}/cancel`, undefined, testOtherUserId)).statusCode).toBe(404)
    const portal = await req('POST', '/billing/portal', undefined, carolId)
    await validateResponse('createBillingPortalLink', 200, portal.json())

    // The subscription ends; the grant runs out; access is LAPSED with history intact.
    await webhook('customer.subscription.deleted', { id: 'sub_1', status: 'canceled', cancel_at_period_end: true, items: { data: [{ current_period_end: periodEnd }] } })
    expect((await db.billingSubscription.findFirstOrThrow({ where: { userId: carolId } })).status).toBe('CANCELED')
    await db.programAccessGrant.updateMany({ where: { userId: carolId }, data: { expiresAt: new Date(Date.now() - 1000) } }) // time passes
    expect((await req('GET', `/programs/${programId}`, undefined, carolId)).json().data).toMatchObject({ viewerAccess: 'LAPSED', canPurchase: true })
    const item = await db.calendarItem.findFirstOrThrow({ where: { ownerId: carolId } })
    expect((await req('GET', `/calendar-items/${item.id}/occurrence`, undefined, carolId)).json().data.item.locked).toBe(true)
    expect(await db.calendarItem.count({ where: { ownerId: carolId } })).toBeGreaterThan(0)
  })

  it('a failed renewal marks the subscription past due and tells the subscriber', async () => {
    const { programId, prices } = await paidProgram()
    await req('POST', `/programs/${programId}/checkout`, { priceId: prices.find((p) => p.kind === 'MONTHLY')!.id, idempotencyKey: 'checkout-failing' }, carolId)
    await webhook('checkout.session.completed', { id: 'cs_test_1', mode: 'subscription', payment_status: 'paid', subscription: 'sub_f' })
    await webhook('invoice.payment_failed', { id: 'in_f', parent: { subscription_details: { subscription: 'sub_f' } } })
    expect((await db.billingSubscription.findFirstOrThrow({ where: { userId: carolId } })).status).toBe('PAST_DUE')
    expect(await db.outboxEvent.count({ where: { type: 'PaymentIssue' } })).toBe(1)
  })
})

describe('checkout guards', () => {
  it('refuses owners, inactive creators, and buyers who already have access', async () => {
    const { programId, prices } = await paidProgram()
    const priceId = prices.find((p) => p.kind === 'ONE_TIME')!.id
    expect((await req('POST', `/programs/${programId}/checkout`, { priceId, idempotencyKey: 'owner-buys-own' })).statusCode).toBe(400)
    gw.transfers = 'restricted'
    expect((await req('POST', `/programs/${programId}/checkout`, { priceId, idempotencyKey: 'restricted-creator' }, testOtherUserId)).statusCode).toBe(402)
    gw.transfers = 'active'
    await req('POST', `/programs/${programId}/checkout`, { priceId, idempotencyKey: 'first-purchase' }, testOtherUserId)
    await webhook('checkout.session.completed', { id: 'cs_test_1', mode: 'payment', payment_status: 'paid', payment_intent: 'pi_g' })
    expect((await req('POST', `/programs/${programId}/checkout`, { priceId, idempotencyKey: 'second-purchase' }, testOtherUserId)).statusCode).toBe(409)
  })
})

// ── Contract: one block per operationId (pnpm test:generate recognizes these) ──

describe('getPayoutAccount', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'getPayoutAccount')
  })
})

describe('startPayoutOnboarding', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'startPayoutOnboarding')
  })
})

describe('createProgramCheckout', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'createProgramCheckout')
  })
})

describe('listMyPurchases', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listMyPurchases')
  })
})

describe('listMySubscriptions', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listMySubscriptions')
  })
})

describe('cancelSubscription', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'cancelSubscription')
  })
})

describe('resumeSubscription', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'resumeSubscription')
  })
})

describe('createBillingPortalLink', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'createBillingPortalLink')
  })
})

describe('getCreatorEarnings', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'getCreatorEarnings')
  })
})

describe('handleStripeWebhook', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'handleStripeWebhook')
  })
})
