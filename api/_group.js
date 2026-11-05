// Group-offer membership (Update 166): setting a member's billing state from
// Stripe, and setting them up the first time they're paid.
import { applyTrack } from '../src/lib/plans.js'
import { calcMacros, ACTIVITY } from '../src/lib/macros.js'

export const GOALS = ['cut', 'maintain', 'build']

// Starting targets from the signup numbers, using the coach's own method
// (Mifflin-St Jeor + wrestler activity multipliers). Null if anything's missing.
export function starterTargets(n) {
  const weightLbs = Number(n?.weight), age = Number(n?.age), hft = Number(n?.height_ft), hin = Number(n?.height_in || 0)
  const sex = n?.sex === 'female' ? 'female' : n?.sex === 'male' ? 'male' : null
  const activity = ACTIVITY.some(a => a[0] === n?.activity) ? n.activity : 'lifting-only'
  const goal = GOALS.includes(n?.goal) ? n.goal : 'maintain'
  if (!(weightLbs >= 80 && weightLbs <= 500) || !(age >= 16 && age <= 90) || !(hft >= 4 && hft <= 7) || !(hin >= 0 && hin < 12) || !sex) return null
  const m = calcMacros({ weightLbs, age, sex, hft, hin, bf: null, activity, goal })
  return { calories: m.target, protein_g: m.protein, carbs_g: m.carbs, fat_g: m.fat, age, sex, height_in: hft * 12 + hin, goal }
}

// Program start: today Mon-Wed, otherwise the coming Monday, so nobody joins
// on a Saturday and loses most of week 1. Dates are the coach's local day.
export function groupStartDate(now = new Date(), tz = 'America/New_York') {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dow = (dt.getUTCDay() + 6) % 7 // 0 = Monday
  if (dow > 2) dt.setUTCDate(dt.getUTCDate() + (7 - dow))
  return dt.toISOString().slice(0, 10)
}

const ACCESS = new Set(['active', 'past_due'])

// Set a member's state from a Stripe event. Ignores events older than the
// last one applied (Stripe doesn't promise order). First time they become
// paid, their track is applied: program (auto weeks), templates, chat.
export async function applyGroupState(sb, profileId, s) {
  const { data: p } = await sb.from('profiles').select('id, plan, group_status, group_status_at, group_track_id, group_joined_at').eq('id', profileId).maybeSingle()
  if (!p) return { skipped: 'no profile' }
  const at = s.eventTime ? new Date(s.eventTime * 1000).toISOString() : new Date().toISOString()
  if (p.group_status_at && new Date(p.group_status_at) > new Date(at)) return { skipped: 'stale event' }

  const patch = { plan: 'group', group_status: s.status, group_status_at: at }
  if (s.customer) patch.stripe_customer_id = s.customer
  if (s.subscription) patch.stripe_subscription_id = s.subscription
  if (s.periodEnd) patch.group_period_end = new Date(s.periodEnd * 1000).toISOString()
  if (s.cancelAtPeriodEnd !== undefined) patch.group_cancel_at_period_end = !!s.cancelAtPeriodEnd
  const nowPaid = ACCESS.has(s.status)
  if (nowPaid && !p.group_joined_at) patch.group_joined_at = new Date().toISOString()
  if (nowPaid) patch.status = 'active'
  const { error } = await sb.from('profiles').update(patch).eq('id', profileId)
  if (error) throw error

  const track = p.group_track_id ? (await sb.from('tracks').select('*').eq('id', p.group_track_id).maybeSingle()).data : null
  let setUp = false
  if (nowPaid && track) {
    const { data: asg } = await sb.from('program_assignments').select('id').eq('client_id', profileId).maybeSingle()
    if (!asg) {
      const ids = ['meal_template_id', 'habits_template_id', 'supps_template_id', 'cardio_template_id'].map(k => track[k]).filter(Boolean)
      const { data: tpls } = ids.length ? await sb.from('plan_templates').select('*').in('id', ids) : { data: [] }
      await applyTrack(sb, profileId, track, Object.fromEntries((tpls || []).map(t => [t.id, t])), groupStartDate())
      // nobody is moving a group member's week by hand: count it from the start date
      await sb.from('program_assignments').update({ week_mode: 'auto' }).eq('client_id', profileId)
      setUp = true
    }
  }
  if (track?.chat_group_id) {
    if (nowPaid) await sb.from('message_group_members').upsert({ group_id: track.chat_group_id, profile_id: profileId }, { onConflict: 'group_id,profile_id', ignoreDuplicates: true })
    else if (s.status === 'canceled') await sb.from('message_group_members').delete().eq('group_id', track.chat_group_id).eq('profile_id', profileId)
  }
  return { status: s.status, setUp }
}

// Which profile a Stripe object belongs to.
export async function profileForStripe(sb, { profileId, subscription, customer }) {
  if (profileId) {
    const { data } = await sb.from('profiles').select('id').eq('id', profileId).maybeSingle()
    if (data) return data.id
  }
  if (subscription) {
    const { data } = await sb.from('profiles').select('id').eq('stripe_subscription_id', subscription).maybeSingle()
    if (data) return data.id
  }
  if (customer) {
    const { data } = await sb.from('profiles').select('id').eq('stripe_customer_id', customer).limit(1).maybeSingle()
    if (data) return data.id
  }
  return null
}
