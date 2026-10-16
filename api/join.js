// Public sign-up through the coach's join link.
//   POST { code, check: true }                      -> { ok } if the link is live
//   POST { code, full_name, email, password }        -> creates the client account
import { admin } from './_push.js'
import { checkNewAccount, createClientAccount } from './_accounts.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const sb = admin()
    const { code, check } = req.body || {}
    const { data: link } = await sb.from('join_link').select('code, enabled').eq('id', 1).maybeSingle()
    const live = link && link.enabled && code && String(code).trim().toUpperCase() === String(link.code).toUpperCase()
    if (!live) return res.status(404).json({ error: 'This sign-up link has expired. Ask your coach for a new one.' })
    if (check) return res.json({ ok: true })
    const v = checkNewAccount(req.body)
    if (v.error) return res.status(400).json({ error: v.error })
    const r = await createClientAccount(sb, { ...v, password: req.body.password })
    if (r.error) return res.status(r.status || 400).json({ error: r.error })
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
}
