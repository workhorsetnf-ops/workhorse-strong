import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// Live announcements the client hasn't tapped "Got it" on, pinned to the top
// of Home. Newest first. Renders nothing before migration 139 is run.

// Keep only live announcements this person hasn't seen, newest first.
export function unseenLive(list, seenIds, now = Date.now()) {
  const seen = new Set(seenIds)
  return (list || [])
    .filter(a => !seen.has(a.id) && !a.ended_at && (!a.expires_at || new Date(a.expires_at).getTime() > now))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
}

// Only http(s) links get an Open button.
export function safeLink(url) {
  const u = String(url || '').trim()
  return /^https?:\/\//i.test(u) ? u : ''
}

export default function AnnouncementBanner({ profile }) {
  const [items, setItems] = useState([])

  async function load() {
    const [{ data: list, error }, { data: reads }] = await Promise.all([
      supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('announcement_reads').select('announcement_id').eq('profile_id', profile.id),
    ])
    if (error) return
    setItems(unseenLive(list, (reads || []).map(r => r.announcement_id)))
  }

  useEffect(() => {
    if (!profile) return
    load()
    // a new announcement shows up without a refresh
    const channel = supabase.channel('client-announcements')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => load())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [profile?.id])

  async function gotIt(a) {
    setItems(list => list.filter(x => x.id !== a.id))
    const { error } = await supabase.from('announcement_reads').insert({ announcement_id: a.id, profile_id: profile.id })
    if (error && !/duplicate/i.test(error.message)) load()
  }

  if (!items.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map(a => {
        const link = safeLink(a.link_url)
        return (
          <div key={a.id} className="card glow-behind" role="status"
            style={{ border: '1px solid var(--orange)', boxShadow: '0 0 0 1px var(--orange) inset', background: 'linear-gradient(135deg, rgba(255,106,0,0.16), rgba(255,106,0,0.04))' }}>
            <div className="eyebrow" style={{ fontSize: 10.5, marginBottom: 4 }}>📢 Announcement</div>
            <strong style={{ fontSize: 16, display: 'block', lineHeight: 1.3 }}>{a.title}</strong>
            {a.body && <p style={{ fontSize: 14, marginTop: 6, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{a.body}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {link && <a className="btn-ghost" href={link} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}>Open</a>}
              <button className="btn" style={{ flex: 1 }} onClick={() => gotIt(a)}>Got it</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
