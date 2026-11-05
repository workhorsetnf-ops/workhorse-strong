// Stripe tells the app when someone pays, renews, fails a payment or cancels
// (Update 166). Point a Stripe webhook at /api/stripe-webhook with these events:
//   checkout.session.completed, customer.subscription.created,
//   customer.subscription.updated, customer.subscription.deleted
import { admin } from './_push.js'
import { verifyStripeSignature, rawBody, groupStatusFrom, stripe } from './_stripe.js'
import { applyGroupState, profileForStripe } from './_group.js'

// Stripe signs the exact bytes, so Vercel must not parse the body first.
export const config = { api: { bodyParser: false } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const body = await rawBody(req)
    const check = verifyStripeSignature(body, req.headers['stripe-signature'], String(process.env.STRIPE_WEBHOOK_SECRET || '').trim())
    if (!check.ok) return res.status(400).json({ error: check.error })
    return await runStripeEvent(admin(), JSON.parse(body), res)
  } catch (e) { res.status(500).json({ error: e.message }) }
}

export async function runStripeEvent(sb, event, res, { fetchFn } = {}) {
  const o = event?.data?.object || {}
  if (event.type === 'checkout.session.completed') {
    if (o.mode !== 'subscription') return res.json({ ignored: true })
    const id = await profileForStripe(sb, { profileId: o.client_reference_id || o.metadata?.profile_id, customer: o.customer })
    if (!id) return res.json({ ignored: 'unknown member' })
    // read the subscription itself for its real status and renewal date
    let sub = null
    try { sub = o.subscription ? await stripe(`subscriptions/${o.subscription}`, { method: 'GET', fetchFn }) : null } catch { sub = null }
    const status = sub ? groupStatusFrom(sub.status) : (o.payment_status === 'paid' ? 'active' : 'pending')
    const r = await applyGroupState(sb, id, { status, eventTime: event.created, customer: o.customer, subscription: o.subscription, periodEnd: periodEndOf(sub), cancelAtPeriodEnd: sub?.cancel_at_period_end })
    return res.json(r)
  }
  if (event.type?.startsWith('customer.subscription.')) {
    const id = await profileForStripe(sb, { profileId: o.metadata?.profile_id, subscription: o.id, customer: o.customer })
    if (!id) return res.json({ ignored: 'unknown member' })
    const status = event.type === 'customer.subscription.deleted' ? 'canceled' : groupStatusFrom(o.status)
    const r = await applyGroupState(sb, id, { status, eventTime: event.created, customer: o.customer, subscription: o.id, periodEnd: periodEndOf(o), cancelAtPeriodEnd: o.cancel_at_period_end })
    return res.json(r)
  }
  return res.json({ ignored: event.type })
}

// newer API versions keep the period on the subscription item
const periodEndOf = s => s?.current_period_end || s?.items?.data?.[0]?.current_period_end || null
