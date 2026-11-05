// Coach: the $50/month group offer (Update 166) — setup checklist, sign-up
// link, which tracks are on sale, and the member list with revenue.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { callApi } from '../../lib/push'

export const STATUS_STYLE = {
  active: ['Active', 'var(--green)'], past_due: ['Payment failed', '#e5a03a'],
  pending: ['Not paid', 'var(--muted)'], canceled: ['Ended', 'var(--red)'],
}
const fmtDate = d => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—')

// counts + monthly revenue from the member list
export function groupStats(members, priceAmount) {
  const by = s => members.filter(m => (m.group_status || 'pending') === s).length
  const paying = by('active') + by('past_due')
  const leaving = members.filter(m => m.group_status === 'active' && m.group_cancel_at_period_end).length
  return { paying, active: by('active'), pastDue: by('past_due'), pending: by('pending'), ended: by('canceled'), leaving, mrr: priceAmount ? paying * priceAmount : null }
}

export default function CoachGroup() {
  const [status, setStatus] = useState(null)
  const [tracks, setTracks] = useState([])
  const [chats, setChats] = useState([])
  const [members, setMembers] = useState([])
  const [filter, setFilter] = useState('paying')
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState('')

  async function load() {
    const [t, c, m] = await Promise.all([
      supabase.from('tracks').select('id, name, description, program_id, group_offer, group_position, chat_group_id').order('group_position').order('name'),
      supabase.from('message_groups').select('id, name').eq('archived', false).order('name'),
      supabase.from('profiles').select('id, full_name, email, group_status, group_track_id, group_joined_at, group_period_end, group_cancel_at_period_end, created_at').eq('plan', 'group').order('created_at', { ascending: false }),
    ])
    if (m.error) setErr(/plan|group_/.test(m.error.message) ? 'Run migration_update166_group_offer.sql in Supabase first.' : m.error.message)
    setTracks(t.data || []); setChats(c.data || []); setMembers(m.data || [])
  }
  useEffect(() => {
    load()
    callApi('/api/group-admin', {}).then(setStatus).catch(e => setStatus({ error: e.message }))
  }, [])

  async function patchTrack(id, patch) {
    setTracks(ts => ts.map(t => (t.id === id ? { ...t, ...patch } : t)))
    const { error } = await supabase.from('tracks').update(patch).eq('id', id)
    if (error) { alert('Could not save: ' + error.message); load() }
  }

  const link = `${window.location.origin}/start`
  const onSale = tracks.filter(t => t.group_offer)
  const stats = groupStats(members, status?.price?.amount)
  const checks = [
    ['Stripe secret key', status?.keys?.secret],
    ['Price ($50/month)', status?.keys?.price && status?.price && !status?.priceError],
    ['Webhook', status?.keys?.webhook],
    ['A track on sale', onSale.length > 0],
    ['Every track on sale has a program', onSale.length > 0 && onSale.every(t => t.program_id)],
  ]
  const ready = checks.every(c => c[1])
  const shown = members.filter(m => filter === 'all' ? true : filter === 'paying' ? ['active', 'past_due'].includes(m.group_status) : (m.group_status || 'pending') === filter)
  const trackName = id => tracks.find(t => t.id === id)?.name || '—'

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="eyebrow">Group offer</div>
      <h1 style={{ fontSize: 28, margin: '6px 0 16px' }}>Group</h1>
      {err && <div className="card" style={{ color: 'var(--red)', marginBottom: 14 }}>{err}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
        {[['Paying members', stats.paying], ['Monthly revenue', stats.mrr == null ? '—' : `$${stats.mrr.toLocaleString()}`], ['Payment failed', stats.pastDue], ['Cancelling', stats.leaving], ['Signed up, not paid', stats.pending]].map(([l, v]) => (
          <div key={l} className="card" style={{ padding: 12 }}>
            <div className="muted" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}>{l}</div>
            <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{v}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
          <strong style={{ fontSize: 15 }}>{ready ? 'Sign-ups are open' : 'Setup'}</strong>
          {status?.mode && <span className="muted" style={{ fontSize: 12 }}>Stripe {status.mode === 'live' ? 'LIVE mode' : 'TEST mode (no real charges)'}</span>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {checks.map(([l, ok]) => (
            <span key={l} style={{ fontSize: 12.5, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: ok ? 'rgba(48,164,108,.15)' : 'rgba(229,72,77,.12)', color: ok ? 'var(--green)' : 'var(--red)' }}>{ok ? '✓' : '✗'} {l}</span>
          ))}
        </div>
        {status?.priceError && <p style={{ color: 'var(--red)', fontSize: 13, margin: 0 }}>Stripe price: {status.priceError}</p>}
        {status?.price && <p className="muted" style={{ fontSize: 13, margin: 0 }}>Price: ${status.price.amount}/{status.price.interval || 'once'}{status.price.active === false ? ' (inactive in Stripe!)' : ''}</p>}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <code style={{ background: 'var(--steel)', padding: '7px 10px', borderRadius: 8, fontSize: 13 }}>{link}</code>
          <button className="btn-ghost" onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? 'Copied' : 'Copy sign-up link'}</button>
          <a className="btn-ghost" href="/start" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>Preview</a>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <strong style={{ fontSize: 15 }}>Programs on sale</strong>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          These are your tracks from <Link to="/coach/templates" style={{ color: 'var(--orange-hot)' }}>Templates &amp; Tracks</Link>. Tick the ones people can buy. Their name and description show on the sign-up page; the track’s program, habits, cardio and meal template are applied when someone pays (meal plans scale to their starting macros).
        </p>
        {tracks.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No tracks yet. Create “Main Event Build” and your women’s track in Templates &amp; Tracks first.</p>}
        {tracks.map(t => (
          <div key={t.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--line)' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={!!t.group_offer} onChange={e => patchTrack(t.id, { group_offer: e.target.checked })} aria-label={`Sell ${t.name}`} />
            <div>
              <div style={{ fontWeight: 800 }}>{t.name}</div>
              {!t.program_id && <div style={{ fontSize: 12, color: 'var(--red)' }}>No program set on this track</div>}
              {t.group_offer && !t.description && <div className="muted" style={{ fontSize: 12 }}>Add a description in Templates &amp; Tracks: it’s the sales copy on the sign-up page</div>}
            </div>
            <label className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>Chat
              <select value={t.chat_group_id || ''} onChange={e => patchTrack(t.id, { chat_group_id: e.target.value || null })} style={{ width: 'auto', padding: '4px 8px', fontSize: 12.5 }}>
                <option value="">None</option>
                {chats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <input type="number" title="Order on the sign-up page" value={t.group_position} onChange={e => patchTrack(t.id, { group_position: Number(e.target.value) || 0 })} style={{ width: 60, padding: '4px 8px', fontSize: 12.5 }} />
          </div>
        ))}
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>Chat: paying members on that track are added to this group chat automatically and removed if they cancel. Create the chat in Messages first.</p>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {[['paying', 'Paying'], ['past_due', 'Payment failed'], ['pending', 'Not paid'], ['canceled', 'Ended'], ['all', 'All']].map(([k, l]) => (
            <button key={k} className={filter === k ? 'btn' : 'btn-ghost'} style={{ padding: '5px 12px', fontSize: 12.5 }} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <table className="data">
          <thead><tr><th>Member</th><th>Program</th><th>Status</th><th>Joined</th><th>Renews / ends</th></tr></thead>
          <tbody>
            {shown.map(m => {
              const [label, color] = STATUS_STYLE[m.group_status || 'pending']
              return (
                <tr key={m.id}>
                  <td><div style={{ fontWeight: 700 }}>{m.full_name || '—'}</div><div className="muted" style={{ fontSize: 12 }}>{m.email}</div></td>
                  <td className="muted">{trackName(m.group_track_id)}</td>
                  <td><span style={{ fontWeight: 800, color }}>{label}</span>{m.group_cancel_at_period_end && m.group_status === 'active' && <div className="muted" style={{ fontSize: 11.5 }}>cancelling</div>}</td>
                  <td className="muted">{fmtDate(m.group_joined_at || m.created_at)}</td>
                  <td className="muted">{fmtDate(m.group_period_end)}</td>
                </tr>
              )
            })}
            {shown.length === 0 && <tr><td colSpan="5" className="muted">Nobody here yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
