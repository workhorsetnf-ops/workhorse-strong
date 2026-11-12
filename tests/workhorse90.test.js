// Workhorse 90 (Update 180): 90-day group, $495 in full or 2 × $249 six
// weeks apart, renewal when the 90 days are up, monthly group call.
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { makeSb, res } from './helpers/fakeSupabase.js'
import { W90, ensureW90Prices, w90AccessUntil, splitCancelAt } from '../api/_w90.js'
import { groupAccess, w90CanRenew } from '../src/lib/groupAccess.js'
import { runGroupBilling } from '../api/group-billing.js'
import { runGroupSignup } from '../api/group-signup.js'
import { runStripeEvent } from '../api/stripe-webhook.js'
import { dueGroupCallReminders } from '../src/lib/agenda.js'
import { nextGroupCall } from '../src/lib/agenda.js'
import { memberState, groupStats, offerLabel } from '../src/lib/groupAccess.js'

const DAY = 864e5
process.env.STRIPE_SECRET_KEY = 'sk_test_x'; process.env.STRIPE_PRICE_ID = 'price_50'

// a stand-in Stripe: answers by path, records every call
function fakeStripe(routes = {}) {
  const calls = []
  const fetchFn = async (url, o) => {
    const path = url.replace('https://api.stripe.com/v1/', '')
    const body = o.body ? decodeURIComponent(o.body) : null
    calls.push({ path, method: o.method, body })
    for (const [k, fn] of Object.entries(routes)) if (path.startsWith(k)) return { ok: true, json: async () => fn(path, body) }
    return { ok: true, json: async () => ({ id: 'x_1', url: 'https://checkout.stripe.com/c/x' }) }
  }
  return { fetchFn, calls }
}
const pricesExist = { prices: () => ({ data: [
  { id: 'price_full', lookup_key: W90.full.lookup, product: { id: 'prod_w90' } },
  { id: 'price_split', lookup_key: W90.split.lookup, product: { id: 'prod_w90' } },
] }) }

// ---------- the Stripe product
test('first time: creates the product, $495 one-time and $249 every 6 weeks', async () => {
  let n = 0
  const { fetchFn, calls } = fakeStripe({ 'prices?': () => ({ data: [] }), products: () => ({ id: 'prod_new' }), prices: () => ({ id: `price_${++n}` }) })
  const r = await ensureW90Prices(fetchFn)
  assert.deepEqual(r.created, ['product', 'full', 'split']); assert.equal(r.product, 'prod_new')
  const full = calls.find(c => c.path === 'prices' && c.body.includes(W90.full.lookup)).body
  const split = calls.find(c => c.path === 'prices' && c.body.includes(W90.split.lookup)).body
  for (const s of ['unit_amount=49500', 'currency=usd', 'product=prod_new']) assert.ok(full.includes(s), s)
  assert.ok(!full.includes('recurring'))
  for (const s of ['unit_amount=24900', 'recurring[interval]=week', 'recurring[interval_count]=6', 'product=prod_new']) assert.ok(split.includes(s), s)
})
test('after that: found by lookup key, nothing created again', async () => {
  const { fetchFn, calls } = fakeStripe(pricesExist)
  const r = await ensureW90Prices(fetchFn)
  assert.deepEqual(r, { product: 'prod_w90', full: 'price_full', split: 'price_split', created: [] })
  assert.equal(calls.filter(c => c.method !== 'GET').length, 0)
})
test('only one price missing: added to the same product', async () => {
  const { fetchFn, calls } = fakeStripe({ 'prices?': () => ({ data: [{ id: 'price_full', lookup_key: W90.full.lookup, product: { id: 'prod_w90' } }] }), prices: () => ({ id: 'price_split2' }) })
  const r = await ensureW90Prices(fetchFn)
  assert.deepEqual(r.created, ['split']); assert.ok(calls.find(c => c.path === 'prices').body.includes('product=prod_w90'))
  assert.equal(calls.some(c => c.path === 'products'), false)
})

