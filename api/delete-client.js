// Coach-only: permanently delete a client account and everything attached to it
// (profile, logs, check-ins, messages... all cascade from the account).
//   POST { id, confirm }   confirm must match the client's name (or email if unnamed)
import { admin, userFromReq } from './_push.js'

const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const sb = admin()
    const me = await userFromReq(sb, req)
    if (!me || me.role !== 'coach') return res.status(403).json({ error: 'Coach only.' })
    const { id, confirm } = req.body || {}
    if (!id || id === me.id) return res.status(400).json({ error: 'You can’t delete this account.' })
    const { data: target } = await sb.from('profiles').select('id, role, full_name, email').eq('id', id).maybeSingle()
    if (!target) return res.status(404).json({ error: 'Client not found. They may already be deleted.' })
    if (target.role !== 'client') return res.status(403).json({ error: 'Only client accounts can be deleted here.' })
    const expected = norm(target.full_name) || norm(target.email)
    if (!expected || norm(confirm) !== expected) return res.status(400).json({ error: 'The name you typed doesn’t match, so nothing was deleted.' })

    // tidy their photo files (the rows go with the account)
    try {
      const { data: files } = await sb.storage.from('avatars').list(id)
      if (files?.length) await sb.storage.from('avatars').remove(files.map(f => `${id}/${f.name}`))
    } catch { /* storage cleanup is best-effort */ }

    const { error } = await sb.auth.admin.deleteUser(id)
    if (error) return res.status(500).json({ error: 'Could not delete: ' + error.message })
    await sb.from('profiles').delete().eq('id', id)   // no-op when the cascade already removed it
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
}
