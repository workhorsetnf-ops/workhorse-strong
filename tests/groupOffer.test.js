// $50/month group offer: Stripe plumbing, sign-up, checkout and the
// membership lifecycle from webhooks (Update 166).
import { test, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { makeSb, res } from './helpers/fakeSupabase.js'
import { verifyStripeSignature, formEncode, groupStatusFrom } from '../api/_stripe.js'
import { starterTargets, groupStartDate } from '../api/_group.js'
import { runStripeEvent } from '../api/stripe-webhook.js'
import { runGroupSignup } from '../api/group-signup.js'
import { runGroupBilling } from '../api/group-billing.js'
const sign = (body, secret, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`

// ---------- Stripe plumbing
test('signature: valid passes, tampered/wrong secret/old fail', () => {
  const b = '{"id":"evt_1"}'
  assert.ok(verifyStripeSignature(b, sign(b, 'whsec_x'), 'whsec_x').ok)
  assert.equal(verifyStripeSignature(b + ' ', sign(b, 'whsec_x'), 'whsec_x').ok, false)
  assert.equal(verifyStripeSignature(b, sign(b, 'whsec_y'), 'whsec_x').ok, false)
  assert.equal(verifyStripeSignature(b, sign(b, 'whsec_x', Math.floor(Date.now() / 1000) - 900), 'whsec_x').ok, false)
  assert.equal(verifyStripeSignature(b, 'garbage', 'whsec_x').ok, false); assert.equal(verifyStripeSignature(b, sign(b, 'a'), '').ok, false)
})
test('form encoding nests like Stripe expects', () => assert.equal(decodeURIComponent(formEncode({ mode: 'subscription', line_items: [{ price: 'price_1', quantity: 1 }], metadata: { profile_id: 'p' }, skip: undefined })), 'mode=subscription&line_items[0][price]=price_1&line_items[0][quantity]=1&metadata[profile_id]=p'))
test('status mapping', () => assert.deepEqual(['active', 'trialing', 'past_due', 'incomplete', 'canceled', 'unpaid', 'incomplete_expired', 'paused'].map(groupStatusFrom), ['active', 'active', 'past_due', 'pending', 'canceled', 'canceled', 'canceled', 'canceled']))

// ---------- signup numbers / start date
test('starting targets use his method; missing numbers rejected', () => {
  const m = starterTargets({ weight: 200, height_ft: 6, height_in: 0, age: 30, sex: 'male', activity: 'working-talent', goal: 'cut' })
  assert.ok(m.calories > 2000 && m.calories < 3200 && m.protein_g === 200 && m.fat_g >= 50 && m.height_in === 72 && m.goal === 'cut')
  assert.equal(starterTargets({ weight: 200, height_ft: 6, age: 30 }), null); assert.equal(starterTargets({ weight: 20, height_ft: 6, age: 30, sex: 'male' }), null)
})
test('start date: Mon-Wed today, Thu-Sun next Monday (Eastern)', () => {
  assert.equal(groupStartDate(new Date('2026-11-02T15:00:00Z')), '2026-11-02') // Mon
  assert.equal(groupStartDate(new Date('2026-11-04T15:00:00Z')), '2026-11-04') // Wed
  assert.equal(groupStartDate(new Date('2026-11-05T15:00:00Z')), '2026-11-09') // Thu -> Mon
  assert.equal(groupStartDate(new Date('2026-11-08T15:00:00Z')), '2026-11-09') // Sun -> Mon
  assert.equal(groupStartDate(new Date('2026-11-09T03:00:00Z')), '2026-11-09') // Sun 10pm ET -> Mon 9th
})

// ---------- sign-up endpoint
const baseDb = () => ({
  tracks: [{ id: 'trA', name: 'Main Event Build', description: 'Strength + conditioning', group_offer: true, group_position: 0, program_id: 'progA', chat_group_id: 'chat1', habits_template_id: 'h1' },
           { id: 'trX', name: '1:1 only', group_offer: false, program_id: 'progX' }],
  profiles: [], program_blocks: [{ id: 'blk1', program_id: 'progA', position: 0 }], program_assignments: [], message_group_members: [],
  plan_templates: [{ id: 'h1', kind: 'habits', data: { habits: [] } }],
})
test('signup list shows only tracks on sale', async () => { const sb = makeSb(baseDb()); const r = res(); await runGroupSignup(sb, { list: true }, r); assert.deepEqual(r.body.tracks.map(x => x.name), ['Main Event Build']) })
test('signup creates a pending group member with targets + daily check-in tier', async () => {
  const sb = makeSb(baseDb()); const r = res()
  const createAccount = async (sb2, v) => { sb2.db.profiles.push({ id: 'u1', role: 'client', email: v.mail }); return { user: { id: 'u1' } } }
  await runGroupSignup(sb, { track_id: 'trA', full_name: 'Jay Wrestler', email: 'J@x.com', password: 'longenough', numbers: { weight: 180, height_ft: 5, height_in: 10, age: 24, sex: 'male', activity: 'light-schedule', goal: 'build' } }, r, { createAccount })
  assert.equal(r.code, 200); const p = sb.db.profiles[0]
  assert.equal(p.plan, 'group'); assert.equal(p.group_status, 'pending'); assert.equal(p.group_track_id, 'trA'); assert.equal(p.adherence_tier, 3); assert.equal(p.protein_g, 180); assert.ok(p.calories > 2000)
})
test('signup refuses a track not on sale, and missing numbers', async () => {
  const sb = makeSb(baseDb()); let r = res(); await runGroupSignup(sb, { track_id: 'trX', full_name: 'A B', email: 'a@b.co', password: 'longenough', numbers: {} }, r); assert.equal(r.code, 400)
  r = res(); await runGroupSignup(sb, { track_id: 'trA', full_name: 'A B', email: 'a@b.co', password: 'longenough', numbers: { weight: 180 } }, r); assert.equal(r.code, 400); assert.equal(sb.db.profiles.length, 0)
})

// ---------- billing endpoint
process.env.STRIPE_SECRET_KEY = 'sk_test_x'; process.env.STRIPE_PRICE_ID = 'price_50'
let stripeCalls = []
const fakeStripe = async (url, o) => { stripeCalls.push({ url, body: o.body ? decodeURIComponent(o.body) : null }); return { ok: true, json: async () => ({ url: 'https://checkout.stripe.com/c/x', id: 'cs_1' }) } }
test('checkout: subscription for the $50 price, tagged with the member', async () => {
  stripeCalls = []; const sb = makeSb({ profiles: [{ id: 'u1', email: 'j@x.com', plan: 'group', group_status: 'pending' }] }); const r = res()
  await runGroupBilling(sb, { id: 'u1' }, { action: 'checkout' }, r, { base: 'https://app.test', fetchFn: fakeStripe })
  assert.equal(r.body.url, 'https://checkout.stripe.com/c/x'); const b = stripeCalls[0].body
  assert.ok(stripeCalls[0].url.endsWith('/checkout/sessions')); for (const s of ['mode=subscription', 'line_items[0][price]=price_50', 'client_reference_id=u1', 'subscription_data[metadata][profile_id]=u1', 'customer_email=j@x.com', 'success_url=https://app.test/app?joined=1']) assert.ok(b.includes(s), s)
})
test('checkout refused for paid members and 1:1 clients; portal needs a customer', async () => {
  const sb = makeSb({ profiles: [{ id: 'u1', plan: 'group', group_status: 'active' }, { id: 'c1', plan: 'coaching' }, { id: 'u2', plan: 'group', group_status: 'pending' }] })
  let r = res(); await runGroupBilling(sb, { id: 'u1' }, { action: 'checkout' }, r, { base: 'x', fetchFn: fakeStripe }); assert.equal(r.code, 400)
  r = res(); await runGroupBilling(sb, { id: 'c1' }, { action: 'checkout' }, r, { base: 'x', fetchFn: fakeStripe }); assert.equal(r.code, 403)
  r = res(); await runGroupBilling(sb, { id: 'u2' }, { action: 'portal' }, r, { base: 'x', fetchFn: fakeStripe }); assert.equal(r.code, 400)
})

// ---------- webhook lifecycle
const memberDb = () => { const d = baseDb(); d.profiles.push({ id: 'u1', plan: 'group', group_status: 'pending', group_track_id: 'trA' }); return d }
const subFetch = status => async url => ({ ok: true, json: async () => ({ id: 'sub_1', status, current_period_end: 1767225600, cancel_at_period_end: false }) })
const ev = (type, object, created = 1762300000) => ({ type, created, data: { object } })
test('paid: member active, program assigned (auto weeks), habits applied, added to chat', async () => {
  const sb = makeSb(memberDb()); const r = res()
  await runStripeEvent(sb, ev('checkout.session.completed', { mode: 'subscription', client_reference_id: 'u1', customer: 'cus_1', subscription: 'sub_1', payment_status: 'paid' }), r, { fetchFn: subFetch('active') })
  const p = sb.db.profiles[0]; assert.equal(p.group_status, 'active'); assert.equal(p.stripe_customer_id, 'cus_1'); assert.equal(p.stripe_subscription_id, 'sub_1'); assert.ok(p.group_period_end && p.group_joined_at)
  assert.equal(sb.db.program_assignments.length, 1); assert.equal(sb.db.program_assignments[0].program_id, 'progA'); assert.equal(sb.db.program_assignments[0].week_mode, 'auto'); assert.equal(sb.db.program_assignments[0].current_block_id, 'blk1')
  assert.equal(p.track_id, 'trA'); assert.deepEqual(sb.db.message_group_members.map(m => m.profile_id), ['u1']); assert.equal(r.body.setUp, true)
})
test('a repeat/renewal event never re-assigns or duplicates', async () => {
  const sb = makeSb(memberDb()); await runStripeEvent(sb, ev('checkout.session.completed', { mode: 'subscription', client_reference_id: 'u1', customer: 'cus_1', subscription: 'sub_1' }), res(), { fetchFn: subFetch('active') })
  sb.db.program_assignments[0].current_week = 3
  await runStripeEvent(sb, ev('customer.subscription.updated', { id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { profile_id: 'u1' } }, 1762400000), res())
  assert.equal(sb.db.program_assignments.length, 1); assert.equal(sb.db.program_assignments[0].current_week, 3); assert.equal(sb.db.message_group_members.length, 1)
})
test('failed payment -> past_due (keeps access); fixed -> active', async () => {
  const sb = makeSb(memberDb()); await runStripeEvent(sb, ev('checkout.session.completed', { mode: 'subscription', client_reference_id: 'u1', customer: 'cus_1', subscription: 'sub_1' }), res(), { fetchFn: subFetch('active') })
  await runStripeEvent(sb, ev('customer.subscription.updated', { id: 'sub_1', status: 'past_due' }, 1762400000), res()); assert.equal(sb.db.profiles[0].group_status, 'past_due'); assert.equal(sb.db.message_group_members.length, 1)
  await runStripeEvent(sb, ev('customer.subscription.updated', { id: 'sub_1', status: 'active' }, 1762500000), res()); assert.equal(sb.db.profiles[0].group_status, 'active')
})
test('cancel at period end shows as cancelling; deleted -> ended + removed from chat', async () => {
  const sb = makeSb(memberDb()); await runStripeEvent(sb, ev('checkout.session.completed', { mode: 'subscription', client_reference_id: 'u1', customer: 'cus_1', subscription: 'sub_1' }), res(), { fetchFn: subFetch('active') })
  await runStripeEvent(sb, ev('customer.subscription.updated', { id: 'sub_1', status: 'active', cancel_at_period_end: true, current_period_end: 1767225600 }, 1762400000), res())
  assert.equal(sb.db.profiles[0].group_cancel_at_period_end, true); assert.equal(sb.db.profiles[0].group_status, 'active')
  await runStripeEvent(sb, ev('customer.subscription.deleted', { id: 'sub_1', status: 'canceled' }, 1762600000), res())
  assert.equal(sb.db.profiles[0].group_status, 'canceled'); assert.equal(sb.db.message_group_members.length, 0); assert.equal(sb.db.program_assignments.length, 1) // history kept
})
test('out-of-order: an older event can\'t undo a newer one', async () => {
  const sb = makeSb(memberDb()); await runStripeEvent(sb, ev('customer.subscription.deleted', { id: 'sub_1', status: 'canceled', metadata: { profile_id: 'u1' } }, 1762600000), res())
  const r = res(); await runStripeEvent(sb, ev('customer.subscription.updated', { id: 'sub_1', status: 'active', metadata: { profile_id: 'u1' } }, 1762500000), r)
  assert.equal(r.body.skipped, 'stale event'); assert.equal(sb.db.profiles[0].group_status, 'canceled')
})
test('rejoin after ending: active again, back in chat, program kept', async () => {
  const sb = makeSb(memberDb()); await runStripeEvent(sb, ev('checkout.session.completed', { mode: 'subscription', client_reference_id: 'u1', customer: 'cus_1', subscription: 'sub_1' }), res(), { fetchFn: subFetch('active') })
  await runStripeEvent(sb, ev('customer.subscription.deleted', { id: 'sub_1' }, 1762600000), res())
  await runStripeEvent(sb, ev('checkout.session.completed', { mode: 'subscription', client_reference_id: 'u1', customer: 'cus_1', subscription: 'sub_2' }, 1762700000), res(), { fetchFn: subFetch('active') })
  const p = sb.db.profiles[0]; assert.equal(p.group_status, 'active'); assert.equal(p.stripe_subscription_id, 'sub_2'); assert.equal(sb.db.message_group_members.length, 1); assert.equal(sb.db.program_assignments.length, 1)
})
test('unknown customer / one-off payments ignored safely', async () => {
  const sb = makeSb(memberDb()); let r = res(); await runStripeEvent(sb, ev('customer.subscription.updated', { id: 'sub_zzz', customer: 'cus_zzz', status: 'active' }), r); assert.equal(r.body.ignored, 'unknown member')
  r = res(); await runStripeEvent(sb, ev('checkout.session.completed', { mode: 'payment', client_reference_id: 'u1' }), r); assert.equal(r.body.ignored, true); assert.equal(sb.db.profiles[0].group_status, 'pending')
  r = res(); await runStripeEvent(sb, ev('invoice.paid', {}), r); assert.equal(r.body.ignored, 'invoice.paid')
})
