// Hands-free onboarding (Update 184).
//   POST { action: 'check', token }                      -> { ok, email, name }   (public: the setup page)
//   POST { action: 'claim', token, password, full_name }  -> { ok, email }         (public: sets their password)
//   POST { action: 'signed' }                             -> client: contract signed, send the welcome email
//   POST { action: 'link', client_id }                    -> coach: a fresh setup link to copy or text
//   POST { action: 'kit' }                                -> coach: { ready, sequences } for the settings card
import { admin, userFromReq } from './_push.js'
import { liveToken, issueSetupLink, sendWelcome, resolveContract } from './_onboard.js'
import { kitReady, kitSequences } from './_kit.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const sb = admin()
    return await runOnboard(sb, req.body || {}, res, { me: () => userFromReq(sb, req) })
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
}

const EXPIRED = 'This setup link has expired or was already used. Sign in with your email, or tap “Forgot password?”.'

export async function runOnboard(sb, body, res, deps = {}) {
  const { action } = body
  if (action === 'check' || action === 'claim') {
    const t = await liveToken(sb, body.token)
    if (!t) return res.status(404).json({ error: EXPIRED })
    const { data: p } = await sb.from('profiles').select('id, email, full_name').eq('id', t.client_id).maybeSingle()
    if (!p) return res.status(404).json({ error: EXPIRED })
    if (action === 'check') return res.json({ ok: true, email: p.email, name: p.full_name })

    const password = String(body.password || '')
    if (password.length < 8) return res.status(400).json({ error: 'Password needs at least 8 characters.' })
    const name = String(body.full_name || '').trim()
    // use the token up first, so the same link can't set a password twice
    const { data: used } = await sb.from('onboarding_tokens').update({ used_at: new Date().toISOString() }).eq('token_hash', t.token_hash).is('used_at', null).select('token_hash')
    if (!used?.length) return res.status(404).json({ error: EXPIRED })
    const { error } = await (deps.updateUser || ((id, attrs) => sb.auth.admin.updateUserById(id, attrs)))(p.id, { password })
    if (error) {
      await sb.from('onboarding_tokens').update({ used_at: null }).eq('token_hash', t.token_hash)
      return res.status(400).json({ error: error.message })
    }
    if (name.length >= 2 && name !== p.full_name) {
      await sb.from('profiles').update({ full_name: name }).eq('id', p.id)
      // the unsigned contract was written with the name from the payment
      const { data: open } = await sb.from('contracts').select('id, template_id').eq('client_id', p.id).eq('status', 'sent')
      for (const c of open || []) {
        if (!c.template_id) continue
        const { data: tpl } = await sb.from('contract_templates').select('body').eq('id', c.template_id).maybeSingle()
        if (tpl) await sb.from('contracts').update({ body: resolveContract(tpl.body, name) }).eq('id', c.id)
      }
    }
    return res.json({ ok: true, email: p.email })
  }

  const me = await deps.me?.()
  if (!me) return res.status(401).json({ error: 'Please sign in again.' })

  if (action === 'signed') return res.json(await sendWelcome(sb, me.id, deps))

  if (me.role !== 'coach') return res.status(403).json({ error: 'Coach only.' })
  if (action === 'link') {
    const { data: p } = await sb.from('profiles').select('id, onboarding_started_at').eq('id', body.client_id).maybeSingle()
    if (!p) return res.status(404).json({ error: 'Client not found.' })
    return res.json({ link: await issueSetupLink(sb, p.id) })
  }
  if (action === 'kit') {
    if (!(deps.kitReady || kitReady)()) return res.json({ ready: false, sequences: [] })
    try { return res.json({ ready: true, sequences: await (deps.kitSequences || kitSequences)(deps) }) }
    catch (e) { return res.json({ ready: false, sequences: [], error: e.message }) }
  }
  return res.status(400).json({ error: 'Unknown action' })
}
