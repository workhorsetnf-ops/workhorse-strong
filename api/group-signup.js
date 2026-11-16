// Public sign-up for the group offer (Update 166).
//   POST { list: true }  -> { tracks: [{ id, name, description }], price }   (what's on sale)
//   ... with offer: 'w90' -> Workhorse 90 (Update 180): same tracks, 90 days, monthly group call
//   ... each track says three_day: true when it also comes as a 3-day program (Update 183)
//   POST { track_id, days: 3 | 4, full_name, email, password, numbers: { weight, height_ft, height_in, age, sex, activity, goal } }
//        -> creates the account as a group member (pending until paid) with
//           starting macros. The page then signs them in and opens checkout.
import { admin } from './_push.js'
import { checkNewAccount, createClientAccount } from './_accounts.js'
import { starterTargets } from './_group.js'
import { stripe } from './_stripe.js'
import { W90, W90_LABELS } from './_w90.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try { return await runGroupSignup(admin(), req.body || {}, res) } catch (e) { res.status(500).json({ error: e.message }) }
}

export async function runGroupSignup(sb, body, res, deps = {}) {
  const { data: rows } = await sb.from('tracks').select('id, name, description, program_3day_id').eq('group_offer', true).order('group_position').order('name')
  const w90 = body.offer === 'w90'
  // the page only needs to know a 3-day version exists, not which program it is
  const tracks = (rows || []).map(({ program_3day_id, ...t }) => ({ ...t, three_day: !!program_3day_id }))
  if (body.list) return res.json(w90
    ? { tracks, offer: 'w90', name: W90.name, options: W90_LABELS }
    : { tracks, price: await priceLabel(deps.fetchFn) })
  if (!tracks.length) return res.status(400).json({ error: 'Sign-ups aren’t open yet.' })
  const track = tracks.find(t => t.id === body.track_id)
  if (!track) return res.status(400).json({ error: 'Pick a program first.' })
  const days = Number(body.days) === 3 ? 3 : 4
  if (days === 3 && !track.three_day) return res.status(400).json({ error: `${track.name} doesn’t come in a 3-day version yet. Pick 4 days.` })
  const v = checkNewAccount(body)
  if (v.error) return res.status(400).json({ error: v.error })
  const targets = starterTargets(body.numbers)
  if (!targets) return res.status(400).json({ error: 'Please fill in your weight, height, age and sex so we can set your starting targets.' })
  const r = await (deps.createAccount || createClientAccount)(sb, { ...v, password: body.password })
  if (r.error) return res.status(r.status || 400).json({ error: r.error })
  const { error } = await sb.from('profiles').update({
    plan: 'group', group_status: 'pending', group_tier: w90 ? 'w90' : 'monthly', group_track_id: track.id, group_days: days, status: 'active', adherence_tier: 3, ...targets,
  }).eq('id', r.user.id)
  if (error) return res.status(500).json({ error: 'Account made, but setup failed: ' + error.message })
  res.json({ ok: true })
}

// "$50/month" from the Stripe price, so the page never shows a stale number
async function priceLabel(fetchFn) {
  const id = String(process.env.STRIPE_PRICE_ID || '').trim()
  if (!id || !process.env.STRIPE_SECRET_KEY) return null
  try {
    const p = await stripe(`prices/${id}`, { method: 'GET', fetchFn })
    const amt = (p.unit_amount || 0) / 100
    const per = p.recurring?.interval_count > 1 ? `${p.recurring.interval_count} ${p.recurring.interval}s` : p.recurring?.interval || 'month'
    return `$${Number.isInteger(amt) ? amt : amt.toFixed(2)}/${per}`
  } catch { return null }
}
