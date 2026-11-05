// Coach: is the group offer wired up? (Update 166)
//   POST {} -> { keys: { secret, price, webhook }, price, mode }
import { admin, userFromReq } from './_push.js'
import { stripe } from './_stripe.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const sb = admin()
    const me = await userFromReq(sb, req)
    if (!me || me.role !== 'coach') return res.status(403).json({ error: 'Coach only' })
    const key = String(process.env.STRIPE_SECRET_KEY || '').trim()
    const keys = { secret: !!key, price: !!String(process.env.STRIPE_PRICE_ID || '').trim(), webhook: !!String(process.env.STRIPE_WEBHOOK_SECRET || '').trim() }
    let price = null, priceError = null
    if (keys.secret && keys.price) {
      try {
        const p = await stripe(`prices/${process.env.STRIPE_PRICE_ID.trim()}`, { method: 'GET' })
        price = { amount: (p.unit_amount || 0) / 100, currency: p.currency, interval: p.recurring?.interval || null, active: p.active }
      } catch (e) { priceError = e.message }
    }
    res.json({ keys, price, priceError, mode: key.startsWith('sk_live') ? 'live' : key ? 'test' : null })
  } catch (e) { res.status(500).json({ error: e.message }) }
}
