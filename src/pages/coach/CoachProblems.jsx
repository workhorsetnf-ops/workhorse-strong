// Coach: what's breaking in the app, for whom (Update 167).
// Same error from many phones is one row with a count.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// rows -> one group per message, newest first
export function groupErrors(rows, names = {}) {
  const by = new Map()
  for (const r of rows) {
    const g = by.get(r.message) || { message: r.message, count: 0, people: new Set(), paths: new Set(), devices: new Set(), last: r.created_at, first: r.created_at, stack: r.stack, kind: r.kind, ids: [] }
    g.count++; g.ids.push(r.id)
    if (r.profile_id) g.people.add(names[r.profile_id] || 'Someone')
    if (r.path) g.paths.add(r.path)
    if (r.device) g.devices.add(r.device)
    if (r.created_at > g.last) { g.last = r.created_at; g.stack = r.stack || g.stack }
    if (r.created_at < g.first) g.first = r.created_at
    if (r.kind === 'crash') g.kind = 'crash'
    by.set(r.message, g)
  }
  return [...by.values()].sort((a, b) => (a.last < b.last ? 1 : -1))
}
const ago = iso => {
  const m = Math.round((Date.now() - new Date(iso)) / 60000)
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`
}
const SCREEN = p => ({ '/app': 'Home', '/app/training': 'Train', '/app/nutrition': 'Eat', '/app/progress': 'Log', '/app/checkin': 'Check-in', '/app/calendar': 'Calendar', '/app/messages': 'Messages' }[p] || p)

export default function CoachProblems() {
  const [rows, setRows] = useState(null)
  const [names, setNames] = useState({})
  const [open, setOpen] = useState(null)
  const [showFixed, setShowFixed] = useState(false)
  const [err, setErr] = useState('')

  async function load() {
    let q = supabase.from('app_errors').select('*').order('created_at', { ascending: false }).limit(1000)
    if (!showFixed) q = q.eq('resolved', false)
    const [{ data, error }, { data: ps }] = await Promise.all([q, supabase.from('profiles').select('id, full_name')])
    if (error) return setErr(/app_errors/.test(error.message) ? 'Run migration_update167_error_log.sql in Supabase first.' : error.message)
    setRows(data || []); setNames(Object.fromEntries((ps || []).map(p => [p.id, p.full_name || 'Unnamed'])))
  }
  useEffect(() => { load() }, [showFixed])

  async function markFixed(g) {
    for (let i = 0; i < g.ids.length; i += 200) await supabase.from('app_errors').update({ resolved: true }).in('id', g.ids.slice(i, i + 200))
    load()
  }
  async function clearOld() {
    if (!confirm('Delete fixed problems older than 30 days?')) return
    await supabase.from('app_errors').delete().eq('resolved', true).lt('created_at', new Date(Date.now() - 30 * 864e5).toISOString())
    load()
  }

  const groups = rows ? groupErrors(rows, names) : []
  return (
    <div style={{ maxWidth: 900 }}>
      <div className="eyebrow">App health</div>
      <h1 style={{ fontSize: 28, margin: '6px 0 6px' }}>Problems</h1>
      <p className="muted" style={{ fontSize: 14, marginBottom: 14 }}>Errors and crashes from people’s phones. If a client says “the app did something weird”, it’s probably here. Send me the details and I’ll fix it.</p>
      {err && <div className="card" style={{ color: 'var(--red)' }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button className={!showFixed ? 'btn' : 'btn-ghost'} onClick={() => setShowFixed(false)}>Open</button>
        <button className={showFixed ? 'btn' : 'btn-ghost'} onClick={() => setShowFixed(true)}>Include fixed</button>
        <button className="btn-ghost" onClick={clearOld}>Clear old fixed</button>
      </div>
      {rows && groups.length === 0 && <div className="card" style={{ color: 'var(--green)', fontWeight: 700 }}>✓ Nothing broken. All quiet.</div>}
      {groups.map(g => (
        <div key={g.message} className="card" style={{ marginBottom: 10, borderLeft: `3px solid ${g.kind === 'crash' ? 'var(--red)' : 'var(--orange)'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontWeight: 800, fontSize: 14.5, wordBreak: 'break-word' }}>{g.kind === 'crash' ? '💥 Screen crashed: ' : ''}{g.message}</div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                {g.count}× · {g.people.size ? `${g.people.size} ${g.people.size === 1 ? 'person' : 'people'} (${[...g.people].slice(0, 4).join(', ')}${g.people.size > 4 ? '…' : ''})` : 'not signed in'} · last {ago(g.last)}
              </div>
              <div className="muted" style={{ fontSize: 12.5 }}>On: {[...g.paths].map(SCREEN).join(', ') || '—'} · {[...g.devices].join(', ')}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => setOpen(open === g.message ? null : g.message)}>{open === g.message ? 'Hide' : 'Details'}</button>
              <button className="btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => { navigator.clipboard?.writeText(`${g.message}\nScreens: ${[...g.paths].join(', ')}\nDevices: ${[...g.devices].join(', ')}\nCount: ${g.count}\n\n${g.stack || ''}`) }}>Copy</button>
              {!showFixed && <button className="btn" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => markFixed(g)}>Mark fixed</button>}
            </div>
          </div>
          {open === g.message && <pre style={{ marginTop: 10, fontSize: 11.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--coal)', padding: 10, borderRadius: 8, maxHeight: 260, overflow: 'auto' }}>{g.stack || 'No stack trace.'}</pre>}
        </div>
      ))}
    </div>
  )
}
