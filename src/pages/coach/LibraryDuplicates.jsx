// Library: find and merge duplicate exercises (Update 171).
// "Leg Extension (2 sets)" / "leg extension" / "Leg Extension - each side"
// become one "Leg Extension", keeping the video, icon and swap links.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { findLibraryDuplicates, baseName, normName } from '../../lib/exmatch'

export default function LibraryDuplicates({ library, onDone, onClose }) {
  const [uses, setUses] = useState(null)
  const [groups, setGroups] = useState([])
  const [pick, setPick] = useState({})     // key -> { on, keepId, name }
  const [state, setState] = useState('')

  // how often each Library entry's exact name is used in programs, and in swaps
  useEffect(() => {
    ;(async () => {
      const rows = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('program_exercises').select('name').range(from, from + 999)
        if (error || !data) break
        rows.push(...data); if (data.length < 1000) break
      }
      const { data: alts } = await supabase.from('exercise_alternatives').select('library_id, alt_id')
      const byName = {}
      for (const r of rows) { const k = normName(r.name); byName[k] = (byName[k] || 0) + 1 }
      const u = {}
      for (const l of library) u[l.id] = { programs: byName[normName(l.name)] || 0, swaps: (alts || []).filter(a => a.library_id === l.id || a.alt_id === l.id).length }
      setUses(u)
    })()
  }, [library])

  useEffect(() => {
    if (!uses) return
    const g = findLibraryDuplicates(library, uses)
    setGroups(g)
    setPick(Object.fromEntries(g.map(x => [x.key, { on: true, keepId: x.keepId, name: x.cleanName }])))
  }, [uses, library])

  const chosen = groups.filter(g => pick[g.key]?.on)
  const toDelete = chosen.reduce((n, g) => n + g.items.length - 1, 0)

  async function merge() {
    if (!confirm(`Merge ${chosen.length} group${chosen.length === 1 ? '' : 's'} and remove ${toDelete} duplicate${toDelete === 1 ? '' : 's'}? This can't be undone.`)) return
    setState('working')
    let done = 0
    for (const g of chosen) {
      const p = pick[g.key]
      const { error } = await supabase.rpc('merge_library_exercises', { p_keep: p.keepId, p_drop: g.items.filter(i => i.id !== p.keepId).map(i => i.id), p_name: p.name.trim() || null })
      if (error) { setState(/merge_library_exercises/.test(error.message) ? 'Run migration_update171_library_merge.sql in Supabase first.' : `Stopped at "${p.name}": ${error.message}`); onDone?.(done); return }
      done++
    }
    setState(''); onDone?.(done)
  }

  return (
    <div className="card" style={{ marginBottom: 20, borderLeft: '3px solid var(--orange)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow" style={{ fontSize: 10 }}>Clean up duplicates</div>
          <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
            Same exercise saved more than once, e.g. with “(2 sets)” or “each side” in the name. Pick the one to keep and its final name. The kept one picks up any video, icon and hotel swaps from the others. Your programs aren’t changed.
          </p>
        </div>
        <button className="btn-ghost" onClick={onClose} style={{ padding: '5px 10px', fontSize: 12 }}>Close</button>
      </div>

      {!uses && <p className="muted" style={{ fontSize: 13, margin: 0 }}>Checking your library…</p>}
      {uses && groups.length === 0 && <p style={{ fontSize: 14, color: 'var(--green)', fontWeight: 700, margin: 0 }}>✓ No duplicates found.</p>}

      {groups.map(g => {
        const p = pick[g.key] || {}
        return (
          <div key={g.key} style={{ borderTop: '1px solid var(--line)', paddingTop: 10, opacity: p.on ? 1 : 0.5 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={!!p.on} aria-label={`Merge ${p.name}`}
                onChange={e => setPick(s => ({ ...s, [g.key]: { ...p, on: e.target.checked } }))} />
              <span className="muted" style={{ fontSize: 12.5 }}>Keep as</span>
              <input value={p.name || ''} onChange={e => setPick(s => ({ ...s, [g.key]: { ...p, name: e.target.value } }))}
                style={{ flex: 1, minWidth: 180, padding: '5px 8px', fontSize: 14, fontWeight: 700 }} aria-label="Final name" />
            </div>
            {g.items.map(it => {
              const u = uses[it.id] || {}
              const keep = p.keepId === it.id
              return (
                <label key={it.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, padding: '3px 0 3px 26px', cursor: 'pointer' }}>
                  <input type="radio" name={`keep-${g.key}`} style={{ width: 'auto' }} checked={keep}
                    onChange={() => setPick(s => ({ ...s, [g.key]: { ...p, keepId: it.id, name: baseName(it.name) } }))} />
                  <span style={{ fontWeight: keep ? 800 : 500 }}>{it.name}</span>
                  <span className="muted" style={{ fontSize: 11.5 }}>
                    {[it.video_url && '▶ video', it.icon_url && 'icon', u.swaps && `${u.swaps} swap${u.swaps === 1 ? '' : 's'}`, u.programs && `in ${u.programs} program exercise${u.programs === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 800, color: keep ? 'var(--green)' : 'var(--red)' }}>{keep ? 'KEEP' : 'remove'}</span>
                </label>
              )
            })}
          </div>
        )
      })}

      {groups.length > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn" disabled={!chosen.length || state === 'working'} onClick={merge}>
            {state === 'working' ? 'Merging…' : `Merge ${chosen.length} · remove ${toDelete}`}
          </button>
          {state && state !== 'working' && <span style={{ color: 'var(--red)', fontSize: 13 }}>{state}</span>}
        </div>
      )}
    </div>
  )
}
