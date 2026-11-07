// Stripe behind a narrow gateway (docs/adr/0001-billing-stripe-connect.md). Production uses one
// StripeClient instance with a restricted key; tests swap in a fake. Webhook signature checks always
// use the real SDK helpers, which work offline.
import Stripe from 'stripe'

export type CheckoutRequest = {
  mode: 'payment' | 'subscription'
  stripePriceId: string
  destinationAccountId: string
  platformFeeBps: number
  amountMinor: number
  customerEmail: string
  successUrl: string
  cancelUrl: string
  metadata: Record<string, string>
  idempotencyKey: string
}

export interface BillingGateway {
  createRecipientAccount(input: { email: string; displayName: string }): Promise<{ id: string }>
  createOnboardingLink(accountId: string, refreshUrl: string, returnUrl: string): Promise<{ url: string }>
  /** v2 readiness: configuration.recipient.capabilities.stripe_balance.stripe_transfers.status */
  transfersStatus(accountId: string): Promise<string>
  ensurePrice(input: { programId: string; programTitle: string; existingProductId: string | null; kind: 'ONE_TIME' | 'MONTHLY'; amountMinor: number; currency: string }): Promise<{ priceId: string; productId: string }>
  createCheckout(input: CheckoutRequest): Promise<{ id: string; url: string }>
  setCancelAtPeriodEnd(subscriptionId: string, cancel: boolean): Promise<void>
  subscription(subscriptionId: string): Promise<{ status: string; customerId: string; currentPeriodEnd: number | null; cancelAtPeriodEnd: boolean }>
  portalLink(customerId: string, returnUrl: string): Promise<{ url: string }>
  /** A Program's Stripe Product, found through one of its existing Prices (no product column needed). */
  productOfPrice(priceId: string): Promise<string>
}

const apiKey = () => process.env.STRIPE_API_KEY ?? process.env.STRIPE_SECRET_KEY
let client: Stripe | null = null

/** One StripeClient instance; never the deprecated global key pattern. API version pinned by the SDK. */
export function stripeClient() {
  if (client) return client
  const key = apiKey()
  if (!key) throw new Error('STRIPE_API_KEY is not configured')
  client = new Stripe(key, { appInfo: { name: 'programs-app' }, maxNetworkRetries: 2 })
  return client
}

/** Webhook verification needs no key: a client constructed with a placeholder is enough offline. */
export function webhookClient() {
  return apiKey() ? stripeClient() : new Stripe('sk_test_signature_verification_only')
}

const letters = () => Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')

class StripeGateway implements BillingGateway {
  async createRecipientAccount(input: { email: string; displayName: string }) {
    const account = await stripeClient().v2.core.accounts.create({
      contact_email: input.email,
      display_name: input.displayName,
      dashboard: 'express',
      identity: { country: 'us' },
      defaults: { currency: 'usd', responsibilities: { fees_collector: 'application', losses_collector: 'application' } },
      configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
      include: ['configuration.recipient', 'requirements'],
    })
    return { id: account.id }
  }

  async createOnboardingLink(accountId: string, refreshUrl: string, returnUrl: string) {
    const link = await stripeClient().v2.core.accountLinks.create({
      account: accountId,
      use_case: { type: 'account_onboarding', account_onboarding: { refresh_url: refreshUrl, return_url: returnUrl } },
    })
    return { url: link.url }
  }

  async transfersStatus(accountId: string) {
    const a = (await stripeClient().v2.core.accounts.retrieve(accountId, { include: ['configuration.recipient'] })) as any
    return a.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status ?? 'unknown'
  }

  async ensurePrice(input: { programId: string; programTitle: string; existingProductId: string | null; kind: 'ONE_TIME' | 'MONTHLY'; amountMinor: number; currency: string }) {
    const s = stripeClient()
    // One Product per Program, one immutable Price per ProgramPrice row (ADR: Catalog).
    const productId =
      input.existingProductId ??
      (await s.products.create({ name: input.programTitle.slice(0, 250), metadata: { programId: input.programId } }, { idempotencyKey: `product:${input.programId}` })).id
    const price = await s.prices.create(
      {
        product: productId,
        currency: input.currency.toLowerCase(),
        unit_amount: input.amountMinor,
        ...(input.kind === 'MONTHLY' ? { recurring: { interval: 'month' } } : {}),
        metadata: { programId: input.programId },
      },
      { idempotencyKey: `price:${input.programId}:${input.kind}:${input.amountMinor}` },
    )
    return { priceId: price.id, productId }
  }

  async createCheckout(r: CheckoutRequest) {
    const s = stripeClient()
    const fee = Math.round((r.amountMinor * r.platformFeeBps) / 10_000)
    // No payment_method_types: dynamic payment methods. Tax stays off until registrations exist.
    const session = await s.checkout.sessions.create(
      {
        mode: r.mode,
        line_items: [{ price: r.stripePriceId, quantity: 1 }],
        customer_email: r.customerEmail,
        success_url: r.successUrl,
        cancel_url: r.cancelUrl,
        metadata: r.metadata,
        automatic_tax: { enabled: process.env.STRIPE_AUTOMATIC_TAX === 'true' },
        integration_identifier: `programs-p1-${letters()}`,
        ...(r.mode === 'payment'
          ? { customer_creation: 'always', payment_intent_data: { application_fee_amount: fee, transfer_data: { destination: r.destinationAccountId }, metadata: r.metadata } }
          : { subscription_data: { application_fee_percent: r.platformFeeBps / 100, transfer_data: { destination: r.destinationAccountId }, metadata: r.metadata } }),
      },
      { idempotencyKey: `checkout:${r.idempotencyKey}` },
    )
    return { id: session.id, url: session.url! }
  }

  async setCancelAtPeriodEnd(subscriptionId: string, cancel: boolean) {
    await stripeClient().subscriptions.update(subscriptionId, { cancel_at_period_end: cancel })
  }

  async subscription(subscriptionId: string) {
    const sub = (await stripeClient().subscriptions.retrieve(subscriptionId)) as any
    return {
      status: sub.status,
      customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      currentPeriodEnd: sub.items?.data?.[0]?.current_period_end ?? null,
      cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    }
  }

  async productOfPrice(priceId: string) {
    const price = await stripeClient().prices.retrieve(priceId)
    return typeof price.product === 'string' ? price.product : price.product.id
  }

  async portalLink(customerId: string, returnUrl: string) {
    const session = await stripeClient().billingPortal.sessions.create({ customer: customerId, return_url: returnUrl })
    return { url: session.url }
  }
}

let gateway: BillingGateway | null = null
export const billingGateway = () => (gateway ??= new StripeGateway())
export function setBillingGateway(g: BillingGateway | null) {
  gateway = g
}
