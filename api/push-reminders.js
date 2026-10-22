// Daily reminder job (Vercel Cron, see vercel.json):
//   /api/push-reminders?slot=morning  -> "Today: Upper A 💪" / "Check-in day ✅"
//   /api/push-reminders?slot=evening  -> one roll-up of what's still open, plus
//                                        the coach's "Client radar"
// Each person gets at most one notification per slot. Only people who turned
// notifications on (have a device in push_subscriptions) are looked at.
//
// Env: CRON_SECRET (Vercel sends it automatically on cron calls),
//      COACH_TIMEZONE (optional, default America/New_York) decides what "today" is.
import { admin, sendToUsers, prefsFor, localDateIn } from './_push.js'
import { resolveAssignment, dayShowsInWeek } from '../src/lib/weeks.js'
import { splitForWeek, addDays } from '../src/lib/dashboard.js'
import { checkinState, morningFor, eveningFor, coachDigest } from '../src/lib/reminders.js'
import { quickDone, quickDue } from '../src/lib/adherence.js'

export default async function handler(req, res) {
  if (process.env.CRON_SECRET && (req.headers.authorization || '') !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const slot = req.query?.slot === 'evening' ? 'evening' : 'morning'
  try {
    const sb = admin()
    const tz = process.env.COACH_TIMEZONE || 'America/New_York'
    const today = localDateIn(tz)
    const out = await runSlot(sb, slot, today, tz)
    res.json({ slot, today, ...out })
  } catch (e) { res.status(500).json({ error: e.message }) }
}

export async function runSlot(sb, slot, today, tz) {
  const { data: subs } = await sb.from('push_subscriptions').select('user_id')
  const userIds = [...new Set((subs || []).map(s => s.user_id))]
  if (!userIds.length) return { people: 0, sent: 0 }

  const { data: people } = await sb.from('profiles').select('id, role, full_name, status, checkin_day, checkin_frequency, adherence_tier').in('id', userIds)
  const clients = (people || []).filter(p => p.role === 'client' && p.status !== 'paused' && p.status !== 'exited')
  const coaches = (people || []).filter(p => p.role === 'coach')
  const prefs = await prefsFor(sb, userIds)
  const msgs = []

  if (clients.length) {
    const facts = await gatherFacts(sb, clients, today, tz, prefs)
    for (const f of facts) { const m = slot === 'morning' ? morningFor(f) : eveningFor(f); if (m) msgs.push(m) }
  }

  if (slot === 'evening' && coaches.length) {
    const { data: all } = await sb.from('profiles').select('id, full_name, status, last_seen_at, created_at').eq('role', 'client')
    const { count } = await sb.from('checkins').select('id', { count: 'exact', head: true }).neq('status', 'done').gte('submitted_at', addDays(today, -14))
    for (const c of coaches) { const m = coachDigest(c.id, prefs[c.id], all || [], today, count || 0); if (m) msgs.push(m) }
  }

  let sent = 0
  for (const m of msgs) sent += (await sendToUsers(sb, [m.user_id], m)).sent
  return { people: userIds.length, messages: msgs.length, sent }
}

async function gatherFacts(sb, clients, today, tz, prefs) {
  const ids = clients.map(c => c.id)
  const [asg, wl, ml, dl, habits, hl, ck] = await Promise.all([
    sb.from('program_assignments').select('*').in('client_id', ids),
    sb.from('workout_logs').select('client_id, logged_at').in('client_id', ids).gte('logged_at', addDays(today, -1)),
    sb.from('meal_logs').select('client_id').in('client_id', ids).eq('logged_on', today),
    // the last week, for tiered quick check-ins (today's row also says if they trained)
    sb.from('daily_logs').select('client_id, log_date, trained, weight, sleep_hours, readiness, quick_checkin_at').in('client_id', ids).gte('log_date', addDays(today, -7)).lte('log_date', today),
    sb.from('client_habits').select('id, client_id').in('client_id', ids).eq('active', true),
    sb.from('habit_logs').select('client_id, habit_id').in('client_id', ids).eq('log_date', today),
    // 45 days back so a monthly client's last check-in (~28 days ago) is seen; newest first
    sb.from('checkins').select('client_id, submitted_at').in('client_id', ids).gte('submitted_at', addDays(today, -45)).order('submitted_at', { ascending: false }),
  ])

  // today's sessions per client, from their program's current block/week
  const sessions = {}
  for (const a of asg.data || []) {
    const { data: blocks } = await sb.from('program_blocks').select('*').eq('program_id', a.program_id).order('position')
    const pos = resolveAssignment(a, blocks || [])
    if (!pos.block) continue
    const [{ data: days }, { data: rots }] = await Promise.all([
      sb.from('program_days').select('*').eq('block_id', pos.block.id),
      sb.from('program_rotations').select('*').eq('block_id', pos.block.id).order('position'),
    ])
    const [row] = splitForWeek([today], { startDate: a.start_date, blockDays: days || [], rotations: rots || [], weekInBlock: pos.weekInBlock, showsInWeek: dayShowsInWeek })
    sessions[a.client_id] = row.sessions.map(s => s.day_label || `Day ${s.day_number}`)
  }

  const trained = new Set((wl.data || []).filter(l => localDateIn(tz, new Date(l.logged_at)) === today).map(l => l.client_id))
  for (const d of dl.data || []) if (d.trained && d.log_date === today) trained.add(d.client_id)
  const quickDates = {}
  for (const d of dl.data || []) if (quickDone(d)) (quickDates[d.client_id] ||= new Set()).add(d.log_date)
  const ate = new Set((ml.data || []).map(l => l.client_id))
  const lastCk = {}
  for (const c of ck.data || []) if (!lastCk[c.client_id]) lastCk[c.client_id] = localDateIn(tz, new Date(c.submitted_at))

  return clients.map(c => {
    const mine = (habits.data || []).filter(h => h.client_id === c.id)
    const ticked = new Set((hl.data || []).filter(l => l.client_id === c.id).map(l => l.habit_id))
    return {
      id: c.id, name: c.full_name, prefs: prefs[c.id],
      sessionsToday: sessions[c.id] || [],
      trainedToday: trained.has(c.id),
      foodLoggedToday: ate.has(c.id),
      habitsLeft: mine.filter(h => !ticked.has(h.id)).length,
      checkin: checkinState(c.checkin_day, lastCk[c.id] || null, today, c.checkin_frequency),
      quickDue: quickDue(c.adherence_tier, quickDates[c.id] || new Set(), today),
    }
  })
}
