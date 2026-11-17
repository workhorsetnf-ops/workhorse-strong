// Hands-free onboarding (Update 184): payment -> account + contract + forms +
// setup email; setup link -> password; signing -> welcome email; stages.
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { makeSb, res } from './helpers/fakeSupabase.js'
import { onboardFromPayment, sendWelcome, hashToken, resolveContract } from '../api/_onboard.js'
import { runOnboard, runKitHook } from '../api/onboard.js'
import { runStripeEvent, isOutsidePayment } from '../api/stripe-webhook.js'
import { onboardingStage, slotsByDay } from '../src/lib/onboarding.js'

const SETTINGS = { id: 1, enabled: true, contract_template_id: 'tpl1', form_ids: ['f1', 'f2'], call_type_id: 'ct1', kit_setup_sequence_id: 11, kit_welcome_sequence_id: 22 }
const db = (over = {}) => ({
  onboarding_settings: [{ ...SETTINGS, ...over }],
  contract_templates: [{ id: 'tpl1', name: 'Coaching Agreement', body: 'I, {{client_name}}, agree. Dated {{date}}.' }],
  profiles: [{ id: 'old', email: 'old@x.com', full_name: 'Old Client' }],
  contracts: [], standalone_form_assignments: [], onboarding_tokens: [],
})
const makeAccount = async (sb, v) => { sb.db.profiles.push({ id: 'new1', email: v.mail, full_name: v.name, role: 'client' }); return { user: { id: 'new1' } } }
function deps(extra = {}) {
  const calls = { subscribe: [], notify: [] }
  return { calls, d: { createAccount: makeAccount, kitReady: () => true, subscribe: async a => { calls.subscribe.push(a) }, notify: async m => { calls.notify.push(m) }, ...extra } }
}

// ---------- payment -> onboarding
test('new payer: account, contract with their name, forms, hashed one-time link, setup email', async () => {
  const sb = makeSb(db()); const { calls, d } = deps()
  const r = await onboardFromPayment(sb, { email: ' Jay@Example.com ', name: 'Jay Lethal', source: 'stripe:sub_1' }, d)
  assert.equal(r.onboarded, 'new1')
  const p = sb.db.profiles.find(x => x.id === 'new1')
  assert.equal(p.email, 'jay@example.com'); assert.ok(p.onboarding_started_at); assert.equal(p.onboarding_source, 'stripe:sub_1')
  assert.equal(sb.db.contracts.length, 1); assert.match(sb.db.contracts[0].body, /^I, Jay Lethal, agree\./); assert.equal(sb.db.contracts[0].status, 'sent')
  assert.deepEqual(sb.db.standalone_form_assignments.map(a => a.form_id), ['f1', 'f2'])
  const token = r.link.split('/welcome/')[1]
  assert.equal(sb.db.onboarding_tokens.length, 1); assert.equal(sb.db.onboarding_tokens[0].token_hash, hashToken(token)); assert.notEqual(sb.db.onboarding_tokens[0].token_hash, token)
  assert.equal(calls.subscribe.length, 1); assert.equal(calls.subscribe[0].sequenceId, 11); assert.equal(calls.subscribe[0].fields.setup_link, r.link); assert.equal(calls.subscribe[0].firstName, 'Jay')
  assert.match(calls.notify[0].body, /setup email sent/)
})
test('existing account, switched off, or no email: nothing happens', async () => {
  for (const [over, info, why] of [[{}, { email: 'OLD@x.com' }, 'already has an account'], [{ enabled: false }, { email: 'n@x.com' }, 'onboarding is off'], [{}, { email: '' }, 'no email on the payment']]) {
    const sb = makeSb(db(over)); const { calls, d } = deps()
    assert.equal((await onboardFromPayment(sb, info, d)).skipped, why)
    assert.equal(sb.db.contracts.length + calls.subscribe.length, 0)
  }
})
test('account already exists in auth (race with another event): skipped quietly', async () => {
  const sb = makeSb(db()); const { calls, d } = deps({ createAccount: async () => ({ error: 'exists', status: 409 }) })
  assert.equal((await onboardFromPayment(sb, { email: 'n@x.com' }, d)).skipped, 'already has an account'); assert.equal(calls.subscribe.length, 0)
})
test('Kit down: still onboarded, coach told to copy the link', async () => {
  const sb = makeSb(db()); const { calls, d } = deps({ subscribe: async () => { throw new Error('Kit error 500') } })
  const r = await onboardFromPayment(sb, { email: 'n@x.com', name: 'N Person' }, d)
  assert.equal(r.onboarded, 'new1'); assert.equal(r.kitError, 'Kit error 500'); assert.match(calls.notify[0].body, /didn’t send/)
})
test('no name on the payment falls back to the email', async () => {
  const sb = makeSb(db()); const { d } = deps()
  await onboardFromPayment(sb, { email: 'mjf@x.com' }, d); assert.equal(sb.db.profiles.find(p => p.id === 'new1').full_name, 'mjf')
})

