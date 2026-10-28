// Call & task reminders (Vercel Cron, every 5 minutes; see vercel.json).
//   - Booked calls: the coach and the client each get "📞 Coaching call at 1:00 PM"
//     their chosen number of minutes before (default 15). Tapping opens the call.
//   - Coach tasks with a time and a reminder set: "⏰ Post reel · 9:00 AM".
//   - From 7am, the coach gets one "Today: 2 calls · 3 tasks" rundown.
// Each reminder is claimed in agenda_sends before it's sent, so it fires once.
//
// Env: CRON_SECRET (sent automatically by Vercel Cron). Times use the timezone
// on the Calls page settings, falling back to COACH_TIMEZONE / America/New_York.
import { admin, sendToUsers } from './_push.js'
import { buildAgenda, dueReminders, morningDigest, localDateIn } from '../src/lib/agenda.js'

export default async function handler(req, res) {
  if (process.env.CRON_SECRET && (req.headers.authorization || '') !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    const out = await runAgenda(admin(), new Date())
    res.json(out)
  } catch (e) { res.status(500).json({ error: e.message }) }
}

export async function runAgenda(sb, now) {
  const { data: cfg } = await sb.from('coach_call_settings').select('timezone').eq('id', 1).maybeSingle()
  const tz = cfg?.timezone || process.env.COACH_TIMEZONE || 'America/New_York'
  const today = localDateIn(tz, now)

  const { data: subs } = await sb.from('push_subscriptions').select('user_id')
  const withDevice = new Set((subs || []).map(s => s.user_id))
  if (!withDevice.size) return { today, tz, sent: 0, skipped: 'no devices' }

  // Calls from a little while ago through the next couple of hours, plus the
  // rest of today for the morning rundown.
  const from = new Date(now.getTime() - 15 * 60000).toISOString()
  const until = new Date(now.getTime() + 26 * 3600000).toISOString()
  const [{ data: coaches }, { data: bookings }, { data: tasks }, { data: comp }, { data: sentRows }] = await Promise.all([
    sb.from('profiles').select('id').eq('role', 'coach'),
    sb.from('bookings').select('id, client_id, starts_at, ends_at, status, video_url, profiles(full_name), call_types(name)')
      .in('status', ['booked', 'completed']).gte('starts_at', from).lte('starts_at', until).order('starts_at'),
    sb.from('coach_tasks').select('*'),
    sb.from('coach_task_completions').select('task_id').eq('completed_date', today),
    sb.from('agenda_sends').select('kind, item_id, user_id, for_date').gte('sent_at', new Date(now.getTime() - 2 * 86400000).toISOString()),
  ])
  const coachIds = (coaches || []).map(c => c.id).filter(id => withDevice.has(id))
  const doneIds = new Set((comp || []).map(c => c.task_id))
  const sent = new Set((sentRows || []).map(r => `${r.kind}:${r.item_id}:${r.user_id}:${r.for_date}`))

  const people = [...new Set([...coachIds, ...(bookings || []).map(b => b.client_id)])].filter(id => withDevice.has(id))
  const { data: prefRows } = people.length ? await sb.from('reminder_prefs').select('user_id, calls, call_lead_minutes').in('user_id', people) : { data: [] }
  const prefs = Object.fromEntries((prefRows || []).map(p => [p.user_id, p]))

  const msgs = dueReminders({ now, tz, today, bookings: bookings || [], tasks: tasks || [], doneIds, coachIds, prefs, sent })
    .filter(m => withDevice.has(m.user_id))

  const todays = (bookings || []).filter(b => localDateIn(tz, new Date(b.starts_at)) === today)
  const agenda = buildAgenda({ bookings: todays, tasks: tasks || [], doneIds, today, tz })
  for (const id of coachIds) {
    const d = morningDigest({ now, tz, today, coachId: id, prefs, agenda, sent })
    if (d) msgs.unshift(d)
  }

  let sentCount = 0, claimed = 0
  for (const m of msgs) {
    // Claim first: if another run already sent this one, nothing comes back.
    const { data: got, error } = await sb.from('agenda_sends')
      .upsert(m.key, { onConflict: 'kind,item_id,user_id,for_date', ignoreDuplicates: true }).select()
    if (error || !got?.length) continue
    claimed++
    sentCount += (await sendToUsers(sb, [m.user_id], m)).sent
  }
  return { today, tz, due: msgs.length, claimed, sent: sentCount }
}
