// Coach-only: create a client account with a temporary password.
import { admin, userFromReq } from './_push.js'
import { checkNewAccount, createClientAccount } from './_accounts.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const sb = admin()
    const me = await userFromReq(sb, req)
    if (!me || me.role !== 'coach') return res.status(403).json({ error: 'Coach only.' })
    const v = checkNewAccount(req.body)
    if (v.error) return res.status(400).json({ error: v.error.replace('your full name', 'their full name') })
    const r = await createClientAccount(sb, { ...v, password: req.body.password })
    if (r.error) return res.status(r.status || 400).json({ error: r.error.replace(' Sign in instead, or use “Forgot password?”.', '') })
    res.json({ ok: true, id: r.user.id })
  } catch (e) { res.status(500).json({ error: e.message }) }
}
