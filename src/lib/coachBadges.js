// What's waiting for the coach in each section, for the highlighted menu tabs.
// Every count is independent: one failing (e.g. before a migration is run)
// just leaves that tab unlit.
import { supabase } from './supabase'

const DAY = 864e5
const safe = async (fn) => { try { return await fn() } catch { return 0 } }

// Latest check-in per client that you haven't replied to or marked done.
export function checkinsNeedingReview(rows, activeIds) {
  const latest = {}
  for (const r of rows) if (!latest[r.client_id] || r.submitted_at > latest[r.client_id].submitted_at) latest[r.client_id] = r
  return Object.values(latest).filter(r => (!activeIds || activeIds.has(r.client_id)) && !r.coach_feedback && (r.status || 'pending') !== 'done').length
}

export async function loadCoachBadges(me) {
  if (!me) return {}
  const since = d => new Date(Date.now() - d * DAY).toISOString()
  const [messages, checkins, community, formChecks] = await Promise.all([
    safe(async () => {
      const { count } = await supabase.from('messages').select('id', { count: 'exact', head: true }).eq('recipient_id', me).is('read_at', null)
      const { data: groups, error } = await supabase.rpc('my_groups')
      const g = error ? 0 : (groups || []).reduce((n, x) => n + (x.unread || 0), 0)
      return (count || 0) + g
    }),
    safe(async () => {
      const [{ data: rows }, { data: active }] = await Promise.all([
        supabase.from('checkins').select('client_id, submitted_at, coach_feedback, status').gte('submitted_at', since(45)),
        supabase.from('profiles').select('id').eq('role', 'client').neq('status', 'exited'),
      ])
      return checkinsNeedingReview(rows || [], new Set((active || []).map(a => a.id)))
    }),
    safe(async () => {
      const { data: seen } = await supabase.from('section_seen').select('seen_at').eq('user_id', me).eq('section', 'community').maybeSingle()
      const after = seen?.seen_at || since(7)
      const [p, c] = await Promise.all([
        supabase.from('community_posts').select('id', { count: 'exact', head: true }).neq('author_id', me).gt('created_at', after),
        supabase.from('community_comments').select('id', { count: 'exact', head: true }).neq('author_id', me).gt('created_at', after),
      ])
      return (p.count || 0) + (c.count || 0)
    }),
    safe(async () => {
      const [{ count: fresh }, { count: replies }] = await Promise.all([
        supabase.from('form_checks').select('id', { count: 'exact', head: true }).eq('reviewed', false),
        supabase.from('form_check_comments').select('id', { count: 'exact', head: true }).neq('sender_id', me).is('read_at', null),
      ])
      return (fresh || 0) + (replies || 0)
    }),
  ])
  return { messages, checkins, community, formChecks }
}

export async function markSectionSeen(me, section) {
  if (!me) return
  try { await supabase.from('section_seen').upsert({ user_id: me, section, seen_at: new Date().toISOString() }, { onConflict: 'user_id,section' }) } catch { /* table not there yet */ }
}

export function coachBadgesChanged() {
  try { window.dispatchEvent(new Event('ws-coach-badges')) } catch { /* ignore */ }
}