// ---------- dates
test('90 days from today; renewing early stacks on the days left', () => {
  const now = new Date('2026-11-12T17:00:00Z')
  assert.equal(w90AccessUntil(now), '2027-02-10T17:00:00.000Z')
  assert.equal(w90AccessUntil(now, '2026-11-20T17:00:00Z'), '2027-02-18T17:00:00.000Z')
  assert.equal(w90AccessUntil(now, '2026-11-01T00:00:00Z'), '2027-02-10T17:00:00.000Z', 'expired: from today')
})
test('2-payment plan stops exactly at the end of its 2nd period (day 84): full 2nd charge, never a 3rd', () => {
  const anchor = 1_800_000_000
  assert.equal(splitCancelAt(anchor), anchor + 84 * 86400)
  assert.ok(splitCancelAt(anchor) > anchor + 42 * 86400)
})
test('access: inside 90 days yes, after no; past-due keeps access; monthly unchanged', () => {
  const now = new Date('2026-11-12T12:00:00Z')
  const m = (o) => ({ plan: 'group', group_tier: 'w90', group_status: 'active', ...o })
  assert.equal(groupAccess(m({ group_access_until: '2026-12-01T00:00:00Z' }), now), true)
  assert.equal(groupAccess(m({ group_access_until: '2026-11-12T11:59:00Z' }), now), false)
  assert.equal(groupAccess(m({ group_status: 'past_due', group_access_until: '2026-12-01T00:00:00Z' }), now), true)
  assert.equal(groupAccess(m({ group_status: 'canceled', group_access_until: '2026-12-01T00:00:00Z' }), now), false)
  assert.equal(groupAccess({ plan: 'group', group_tier: 'monthly', group_status: 'active', group_access_until: null }, now), true)
  assert.equal(groupAccess({ plan: 'coaching' }, now), true)
})
test('renewal opens in the last 14 days only', () => {
  const now = new Date('2026-11-12T12:00:00Z')
  assert.equal(w90CanRenew({ group_tier: 'w90', group_access_until: new Date(now.getTime() + 10 * DAY).toISOString() }, now), true)
  assert.equal(w90CanRenew({ group_tier: 'w90', group_access_until: new Date(now.getTime() + 30 * DAY).toISOString() }, now), false)
  assert.equal(w90CanRenew({ group_tier: 'monthly', group_access_until: null }, now), false)
})

// ---------- sign-up
const baseDb = () => ({
  tracks: [{ id: 'trA', name: 'Main Event Build', group_offer: true, group_position: 0, program_id: 'progA', chat_group_id: 'chat1' }],
  profiles: [], program_blocks: [{ id: 'blk1', program_id: 'progA', position: 0 }], program_assignments: [], message_group_members: [], plan_templates: [],
})
const nums = { weight: 180, height_ft: 5, height_in: 10, age: 24, sex: 'male', activity: 'light-schedule', goal: 'cut' }
test('/start/90 sign-up: same tracks, Workhorse 90 member, payment choices listed', async () => {
  const sb = makeSb(baseDb())
  let r = res(); await runGroupSignup(sb, { list: true, offer: 'w90' }, r)
  assert.deepEqual(r.body.tracks.map(t => t.id), ['trA']); assert.equal(r.body.name, 'Workhorse 90'); assert.ok(r.body.options.full && r.body.options.split)
  const createAccount = async (sb2, v) => { sb2.db.profiles.push({ id: 'u1', email: v.mail }); return { user: { id: 'u1' } } }
  r = res(); await runGroupSignup(sb, { offer: 'w90', track_id: 'trA', full_name: 'Jay W', email: 'j@x.com', password: 'longenough', numbers: nums }, r, { createAccount })
  assert.equal(r.code, 200); assert.equal(sb.db.profiles[0].group_tier, 'w90'); assert.equal(sb.db.profiles[0].group_status, 'pending')
})
test('/start sign-up still makes $50/month members', async () => {
  const sb = makeSb(baseDb())
  const createAccount = async (sb2, v) => { sb2.db.profiles.push({ id: 'u1', email: v.mail }); return { user: { id: 'u1' } } }
  await runGroupSignup(sb, { track_id: 'trA', full_name: 'Jay W', email: 'j@x.com', password: 'longenough', numbers: nums }, res(), { createAccount })
  assert.equal(sb.db.profiles[0].group_tier, 'monthly')
})

