// Library: delete exercises that aren't in any program (Update 172).
// Exercises you've put work into (a video or icon) start unticked so they
// aren't deleted by accident; hotel-gym swaps of program exercises are kept.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { findUnusedLibrary } from '../../lib/exmatch'

export default function LibraryUnused({ library, onDone, onClose }) {
  const [res, setRes] = useState(null)
  const [sel, setSel] = useState(new Set())
  const [q, setQ] = useState('')
  const [state, setState] = useState('')

  useEffect(() => {
    ;(async () => {
      const names = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('program_exercises').select('name').range(from, from + 999)
        if (error) { setState('Could not read your programs: ' + error.message); return }
        names.push(...(data || []).map(r => r.name)); if (!data || data.length < 1000) break
      }
      const { data: alts, error: aErr } = await supabase.from('exercise_alternatives').select('library_id, alt_id')
      const r = findUnusedLibrary(library, names, aErr ? [] : alts || [])
      setRes(r)
      setSel(new Set(r.unused.filter(l => !l.video_url && !l.icon_url).map(l => l.id)))
    })()
  }, [library])

  const toggle = id => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const shown = (res?.unused || []).filter(l => !q.trim() || l.name.toLowerCase().includes(q.trim().toLowerCase()))
  const withMedia = (res?.unused || []).filter(l => l.video_url || l.icon_url)

  async function del() {
    const ids = [...sel]
    if (!confirm(`Delete ${ids.length} exercise${ids.length === 1 ? '' : 's'} from your Library? Programs aren't affected. This can't be undone.`)) return
    setState('working')
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await supabase.from('exercise_library').delete().in('id', ids.slice(i, i + 200))
      if (error) { setState('Could not delete: ' + error.message); onDone?.(i); return }
    }
    setState(''); onDone?.(ids.length)
  }

  return (
    <div className="card" style={{ marginBottom: 20, borderLeft: '3px solid var(--red)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow" style={{ fontSize: 10 }}>Not in any program</div>
          <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
            Library exercises no program uses. Ticked ones get deleted. Ones with a video or icon start unticked so you don’t lose that work. Hotel-gym swaps for exercises in your programs are kept automatically.
          </p>
        </div>
        <button className="btn-ghost" onClick={onClose} style={{ padding: '5px 10px', fontSize: 12 }}>Close</button>
      </div>

      {!res && !state && <p className="muted" style={{ fontSize: 13, margin: 0 }}>Checking every program…</p>}
      {res && res.unused.length === 0 && <p style={{ fontSize: 14, color: 'var(--green)', fontWeight: 700, margin: 0 }}>✓ Every Library exercise is used by a program (or is a hotel-gym swap).</p>}

      {res && res.unused.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input placeholder="Filter…" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, minWidth: 160, padding: '6px 10px' }} />
            <button className="btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => setSel(new Set(res.unused.map(l => l.id)))}>Tick all</button>
            <button className="btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => setSel(new Set())}>Untick all</button>
          </div>
          <div className="muted" style={{ fontSize: 12.5 }}>
            {res.unused.length} not in any program{withMedia.length ? ` · ${withMedia.length} have a video or icon` : ''}{res.keptAsSwap.length ? ` · ${res.keptAsSwap.length} hotel-gym swaps kept` : ''}
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {shown.map(l => (
              <label key={l.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, padding: '4px 2px', cursor: 'pointer' }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={sel.has(l.id)} onChange={() => toggle(l.id)} aria-label={`Delete ${l.name}`} />
                <span style={{ flex: 1 }}>{l.name}</span>
                <span className="muted" style={{ fontSize: 11.5 }}>{[l.category, l.video_url && '▶ video', l.icon_url && 'icon'].filter(Boolean).join(' · ')}</span>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn" style={{ background: 'var(--red)', borderColor: 'var(--red)' }} disabled={!sel.size || state === 'working'} onClick={del}>
              {state === 'working' ? 'Deleting…' : `Delete ${sel.size}`}
            </button>
          </div>
        </>
      )}
      {state && state !== 'working' && <span style={{ color: 'var(--red)', fontSize: 13 }}>{state}</span>}
    </div>
  )
}
