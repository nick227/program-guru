import { requireUser } from '../lib/auth'
import * as billing from '../domains/billing/billing.service'
import { processEvent, verify } from '../domains/billing/webhooks.service'

const uid = (request: any) => requireUser(request).id

export async function getPayoutAccount(request: any) {
  return { data: await billing.getPayoutAccount(uid(request)) }
}
export async function startPayoutOnboarding(request: any) {
  return { data: await billing.startOnboarding(uid(request)) }
}
export async function createProgramCheckout(request: any) {
  return { data: await billing.createCheckout(uid(request), request.params.programId, request.body) }
}
export async function listMyPurchases(request: any) {
  return billing.listPurchases(uid(request), request.query)
}
export async function listMySubscriptions(request: any) {
  return billing.listSubscriptions(uid(request), request.query)
}
export async function cancelSubscription(request: any) {
  return { data: await billing.setCancel(uid(request), request.params.subscriptionId, true) }
}
export async function resumeSubscription(request: any) {
  return { data: await billing.setCancel(uid(request), request.params.subscriptionId, false) }
}
export async function createBillingPortalLink(request: any) {
  return { data: await billing.portalLink(uid(request)) }
}
export async function getCreatorEarnings(request: any) {
  return { data: await billing.earnings(uid(request)) }
}
/** Signature is verified over the exact raw body; errors make Stripe retry (ADR: webhook safety). */
export async function handleStripeWebhook(request: any) {
  const event = verify(request.rawBody ?? '', request.headers['stripe-signature'])
  await processEvent(event)
  return { data: { ok: true } }
}