// ---------- checkout
const member = o => ({ id: 'u1', email: 'j@x.com', plan: 'group', group_status: 'pending', group_tier: 'w90', ...o })
test('pay in full: one-time $495 checkout tagged Workhorse 90', async () => {
  const sb = makeSb({ profiles: [member()] }); const { fetchFn, calls } = fakeStripe(pricesExist); const r = res()
  await runGroupBilling(sb, { id: 'u1' }, { action: 'checkout', offer: 'w90', option: 'full' }, r, { base: 'https://app.test', fetchFn })
  assert.equal(r.code, 200); const b = calls.find(c => c.path === 'checkout/sessions').body
  for (const s of ['mode=payment', 'line_items[0][price]=price_full', 'metadata[offer]=w90', 'metadata[option]=full', 'payment_intent_data[metadata][profile_id]=u1', 'customer_creation=always', 'client_reference_id=u1']) assert.ok(b.includes(s), s)
})
test('2 payments: $249 subscription checkout tagged Workhorse 90 split', async () => {
  const sb = makeSb({ profiles: [member()] }); const { fetchFn, calls } = fakeStripe(pricesExist); const r = res()
  await runGroupBilling(sb, { id: 'u1' }, { action: 'checkout', offer: 'w90', option: 'split' }, r, { base: 'https://app.test', fetchFn })
  const b = calls.find(c => c.path === 'checkout/sessions').body
  for (const s of ['mode=subscription', 'line_items[0][price]=price_split', 'subscription_data[metadata][offer]=w90', 'subscription_data[metadata][option]=split', 'subscription_data[metadata][profile_id]=u1']) assert.ok(b.includes(s), s)
})
test('no buying twice; renewal allowed in the last 14 days; dropping to $50/month when time is up', async () => {
  const { fetchFn, calls } = fakeStripe(pricesExist)
  const soon = new Date(Date.now() + 10 * DAY).toISOString(), later = new Date(Date.now() + 40 * DAY).toISOString(), gone = new Date(Date.now() - DAY).toISOString()
  let sb = makeSb({ profiles: [member({ group_status: 'active', group_access_until: later })] }); let r = res()
  await runGroupBilling(sb, { id: 'u1' }, { action: 'checkout', offer: 'w90', option: 'full' }, r, { base: 'x', fetchFn }); assert.equal(r.code, 400)
  sb = makeSb({ profiles: [member({ group_status: 'active', group_access_until: soon })] }); r = res()
  await runGroupBilling(sb, { id: 'u1' }, { action: 'checkout', offer: 'w90', option: 'full' }, r, { base: 'x', fetchFn }); assert.equal(r.code, 200)
  r = res(); await runGroupBilling(sb, { id: 'u1' }, { action: 'checkout', offer: 'monthly' }, r, { base: 'x', fetchFn }); assert.equal(r.code, 400, 'not while still in')
  sb = makeSb({ profiles: [member({ group_status: 'active', group_access_until: gone })] }); r = res(); calls.length = 0
  await runGroupBilling(sb, { id: 'u1' }, { action: 'checkout', offer: 'monthly' }, r, { base: 'x', fetchFn }); assert.equal(r.code, 200)
  const b = calls.find(c => c.path === 'checkout/sessions').body
  assert.ok(b.includes('line_items[0][price]=price_50') && b.includes('subscription_data[metadata][offer]=monthly'))
})

