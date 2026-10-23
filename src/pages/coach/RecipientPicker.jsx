// Pick one client or the whole roster: search, select all active, and skip
// anyone who already has the thing being sent.
// clients: [{ id, full_name, status }]; already: Set of client ids that already have it.
import { useMemo, useState } from 'react'

export default function RecipientPicker({ clients, selected, onChange, already = new Set(), alreadyLabel = 'already has it' }) {
  const [q, setQ] = useState('')
  const [showPaused, setShowPaused] = useState(false)
  const pool = useMemo(() => clients.filter(c => c.status !== 'exited' && (showPaused || c.status !== 'paused')), [clients, showPaused])
  const shown = pool.filter(c => !q || (c.full_name || '').toLowerCase().includes(q.toLowerCase()))
  const toggle = id => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); onChange(n) }
  const allNew = pool.filter(c => !already.has(c.id)).map(c => c.id)
  const paused = clients.filter(c => c.status === 'paused').length

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => onChange(new Set(allNew))}>
          Select all active{already.size ? ` (skip ${pool.length - allNew.length} who ${alreadyLabel.replace(/^already has/, 'already have')})` : ''}
        </button>
        <button type="button" className="btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => onChange(new Set())}>Clear</button>
        {paused > 0 && (
          <label className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={showPaused} onChange={e => setShowPaused(e.target.checked)} style={{ width: 'auto' }} /> include {paused} paused
          </label>
        )}
        <input placeholder="Search clients…" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, minWidth: 140, padding: '5px 9px', fontSize: 12.5 }} />
      </div>
      <div style={{ maxHeight: 220, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 2 }}>
        {shown.map(c => (
          <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '4px 6px', borderRadius: 6, cursor: 'pointer', background: selected.has(c.id) ? 'rgba(255,106,0,0.12)' : 'transparent' }}>
            <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} style={{ width: 'auto' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name || 'Unnamed client'}</span>
            {already.has(c.id) && <span className="muted" style={{ fontSize: 10.5, whiteSpace: 'nowrap' }}>· {alreadyLabel}</span>}
            {c.status === 'paused' && <span className="muted" style={{ fontSize: 10.5 }}>· paused</span>}
          </label>
        ))}
        {shown.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>No clients match.</span>}
      </div>
      <div className="muted" style={{ fontSize: 12 }}>{selected.size} selected</div>
    </div>
  )
}
