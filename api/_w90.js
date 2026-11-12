// Workhorse 90 (Update 180): the 90-day group with a monthly group call.
// Same group programming as the $50/month group, paid up front for 90 days:
//   full  — $495 once
//   split — $249 now + $249 six weeks later (halfway), then it stops
// The Stripe product and both prices are created in the coach's Stripe account
// the first time they're needed (found again by lookup key after that), so
// there's nothing to set up in the Stripe dashboard.
import { stripe } from './_stripe.js'

export const W90 = {
  name: 'Workhorse 90',
  days: 90,
  full: { cents: 49500, lookup: 'workhorse90_full' },
  split: { cents: 24900, lookup: 'workhorse90_split', everyWeeks: 6, payments: 2 },
}
export const W90_LABELS = {
  full: '$495 for 90 days',
  split: '2 payments of $249',
}
const DAY = 864e5

// Find both prices, creating the product and whichever price is missing.
export async function ensureW90Prices(fetchFn) {
  const q = `prices?active=true&lookup_keys[]=${W90.full.lookup}&lookup_keys[]=${W90.split.lookup}&expand[]=data.product`
  const found = (await stripe(q, { method: 'GET', fetchFn })).data || []
  const by = k => found.find(p => p.lookup_key === k)
  let full = by(W90.full.lookup), split = by(W90.split.lookup)
  const created = []
  let product = (full || split)?.product
  product = typeof product === 'object' ? product?.id : product
  if (!product) {
    const p = await stripe('products', { fetchFn, body: { name: W90.name, description: '90-day group training with a monthly group call.', metadata: { workhorse_offer: 'w90' } } })
    product = p.id
    created.push('product')
  }
  if (!full) {
    full = await stripe('prices', { fetchFn, body: { product, currency: 'usd', unit_amount: W90.full.cents, lookup_key: W90.full.lookup, nickname: 'Pay in full (90 days)', metadata: { workhorse_offer: 'w90', option: 'full' } } })
    created.push('full')
  }
  if (!split) {
    split = await stripe('prices', { fetchFn, body: {
      product, currency: 'usd', unit_amount: W90.split.cents, lookup_key: W90.split.lookup, nickname: '2 payments, 6 weeks apart',
      recurring: { interval: 'week', interval_count: W90.split.everyWeeks }, metadata: { workhorse_offer: 'w90', option: 'split' },
    } })
    created.push('split')
  }
  return { product, full: full.id, split: split.id, created }
}

// 90 days of access from today, or from the end of time they still have
// (renewing early never loses days).
export function w90AccessUntil(now = new Date(), current = null) {
  const from = current && new Date(current) > now ? new Date(current) : now
  return new Date(from.getTime() + W90.days * DAY).toISOString()
}

// When the split subscription should stop: exactly at the end of its second
// 6-week period (day 84), so the second charge is the full $249 and no third
// is ever made. Stripe prorates a cancel date that cuts a later period short,
// so this lands on the period boundary, measured from the billing anchor.
export function splitCancelAt(anchorUnix) {
  return anchorUnix + W90.split.everyWeeks * W90.split.payments * 7 * 86400
}

// access rules are shared with the app
export { groupAccess, w90CanRenew } from '../src/lib/groupAccess.js'