// ---------- webhook
const ev = (type, object, created = 1762300000) => ({ type, created, data: { object } })
const w90Db = () => { const d = baseDb(); d.profiles.push({ id: 'u1', plan: 'group', group_status: 'pending', group_tier: 'w90', group_track_id: 'trA' }); return d }
const near = (iso, days) => Math.abs(new Date(iso).getTime() - (Date.now() + days * DAY)) < 60000
test('paid in full: active for 90 days, program assigned, in the team chat', async () => {
  const sb = makeSb(w90Db()); const r = res()
  await runStripeEvent(sb, ev('checkout.session.completed', { id: 'cs_full', mode: 'payment', payment_status: 'paid', client_reference_id: 'u1', customer: 'cus_1', metadata: { offer: 'w90', option: 'full', profile_id: 'u1' } }), r)
  const p = sb.db.profiles[0]
  assert.equal(p.group_status, 'active'); assert.equal(p.group_tier, 'w90'); assert.equal(p.group_option, 'full'); assert.ok(near(p.group_access_until, 90))
  assert.equal(p.stripe_customer_id, 'cus_1'); assert.equal(sb.db.program_assignments.length, 1); assert.deepEqual(sb.db.message_group_members.map(m => m.profile_id), ['u1'])
})
test('Stripe sending the same payment twice never adds 90 days twice', async () => {
  const sb = makeSb(w90Db())
  const e = ev('checkout.session.completed', { id: 'cs_full', mode: 'payment', payment_status: 'paid', client_reference_id: 'u1', metadata: { offer: 'w90', option: 'full' } })
  await runStripeEvent(sb, e, res()); const first = sb.db.profiles[0].group_access_until
  await runStripeEvent(sb, { ...e, created: e.created + 5 }, res())
  assert.equal(sb.db.profiles[0].group_access_until, first)
})
test('unpaid or non-Workhorse one-time payments are ignored', async () => {
  const sb = makeSb(w90Db())
  let r = res(); await runStripeEvent(sb, ev('checkout.session.completed', { id: 'cs_x', mode: 'payment', payment_status: 'unpaid', client_reference_id: 'u1', metadata: { offer: 'w90' } }), r); assert.equal(r.body.ignored, true)
  r = res(); await runStripeEvent(sb, ev('checkout.session.completed', { id: 'cs_y', mode: 'payment', payment_status: 'paid', client_reference_id: 'u1' }), r); assert.equal(r.body.ignored, true)
  assert.equal(sb.db.profiles[0].group_status, 'pending')
})

