// Stripe tells the app when someone pays, renews, fails a payment or cancels
// (Update 166). Point a Stripe webhook at /api/stripe-webhook with these events:
//   checkout.session.completed, customer.subscription.created,
//   customer.subscription.updated, customer.subscription.deleted
// Workhorse 90 (Update 180) uses the same four events: pay-in-full arrives as a
// one-time checkout, the 2-payment plan as a subscription that stops itself
// after the second charge.
// Update 184 adds payment_intent.succeeded: a payment from someone with no
// account yet (a new 1:1 client paying through Newie) starts hands-free
// onboarding. Group sign-ups always carry a profile_id, so they never do.
import { admin } from './_push.js'
import { verifyStripeSignature, rawBody, groupStatusFrom, stripe } from './_stripe.js'
import { applyGroupState, profileForStripe } from './_group.js'
import { splitCancelAt } from './_w90.js'
import { onboardFromPayment } from './_onboard.js'
import { sendToUsers, staffIds } from './_push.js'

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

export async function runStripeEvent(sb, event, res, { fetchFn, onboard } = {}) {
  const o = event?.data?.object || {}
  if (event.type === 'checkout.session.completed') {
    const offer = o.metadata?.offer || 'monthly'
    const w90 = offer === 'w90'
    // Workhorse 90 paid in full: a one-time payment, 90 days of access
    if (o.mode === 'payment') {
      if (!w90 && o.payment_status === 'paid' && isOutsidePayment(o)) return res.json(await newClient(sb, { email: o.customer_details?.email || o.customer_email, name: o.customer_details?.name, customer: o.customer, source: `stripe:${o.id}` }, { fetchFn, onboard }))
      if (!w90 || o.payment_status !== 'paid') return res.json({ ignored: true })
      const id = await profileForStripe(sb, { profileId: o.client_reference_id || o.metadata?.profile_id, customer: o.customer })
      if (!id) return res.json({ ignored: 'unknown member' })
      const r = await applyGroupState(sb, id, { status: 'active', eventTime: event.created, customer: o.customer, tier: 'w90', option: 'full', extendW90: true, checkoutId: o.id })
      return res.json(r)
    }
    if (o.mode !== 'subscription') return res.json({ ignored: true })
    const id = await profileForStripe(sb, { profileId: o.client_reference_id || o.metadata?.profile_id, customer: o.customer })
    if (!id) {
      if (o.payment_status === 'paid' && isOutsidePayment(o)) return res.json(await newClient(sb, { email: o.customer_details?.email || o.customer_email, name: o.customer_details?.name, customer: o.customer, source: `stripe:${o.subscription || o.id}` }, { fetchFn, onboard }))
      return res.json({ ignored: 'unknown member' })
    }
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
    if (!id) {
      if (event.type === 'customer.subscription.created' && ['active', 'trialing'].includes(o.status) && isOutsidePayment(o))
        return res.json(await newClient(sb, { customer: o.customer, source: `stripe:${o.id}` }, { fetchFn, onboard }))
      return res.json({ ignored: 'unknown member' })
    }
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
  if (event.type === 'payment_intent.succeeded') {
    // one-off payments and subscription first charges alike; anyone with an
    // account already is skipped inside newClient
    if (!isOutsidePayment(o) || (o.amount_received ?? o.amount ?? 0) < 100) return res.json({ ignored: true })
    const id = o.customer ? await profileForStripe(sb, { customer: o.customer }) : null
    if (id) return res.json({ ignored: 'existing client' })
    return res.json(await newClient(sb, { email: o.receipt_email, customer: o.customer, charge: o.latest_charge, source: `stripe:${o.id}` }, { fetchFn, onboard }))
  }
  return res.json({ ignored: event.type })
}

// Not one of the app's own checkouts (those always say who they're for).
export const isOutsidePayment = o => !o?.metadata?.profile_id && !o?.metadata?.offer && !o?.client_reference_id

// Work out who paid (email + name) from whatever Stripe gave us, then onboard.
async function newClient(sb, { email, name, customer, charge, source }, { fetchFn, onboard }) {
  let mail = email || null, who = name || null
  if ((!mail || !who) && customer) {
    try { const c = await stripe(`customers/${customer}`, { method: 'GET', fetchFn }); mail ||= c.email; who ||= c.name } catch { /* fall through */ }
  }
  if ((!mail || !who) && charge) {
    try { const ch = await stripe(`charges/${typeof charge === 'string' ? charge : charge.id}`, { method: 'GET', fetchFn }); mail ||= ch.billing_details?.email || ch.receipt_email; who ||= ch.billing_details?.name } catch { /* fall through */ }
  }
  if (!mail) return { ignored: 'no email on the payment' }
  // a returning payer (renewal, second purchase) is never a new client, even
  // if they pay with an email the app doesn't have
  if (customer) {
    try {
      const prior = await stripe(`charges?customer=${encodeURIComponent(customer)}&limit=5`, { method: 'GET', fetchFn })
      if ((prior.data || []).filter(c => c.status === 'succeeded').length > 1) return { ignored: 'returning payer' }
    } catch { return { ignored: 'could not check payment history' } }
  }
  return (onboard || defaultOnboard)(sb, { email: mail, name: who, source })
}

const defaultOnboard = (sb, info) => onboardFromPayment(sb, info, {
  notify: async msg => { try { await sendToUsers(sb, await staffIds(sb), { ...msg, tag: 'new-client' }) } catch { /* push is a bonus */ } },
})

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
