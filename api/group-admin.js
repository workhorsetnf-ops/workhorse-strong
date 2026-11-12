// Coach: is the group offer wired up? (Update 166)
//   POST {} -> { keys: { secret, price, webhook }, price, mode, w90 }
//   POST { action: 'w90-setup' } -> creates the Workhorse 90 product + prices in Stripe if missing (Update 180)
import { admin, userFromReq } from './_push.js'
import { stripe } from './_stripe.js'
import { ensureW90Prices, W90 } from './_w90.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const sb = admin()
    const me = await userFromReq(sb, req)
    if (!me || me.role !== 'coach') return res.status(403).json({ error: 'Coach only' })
    if (req.body?.action === 'w90-setup') {
      const r = await ensureW90Prices()
      return res.json({ ok: true, ...r })
    }
    const key = String(process.env.STRIPE_SECRET_KEY || '').trim()
    const keys = { secret: !!key, price: !!String(process.env.STRIPE_PRICE_ID || '').trim(), webhook: !!String(process.env.STRIPE_WEBHOOK_SECRET || '').trim() }
    let price = null, priceError = null
    if (keys.secret && keys.price) {
      try {
        const p = await stripe(`prices/${process.env.STRIPE_PRICE_ID.trim()}`, { method: 'GET' })
        price = { amount: (p.unit_amount || 0) / 100, currency: p.currency, interval: p.recurring?.interval || null, active: p.active }
      } catch (e) { priceError = e.message }
    }
    // Workhorse 90: is the product there yet? (looked up, never created here)
    let w90 = null
    if (keys.secret) {
      try {
        const r = await stripe(`prices?active=true&lookup_keys[]=${W90.full.lookup}&lookup_keys[]=${W90.split.lookup}`, { method: 'GET' })
        const has = k => (r.data || []).some(p => p.lookup_key === k)
        w90 = { full: has(W90.full.lookup), split: has(W90.split.lookup) }
      } catch (e) { w90 = { error: e.message } }
    }
    res.json({ keys, price, priceError, w90, mode: key.startsWith('sk_live') ? 'live' : key ? 'test' : null })
  } catch (e) { res.status(500).json({ error: e.message }) }
}