const splitSub = (o = {}) => ({ id: 'sub_w90', status: 'active', start_date: 1762300000, billing_cycle_anchor: 1762300000, current_period_end: 1762300000 + 42 * 86400, metadata: { offer: 'w90', option: 'split', profile_id: 'u1' }, ...o })
test('2 payments: active for 90 days and the subscription is set to stop after the 2nd payment', async () => {
  const sb = makeSb(w90Db())
  const { fetchFn, calls } = fakeStripe({ 'subscriptions/sub_w90': (path, body) => (body ? splitSub({ cancel_at: splitCancelAt(1762300000) }) : splitSub()) })
  await runStripeEvent(sb, ev('checkout.session.completed', { id: 'cs_split', mode: 'subscription', client_reference_id: 'u1', customer: 'cus_1', subscription: 'sub_w90', metadata: { offer: 'w90', option: 'split' } }), res(), { fetchFn })
  const p = sb.db.profiles[0]
  assert.equal(p.group_status, 'active'); assert.equal(p.group_option, 'split'); assert.ok(near(p.group_access_until, 90)); assert.equal(p.stripe_subscription_id, 'sub_w90')
  const stop = calls.find(c => c.path === 'subscriptions/sub_w90' && c.method !== 'GET')
  assert.ok(stop, 'cancel_at was set'); assert.equal(stop.body, `cancel_at=${1762300000 + 84 * 86400}`, 'on the period boundary, nothing else changed')
  assert.equal(p.group_cancel_at_period_end, false, 'not shown as cancelling')
})
const paidW90 = () => { const d = w90Db(); Object.assign(d.profiles[0], { group_status: 'active', group_option: 'split', stripe_subscription_id: 'sub_w90', group_status_at: '2025-11-05T00:00:00Z', group_access_until: new Date(Date.now() + 7 * DAY).toISOString() }); return d }
test('the planned stop after both payments: they keep their 90 days', async () => {
  const sb = makeSb(paidW90()); const { fetchFn } = fakeStripe({ invoices: () => ({ data: [{ amount_paid: 24900 }, { amount_paid: 24900 }] }) })
  await runStripeEvent(sb, ev('customer.subscription.deleted', splitSub({ status: 'canceled' }), 1769500000), res(), { fetchFn })
  assert.equal(sb.db.profiles[0].group_status, 'active'); assert.ok(groupAccess(sb.db.profiles[0]))
})
test('second payment never went through: membership ends', async () => {
  const sb = makeSb(paidW90()); const { fetchFn } = fakeStripe({ invoices: () => ({ data: [{ amount_paid: 24900 }] }) })
  await runStripeEvent(sb, ev('customer.subscription.updated', splitSub({ status: 'past_due', cancel_at: 1 }), 1766000000), res(), { fetchFn })
  assert.equal(sb.db.profiles[0].group_status, 'past_due'); assert.ok(groupAccess(sb.db.profiles[0]), 'still in while Stripe retries')
  await runStripeEvent(sb, ev('customer.subscription.deleted', splitSub({ status: 'canceled' }), 1766500000), res(), { fetchFn })
  assert.equal(sb.db.profiles[0].group_status, 'canceled'); assert.equal(groupAccess(sb.db.profiles[0]), false)
  assert.equal(sb.db.message_group_members.length, 0)
})
test('if Stripe can\'t be asked about invoices, nothing is ended (Stripe retries)', async () => {
  const sb = makeSb(paidW90())
  const fetchFn = async () => ({ ok: false, status: 500, json: async () => ({ error: { message: 'down' } }) })
  await assert.rejects(runStripeEvent(sb, ev('customer.subscription.deleted', splitSub({ status: 'canceled' }), 1769500000), res(), { fetchFn }))
  assert.equal(sb.db.profiles[0].group_status, 'active')
})
test('subscription events arriving before the checkout still record the offer and 90 days', async () => {
  const sb = makeSb(w90Db())
  const { fetchFn } = fakeStripe({ 'subscriptions/sub_w90': () => splitSub({ cancel_at: 5 }) })
  await runStripeEvent(sb, ev('customer.subscription.created', splitSub({ cancel_at: 5 }), 1762300010), res(), { fetchFn })
  await runStripeEvent(sb, ev('checkout.session.completed', { id: 'cs_split', mode: 'subscription', client_reference_id: 'u1', customer: 'cus_1', subscription: 'sub_w90', metadata: { offer: 'w90' } }, 1762300000), res(), { fetchFn })
  const p = sb.db.profiles[0]
  assert.equal(p.group_tier, 'w90'); assert.equal(p.group_option, 'split'); assert.ok(near(p.group_access_until, 90)); assert.equal(p.group_status, 'active')
})
test('an old subscription ending never touches the current membership', async () => {
  const sb = makeSb(paidW90()); sb.db.profiles[0].stripe_subscription_id = 'sub_new'
  const r = res(); await runStripeEvent(sb, ev('customer.subscription.deleted', splitSub({ status: 'canceled' }), 1769500000), r)
  assert.equal(r.body.ignored, 'not their current subscription'); assert.equal(sb.db.profiles[0].group_status, 'active')
})
test('renewing early adds 90 days on top of the days left', async () => {
  const sb = makeSb(paidW90())
  await runStripeEvent(sb, ev('checkout.session.completed', { id: 'cs_renew', mode: 'payment', payment_status: 'paid', client_reference_id: 'u1', metadata: { offer: 'w90', option: 'full' } }, 1769600000), res())
  assert.ok(near(sb.db.profiles[0].group_access_until, 97)); assert.equal(sb.db.profiles[0].group_option, 'full')
})
test('time up, switched to $50/month: runs until cancelled, program kept', async () => {
  const sb = makeSb(paidW90()); Object.assign(sb.db.profiles[0], { group_access_until: new Date(Date.now() - DAY).toISOString() })
  sb.db.program_assignments.push({ id: 'a1', client_id: 'u1' })
  const { fetchFn } = fakeStripe({ 'subscriptions/sub_m': () => ({ id: 'sub_m', status: 'active', current_period_end: 1772000000 }) })
  await runStripeEvent(sb, ev('checkout.session.completed', { id: 'cs_m', mode: 'subscription', client_reference_id: 'u1', subscription: 'sub_m', metadata: { offer: 'monthly' } }, 1769700000), res(), { fetchFn })
  const p = sb.db.profiles[0]
  assert.equal(p.group_tier, 'monthly'); assert.equal(p.group_access_until, null); assert.equal(p.stripe_subscription_id, 'sub_m'); assert.ok(groupAccess(p)); assert.equal(sb.db.program_assignments.length, 1)
})

