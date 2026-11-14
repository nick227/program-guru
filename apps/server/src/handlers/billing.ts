import { requireUser } from '../lib/auth'
import { processEvent, verify } from '../domains/billing/webhooks.service'

const uid = (request: any) => requireUser(request).id

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
/** Signature is verified over the exact raw body; errors make Stripe retry (ADR: webhook safety). */
export async function handleStripeWebhook(request: any) {
  const event = verify(request.rawBody ?? '', request.headers['stripe-signature'])
  await processEvent(event)
  return { data: { ok: true } }
}
