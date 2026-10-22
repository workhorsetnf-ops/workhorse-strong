// Library → Warm-ups & Cool-downs. Saved routines you load into any workout
// (Programs → a workout's 🔥 Warm-up / 🧊 Cool-down box → "Load saved…"), or
// pull in from "Paste whole block" by writing its name: "Warm-up: Upper Prep".
// Loading copies the routine, so editing it here never changes programs that
// already use it.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { ROUTINE_KINDS } from '../../lib/routines'

const EMPTY = { kind: 'warmup', name: '', body: '', video_url: '' }

export default function RoutineLibrary() {
  const [list, setList] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState(null)
  const [show, setShow] = useState('all')
  const [q, setQ] = useState('')

  async function load() {
    const { data, error } = await supabase.from('routine_library').select('*').order('kind').order('name')
    setList(error ? [] : data || [])
  }
  useEffect(() => { load() }, [])

  async function save() {
    const row = { kind: form.kind, name: form.name.trim(), body: form.body.replace(/\s+$/, ''), video_url: form.video_url.trim() }
    if (!row.name || !row.body.trim()) { alert('Give it a name and write out the drills.'); return }
    const { error } = editingId
      ? await supabase.from('routine_library').update({ ...row, updated_at: new Date().toISOString() }).eq('id', editingId)
      : await supabase.from('routine_library').insert(row)
    if (error) { alert(/duplicate|unique/i.test(error.message) ? `There's already a ${ROUTINE_KINDS[row.kind].toLowerCase()} called "${row.name}".` : 'Could not save: ' + error.message); return }
    setForm(EMPTY); setEditingId(null); load()
  }
  async function remove(r) {
    if (!window.confirm(`Delete "${r.name}" from the library? Programs that already use it keep their copy.`)) return
    await supabase.from('routine_library').delete().eq('id', r.id)
    if (editingId === r.id) { setEditingId(null); setForm(EMPTY) }
    load()
  }

  const shown = (list || []).filter(r => (show === 'all' || r.kind === show) && (!q || (r.name + ' ' + r.body).toLowerCase().includes(q.toLowerCase())))
  return (
    <>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        <span className="eyebrow" style={{ fontSize: 10 }}>{editingId ? 'Edit' : 'Add a warm-up or cool-down'}</span>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8 }}>
          <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
            <option value="warmup">Warm-up</option>
            <option value="cooldown">Cool-down</option>
          </select>
          <input placeholder={form.kind === 'warmup' ? 'Name (e.g. Upper Prep, Lower Body Prep)' : 'Name (e.g. Hips & Hamstrings Reset)'} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </div>
        <textarea rows="5" placeholder={form.kind === 'warmup' ? 'One drill per line, e.g.\nAlternating Arm Hug 60s\nArm Circle 60s\nHinge to T-Rotation 60s' : 'One drill per line, e.g.\nCouch stretch 60s each side\nChild\'s pose 60s'}
          value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} style={{ fontFamily: 'inherit' }} />
        <input placeholder="Video link (optional)" value={form.video_url} onChange={e => setForm({ ...form, video_url: e.target.value })} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" style={{ padding: '10px 18px', fontSize: 13 }} onClick={save}>{editingId ? 'Save changes' : 'Add to library'}</button>
          {editingId && <button className="btn-ghost" onClick={() => { setEditingId(null); setForm(EMPTY) }}>Cancel</button>}
        </div>
        <span className="muted" style={{ fontSize: 11.5 }}>
          Use it in Programs from any workout's 🔥 Warm-up / 🧊 Cool-down box ("Load saved…"), or in "Paste whole block" by writing just its name: <code>Warm-up: Upper Prep</code>.
          Loading makes a copy, so editing it here only affects programs you build from now on.
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {[['all', 'All'], ['warmup', 'Warm-ups'], ['cooldown', 'Cool-downs']].map(([k, l]) => (
          <button key={k} className={show === k ? 'btn' : 'btn-ghost'} onClick={() => setShow(k)} style={{ padding: '6px 12px', fontSize: 12.5 }}>{l}</button>
        ))}
        <input placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
      </div>

      {list === null ? <p className="muted">Loading…</p> : (
        <table className="data">
          <thead><tr><th>Name</th><th>Drills</th><th>Video</th><th></th></tr></thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.id}>
                <td>
                  <div className="muted" style={{ fontSize: 11 }}>{ROUTINE_KINDS[r.kind]}</div>
                  <div style={{ fontWeight: 700 }}>{r.name}</div>
                </td>
                <td className="muted" style={{ maxWidth: 360, whiteSpace: 'pre-line', fontSize: 12.5 }}>{r.body}</td>
                <td>{r.video_url ? <a href={r.video_url} target="_blank" rel="noreferrer">▶ Link</a> : <span className="muted">—</span>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12, marginRight: 6 }} onClick={() => { setEditingId(r.id); setForm({ kind: r.kind, name: r.name, body: r.body, video_url: r.video_url || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Edit</button>
                  <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12, color: 'var(--red)' }} onClick={() => remove(r)}>✕</button>
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan="4" className="muted">{list.length ? 'Nothing matches.' : 'Nothing saved yet. Add one above, or press "☆ Save to library" on any workout\'s warm-up in Programs.'}</td></tr>}
          </tbody>
        </table>
      )}
    </>
  )
}