// ---------- monthly group call
test('call reminders: members and coach, at their usual lead time, once', () => {
  const now = new Date('2026-12-10T23:50:00Z'), tz = 'America/New_York'
  const calls = [{ id: 'gc1', title: 'Workhorse 90 group call', starts_at: '2026-12-11T00:00:00Z', link_url: 'https://zoom.us/j/1' }]
  const out = dueGroupCallReminders({ now, tz, calls, members: [{ id: 'm1' }, { id: 'm2' }], coachIds: ['coach'], prefs: { m2: { call_lead_minutes: 5 } } })
  assert.deepEqual(out.map(m => m.user_id).sort(), ['coach', 'm1'], 'm2 asked for 5 minutes, not yet')
  assert.ok(out[0].title.includes('7:00 PM')); assert.equal(out[0].url, 'https://zoom.us/j/1'); assert.equal(out[0].key.kind, 'group_call')
  const sent = new Set(out.map(m => `${m.key.kind}:${m.key.item_id}:${m.key.user_id}:${m.key.for_date}`))
  assert.equal(dueGroupCallReminders({ now, tz, calls, members: [{ id: 'm1' }], coachIds: ['coach'], sent }).length, 0)
  assert.equal(dueGroupCallReminders({ now, tz, calls, members: [{ id: 'm1' }], prefs: { m1: { calls: false } } }).length, 0)
  assert.equal(dueGroupCallReminders({ now: new Date('2026-12-11T00:30:00Z'), tz, calls, members: [{ id: 'm1' }] }).length, 0, 'not after it started')
})
test('Home shows the next call that hasn\'t finished', () => {
  const now = new Date('2026-12-11T00:30:00Z')
  const c = nextGroupCall([{ id: 'b', starts_at: '2027-01-08T00:00:00Z' }, { id: 'a', starts_at: '2026-12-11T00:00:00Z', duration_minutes: 60 }, { id: 'old', starts_at: '2026-11-10T00:00:00Z' }], now)
  assert.equal(c.id, 'a', 'still live for its hour'); assert.equal(nextGroupCall([{ id: 'a', starts_at: '2026-12-10T00:00:00Z' }], now), null)
})

// ---------- coach view
test('coach list: time-up members shown as such, revenue counts the $50 plan only', () => {
  const now = new Date('2026-11-12T12:00:00Z')
  const ms = [
    { group_tier: 'monthly', group_status: 'active' },
    { group_tier: 'monthly', group_status: 'past_due' },
    { group_tier: 'w90', group_option: 'full', group_status: 'active', group_access_until: '2026-12-30T00:00:00Z' },
    { group_tier: 'w90', group_option: 'split', group_status: 'active', group_access_until: '2026-11-01T00:00:00Z' },
    { group_tier: 'w90', group_status: 'pending' },
  ]
  assert.deepEqual(ms.map(m => memberState(m, now)), ['active', 'past_due', 'active', 'expired', 'pending'])
  const st = groupStats(ms, 50, now)
  assert.equal(st.paying, 3); assert.equal(st.w90, 1); assert.equal(st.mrr, 100); assert.equal(st.ended, 1)
  assert.deepEqual(ms.slice(0, 4).map(offerLabel), ['$50/month', '$50/month', 'W90 · paid in full', 'W90 · 2 payments'])
})
