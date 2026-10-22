// A workout's warm-up or cool-down in the program builder: the text, an
// optional video link, "Load saved…" from the library, and "Save to library".
// Loading COPIES the saved routine into this workout; editing the library
// later never changes it.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { ROUTINE_KINDS } from '../../lib/routines'

export default function RoutineBox({ kind, text, video, library = [], onSave, onLibraryChange, placeholder }) {
  const label = ROUTINE_KINDS[kind]
  const [open, setOpen] = useState(false)
  const [t, setT] = useState(text || '')
  const [v, setV] = useState(video || '')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState('')
  useEffect(() => { if (!open) { setT(text || ''); setV(video || '') } }, [text, video, open])
  const saved = library.filter(r => r.kind === kind)
  const dirty = t !== (text || '') || v !== (video || '')
  const preview = String(text || '').split('\n').find(l => l.trim()) || ''
  const note = msg => { setFlash(msg); setTimeout(() => setFlash(''), 2000) }

  async function save() {
    setBusy(true)
    await onSave({ text: t.replace(/\s+$/, ''), video: v.trim() })
    setBusy(false); setOpen(false); note('Saved ✓')
  }

  function load(id) {
    const r = saved.find(x => x.id === id)
    if (!r) return
    if (t.trim() && t.trim() !== r.body.trim() && !window.confirm(`Replace what's in this ${label.toLowerCase()} with "${r.name}"?`)) return
    setT(r.body); setV(r.video_url || '')
  }

  async function saveToLibrary() {
    if (!t.trim()) return
    const name = (window.prompt(`Name this ${label.toLowerCase()} for the library (e.g. ${kind === 'warmup' ? 'Upper Prep' : 'Hips & Hamstrings'}):`) || '').trim()
    if (!name) return
    const existing = saved.find(r => r.name.trim().toLowerCase() === name.toLowerCase())
    setBusy(true)
    let error
    if (existing) {
      if (!window.confirm(`"${existing.name}" is already in the library. Replace it with this one? (Programs that already use it keep their copy.)`)) { setBusy(false); return }
      ;({ error } = await supabase.from('routine_library').update({ body: t.replace(/\s+$/, ''), video_url: v.trim(), updated_at: new Date().toISOString() }).eq('id', existing.id))
    } else {
      ;({ error } = await supabase.from('routine_library').insert({ kind, name, body: t.replace(/\s+$/, ''), video_url: v.trim() }))
    }
    setBusy(false)
    if (error) { alert('Could not save to the library: ' + error.message); return }
    onLibraryChange?.()
    note(`Saved to library as "${existing?.name || name}" ✓`)
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost"
        style={{ width: '100%', textAlign: 'left', padding: '7px 10px', fontSize: 12.5, display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <span style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{kind === 'warmup' ? '🔥' : '🧊'} {label}</span>
        <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
          {flash || preview || (saved.length ? 'Add, paste or load saved…' : 'Add / paste…')}{video && !flash ? ' · ▶' : ''}
        </span>
      </button>
    )
  }
  return (
    <div style={{ border: '1px solid var(--orange)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 12.5 }}>{kind === 'warmup' ? '🔥' : '🧊'} {label}</strong>
        {saved.length > 0 && (
          <select value="" onChange={e => load(e.target.value)} style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }} aria-label={`Load a saved ${label.toLowerCase()}`}>
            <option value="">Load saved {label.toLowerCase()}…</option>
            {saved.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        )}
      </div>
      <span className="muted" style={{ fontSize: 11.5 }}>{kind === 'warmup' ? 'Shown above the exercises as the warm-up to do first.' : 'Shown after the last exercise.'}</span>
      <textarea rows={5} autoFocus value={t} placeholder={placeholder} onChange={e => setT(e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, lineHeight: 1.45, fontFamily: 'inherit', resize: 'vertical' }} />
      <input placeholder="Video link (optional)" value={v} onChange={e => setV(e.target.value)} style={{ fontSize: 12.5, padding: '6px 9px' }} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" className="btn" disabled={busy || !dirty} onClick={save} style={{ padding: '6px 14px', fontSize: 12 }}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="btn-ghost" onClick={() => { setT(text || ''); setV(video || ''); setOpen(false) }} style={{ padding: '6px 12px', fontSize: 12 }}>Cancel</button>
        <button type="button" className="btn-ghost" disabled={busy || !t.trim()} onClick={saveToLibrary} style={{ padding: '6px 12px', fontSize: 12, marginLeft: 'auto' }}>☆ Save to library</button>
      </div>
      {flash && <span style={{ fontSize: 11.5, color: 'var(--orange-hot)' }}>{flash}</span>}
    </div>
  )
}
