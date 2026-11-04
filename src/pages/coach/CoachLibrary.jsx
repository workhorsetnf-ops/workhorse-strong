import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import FoodLibrary from './FoodLibrary'
import RoutineLibrary from './RoutineLibrary'
import SwapEditor from './SwapEditor'
import VideoFinder from './VideoFinder'
import { matchProgramExercises, findUnmatched, confidence } from '../../lib/exmatch'

const EMPTY_EX = { name: '', category: '', metric: 'reps', video_url: '', notes: '', icon_url: '' }
const EMPTY_COND = { name: '', format: '', instructions: '', video_url: '' }
const EMPTY_LIFE = { name: '', category: '', instructions: '', video_url: '', tracking_type: 'yesno', reminder_time: '' }
const TRACK_LABEL = { count: 'Count', time: 'Time', yesno: 'Yes / No', scale: 'Quality 1–10' }

export default function CoachLibrary() {
  const [tab, setTab] = useState('exercises')
  const [items, setItems] = useState([])
  const [uploadingIcon, setUploadingIcon] = useState(false)
  const [pushingId, setPushingId] = useState(null)
  const [alts, setAlts] = useState([])
  const [swapItem, setSwapItem] = useState(null)
  const [matchPanel, setMatchPanel] = useState(null) // { rows:[unmatched + pick/ticked], fields, busy }
  const [scanning, setScanning] = useState(false)
  const [finder, setFinder] = useState(null) // exercises to find videos for, one at a time (Update 163)
  const [finderNote, setFinderNote] = useState('')
  const [pushPanel, setPushPanel] = useState(null)   // { item, groups, picked:Set(name), fields:{icon_url,video_url}, rename }
  const [cond, setCond] = useState([])
  const [life, setLife] = useState([])
  const [q, setQ] = useState('')
  const [form, setForm] = useState(EMPTY_EX)
  const [condForm, setCondForm] = useState(EMPTY_COND)
  const [lifeForm, setLifeForm] = useState(EMPTY_LIFE)
  const [editingId, setEditingId] = useState(null)

  async function load() {
    const [{ data: e }, { data: c }, { data: l }] = await Promise.all([
      supabase.from('exercise_library').select('*').order('name'),
      supabase.from('conditioning_library').select('*').order('name'),
      supabase.from('lifestyle_library').select('*').order('name'),
    ])
    setItems(e || []); setCond(c || []); setLife(l || [])
    const { data: al, error: alErr } = await supabase.from('exercise_alternatives').select('*')
    setAlts(alErr ? [] : al || [])
  }
  useEffect(() => { load() }, [])

  // ---- exercises ----
  async function uploadIcon(file) {
    if (!file) return
    setUploadingIcon(true)
    const path = `${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('exercise-icons').upload(path, file)
    if (error) { alert('Upload failed: ' + error.message); setUploadingIcon(false); return }
    const { data } = supabase.storage.from('exercise-icons').getPublicUrl(path)
    setForm(f => ({ ...f, icon_url: data.publicUrl }))
    setUploadingIcon(false)
  }

  async function saveEx() {
    if (!form.name.trim()) return
    const row = { name: form.name.trim(), category: form.category.trim(), metric: form.metric, video_url: form.video_url.trim(), notes: form.notes.trim(), icon_url: form.icon_url || null }
    if (editingId) await supabase.from('exercise_library').update(row).eq('id', editingId)
    else await supabase.from('exercise_library').insert(row)
    setForm(EMPTY_EX); setEditingId(null); load()
  }
  async function removeEx(id) {
    if (!confirm('Remove from library? (Programs already using it are unaffected.)')) return
    await supabase.from('exercise_library').delete().eq('id', id)
    if (editingId === id) { setEditingId(null); setForm(EMPTY_EX) }
    load()
  }
  // Copy a library exercise's icon/video onto program exercises. Program
  // exercises keep their own copy, so this is how media added to the library
  // reaches programs built before it. Names are matched ignoring capitals,
  // spacing and punctuation; if a program spells it differently, close
  // matches are offered to pick from instead of silently updating nothing.
  async function pushEverywhere(item, field) {
    setPushingId(`${item.id}:${field}`)
    const rows = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('program_exercises').select('id, name').range(from, from + 999)
      if (error) { setPushingId(null); alert('Could not load program exercises: ' + error.message); return }
      rows.push(...(data || []))
      if (!data || data.length < 1000) break
    }
    setPushingId(null)
    const { exact, similar } = matchProgramExercises(item.name, rows)
    setPushPanel({
      item, exact, similar,
      picked: new Set(exact.map(g => g.name)),
      fields: { icon_url: false, video_url: false, [field]: true },
      rename: false, busy: false,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function applyPush() {
    const p = pushPanel
    const groups = [...p.exact, ...p.similar].filter(g => p.picked.has(g.name))
    const ids = groups.flatMap(g => g.ids)
    const patch = {}
    if (p.fields.icon_url && p.item.icon_url) patch.icon_url = p.item.icon_url
    if (p.fields.video_url && p.item.video_url) patch.video_url = p.item.video_url
    if (p.rename) patch.name = p.item.name
    if (!ids.length || !Object.keys(patch).length) return
    setPushPanel({ ...p, busy: true })
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await supabase.from('program_exercises').update(patch).in('id', ids.slice(i, i + 200))
      if (error) { setPushPanel({ ...p, busy: false }); alert('Could not apply: ' + error.message); return }
    }
    setPushPanel(null)
    alert(`Done. Updated ${ids.length} exercise${ids.length === 1 ? '' : 's'} across your programs.`)
  }

  // Bulk clean-up: every program exercise name that isn't in the library,
  // each paired with its most likely library exercise. Applying renames them
  // to the library name and copies the library icon/video, so typed-in
  // exercises become "library" exercises without editing them one by one.
  async function scanUnmatched() {
    setScanning(true)
    const rows = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('program_exercises').select('id, name, kind').range(from, from + 999)
      if (error) { setScanning(false); alert('Could not load program exercises: ' + error.message); return }
      rows.push(...(data || []))
      if (!data || data.length < 1000) break
    }
    setScanning(false)
    const list = findUnmatched(rows.filter(r => r.kind !== 'conditioning'), items).map(u => ({
      ...u, pick: u.best ? u.best.id : '', ticked: !!u.best && confidence(u.score) === 'high',
    }))
    setMatchPanel({ rows: list, fields: { icon_url: true, video_url: true }, busy: false, done: null })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function applyMatches() {
    const m = matchPanel
    const chosen = m.rows.filter(r => r.ticked && r.pick)
    if (!chosen.length) return
    setMatchPanel({ ...m, busy: true })
    const byLib = new Map()
    for (const r of chosen) {
      if (!byLib.has(r.pick)) byLib.set(r.pick, [])
      byLib.get(r.pick).push(...r.ids)
    }
    let n = 0
    for (const [libId, ids] of byLib) {
      const lib = items.find(i => i.id === libId)
      if (!lib) continue
      const patch = { name: lib.name }
      if (m.fields.icon_url && lib.icon_url) patch.icon_url = lib.icon_url
      if (m.fields.video_url && lib.video_url) patch.video_url = lib.video_url
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await supabase.from('program_exercises').update(patch).in('id', ids.slice(i, i + 200))
        if (error) { setMatchPanel({ ...m, busy: false }); alert(`Stopped after ${n} updates: ${error.message}`); return }
        n += Math.min(200, ids.length - i)
      }
    }
    const done = new Set(chosen.map(r => r.name))
    setMatchPanel({ ...m, rows: m.rows.filter(r => !done.has(r.name)), busy: false, done: { exercises: n, names: chosen.length } })
  }

  // No library match at all: add the program's spelling to the library as-is.
  async function addUnmatchedToLibrary(row) {
    const { error } = await supabase.from('exercise_library').insert({ name: row.name.trim() })
    if (error) { alert('Could not add: ' + error.message); return }
    setMatchPanel(m => ({ ...m, rows: m.rows.filter(r => r.name !== row.name) }))
    load()
  }

  function editEx(i) {
    setEditingId(i.id)
    setForm({ name: i.name, category: i.category, metric: i.metric, video_url: i.video_url, notes: i.notes, icon_url: i.icon_url || '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ---- conditioning ----
  async function saveCond() {
    if (!condForm.name.trim()) return
    const row = { name: condForm.name.trim(), format: condForm.format.trim(), instructions: condForm.instructions.trim(), video_url: condForm.video_url.trim() }
    if (editingId) await supabase.from('conditioning_library').update(row).eq('id', editingId)
    else await supabase.from('conditioning_library').insert(row)
    setCondForm(EMPTY_COND); setEditingId(null); load()
  }
  async function removeCond(id) {
    if (!confirm('Remove from conditioning library?')) return
    await supabase.from('conditioning_library').delete().eq('id', id)
    if (editingId === id) { setEditingId(null); setCondForm(EMPTY_COND) }
    load()
  }
  function editCond(i) {
    setEditingId(i.id)
    setCondForm({ name: i.name, format: i.format, instructions: i.instructions, video_url: i.video_url })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ---- lifestyle ----
  async function saveLife() {
    if (!lifeForm.name.trim()) return
    const row = { name: lifeForm.name.trim(), category: lifeForm.category.trim(), instructions: lifeForm.instructions.trim(), video_url: lifeForm.video_url.trim(), tracking_type: lifeForm.tracking_type, reminder_time: lifeForm.reminder_time.trim() }
    if (editingId) await supabase.from('lifestyle_library').update(row).eq('id', editingId)
    else await supabase.from('lifestyle_library').insert(row)
    setLifeForm(EMPTY_LIFE); setEditingId(null); load()
  }
  async function removeLife(id) {
    if (!confirm('Remove from lifestyle library?')) return
    await supabase.from('lifestyle_library').delete().eq('id', id)
    if (editingId === id) { setEditingId(null); setLifeForm(EMPTY_LIFE) }
    load()
  }
  function editLife(i) {
    setEditingId(i.id)
    setLifeForm({ name: i.name, category: i.category, instructions: i.instructions, video_url: i.video_url, tracking_type: i.tracking_type || 'yesno', reminder_time: i.reminder_time || '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const filteredLife = life.filter(i => (i.name + ' ' + i.category + ' ' + i.instructions).toLowerCase().includes(q.toLowerCase()))
  const filteredEx = items.filter(i => (i.name + ' ' + i.category).toLowerCase().includes(q.toLowerCase()))
  const filteredCond = cond.filter(i => (i.name + ' ' + i.format + ' ' + i.instructions).toLowerCase().includes(q.toLowerCase()))
  const categories = [...new Set(items.map(i => i.category).filter(Boolean))].sort()
  const metricLabel = { reps: 'Reps', time: 'Time', distance: 'Distance' }

  return (
    <div>
      <div className="eyebrow">Training</div>
      <h1 style={{ fontSize: 28, margin: '6px 0 16px' }}>Library</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <button className={tab === 'exercises' ? 'btn' : 'btn-ghost'} onClick={() => { setTab('exercises'); setEditingId(null) }}>Exercises</button>
        <button className={tab === 'conditioning' ? 'btn' : 'btn-ghost'} onClick={() => { setTab('conditioning'); setEditingId(null) }}>Conditioning</button>
        <button className={tab === 'lifestyle' ? 'btn' : 'btn-ghost'} onClick={() => { setTab('lifestyle'); setEditingId(null) }}>Lifestyle</button>
        <button className={tab === 'routines' ? 'btn' : 'btn-ghost'} onClick={() => { setTab('routines'); setEditingId(null) }}>Warm-ups &amp; Cool-downs</button>
        <button className={tab === 'foods' ? 'btn' : 'btn-ghost'} onClick={() => { setTab('foods'); setEditingId(null) }}>Foods</button>
      </div>

      {matchPanel && tab === 'exercises' && <MatchPanel m={matchPanel} setM={setMatchPanel} library={items} apply={applyMatches} addToLib={addUnmatchedToLibrary} />}
      {pushPanel && <PushPanel p={pushPanel} setP={setPushPanel} apply={applyPush} />}
      {finder && tab === 'exercises' && (
        <VideoFinder key={finder.key} queue={finder.queue}
          onSaved={(id, url) => setItems(list => list.map(x => (x.id === id ? { ...x, video_url: url } : x)))}
          onClose={n => { setFinder(null); setFinderNote(n ? `Saved ${n} video${n === 1 ? '' : 's'}.` : ''); load() }} />
      )}
      {finderNote && tab === 'exercises' && !finder && <p style={{ fontSize: 13, color: 'var(--green)', margin: '0 0 12px' }}>{finderNote}</p>}
      {swapItem && tab === 'exercises' && <SwapEditor item={swapItem} library={items} alts={alts} onChange={load} onClose={() => setSwapItem(null)} />}
      {tab === 'foods' && <FoodLibrary />}
      {tab === 'routines' && <RoutineLibrary />}

      {tab === 'exercises' && (
        <>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            <span className="eyebrow" style={{ fontSize: 10 }}>{editingId ? 'Edit exercise' : 'Add exercise'}</span>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {form.icon_url && <img src={form.icon_url} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />}
              <label className="btn-ghost" style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
                {uploadingIcon ? 'Uploading…' : form.icon_url ? 'Replace icon' : '+ Icon'}
                <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploadingIcon} onChange={e => uploadIcon(e.target.files[0])} />
              </label>
              {form.icon_url && <button className="btn-ghost" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => setForm(f => ({ ...f, icon_url: '' }))}>Remove</button>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
              <input placeholder="Exercise name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <input placeholder="Category (e.g. Chest)" list="lib-cats" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
              <datalist id="lib-cats">{categories.map(c => <option key={c} value={c} />)}</datalist>
              <select value={form.metric} onChange={e => setForm({ ...form, metric: e.target.value })}>
                <option value="reps">Reps</option><option value="time">Time</option><option value="distance">Distance</option>
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input placeholder="Video URL (optional)" value={form.video_url} onChange={e => setForm({ ...form, video_url: e.target.value })} />
              <input placeholder="Coaching cue / note (optional)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ padding: '10px 18px', fontSize: 13 }} onClick={saveEx}>{editingId ? 'Save changes' : 'Add to library'}</button>
              {editingId && <button className="btn-ghost" onClick={() => { setEditingId(null); setForm(EMPTY_EX) }}>Cancel</button>}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
            <input placeholder="Search exercises…" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1 }} />
            {items.some(i => !i.video_url) && (
              <button className="btn" style={{ whiteSpace: 'nowrap' }} onClick={() => { setFinderNote(''); setFinder({ key: Date.now(), queue: items.filter(i => !i.video_url) }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
                🎬 Find videos ({items.filter(i => !i.video_url).length} missing)</button>
            )}
            <button className="btn-ghost" style={{ whiteSpace: 'nowrap' }} disabled={scanning} onClick={scanUnmatched}>{scanning ? 'Scanning programs…' : '⇄ Match program exercises'}</button>
          </div>

          <table className="data">
            <thead><tr><th></th><th>Exercise</th><th>Category</th><th>Metric</th><th>Video</th><th>Note</th><th></th></tr></thead>
            <tbody>
              {filteredEx.map(i => (
                <tr key={i.id}>
                  <td>{i.icon_url ? <img src={i.icon_url} alt="" style={{ width: 30, height: 30, borderRadius: 6, objectFit: 'cover' }} /> : null}</td>
                  <td style={{ fontWeight: 700 }}>{i.name}</td>
                  <td className="muted">{i.category || '—'}</td>
                  <td className="muted">{metricLabel[i.metric]}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {i.video_url ? <a href={i.video_url} target="_blank" rel="noreferrer">▶ Link</a> : <span className="muted">—</span>}
                    <button className="btn-ghost" title={i.video_url ? 'Find a different video' : 'Find a video'} style={{ padding: '2px 7px', fontSize: 11, marginLeft: 6 }}
                      onClick={() => { setFinderNote(''); setFinder({ key: Date.now(), queue: [i] }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>🔍</button>
                  </td>
                  <td className="muted" style={{ maxWidth: 240 }}>{i.notes || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {i.icon_url && <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12, marginRight: 6 }} disabled={pushingId === `${i.id}:icon_url`} onClick={() => pushEverywhere(i, 'icon_url')}>{pushingId === `${i.id}:icon_url` ? 'Applying…' : 'Push icon'}</button>}
                    {i.video_url && <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12, marginRight: 6 }} disabled={pushingId === `${i.id}:video_url`} onClick={() => pushEverywhere(i, 'video_url')}>{pushingId === `${i.id}:video_url` ? 'Applying…' : 'Push video'}</button>}
                    <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12, marginRight: 6, borderColor: alts.some(a => a.library_id === i.id) ? 'var(--orange)' : undefined }} onClick={() => { setSwapItem(i); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>⇄ Swaps{alts.filter(a => a.library_id === i.id).length ? ` (${alts.filter(a => a.library_id === i.id).length})` : ''}</button>
                    <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12, marginRight: 6 }} onClick={() => editEx(i)}>Edit</button>
                    <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12, color: 'var(--red)' }} onClick={() => removeEx(i.id)}>✕</button>
                  </td>
                </tr>
              ))}
              {filteredEx.length === 0 && <tr><td colSpan="6" className="muted">Nothing here yet.</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {tab === 'lifestyle' && (
        <>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            <span className="eyebrow" style={{ fontSize: 10 }}>{editingId ? 'Edit lifestyle Rx' : 'Add lifestyle Rx'}</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input placeholder="Name (e.g. Steps, Bed Time, Units of Water)" value={lifeForm.name} onChange={e => setLifeForm({ ...lifeForm, name: e.target.value })} />
              <input placeholder="Category (e.g. Movement, Energy, Hydration)" value={lifeForm.category} onChange={e => setLifeForm({ ...lifeForm, category: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <select value={lifeForm.tracking_type} onChange={e => setLifeForm({ ...lifeForm, tracking_type: e.target.value })} title="How the client logs it">
                <option value="count">Tracks: Count (a number)</option>
                <option value="time">Tracks: Time (clock time)</option>
                <option value="yesno">Tracks: Yes / No</option>
                <option value="scale">Tracks: Quality (1–10)</option>
              </select>
              <input placeholder="Reminder time shown to client (e.g. 8:00pm)" value={lifeForm.reminder_time} onChange={e => setLifeForm({ ...lifeForm, reminder_time: e.target.value })} />
            </div>
            <textarea rows="2" placeholder="Instructions" value={lifeForm.instructions} onChange={e => setLifeForm({ ...lifeForm, instructions: e.target.value })} />
            <input placeholder="Video URL (optional)" value={lifeForm.video_url} onChange={e => setLifeForm({ ...lifeForm, video_url: e.target.value })} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ padding: '10px 18px', fontSize: 13 }} onClick={saveLife}>{editingId ? 'Save changes' : 'Add to library'}</button>
              {editingId && <button className="btn-ghost" onClick={() => { setEditingId(null); setLifeForm(EMPTY_LIFE) }}>Cancel</button>}
            </div>
          </div>

          <input placeholder="Search lifestyle…" value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 14 }} />

          <table className="data">
            <thead><tr><th>Name &amp; Type</th><th>Tracking</th><th>Reminder</th><th>Instructions</th><th>Video</th><th></th></tr></thead>
            <tbody>
              {filteredLife.map(i => (
                <tr key={i.id}>
                  <td>
                    {i.category && <div className="muted" style={{ fontSize: 11 }}>{i.category}</div>}
                    <div style={{ fontWeight: 700 }}>{i.name}</div>
                  </td>
                  <td className="muted">{TRACK_LABEL[i.tracking_type] || '—'}</td>
                  <td className="muted">{i.reminder_time ? `⏰ ${i.reminder_time}` : '—'}</td>
                  <td className="muted" style={{ maxWidth: 280 }}>{i.instructions || '—'}</td>
                  <td>{i.video_url ? <a href={i.video_url} target="_blank" rel="noreferrer">▶ Link</a> : <span className="muted">—</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12, marginRight: 6 }} onClick={() => editLife(i)}>Edit</button>
                    <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12, color: 'var(--red)' }} onClick={() => removeLife(i.id)}>✕</button>
                  </td>
                </tr>
              ))}
              {filteredLife.length === 0 && <tr><td colSpan="5" className="muted">Nothing here yet — add habits, recovery work, sleep targets…</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {tab === 'conditioning' && (
        <>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            <span className="eyebrow" style={{ fontSize: 10 }}>{editingId ? 'Edit conditioning' : 'Add conditioning'}</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input placeholder="Name (e.g. 2k Row Time Trial)" value={condForm.name} onChange={e => setCondForm({ ...condForm, name: e.target.value })} />
              <input placeholder="Format (e.g. 2k row time trial)" value={condForm.format} onChange={e => setCondForm({ ...condForm, format: e.target.value })} />
            </div>
            <textarea rows="2" placeholder="Instructions (what the client does, pacing, what to record)" value={condForm.instructions} onChange={e => setCondForm({ ...condForm, instructions: e.target.value })} />
            <input placeholder="Video URL (optional)" value={condForm.video_url} onChange={e => setCondForm({ ...condForm, video_url: e.target.value })} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ padding: '10px 18px', fontSize: 13 }} onClick={saveCond}>{editingId ? 'Save changes' : 'Add to library'}</button>
              {editingId && <button className="btn-ghost" onClick={() => { setEditingId(null); setCondForm(EMPTY_COND) }}>Cancel</button>}
            </div>
          </div>

          <input placeholder="Search conditioning…" value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 14 }} />

          <table className="data">
            <thead><tr><th>Name</th><th>Format</th><th>Instructions</th><th>Video</th><th></th></tr></thead>
            <tbody>
              {filteredCond.map(i => (
                <tr key={i.id}>
                  <td style={{ fontWeight: 700 }}>{i.name}</td>
                  <td className="muted">{i.format || '—'}</td>
                  <td className="muted" style={{ maxWidth: 340 }}>{i.instructions || '—'}</td>
                  <td>{i.video_url ? <a href={i.video_url} target="_blank" rel="noreferrer">▶ Link</a> : <span className="muted">—</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {i.video_url && <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12, marginRight: 6 }} disabled={pushingId === `${i.id}:video_url`} onClick={() => pushEverywhere(i, 'video_url')}>{pushingId === `${i.id}:video_url` ? 'Applying…' : 'Push video'}</button>}
                    <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12, marginRight: 6 }} onClick={() => editCond(i)}>Edit</button>
                    <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12, color: 'var(--red)' }} onClick={() => removeCond(i.id)}>✕</button>
                  </td>
                </tr>
              ))}
              {filteredCond.length === 0 && <tr><td colSpan="5" className="muted">Nothing here yet.</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

function PushPanel({ p, setP, apply }) {
  const toggle = name => { const n = new Set(p.picked); n.has(name) ? n.delete(name) : n.add(name); setP({ ...p, picked: n }) }
  const count = [...p.exact, ...p.similar].filter(g => p.picked.has(g.name)).reduce((s, g) => s + g.count, 0)
  const row = g => (
    <label key={g.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: '1px solid var(--line)', cursor: 'pointer', fontSize: 14 }}>
      <input type="checkbox" checked={p.picked.has(g.name)} onChange={() => toggle(g.name)} style={{ width: 18, height: 18, accentColor: 'var(--orange)' }} />
      <span style={{ flex: 1 }}>{g.name}</span>
      <span className="muted" style={{ fontSize: 12 }}>in {g.count} program spot{g.count === 1 ? '' : 's'}</span>
    </label>
  )
  const nothing = !p.exact.length && !p.similar.length
  return (
    <div className="card" style={{ marginBottom: 14, borderColor: 'var(--orange)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <strong style={{ fontSize: 15 }}>Push “{p.item.name}” to programs</strong>
        <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setP(null)}>Close</button>
      </div>
      <div style={{ display: 'flex', gap: 16, fontSize: 13, marginBottom: 8 }}>
        {p.item.icon_url && <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={!!p.fields.icon_url} onChange={e => setP({ ...p, fields: { ...p.fields, icon_url: e.target.checked } })} /> Icon</label>}
        {p.item.video_url && <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={!!p.fields.video_url} onChange={e => setP({ ...p, fields: { ...p.fields, video_url: e.target.checked } })} /> Video</label>}
      </div>
      {nothing && <p className="muted" style={{ fontSize: 13 }}>No program exercise has this name or anything close to it. Add it to a program from the library search and it carries the icon and video automatically.</p>}
      {p.exact.length > 0 && <div className="eyebrow" style={{ marginTop: 6 }}>Same name</div>}
      {p.exact.map(row)}
      {p.similar.length > 0 && <div className="eyebrow" style={{ marginTop: 10 }}>{p.exact.length ? 'Similar names (tick any that are the same exercise)' : 'No exact name match. Similar names, tick any that are the same exercise'}</div>}
      {p.similar.map(row)}
      {!nothing && (
        <>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginTop: 10 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={p.rename} onChange={e => setP({ ...p, rename: e.target.checked })} />
            Also rename the ticked ones to “{p.item.name}” so future pushes match
          </label>
          <button className="btn" style={{ marginTop: 10, padding: '9px 16px', fontSize: 13 }} disabled={p.busy || !count || (!p.fields.icon_url && !p.fields.video_url && !p.rename)} onClick={apply}>
            {p.busy ? 'Applying…' : `Apply to ${count} exercise${count === 1 ? '' : 's'}`}
          </button>
        </>
      )}
    </div>
  )
}

const CONF_STYLE = {
  high: { label: 'Strong match', color: 'var(--green, #3fb950)' },
  medium: { label: 'Check this', color: 'var(--orange)' },
  low: { label: 'Weak match', color: 'var(--red)' },
  none: { label: 'No match found', color: 'var(--muted, #888)' },
}

function MatchPanel({ m, setM, library, apply, addToLib }) {
  const sorted = [...library].sort((a, b) => a.name.localeCompare(b.name))
  const setRow = (name, patch) => setM({ ...m, rows: m.rows.map(r => r.name === name ? { ...r, ...patch } : r) })
  const chosen = m.rows.filter(r => r.ticked && r.pick)
  const spots = chosen.reduce((s, r) => s + r.count, 0)
  const tickAll = on => setM({ ...m, rows: m.rows.map(r => ({ ...r, ticked: on && !!r.pick })) })
  return (
    <div className="card" style={{ marginBottom: 14, borderColor: 'var(--orange)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <strong style={{ fontSize: 16 }}>Match program exercises to the library</strong>
        <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setM(null)}>Close</button>
      </div>
      {m.done && <p style={{ fontSize: 14, margin: '4px 0 8px', color: 'var(--green, #3fb950)' }}>Done — {m.done.exercises} exercise{m.done.exercises === 1 ? '' : 's'} across your programs now use the library name{m.done.names === 1 ? '' : 's'}.</p>}
      {!m.rows.length ? (
        <p className="muted" style={{ fontSize: 14 }}>Every exercise in your programs matches a library exercise. Nothing to fix.</p>
      ) : (
        <>
          <p className="muted" style={{ fontSize: 13, margin: '0 0 8px' }}>
            {m.rows.length} name{m.rows.length === 1 ? '' : 's'} in your programs {m.rows.length === 1 ? "isn't" : "aren't"} in the library. Strong matches are ticked; check the rest and pick from the dropdown where needed. Ticked ones get renamed to the library name{m.fields.icon_url || m.fields.video_url ? ' and pick up its' : ''}{m.fields.icon_url ? ' icon' : ''}{m.fields.icon_url && m.fields.video_url ? ' and' : ''}{m.fields.video_url ? ' video' : ''}. Clients' logged history is kept.
          </p>
          <div style={{ display: 'flex', gap: 16, fontSize: 13, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={m.fields.icon_url} onChange={e => setM({ ...m, fields: { ...m.fields, icon_url: e.target.checked } })} /> Copy icon</label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={m.fields.video_url} onChange={e => setM({ ...m, fields: { ...m.fields, video_url: e.target.checked } })} /> Copy video</label>
            <span style={{ flex: 1 }} />
            <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => tickAll(true)}>Tick all with a pick</button>
            <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => tickAll(false)}>Untick all</button>
          </div>
          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            {m.rows.map(r => {
              const opt = r.options.find(o => o.item.id === r.pick)
              const cs = !r.pick ? CONF_STYLE.none : opt ? CONF_STYLE[confidence(opt.score)] : { label: 'Your pick', color: 'var(--orange)' }
              const suggested = new Set(r.options.map(o => o.item.id))
              return (
                <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '24px minmax(0,1fr) minmax(0,1.2fr)', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--line)' }}>
                  <input type="checkbox" disabled={!r.pick} checked={r.ticked && !!r.pick} onChange={e => setRow(r.name, { ticked: e.target.checked })} style={{ width: 18, height: 18, accentColor: 'var(--orange)' }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, overflowWrap: 'anywhere' }}>{r.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>in {r.count} program spot{r.count === 1 ? '' : 's'} · <span style={{ color: cs.color }}>{r.pick ? cs.label : r.options.length ? 'Several possible — pick one' : cs.label}</span></div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
                    <select value={r.pick} onChange={e => setRow(r.name, { pick: e.target.value, ticked: !!e.target.value })} style={{ flex: 1, minWidth: 0 }}>
                      <option value="">— leave as is —</option>
                      {r.options.length > 0 && <optgroup label="Suggested">{r.options.map(o => <option key={o.item.id} value={o.item.id}>{o.item.name}</option>)}</optgroup>}
                      <optgroup label="All library exercises">{sorted.filter(x => !suggested.has(x.id)).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>
                    </select>
                    {!r.pick && <button className="btn-ghost" style={{ padding: '4px 8px', fontSize: 12, whiteSpace: 'nowrap' }} title="Add this name to the library as a new exercise" onClick={() => addToLib(r)}>+ Library</button>}
                  </div>
                </div>
              )
            })}
          </div>
          <button className="btn" style={{ marginTop: 12, padding: '10px 18px', fontSize: 13 }} disabled={m.busy || !chosen.length} onClick={apply}>
            {m.busy ? 'Applying…' : `Apply ${chosen.length} match${chosen.length === 1 ? '' : 'es'} (${spots} exercise${spots === 1 ? '' : 's'})`}
          </button>
        </>
      )}
    </div>
  )
}
