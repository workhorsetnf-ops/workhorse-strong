// 3-day option for group tracks (Update 183): members pick 3 or 4 days at
// sign-up and get the matching program when they pay.
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { makeSb, res } from './helpers/fakeSupabase.js'
import { runGroupSignup } from '../api/group-signup.js'
import { runStripeEvent } from '../api/stripe-webhook.js'
import { programForDays } from '../src/lib/plans.js'

process.env.STRIPE_SECRET_KEY = 'sk_test_x'; process.env.STRIPE_PRICE_ID = 'price_50'

const db = () => ({
  tracks: [
    { id: 'trA', name: 'Main Event Build', group_offer: true, group_position: 0, program_id: 'prog4', program_3day_id: 'prog3', chat_group_id: 'chat1' },
    { id: 'trB', name: "Women's Track", group_offer: true, group_position: 1, program_id: 'progW4', program_3day_id: null },
  ],
  profiles: [], program_blocks: [{ id: 'b4', program_id: 'prog4', position: 0 }, { id: 'b3', program_id: 'prog3', position: 0 }],
  program_assignments: [], message_group_members: [], plan_templates: [],
})
const numbers = { weight: 180, height_ft: 5, height_in: 10, age: 24, sex: 'male', activity: 'light-schedule', goal: 'build' }
const createAccount = async (sb, v) => { sb.db.profiles.push({ id: 'u1', role: 'client', email: v.mail }); return { user: { id: 'u1' } } }
const signup = async (sb, extra) => { const r = res(); await runGroupSignup(sb, { track_id: 'trA', full_name: 'Jay W', email: 'j@x.com', password: 'longenough', numbers, ...extra }, r, { createAccount }); return r }

test('picking the program', () => {
  const t = { program_id: 'p4', program_3day_id: 'p3' }
  assert.equal(programForDays(t, 3), 'p3'); assert.equal(programForDays(t, '3'), 'p3')
  assert.equal(programForDays(t, 4), 'p4'); assert.equal(programForDays(t, undefined), 'p4')
  assert.equal(programForDays({ program_id: 'p4', program_3day_id: null }, 3), 'p4')   // no 3-day version: normal one
  assert.equal(programForDays(null, 3), null)
})

test('list says which tracks come in 3 days, without exposing program ids', async () => {
  const r = res(); await runGroupSignup(makeSb(db()), { list: true }, r)
  assert.deepEqual(r.body.tracks.map(t => [t.name, t.three_day]), [['Main Event Build', true], ["Women's Track", false]])
  assert.ok(r.body.tracks.every(t => !('program_3day_id' in t)))
})

test('sign-up stores the days picked; anything but 3 means 4', async () => {
  let sb = makeSb(db()); assert.equal((await signup(sb, { days: 3 })).code, 200); assert.equal(sb.db.profiles[0].group_days, 3)
  sb = makeSb(db()); await signup(sb, {}); assert.equal(sb.db.profiles[0].group_days, 4)
  sb = makeSb(db()); await signup(sb, { days: 7 }); assert.equal(sb.db.profiles[0].group_days, 4)
})

test('3 days on a track without a 3-day version is refused before an account is made', async () => {
  const sb = makeSb(db()); const r = res()
  await runGroupSignup(sb, { track_id: 'trB', days: 3, full_name: 'A B', email: 'a@b.co', password: 'longenough', numbers }, r, { createAccount })
  assert.equal(r.code, 400); assert.match(r.body.error, /3-day/); assert.equal(sb.db.profiles.length, 0)
})

const ev = (object) => ({ type: 'checkout.session.completed', created: 1762300000, data: { object } })
const subFetch = async () => ({ ok: true, json: async () => ({ id: 'sub_1', status: 'active', current_period_end: 1767225600, cancel_at_period_end: false }) })
const pay = sb => runStripeEvent(sb, ev({ mode: 'subscription', client_reference_id: 'u1', customer: 'cus_1', subscription: 'sub_1', payment_status: 'paid' }), res(), { fetchFn: subFetch })

test('paying gets a 3-day member the 3-day program, everyone else the normal one', async () => {
  let sb = makeSb(db()); await signup(sb, { days: 3 }); await pay(sb)
  assert.equal(sb.db.program_assignments[0].program_id, 'prog3'); assert.equal(sb.db.program_assignments[0].current_block_id, 'b3')
  assert.equal(sb.db.profiles[0].track_id, 'trA')
  sb = makeSb(db()); await signup(sb, { days: 4 }); await pay(sb)
  assert.equal(sb.db.program_assignments[0].program_id, 'prog4')
})
