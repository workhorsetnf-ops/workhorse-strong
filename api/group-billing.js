// Signed-in group member: start paying, or manage billing (Update 166).
//   POST { action: 'checkout' } -> { url } Stripe Checkout for the monthly plan
//   POST { action: 'portal' }   -> { url } Stripe billing portal (card, cancel, receipts)
import { admin, userFromReq } from './_push.js'
import { stripe, appUrl } from './_stripe.js'

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
  const { data: p } = await sb.from('profiles').select('id, email, plan, group_status, stripe_customer_id').eq('id', me.id).maybeSingle()
  if (!p || p.plan !== 'group') return res.status(403).json({ error: 'This is for group members.' })
  if (body.action === 'portal') {
    if (!p.stripe_customer_id) return res.status(400).json({ error: 'No billing account yet.' })
    const s = await stripe('billing_portal/sessions', { body: { customer: p.stripe_customer_id, return_url: `${base}/app` }, fetchFn })
    return res.json({ url: s.url })
  }
  if (p.group_status === 'active' || p.group_status === 'past_due') return res.status(400).json({ error: 'You’re already a member.' })
  const price = String(process.env.STRIPE_PRICE_ID || '').trim()
  if (!price) return res.status(400).json({ error: 'Payments are not set up yet (STRIPE_PRICE_ID missing).' })
  const s = await stripe('checkout/sessions', {
    fetchFn,
    body: {
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      client_reference_id: p.id,
      ...(p.stripe_customer_id ? { customer: p.stripe_customer_id } : { customer_email: p.email || undefined }),
      metadata: { profile_id: p.id },
      subscription_data: { metadata: { profile_id: p.id } },
      allow_promotion_codes: 'true',
      success_url: `${base}/app?joined=1`,
      cancel_url: `${base}/app`,
    },
  })
  return res.json({ url: s.url })
}
