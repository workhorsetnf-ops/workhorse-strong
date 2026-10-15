// "Send me a test notification" from the Reminders page.
import { admin, sendToUsers, userFromReq } from './_push.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const sb = admin()
    const me = await userFromReq(sb, req)
    if (!me) return res.status(401).json({ error: 'Sign in again and retry.' })
    const r = await sendToUsers(sb, [me.id], { title: 'Notifications are on 🔔', body: "This is what your reminders will look like. Clock in. Do the work.", url: me.role === 'coach' ? '/coach' : '/app', tag: 'test' })
    if (!r.sent) return res.status(400).json({ error: 'No device is set up for notifications yet. Turn them on first.', ...r })
    res.json(r)
  } catch (e) { res.status(500).json({ error: e.message }) }
}
