# ADR 0001: Billing with Stripe Connect

Status: Accepted for implementation, 2026-11-07. Live payments stay disabled until the launch checklist below is complete.
Requirements: `01-PRODUCT.md` §4, `05-ARCHITECTURE.md` §12, `07-PROGRAMS.md` §2 and §8.

## Context

Any user may sell access to a Program, as a one-time purchase, a monthly subscription, or both, in USD. The platform runs checkout, takes a fee, and pays creators. Access must come only from verified provider events, never from the client. Billing ships after the core experience and must be off by default in production.

## Decision

**Platform model: marketplace, Stripe Connect with destination charges.** Buyers purchase through our platform and we handle checkout, so the platform is merchant of record and each payment's net amount is transferred to the creator's connected account.

| Concern | Decision |
|---|---|
| Account API | Accounts v2 (`/v2/core/accounts`). No legacy `type: express/custom/standard`. |
| Creator account configuration | `configuration.recipient` requesting `stripe_balance.stripe_transfers`. No merchant configuration or `card_payments`. |
| Dashboard | `dashboard: "express"` (cobranded, low maintenance), with Stripe-hosted account links for onboarding. |
| Responsibilities | `fees_collector: "application"`, `losses_collector: "application"`. The platform pays Stripe fees and absorbs negative balances, as destination charges require. |
| Creator readiness | Payout account `ACTIVE` only when `configuration.recipient.capabilities.stripe_balance.stripe_transfers.status === 'active'`. Checked from account webhooks and re-checked before every checkout. The deprecated `charges_enabled` and `payouts_enabled` are not used; our `chargesEnabled` and `payoutsEnabled` columns both mirror the transfers capability. |
| Buyer | A Stripe Customer created by Checkout for each buyer. Buyers are not connected accounts. |
| Checkout | Stripe-hosted Checkout Sessions. `mode: payment` for one-time, `mode: subscription` for monthly. `payment_method_types` is never passed (dynamic payment methods). Each session carries an `integration_identifier` (`programs-p1-` plus 8 random letters). |
| Platform fee | `PLATFORM_FEE_BPS`, default 1000 (10%). One-time: `payment_intent_data.application_fee_amount` plus `transfer_data.destination`. Monthly: `subscription_data.application_fee_percent` plus `transfer_data.destination`. |
| Catalog | One Stripe Product per Program and one Price per `ProgramPrice` row, created when first needed and stored in `providerPriceId`. Prices are immutable; changing a price retires the row (`07` §8). |
| Fulfillment | Webhooks only, never the success page. One-time access on `checkout.session.completed` or `checkout.session.async_payment_succeeded` when `payment_status` is not `unpaid`. Subscriptions are linked on completion; access follows `invoice.paid`. |
| Entitlements | `ProgramAccessGrant`: `PURCHASE` (no expiry, `sourceRef` = purchase id) or `SUBSCRIPTION` (`expiresAt` = current period end + 3-day grace, `sourceRef` = subscription id, extended on each renewal). Enrollment never implies billing. |
| Lapse | Canceled or unpaid at period end: the grant expires; Calendar Items, results, and media stay the user's; full content locks (`LAPSED`). |
| Refunds | Issued by platform support from the Stripe Dashboard with `reverse_transfer` and `refund_application_fee`. On `charge.refunded` for a full refund, the purchase becomes `REFUNDED` and its grant is revoked. Partial refunds keep access. Subscription refunds do not cut access; ending access is a cancellation. |
| Disputes | `charge.dispute.created`: purchase `DISPUTED`, grant revoked. `charge.dispute.closed` with status `won`: restored to `PAID` and re-granted. Transfer reversal for a dispute is a support action until volumes justify automating it. |
| Fraud signals | `radar.early_fraud_warning.created` is recorded and raises a `PAYMENT_ISSUE` notification for the platform team. No automatic action in P1. |
| Event mapping | Through Stripe's object graph to our ids: Checkout Session id → purchase or subscription; PaymentIntent id → purchase; Subscription id → subscription; Account id → payout account. Metadata is a fallback only. |
| Webhook safety | One endpoint (`POST /billing/webhooks/stripe`). The signature is verified over the raw body (snapshot events with `STRIPE_WEBHOOK_SECRET`, Accounts v2 thin events with `STRIPE_THIN_WEBHOOK_SECRET`). Every event is stored in `BillingEvent`, deduplicated by provider event id, and processed idempotently. Unprocessed or failed events return 500 so Stripe retries. |
| Tax | `automatic_tax` is **off**. Destination charges make the platform the seller for tax. Turning tax on requires active Stripe Tax registrations first: without one, Stripe silently collects nothing. Controlled by `STRIPE_AUTOMATIC_TAX=true`. |
| Keys | A restricted API key (`rk_…`) with only the permissions this integration uses. One `StripeClient` instance; never the global key pattern. API version pinned by the SDK (`2026-10-28.endive` in `stripe` 23.1.0); never overridden per request. |
| Environments | Separate Stripe sandboxes for local development and CI (not the shared test-mode sandbox), live keys only in Railway production. Local webhooks through `stripe listen --forward-to localhost:3001/billing/webhooks/stripe`. Tests use a fake gateway and the SDK's offline signature helpers; no network calls. |
| Feature flag | `MARKETPLACE_ENABLED`, default `false`. While false, payout onboarding and checkout refuse with `FORBIDDEN`, PAID cannot be published, and Storefronts show paid access as unavailable. Webhook processing and read-only billing endpoints keep working. |

## Webhook events subscribed

`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`, `radar.early_fraud_warning.created`, and the Accounts v2 thin event `v2.core.account[configuration.recipient].capability_status_updated`. Nothing else.

## Known limitations (accepted for P1)

- A buyer's Stripe Customer is not stored on our side, so each checkout creates a new Customer and the billing portal is reached through the buyer's subscription. Store a provider customer id per user if repeat buyers become common.
- Creator earnings are aggregated from purchases and recorded `invoice.paid` events; Stripe's Express dashboard is the payout record of truth.

## Launch checklist (all required before `MARKETPLACE_ENABLED=true` in production)

1. Refund, cancellation, and support policies published; terms of service cover creator sales and content compliance.
2. Stripe Tax registrations decided and active where required, then `STRIPE_AUTOMATIC_TAX=true`, or a documented decision not to collect.
3. Live restricted key, live webhook endpoint and secrets, and a live Connect configuration reviewed against this ADR.
4. Stripe go-live checklist reviewed: https://docs.stripe.com/get-started/checklist/go-live.md
5. A test-mode end-to-end run in a sandbox: onboarding, one-time purchase, subscription renewal, cancellation, refund, dispute.
