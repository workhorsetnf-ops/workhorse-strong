// Instant notifications the app triggers after something happens:
//   { type: 'message', to: <user id> }  new message (coach <-> client only)
//   { type: 'checkin' }                  client submitted a check-in -> coach
// The server re-checks who is allowed to notify whom; the app can't spoof it.
import { admin, sendToUsers, userFromReq, prefsFor } from './_push.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const sb = admin()
    const me = await userFromReq(sb, req)
    if (!me) return res.status(401).json({ error: 'Not signed in' })
    const { type, to } = req.body || {}
    const first = String(me.full_name || '').split(/\s+/)[0] || (me.role === 'coach' ? 'Your coach' : 'A client')

    if (type === 'message') {
      const { data: rec } = await sb.from('profiles').select('id, role').eq('id', to).single()
      if (!rec || rec.role === me.role) return res.status(403).json({ error: 'Not allowed' })   // coach<->client only
      // the newest message from me to them, so the preview is real
      const { data: m } = await sb.from('messages').select('body, created_at').eq('sender_id', me.id).eq('recipient_id', to).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!m || Date.now() - new Date(m.created_at).getTime() > 5 * 60 * 1000) return res.json({ skipped: 'no recent message' })
      const prefs = (await prefsFor(sb, [to]))[to]
      if (prefs && prefs.messages === false) return res.json({ skipped: 'muted' })
      const preview = String(m.body || '').slice(0, 120)
      return res.json(await sendToUsers(sb, [to], {
        title: me.role === 'coach' ? `Message from ${first}` : `${first} sent you a message`,
        body: preview, url: rec.role === 'coach' ? '/coach/messages' : '/app/messages', tag: `msg-${me.id}`,
      }))
    }

    if (type === 'checkin') {
      if (me.role !== 'client') return res.status(403).json({ error: 'Not allowed' })
      const { data: coaches } = await sb.from('profiles').select('id').eq('role', 'coach')
      const ids = (coaches || []).map(c => c.id)
      const prefs = await prefsFor(sb, ids)
      const want = ids.filter(id => !prefs[id] || prefs[id].checkin !== false)
      return res.json(await sendToUsers(sb, want, { title: `${first} checked in`, body: 'Their weekly check-in is ready to review.', url: `/coach/review/${me.id}`, tag: `checkin-${me.id}` }))
    }

    res.status(400).json({ error: 'Unknown type' })
  } catch (e) { res.status(500).json({ error: e.message }) }
}
