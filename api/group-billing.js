// Signed-in group member: start paying, or manage billing (Update 166).
//   POST { action: 'checkout' } -> { url } Stripe Checkout for the monthly plan
//   POST { action: 'checkout', offer: 'w90', option: 'full' | 'split' } -> Workhorse 90 (Update 180)
//   POST { action: 'portal' }   -> { url } Stripe billing portal (card, cancel, receipts)
import { admin, userFromReq } from './_push.js'
import { stripe, appUrl } from './_stripe.js'
import { ensureW90Prices, groupAccess, w90CanRenew } from './_w90.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const sb = admin()
    const me = await userFromReq(sb, req)
    if (!me) return res.status(401).json({ error: 'Please sign in again.' })
    return await runGroupBilling(sb, me, req.body || {}, res, { base: appUrl(req) })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
}

export async function runGroupBilling(sb, me, body, res, { base, fetchFn } = {}) {
  const { data: p } = await sb.from('profiles').select('id, email, plan, group_status, group_tier, group_access_until, stripe_customer_id').eq('id', me.id).maybeSingle()
  if (!p || p.plan !== 'group') return res.status(403).json({ error: 'This is for group members.' })
  if (body.action === 'portal') {
    if (!p.stripe_customer_id) return res.status(400).json({ error: 'No billing account yet.' })
    const s = await stripe('billing_portal/sessions', { body: { customer: p.stripe_customer_id, return_url: `${base}/app` }, fetchFn })
    return res.json({ url: s.url })
  }
  const offer = body.offer === 'w90' ? 'w90' : 'monthly'
  // a paid member can't buy twice; Workhorse 90 can renew in its last 14 days
  if (groupAccess(p) && !(offer === 'w90' && w90CanRenew(p))) return res.status(400).json({ error: 'You’re already a member.' })
  const who = {
    client_reference_id: p.id,
    ...(p.stripe_customer_id ? { customer: p.stripe_customer_id } : { customer_email: p.email || undefined }),
    allow_promotion_codes: 'true',
    success_url: `${base}/app?joined=1`,
    cancel_url: `${base}/app`,
  }

  if (offer === 'w90') {
    const option = body.option === 'full' ? 'full' : 'split'
    const prices = await ensureW90Prices(fetchFn)
    const meta = { profile_id: p.id, offer: 'w90', option }
    const s = option === 'full'
      ? await stripe('checkout/sessions', { fetchFn, body: {
          ...who, mode: 'payment', line_items: [{ price: prices.full, quantity: 1 }], metadata: meta,
          payment_intent_data: { metadata: meta },
          ...(p.stripe_customer_id ? {} : { customer_creation: 'always' }),   // so receipts/portal work later
        } })
      : await stripe('checkout/sessions', { fetchFn, body: {
          ...who, mode: 'subscription', line_items: [{ price: prices.split, quantity: 1 }], metadata: meta,
          subscription_data: { metadata: meta, description: 'Workhorse 90: 2 payments of $249, six weeks apart' },
        } })
    return res.json({ url: s.url })
  }

  const price = String(process.env.STRIPE_PRICE_ID || '').trim()
  if (!price) return res.status(400).json({ error: 'Payments are not set up yet (STRIPE_PRICE_ID missing).' })
  const s = await stripe('checkout/sessions', {
    fetchFn,
    body: {
      ...who,
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      metadata: { profile_id: p.id, offer: 'monthly' },
      subscription_data: { metadata: { profile_id: p.id, offer: 'monthly' } },
    },
  })
  return res.json({ url: s.url })
}
