// Library: the coach's approved swaps for one exercise.
import { useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function SwapEditor({ item, library, alts, onChange, onClose }) {
  const [q, setQ] = useState('')
  const mine = alts.filter(a => a.library_id === item.id).sort((a, b) => a.position - b.position)
  const byId = Object.fromEntries(library.map(l => [l.id, l]))
  const taken = new Set([item.id, ...mine.map(a => a.alt_id)])
  const matches = q.trim() ? library.filter(l => !taken.has(l.id) && l.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : []

  async function add(l) {
    const { error } = await supabase.from('exercise_alternatives').insert({ library_id: item.id, alt_id: l.id, position: mine.length })
    if (error) { alert(error.message.includes('exercise_alternatives') ? 'Run the Update 152 SQL in Supabase first.' : error.message); return }
    setQ(''); onChange()
  }
  async function remove(altId) {
    await supabase.from('exercise_alternatives').delete().eq('library_id', item.id).eq('alt_id', altId)
    onChange()
  }

  return (
    <div className="card" style={{ marginBottom: 14, borderColor: 'var(--orange)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 15 }}>⇄ Swaps for “{item.name}”</strong>
        <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={onClose}>Close</button>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: '6px 0 10px' }}>Clients see these when they tap ⇄ Swap on this exercise (machine taken, it hurts, no equipment). Order = the order they’re shown.</p>
      {mine.length === 0 && <p className="muted" style={{ fontSize: 13 }}>None yet.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {mine.map((a, i) => (
          <div key={a.alt_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <span className="muted" style={{ width: 18 }}>{i + 1}.</span>
            {byId[a.alt_id]?.icon_url && <img src={byId[a.alt_id].icon_url} alt="" style={{ width: 26, height: 26, borderRadius: 6, objectFit: 'cover' }} />}
            <span style={{ flex: 1, fontWeight: 700 }}>{byId[a.alt_id]?.name || 'Deleted exercise'}</span>
            <button onClick={() => remove(a.alt_id)} aria-label="Remove" style={{ background: 'none', color: 'var(--muted)' }}><X size={15} /></button>
          </div>
        ))}
      </div>
      <input placeholder="Add a swap: search your library…" value={q} onChange={e => setQ(e.target.value)} style={{ marginTop: 10 }} />
      {matches.map(l => (
        <button key={l.id} className="btn-ghost" onClick={() => add(l)} style={{ display: 'block', width: '100%', textAlign: 'left', marginTop: 4, padding: '7px 10px', fontSize: 13.5 }}>+ {l.name}</button>
      ))}
      {q.trim() && !matches.length && <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Not in your library. Add it there first.</p>}
    </div>
  )
}