// ---------- setup link
async function withLink() {
  const sb = makeSb(db()); const { d } = deps()
  const r = await onboardFromPayment(sb, { email: 'jay@x.com', name: 'Jay L' }, d)
  return { sb, token: r.link.split('/welcome/')[1] }
}
test('check shows their email; claim sets the password, renames the contract, and the link dies', async () => {
  const { sb, token } = await withLink()
  let r = res(); await runOnboard(sb, { action: 'check', token }, r); assert.deepEqual(r.body, { ok: true, email: 'jay@x.com', name: 'Jay L' })
  const set = []
  r = res(); await runOnboard(sb, { action: 'claim', token, password: 'short' }, r, { updateUser: async () => ({}) }); assert.equal(r.code, 400)
  r = res(); await runOnboard(sb, { action: 'claim', token, password: 'longenough1', full_name: 'Jay Lethal' }, r, { updateUser: async (id, a) => { set.push([id, a.password]); return {} } })
  assert.equal(r.body.ok, true); assert.deepEqual(set, [['new1', 'longenough1']])
  assert.equal(sb.db.profiles.find(p => p.id === 'new1').full_name, 'Jay Lethal'); assert.match(sb.db.contracts[0].body, /^I, Jay Lethal, agree/)
  r = res(); await runOnboard(sb, { action: 'check', token }, r); assert.equal(r.code, 404)
  r = res(); await runOnboard(sb, { action: 'claim', token, password: 'longenough1' }, r, { updateUser: async () => ({}) }); assert.equal(r.code, 404)
})
test('expired or made-up link: refused; failed password save frees the link again', async () => {
  const { sb, token } = await withLink()
  let r = res(); await runOnboard(sb, { action: 'check', token: 'nope' }, r); assert.equal(r.code, 404)
  r = res(); await runOnboard(sb, { action: 'claim', token, password: 'longenough1' }, r, { updateUser: async () => ({ error: { message: 'weak' } }) })
  assert.equal(r.code, 400); assert.equal(sb.db.onboarding_tokens[0].used_at, null)
  sb.db.onboarding_tokens[0].expires_at = new Date(Date.now() - 1000).toISOString()
  r = res(); await runOnboard(sb, { action: 'check', token }, r); assert.equal(r.code, 404)
})
test('coach can mint a fresh link (old one stops); clients cannot', async () => {
  const { sb, token } = await withLink()
  let r = res(); await runOnboard(sb, { action: 'link', client_id: 'new1' }, r, { me: async () => ({ id: 'c', role: 'coach' }) })
  assert.match(r.body.link, /\/welcome\//); assert.equal(sb.db.onboarding_tokens.length, 1)
  r = res(); await runOnboard(sb, { action: 'check', token }, r); assert.equal(r.code, 404)
  r = res(); await runOnboard(sb, { action: 'link', client_id: 'new1' }, r, { me: async () => ({ id: 'new1', role: 'client' }) }); assert.equal(r.code, 403)
  r = res(); await runOnboard(sb, { action: 'signed' }, r, { me: async () => null }); assert.equal(r.code, 401)
})

// ---------- signing -> welcome
test('welcome waits for the signature, sends once, and retries if Kit fails', async () => {
  const { sb } = await withLink(); const { calls, d } = deps()
  assert.equal((await sendWelcome(sb, 'new1', d)).skipped, 'contract not signed yet')
  sb.db.contracts[0].status = 'signed'
  let fail = true
  const flaky = { ...d, subscribe: async a => { if (fail) throw new Error('Kit 503'); calls.subscribe.push(a) } }
  await assert.rejects(sendWelcome(sb, 'new1', flaky)); assert.equal(sb.db.profiles.find(p => p.id === 'new1').onboarding_welcome_at, null)
  fail = false
  assert.equal((await sendWelcome(sb, 'new1', flaky)).sent, true)
  assert.equal(calls.subscribe.length, 1); assert.equal(calls.subscribe[0].sequenceId, 22); assert.match(calls.subscribe[0].fields.app_link, /\/app$/)
  assert.equal((await sendWelcome(sb, 'new1', flaky)).skipped, 'already sent'); assert.equal(calls.subscribe.length, 1)
  assert.equal((await sendWelcome(sb, 'old', flaky)).skipped, 'not a new client')
})

// ---------- Stripe events
const stripeFake = (charges = 1, email = 'buyer@x.com', name = 'Big Buyer') => async url => ({
  ok: true, json: async () => url.includes('/customers/') ? { email, name }
    : url.includes('/charges?') ? { data: Array.from({ length: charges }, () => ({ status: 'succeeded' })) }
    : url.includes('/charges/') ? { billing_details: { email, name } } : {},
})
async function event(evt, { charges = 1, sbDb = db() } = {}) {
  process.env.STRIPE_SECRET_KEY = 'sk_test'
  const sb = makeSb(sbDb); const seen = []
  const r = res(); await runStripeEvent(sb, evt, r, { fetchFn: stripeFake(charges), onboard: async (_s, info) => { seen.push(info); return { onboarded: 'x' } } })
  return { body: r.body, seen }
}
test('Newie subscription from a stranger starts onboarding with their email + name', async () => {
  const { body, seen } = await event({ type: 'customer.subscription.created', data: { object: { id: 'sub_9', customer: 'cus_9', status: 'active', metadata: {} } } })
  assert.equal(body.onboarded, 'x'); assert.deepEqual(seen, [{ email: 'buyer@x.com', name: 'Big Buyer', source: 'stripe:sub_9' }])
})
test('one-time payment (payment_intent) from a stranger starts onboarding', async () => {
  const { seen } = await event({ type: 'payment_intent.succeeded', data: { object: { id: 'pi_1', amount_received: 120000, latest_charge: 'ch_1', metadata: {} } } })
  assert.equal(seen[0].email, 'buyer@x.com'); assert.equal(seen[0].source, 'stripe:pi_1')
})
test('renewals, the app’s own checkouts, tiny charges and subscription updates never onboard', async () => {
  const cases = [
    [{ type: 'customer.subscription.created', data: { object: { id: 's', customer: 'cus_1', status: 'active', metadata: {} } } }, { charges: 3 }],   // returning payer
    [{ type: 'payment_intent.succeeded', data: { object: { id: 'pi', amount_received: 5000, metadata: { offer: 'w90', profile_id: 'p' } } } }, {}],
    [{ type: 'payment_intent.succeeded', data: { object: { id: 'pi', amount_received: 50, metadata: {} } } }, {}],
    [{ type: 'customer.subscription.updated', data: { object: { id: 's', customer: 'cus_1', status: 'active', metadata: {} } } }, {}],
    [{ type: 'customer.subscription.created', data: { object: { id: 's', customer: 'cus_1', status: 'incomplete', metadata: {} } } }, {}],
    [{ type: 'checkout.session.completed', data: { object: { id: 'cs', mode: 'subscription', payment_status: 'paid', client_reference_id: 'ghost', metadata: { profile_id: 'ghost' } } } }, {}],
  ]
  for (const [evt, opt] of cases) { const { seen } = await event(evt, opt); assert.equal(seen.length, 0, JSON.stringify(evt)) }
})
test('a known customer paying again is left alone', async () => {
  const sbDb = db(); sbDb.profiles.push({ id: 'k', email: 'k@x.com', stripe_customer_id: 'cus_k' })
  const { body, seen } = await event({ type: 'payment_intent.succeeded', data: { object: { id: 'pi', customer: 'cus_k', amount_received: 40000, metadata: {} } } }, { sbDb })
  assert.equal(body.ignored, 'existing client'); assert.equal(seen.length, 0)
})
test('outside-payment check', () => {
  assert.equal(isOutsidePayment({ metadata: {} }), true)
  assert.equal(isOutsidePayment({ metadata: { profile_id: 'p' } }), false); assert.equal(isOutsidePayment({ client_reference_id: 'p', metadata: {} }), false)
})

// ---------- stages + slots
test('stages run setup -> contract -> forms -> call -> done', () => {
  const profile = { onboarding_started_at: '2026-11-17T00:00:00Z' }
  assert.equal(onboardingStage({ profile: {} }), null)
  assert.equal(onboardingStage({ profile, setupDone: false }), 'setup')
  assert.equal(onboardingStage({ profile, contracts: [{ status: 'sent' }] }), 'contract')
  assert.equal(onboardingStage({ profile, contracts: [{ status: 'signed' }], assignments: [{ status: 'pending' }, { status: 'completed' }] }), 'forms')
  assert.equal(onboardingStage({ profile, assignments: [{ status: 'completed' }], callTypeId: 'ct1', bookings: [{ status: 'booked', call_type_id: 'other' }] }), 'call')
  assert.equal(onboardingStage({ profile, callTypeId: 'ct1', bookings: [{ status: 'cancelled', call_type_id: 'ct1' }] }), 'call')
  assert.equal(onboardingStage({ profile, callTypeId: 'ct1', bookings: [{ status: 'booked', call_type_id: 'ct1' }] }), 'done')
  assert.equal(onboardingStage({ profile, bookings: [{ status: 'booked', created_at: '2026-11-18T00:00:00Z' }] }), 'done')
})
test('slots group by the coach’s day, not UTC', () => {
  const g = slotsByDay([{ starts_at: '2026-11-18T23:30:00Z' }, { starts_at: '2026-11-19T01:00:00Z' }, { starts_at: '2026-11-19T15:00:00Z' }], 'America/New_York')
  assert.deepEqual(g.map(x => [x.day, x.slots.length]), [['2026-11-18', 2], ['2026-11-19', 1]])
})
test('contract placeholders', () => assert.equal(resolveContract('{{client_name}} / {{date}}', 'A B', new Date('2026-11-17T15:00:00Z')), 'A B / 11/17/2026'))

// ---------- Newie via Zapier -> Kit tag -> Kit webhook (Update 185)
const kitFake = (tags, sub = { email_address: 'newbie@x.com', first_name: 'New', fields: { last_name: 'Guy' } }) => async path =>
  path.endsWith('/tags?per_page=100') ? { tags } : { subscriber: sub }
test('Kit tag webhook onboards only a subscriber who really has the newie-purchase tag', async () => {
  const sb = makeSb(db()); const seen = []
  const onboard = async (_s, info) => { seen.push(info); return { onboarded: 'x' } }
  let r = res(); await runKitHook(sb, { subscriber: { id: 5, email_address: 'spoof@evil.com' } }, r, { kit: kitFake([{ name: 'Newie-Purchase' }]), onboard })
  assert.deepEqual(seen, [{ email: 'newbie@x.com', name: 'New Guy', source: 'newie' }])   // email from Kit, not the body
  r = res(); await runKitHook(sb, { subscriber: { id: 6 } }, r, { kit: kitFake([{ name: 'lead-magnet' }]), onboard })
  assert.equal(r.body.ignored, 'not tagged'); assert.equal(seen.length, 1)
  r = res(); await runKitHook(sb, {}, r, { kit: kitFake([]), onboard }); assert.equal(r.code, 400)
})

// ---------- coach's "Start onboarding" button (Update 186)
test('coach can start onboarding by hand, even with auto switched off; clients cannot', async () => {
  const sb = makeSb(db({ enabled: false })); const coach = { me: async () => ({ id: 'c', role: 'coach' }) }
  const real = (s, info, d) => onboardFromPayment(s, info, { ...d, createAccount: makeAccount, kitReady: () => true, subscribe: async () => {} })
  let r = res(); await runOnboard(sb, { action: 'start', email: 'walkin@x.com', full_name: 'Walk In' }, r, { ...coach, onboard: real })
  assert.equal(r.body.onboarded, 'new1'); assert.match(r.body.link, /\/welcome\//); assert.equal(sb.db.contracts.length, 1)
  assert.equal(sb.db.profiles.find(p => p.id === 'new1').onboarding_source, 'manual')
  r = res(); await runOnboard(sb, { action: 'start', email: 'old@x.com', full_name: 'Old' }, r, { ...coach, onboard: real }); assert.equal(r.code, 409)
  r = res(); await runOnboard(sb, { action: 'start', email: 'nope', full_name: 'No' }, r, { ...coach, onboard: real }); assert.equal(r.code, 400)
  r = res(); await runOnboard(sb, { action: 'start', email: 'x@y.com' }, r, { me: async () => ({ id: 'k', role: 'client' }) }); assert.equal(r.code, 403)
})
test('automatic path still respects the off switch', async () => {
  const sb = makeSb(db({ enabled: false })); const { d } = deps()
  assert.equal((await onboardFromPayment(sb, { email: 'z@x.com' }, d)).skipped, 'onboarding is off')
})
