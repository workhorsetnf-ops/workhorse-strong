// Instant notifications the app triggers after something happens:
//   { type: 'message', to: <user id> }  new message (coach <-> client only)
//   { type: 'checkin' }                  client submitted a check-in -> coach
//   { type: 'paperwork', to: [ids], kind: 'contract'|'form', title }  coach sent a contract/form -> those clients
//   { type: 'group', group: <group id> }  new group-chat message -> the other members
//   { type: 'broadcast', to: [ids] }      coach sent the same 1-on-1 message to many clients
//   { type: 'announcement', id }          coach posted an announcement -> every active client
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

    if (type === 'paperwork') {
      if (me.role !== 'coach') return res.status(403).json({ error: 'Not allowed' })
      const ids = Array.isArray(to) ? to.filter(x => typeof x === 'string').slice(0, 500) : []
      if (!ids.length) return res.json({ skipped: 'nobody' })
      const { data: recs } = await sb.from('profiles').select('id').in('id', ids).eq('role', 'client')
      const clientIds = (recs || []).map(r => r.id)
      const prefs = await prefsFor(sb, clientIds)
      const want = clientIds.filter(id => !prefs[id] || prefs[id].messages !== false)
      const isContract = req.body?.kind === 'contract'
      const what = String(req.body?.title || '').slice(0, 80)
      return res.json(await sendToUsers(sb, want, {
        title: isContract ? 'Something to sign ✍️' : 'A quick form for you 📋',
        body: `${first} sent you ${isContract ? 'an agreement' : 'a form'}${what ? `: ${what}` : ''}. Tap to open it.`,
        url: isContract ? '/app/contracts' : '/app/intake-forms', tag: `paperwork-${isContract ? 'contract' : 'form'}`,
      }))
    }

    if (type === 'group') {
      const gid = String(req.body?.group || '')
      const { data: g } = await sb.from('message_groups').select('id, name, archived').eq('id', gid).maybeSingle()
      if (!g) return res.status(404).json({ error: 'No such group' })
      const { data: mem } = await sb.from('message_group_members').select('profile_id, profiles(role)').eq('group_id', gid)
      const members = mem || []
      if (me.role !== 'coach' && !members.some(m => m.profile_id === me.id)) return res.status(403).json({ error: 'Not allowed' })
      const { data: m } = await sb.from('group_messages').select('body, created_at').eq('group_id', gid).eq('sender_id', me.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!m || Date.now() - new Date(m.created_at).getTime() > 5 * 60 * 1000) return res.json({ skipped: 'no recent message' })
      const others = members.filter(x => x.profile_id !== me.id)
      const prefs = await prefsFor(sb, others.map(x => x.profile_id))
      const want = others.filter(x => !prefs[x.profile_id] || prefs[x.profile_id].messages !== false)
      const msg = { title: `${first} in ${g.name}`, body: String(m.body || '').slice(0, 120), tag: `grp-${gid}` }
      const coaches = want.filter(x => x.profiles?.role === 'coach').map(x => x.profile_id)
      const clients = want.filter(x => x.profiles?.role !== 'coach').map(x => x.profile_id)
      const [a, b] = await Promise.all([
        sendToUsers(sb, coaches, { ...msg, url: '/coach/messages' }),
        sendToUsers(sb, clients, { ...msg, url: '/app/messages' }),
      ])
      return res.json({ sent: (a.sent || 0) + (b.sent || 0) })
    }

    if (type === 'broadcast') {
      if (me.role !== 'coach') return res.status(403).json({ error: 'Not allowed' })
      const ids = Array.isArray(to) ? to.filter(x => typeof x === 'string').slice(0, 500) : []
      if (!ids.length) return res.json({ skipped: 'nobody' })
      // only people who really just got a message from me
      const since = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      const { data: sent } = await sb.from('messages').select('recipient_id, body').eq('sender_id', me.id).in('recipient_id', ids).gte('created_at', since)
      const got = [...new Set((sent || []).map(r => r.recipient_id))]
      if (!got.length) return res.json({ skipped: 'no recent message' })
      const prefs = await prefsFor(sb, got)
      const want = got.filter(id => !prefs[id] || prefs[id].messages !== false)
      return res.json(await sendToUsers(sb, want, {
        title: `Message from ${first}`, body: String(sent[0].body || '').slice(0, 120), url: '/app/messages', tag: `msg-${me.id}`,
      }))
    }

    if (type === 'announcement') {
      if (me.role !== 'coach') return res.status(403).json({ error: 'Not allowed' })
      const { data: a } = await sb.from('announcements').select('title, body, created_at, ended_at').eq('id', String(req.body?.id || '')).maybeSingle()
      if (!a || a.ended_at || Date.now() - new Date(a.created_at).getTime() > 5 * 60 * 1000) return res.json({ skipped: 'no new announcement' })
      const { data: recs } = await sb.from('profiles').select('id').eq('role', 'client').eq('status', 'active')
      const ids = (recs || []).map(r => r.id)
      const prefs = await prefsFor(sb, ids)
      const want = ids.filter(id => !prefs[id] || prefs[id].messages !== false)
      return res.json(await sendToUsers(sb, want, {
        title: `📢 ${String(a.title).slice(0, 80)}`, body: String(a.body || 'Tap to read.').slice(0, 120), url: '/app', tag: 'announcement',
      }))
    }

    res.status(400).json({ error: 'Unknown type' })
  } catch (e) { res.status(500).json({ error: e.message }) }
}
