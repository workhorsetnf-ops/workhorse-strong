// The coach's team: assistant (VA) logins (Update 179). Head coach only:
// an assistant can never add, switch on, or change the password of a team login.
//   POST { action: 'list' }
//   POST { action: 'add', full_name, email, password }
//   POST { action: 'deactivate' | 'reactivate', id }
//   POST { action: 'password', id, password }
import { admin, userFromReq } from './_push.js'
import { checkNewAccount, createClientAccount } from './_accounts.js'

const FOREVER = '876000h'   // ~100 years: Supabase's way to block sign-in

export async function runTeam(sb, me, body = {}) {
  if (!me || me.role !== 'coach' || me.actor) return { status: 403, json: { error: 'Only the coach can manage the team.' } }
  const { action, id } = body

  if (action === 'list') {
    const { data, error } = await sb.from('profiles').select('id, full_name, email, status, created_at, last_seen_at')
      .eq('role', 'assistant').order('created_at')
    if (error) return { status: 500, json: { error: error.message } }
    return { status: 200, json: { team: data || [] } }
  }

  if (action === 'add') {
    const v = checkNewAccount(body)
    if (v.error) return { status: 400, json: { error: v.error.replace('your full name', 'their full name') } }
    const r = await createClientAccount(sb, { ...v, password: body.password }, 'assistant')
    if (r.error) return { status: r.status || 400, json: { error: r.error.replace(' Sign in instead, or use “Forgot password?”.', '') } }
    await sb.from('profiles').update({ status: 'active', status_changed_at: new Date().toISOString() }).eq('id', r.user.id)
    return { status: 200, json: { ok: true, id: r.user.id } }
  }

  // everything else acts on one existing assistant, never the coach or a client
  if (!['deactivate', 'reactivate', 'password'].includes(action)) return { status: 400, json: { error: 'Unknown action.' } }
  const { data: target } = await sb.from('profiles').select('id, role').eq('id', String(id || '')).maybeSingle()
  if (!target || target.role !== 'assistant') return { status: 404, json: { error: 'Team member not found.' } }

  if (action === 'password') {
    if (String(body.password || '').length < 8) return { status: 400, json: { error: 'Password needs at least 8 characters.' } }
    const { error } = await sb.auth.admin.updateUserById(target.id, { password: String(body.password) })
    if (error) return { status: 400, json: { error: error.message } }
    return { status: 200, json: { ok: true } }
  }

  const on = action === 'reactivate'
  // profile status cuts database access on their next request; the ban stops new sign-ins
  const { error: pErr } = await sb.from('profiles')
    .update({ status: on ? 'active' : 'exited', status_changed_at: new Date().toISOString() }).eq('id', target.id)
  if (pErr) return { status: 500, json: { error: pErr.message } }
  const { error } = await sb.auth.admin.updateUserById(target.id, { ban_duration: on ? 'none' : FOREVER })
  if (error) return { status: 500, json: { error: 'Access was ' + (on ? 'restored' : 'turned off') + ' in the app, but the login could not be updated: ' + error.message } }
  return { status: 200, json: { ok: true } }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const sb = admin()
    const me = await userFromReq(sb, req)
    const r = await runTeam(sb, me, req.body || {})
    res.status(r.status).json(r.json)
  } catch (e) { res.status(500).json({ error: e.message }) }
}
