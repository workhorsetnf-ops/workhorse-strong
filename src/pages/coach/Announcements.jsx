import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { notifyEvent } from '../../lib/push'
import { localDateStr } from '../../lib/weeks'

// Coach panel on the Messages page: post an announcement (pinned on every
// client's Home until they tap "Got it"), and see who has and hasn't seen it.

export function statusOf(a, now = Date.now()) {
  if (a.ended_at) return 'ended'
  if (a.expires_at && new Date(a.expires_at).getTime() <= now) return 'expired'
  return 'live'
}

// "Ends end of day on" date -> the instant it should stop showing (local 23:59:59).
export function expiryFromDate(dateStr) {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59).toISOString()
}

// Seen / not seen among the clients it went to: active clients, plus anyone
// who saw it and has since been paused.
export function seenSplit(clients, reads) {
  const seen = new Set(reads.map(r => r.profile_id))
  const pool = clients.filter(c => c.status === 'active' || seen.has(c.id))
  return { seen: pool.filter(c => seen.has(c.id)), notSeen: pool.filter(c => !seen.has(c.id)) }
}

export default function Announcements({ coachId }) {
  const [list, setList] = useState([])
  const [reads, setReads] = useState([])
  const [clients, setClients] = useState([])
  const [form, setForm] = useState({ title: '', body: '', link_url: '', ends: '' })
  const [busy, setBusy] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [ready, setReady] = useState(true)

  async function load() {
    const [{ data: a, error }, { data: r }, { data: c }] = await Promise.all([
      supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('announcement_reads').select('*'),
      supabase.from('profiles').select('id, full_name, status').eq('role', 'client').order('full_name'),
    ])
    if (error) { setReady(false); return }
    setList(a || []); setReads(r || []); setClients(c || [])
  }
  useEffect(() => { load() }, [])

  const activeCount = clients.filter(c => c.status === 'active').length

  async function post() {
    const title = form.title.trim()
    if (!title) return
    if (!confirm(`Pin this to the Home screen of all ${activeCount} active client${activeCount === 1 ? '' : 's'} and send a notification?`)) return
    setBusy(true)
    const link = form.link_url.trim()
    const { data, error } = await supabase.from('announcements').insert({
      title, body: form.body.trim(), created_by: coachId,
      link_url: link ? (/^https?:\/\//i.test(link) ? link : `https://${link}`) : null,
      expires_at: expiryFromDate(form.ends),
    }).select().single()
    setBusy(false)
    if (error) { alert('Could not post: ' + error.message); return }
    notifyEvent('announcement', { id: data.id })
    setForm({ title: '', body: '', link_url: '', ends: '' })
    setOpenId(data.id)
    load()
  }

  async function end(a) {
    if (!confirm(`Take down "${a.title}"? It disappears from everyone's Home screen.`)) return
    const { error } = await supabase.from('announcements').update({ ended_at: new Date().toISOString() }).eq('id', a.id)
    if (error) alert('Could not end it: ' + error.message); else load()
  }
  async function remove(a) {
    if (!confirm(`Delete "${a.title}" and its seen history?`)) return
    const { error } = await supabase.from('announcements').delete().eq('id', a.id)
    if (error) alert('Could not delete: ' + error.message); else load()
  }

  if (!ready) return <p className="muted">Announcements need migration_update139_announcements.sql run in Supabase first.</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 style={{ fontSize: 18 }}>📢 Announcements</h2>
      <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
        Pinned to the top of every active client's Home screen until they tap "Got it", with a push notification when you post.
      </p>
      <input placeholder="Headline (e.g. Seminar this Saturday — 10am)" value={form.title} maxLength={120} onChange={e => setForm({ ...form, title: e.target.value })} />
      <textarea rows={4} placeholder="Details (optional)" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input style={{ flex: '2 1 220px' }} placeholder="Link for an Open button (optional)" value={form.link_url} onChange={e => setForm({ ...form, link_url: e.target.value })} />
        <label style={{ flex: '1 1 160px', display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11.5 }} className="muted">
          Take down after (optional)
          <input type="date" min={localDateStr()} value={form.ends} onChange={e => setForm({ ...form, ends: e.target.value })} />
        </label>
      </div>
      <button className="btn" style={{ alignSelf: 'flex-start' }} disabled={busy || !form.title.trim()} onClick={post}>
        {busy ? 'Posting…' : `Post to ${activeCount} client${activeCount === 1 ? '' : 's'}`}
      </button>

      {list.length > 0 && <div className="eyebrow" style={{ fontSize: 10, marginTop: 8 }}>Posted</div>}
      {list.map(a => {
        const st = statusOf(a)
        const { seen, notSeen } = seenSplit(clients, reads.filter(r => r.announcement_id === a.id))
        const total = seen.length + notSeen.length
        const isOpen = openId === a.id
        return (
          <div key={a.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10, opacity: st === 'live' ? 1 : 0.65 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', borderRadius: 6, padding: '1px 6px',
                color: st === 'live' ? '#000' : 'var(--muted)', background: st === 'live' ? 'var(--green)' : 'transparent', border: st === 'live' ? 'none' : '1px solid var(--line)' }}>
                {st.toUpperCase()}
              </span>
              <strong style={{ flex: 1, minWidth: 0, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</strong>
              <span className="muted" style={{ fontSize: 11.5, flexShrink: 0 }}>{new Date(a.created_at).toLocaleDateString()}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
              <button onClick={() => setOpenId(isOpen ? null : a.id)} style={{ background: 'none', padding: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--orange-hot)' }}>
                Seen by {seen.length} of {total} {isOpen ? '▴' : '▾'}
              </button>
              {a.expires_at && st === 'live' && <span className="muted" style={{ fontSize: 11.5 }}>until {new Date(a.expires_at).toLocaleDateString()}</span>}
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
                {st === 'live' && <button onClick={() => end(a)} style={{ background: 'none', padding: 0, fontSize: 12, color: 'var(--muted)' }}>Take down</button>}
                <button onClick={() => remove(a)} style={{ background: 'none', padding: 0, fontSize: 12, color: 'var(--red)' }}>Delete</button>
              </span>
            </div>
            {isOpen && (
              <div style={{ marginTop: 8, fontSize: 12.5, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div className="muted" style={{ fontSize: 11, fontWeight: 800, marginBottom: 3 }}>NOT SEEN ({notSeen.length})</div>
                  {notSeen.map(c => <div key={c.id}>{c.full_name || 'Unnamed client'}</div>)}
                  {notSeen.length === 0 && <div className="muted">Everyone's seen it ✓</div>}
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 11, fontWeight: 800, marginBottom: 3 }}>SEEN ({seen.length})</div>
                  {seen.map(c => <div key={c.id} className="muted">{c.full_name || 'Unnamed client'}</div>)}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
