// Stripe tells the app when someone pays, renews, fails a payment or cancels
// (Update 166). Point a Stripe webhook at /api/stripe-webhook with these events:
//   checkout.session.completed, customer.subscription.created,
//   customer.subscription.updated, customer.subscription.deleted
// Workhorse 90 (Update 180) uses the same four events: pay-in-full arrives as a
// one-time checkout, the 2-payment plan as a subscription that stops itself
// after the second charge.
import { admin } from './_push.js'
import { verifyStripeSignature, rawBody, groupStatusFrom, stripe } from './_stripe.js'
import { applyGroupState, profileForStripe } from './_group.js'
import { splitCancelAt } from './_w90.js'

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
    const offer = o.metadata?.offer || 'monthly'
    const w90 = offer === 'w90'
    // Workhorse 90 paid in full: a one-time payment, 90 days of access
    if (o.mode === 'payment') {
      if (!w90 || o.payment_status !== 'paid') return res.json({ ignored: true })
      const id = await profileForStripe(sb, { profileId: o.client_reference_id || o.metadata?.profile_id, customer: o.customer })
      if (!id) return res.json({ ignored: 'unknown member' })
      const r = await applyGroupState(sb, id, { status: 'active', eventTime: event.created, customer: o.customer, tier: 'w90', option: 'full', extendW90: true, checkoutId: o.id })
      return res.json(r)
    }
    if (o.mode !== 'subscription') return res.json({ ignored: true })
    const id = await profileForStripe(sb, { profileId: o.client_reference_id || o.metadata?.profile_id, customer: o.customer })
    if (!id) return res.json({ ignored: 'unknown member' })
    // read the subscription itself for its real status and renewal date
    let sub = null
    try { sub = o.subscription ? await stripe(`subscriptions/${o.subscription}`, { method: 'GET', fetchFn }) : null } catch { sub = null }
    // Workhorse 90 in 2 payments: stop the subscription after the second charge
    let stopNote = null
    if (w90 && sub && !sub.cancel_at) {
      try { sub = await stopAfterSecond(sub, fetchFn) } catch (e) { stopNote = e.message }
    }
    const status = sub ? groupStatusFrom(sub.status) : (o.payment_status === 'paid' ? 'active' : 'pending')
    const r = await applyGroupState(sb, id, {
      status, eventTime: event.created, customer: o.customer, subscription: o.subscription, periodEnd: periodEndOf(sub), cancelAtPeriodEnd: w90 ? false : sub?.cancel_at_period_end,
      tier: w90 ? 'w90' : 'monthly', option: w90 ? 'split' : null, extendW90: w90, checkoutId: o.id,
    })
    return res.json(stopNote ? { ...r, stopError: stopNote } : r)
  }
  if (event.type?.startsWith('customer.subscription.')) {
    const id = await profileForStripe(sb, { profileId: o.metadata?.profile_id, subscription: o.id, customer: o.customer })
    if (!id) return res.json({ ignored: 'unknown member' })
    // only the member's current subscription counts: an old one ending (e.g.
    // after they renewed or switched plans) mustn't touch the new membership
    const { data: cur } = await sb.from('profiles').select('stripe_subscription_id').eq('id', id).maybeSingle()
    if (cur?.stripe_subscription_id && cur.stripe_subscription_id !== o.id) return res.json({ ignored: 'not their current subscription' })
    const w90 = o.metadata?.offer === 'w90'
    if (w90 && event.type === 'customer.subscription.deleted') {
      // the planned stop after the 2nd payment: they keep their 90 days.
      // Ended before both payments went through: membership over.
      const paid = await paidInvoices(o.id, fetchFn)
      if (paid >= 2) return res.json(await applyGroupState(sb, id, { status: 'active', eventTime: event.created, cancelAtPeriodEnd: false }))
      return res.json(await applyGroupState(sb, id, { status: 'canceled', eventTime: event.created, cancelAtPeriodEnd: false }))
    }
    if (w90 && !o.cancel_at && event.type !== 'customer.subscription.deleted' && ['active', 'trialing', 'past_due'].includes(o.status)) {
      try { await stopAfterSecond(o, fetchFn) } catch { /* retried on the next event */ }
    }
    const status = event.type === 'customer.subscription.deleted' ? 'canceled' : groupStatusFrom(o.status)
    const r = await applyGroupState(sb, id, { status, eventTime: event.created, customer: o.customer, subscription: o.id, periodEnd: periodEndOf(o), cancelAtPeriodEnd: w90 ? false : o.cancel_at_period_end })
    return res.json(r)
  }
  return res.json({ ignored: event.type })
}

// Schedule the 2-payment subscription to end after its second charge.
// (no proration setting: the date sits exactly on a period boundary, so there is nothing to prorate)
async function stopAfterSecond(sub, fetchFn) {
  const anchor = sub.billing_cycle_anchor || sub.start_date || sub.created
  if (!anchor) throw new Error('subscription has no billing anchor')
  return stripe(`subscriptions/${sub.id}`, { fetchFn, body: { cancel_at: splitCancelAt(anchor) } })
}

// If Stripe can't be asked, this throws: the webhook answers 500 and Stripe
// retries, rather than ending someone's membership on a hiccup.
async function paidInvoices(subId, fetchFn) {
  const r = await stripe(`invoices?subscription=${encodeURIComponent(subId)}&status=paid&limit=10`, { method: 'GET', fetchFn })
  return (r.data || []).filter(i => i.billing_reason !== 'manual').length   // paid, including a 100%-off code
}

// newer API versions keep the period on the subscription item
const periodEndOf = s => s?.current_period_end || s?.items?.data?.[0]?.current_period_end || null
