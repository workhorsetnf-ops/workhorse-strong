import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const GROUP_COLORS = ['#BF5700', '#7C5CBF', '#3E8E7E', '#B0533E', '#4A6FA5', '#8E6E3E']
const prefixOf = l => (l || '').replace(/[0-9]/g, '')
const isNumbered = l => /^[A-Z]+\d+$/.test(l || '')

function nextFreeLetter(exList) {
  const used = new Set(exList.map(e => prefixOf(e.letter)).filter(Boolean))
  for (let i = 0; i < 26; i++) {
    const L = String.fromCharCode(65 + i)
    if (!used.has(L)) return L
  }
  return 'Z'
}

function defaultReps(metric) {
  return metric === 'time' ? '30 sec' : metric === 'distance' ? '40 yd' : '8-12'
}

// chunk consecutive exercises sharing a numbered prefix (A1/A2 → one group)
function chunkGroups(exList) {
  const out = []
  for (const ex of exList) {
    const prev = out[out.length - 1]
    const pfx = prefixOf(ex.letter)
    if (prev && isNumbered(ex.letter) && prev.prefix === pfx && prev.grouped) {
      prev.items.push(ex)
    } else {
      out.push({ prefix: pfx, grouped: isNumbered(ex.letter), items: [ex] })
    }
  }
  // a "group" of one numbered exercise isn't really a group
  return out.map(g => ({ ...g, grouped: g.grouped && g.items.length > 1 }))
}

export default function CoachPrograms() {
  const [programs, setPrograms] = useState([])
  const [clients, setClients] = useState([])
  const [assignments, setAssignments] = useState([])
  const [open, setOpen] = useState(null)
  const [viewWeek, setViewWeek] = useState(1)
  const [days, setDays] = useState([])
  const [exercises, setExercises] = useState({})
  const [newProgram, setNewProgram] = useState('')
  const [newWeeks, setNewWeeks] = useState(4)
  const [library, setLibrary] = useState([])
  const [condLib, setCondLib] = useState([])
  const [lifeLib, setLifeLib] = useState([])
  const [track, setTrack] = useState('exercise')
  const [quickAdd, setQuickAdd] = useState({})       // dayId -> text
  const [expanded, setExpanded] = useState(null)     // exercise id being edited
  const [edit, setEdit] = useState(null)             // edit form values
  const [editWeeks, setEditWeeks] = useState([])
  const [selected, setSelected] = useState({})       // dayId -> Set of exercise ids
  const [drag, setDrag] = useState({})               // { dayId, index } chunk being dragged
  const [dragOver, setDragOver] = useState({})       // { dayId, index } current drop target
  const [detailsFor, setDetailsFor] = useState(null) // dayId with details editor open
  const [detailsForm, setDetailsForm] = useState({})

  async function load() {
    const [{ data: p }, { data: c }, { data: a }] = await Promise.all([
      supabase.from('programs').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name').eq('role', 'client').order('full_name'),
      supabase.from('program_assignments').select('*'),
    ])
    setPrograms(p || []); setClients(c || []); setAssignments(a || [])
  }
  useEffect(() => {
    load()
    supabase.from('exercise_library').select('*').order('name').then(({ data }) => setLibrary(data || []))
    supabase.from('conditioning_library').select('*').order('name').then(({ data }) => setCondLib(data || []))
    supabase.from('lifestyle_library').select('*').order('name').then(({ data }) => setLifeLib(data || []))
  }, [])

  async function loadDay(dayId) {
    const { data: e } = await supabase.from('program_exercises').select('*').eq('day_id', dayId).order('position')
    setExercises(prev => ({ ...prev, [dayId]: e || [] }))
  }

  async function loadDays(programId) {
    const { data: d } = await supabase.from('program_days').select('*').eq('program_id', programId).order('position')
    setDays(d || [])
    for (const day of d || []) loadDay(day.id)
  }

  function openProgram(id) {
    if (open === id) { setOpen(null); setExpanded(null); return }
    setOpen(id); setExpanded(null); setViewWeek(1); setSelected({}); setTrack('exercise')
    loadDays(id)
  }

  async function createProgram() {
    if (!newProgram.trim()) return
    await supabase.from('programs').insert({ name: newProgram.trim(), weeks: +newWeeks || 4 })
    setNewProgram(''); load()
  }

  async function addWorkout(programId, dayNumber) {
    const label = prompt(track === 'lifestyle' ? 'Lifestyle card name (e.g. Daily Habits):' : 'Workout name (e.g. Upper A):', track === 'lifestyle' ? 'Lifestyle' : 'Workout')
    if (!label) return
    await supabase.from('program_days').insert({ program_id: programId, day_label: label, day_number: dayNumber, position: days.length, track })
    loadDays(programId)
  }
  async function moveWorkout(programId, dayId, dayNumber) {
    await supabase.from('program_days').update({ day_number: +dayNumber }).eq('id', dayId)
    loadDays(programId)
  }
  async function deleteWorkout(programId, dayId) {
    if (!confirm('Delete this workout and its exercises?')) return
    await supabase.from('program_days').delete().eq('id', dayId)
    loadDays(programId)
  }

  // ---- instant add ----
  async function quickAddExercise(program, dayId, fromLib, kind = 'exercise', desc = '') {
    const text = (fromLib?.name || quickAdd[dayId] || '').trim() || (kind === 'conditioning' ? 'Conditioning' : '')
    if (!text) return
    const list = exercises[dayId] || []
    const metric = fromLib?.metric || 'reps'
    const weeks = program.weeks || 4
    await supabase.from('program_exercises').insert({
      day_id: dayId,
      name: text,
      kind,
      description: desc,
      letter: nextFreeLetter(list),
      video_url: fromLib?.video_url || '',
      notes: fromLib?.notes || '',
      metric,
      rest: '',
      progression_type: 'rir',
      sets: 3,
      reps: defaultReps(metric),
      rir: '2',
      week_targets: Array.from({ length: weeks }, () => ({ sets: 3, reps: defaultReps(metric), target: '2' })),
      position: list.length,
    })
    setQuickAdd(q => ({ ...q, [dayId]: '' }))
    loadDay(dayId)
  }

  async function deleteExercise(dayId, exId) {
    await supabase.from('program_exercises').delete().eq('id', exId)
    if (expanded === exId) setExpanded(null)
    loadDay(dayId)
  }

  // ---- inline editor ----
  function startEdit(program, ex) {
    if (expanded === ex.id) { setExpanded(null); return }
    setExpanded(ex.id)
    setEdit({
      letter: ex.letter || '', name: ex.name, video_url: ex.video_url || '', rest: ex.rest || '',
      metric: ex.metric || 'reps', progression_type: ex.progression_type || 'rir',
      based_on_lift: ex.based_on_lift || '',
      kind: ex.kind || 'exercise', description: ex.description || '',
    })
    const weeks = program.weeks || 4
    const wt = Array.isArray(ex.week_targets) ? ex.week_targets : []
    setEditWeeks(Array.from({ length: weeks }, (_, i) => ({
      sets: wt[i]?.sets ?? ex.sets, reps: wt[i]?.reps ?? ex.reps, target: wt[i]?.target ?? ex.rir ?? '2',
    })))
  }

  async function saveEdit(dayId, exId) {
    await supabase.from('program_exercises').update({
      letter: edit.letter.trim().toUpperCase(),
      name: edit.name.trim(),
      video_url: edit.video_url.trim(),
      rest: edit.rest.trim(),
      metric: edit.metric,
      progression_type: edit.progression_type,
      based_on_lift: edit.progression_type === 'percent' ? edit.based_on_lift.trim() : '',
      description: edit.description || '',
      sets: +editWeeks[0]?.sets || 3,
      reps: String(editWeeks[0]?.reps ?? ''),
      week_targets: editWeeks.map(r => ({ sets: +r.sets || 3, reps: String(r.reps), target: String(r.target) })),
    }).eq('id', exId)
    setExpanded(null)
    loadDay(dayId)
  }

  // ---- grouping ----
  function toggleSelect(dayId, exId) {
    setSelected(sel => {
      const cur = new Set(sel[dayId] || [])
      cur.has(exId) ? cur.delete(exId) : cur.add(exId)
      return { ...sel, [dayId]: cur }
    })
  }

  async function groupSelected(dayId) {
    const list = exercises[dayId] || []
    const ids = [...(selected[dayId] || [])]
    if (ids.length < 2) return
    const members = list.filter(e => ids.includes(e.id))
    const others = list.filter(e => !ids.includes(e.id))
    const pfx = nextFreeLetter(others)
    // place group at the position of its first member, renumber everything
    const firstPos = Math.min(...members.map(m => list.indexOf(m)))
    const reordered = [...others.slice(0, firstPos), ...members, ...others.slice(firstPos)]
    let n = 1
    for (let i = 0; i < reordered.length; i++) {
      const e = reordered[i]
      const upd = { position: i }
      if (ids.includes(e.id)) upd.letter = `${pfx}${n++}`
      await supabase.from('program_exercises').update(upd).eq('id', e.id)
    }
    setSelected(sel => ({ ...sel, [dayId]: new Set() }))
    loadDay(dayId)
  }

  async function ungroup(dayId, pfx) {
    const list = exercises[dayId] || []
    for (const e of list.filter(x => prefixOf(x.letter) === pfx && isNumbered(x.letter))) {
      const free = nextFreeLetter(list.filter(x => x.id !== e.id))
      e.letter = free
      await supabase.from('program_exercises').update({ letter: free }).eq('id', e.id)
    }
    loadDay(dayId)
  }

  // ---- workout details ----
  function openDetails(d) {
    if (detailsFor === d.id) { setDetailsFor(null); return }
    setDetailsFor(d.id)
    setDetailsForm({
      notes: d.notes || '', video_note: d.video_note || '',
      warmup: d.warmup || '', warmup_video: d.warmup_video || '',
      cooldown: d.cooldown || '', cooldown_video: d.cooldown_video || '',
    })
  }
  async function saveDetails(programId, dayId) {
    await supabase.from('program_days').update(detailsForm).eq('id', dayId)
    setDetailsFor(null)
    loadDays(programId)
  }

  // ---- drag to reorder ----
  async function reorderChunks(dayId, from, to) {
    if (from == null || to == null || from === to) return
    const chunks = chunkGroups(exercises[dayId] || [])
    const [moved] = chunks.splice(from, 1)
    chunks.splice(to, 0, moved)
    let pos = 0, li = 0
    for (const c of chunks) {
      const L = String.fromCharCode(65 + li); li++
      for (let i = 0; i < c.items.length; i++) {
        await supabase.from('program_exercises').update({
          position: pos++,
          letter: c.grouped ? `${L}${i + 1}` : L,
        }).eq('id', c.items[i].id)
      }
    }
    loadDay(dayId)
  }

  // ---- assignment ----
  async function assign(programId, clientId) {
    if (!clientId) return
    await supabase.from('program_assignments').upsert({ program_id: programId, client_id: clientId, current_week: 1 }, { onConflict: 'client_id' })
    load()
  }
  async function setWeek(assignmentId, week) {
    await supabase.from('program_assignments').update({ current_week: +week }).eq('id', assignmentId)
    load()
  }
  async function setStartDate(assignmentId, date) {
    await supabase.from('program_assignments').update({ start_date: date || null }).eq('id', assignmentId)
    load()
  }
  async function deleteProgram(id) {
    if (!confirm('Delete this program and all its workouts?')) return
    await supabase.from('programs').delete().eq('id', id)
    setOpen(null); load()
  }

  const targetLabel = { rir: 'RIR', rpe: 'RPE', percent: '% of max' }

  function exLine(ex) {
    const wt = Array.isArray(ex.week_targets) ? ex.week_targets[viewWeek - 1] : null
    const sets = wt?.sets ?? ex.sets, reps = wt?.reps ?? ex.reps, target = wt?.target ?? ex.rir
    const t = ex.progression_type === 'percent' ? `${target}%` : ex.progression_type === 'rpe' ? `RPE ${target}` : `RIR ${target}`
    return `${sets} × ${reps} @ ${t}${ex.rest ? `, rest ${ex.rest}` : ''}`
  }

  function renderExercise(program, d, ex, dragIdx = null) {
    const sel = selected[d.id]?.has(ex.id)
    return (
      <div key={ex.id}
        draggable={dragIdx !== null && expanded !== ex.id}
        onDragStart={e => {
          if (dragIdx === null || expanded === ex.id) return
          e.dataTransfer.setData('text/plain', String(dragIdx))
          e.dataTransfer.effectAllowed = 'move'
          setDrag({ dayId: d.id, index: dragIdx })
        }}
        onDragEnd={() => { setDrag({}); setDragOver({}) }}
        style={{ background: 'var(--steel)', borderRadius: 6, padding: '7px 9px', marginBottom: 4, cursor: dragIdx !== null && expanded !== ex.id ? 'grab' : 'default' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
          {dragIdx !== null && (
            <span title="Drag to reorder"
              style={{ color: 'var(--muted)', fontSize: 13, lineHeight: '17px', flexShrink: 0, userSelect: 'none' }}>⠿</span>
          )}
          <input type="checkbox" checked={!!sel} onChange={() => toggleSelect(d.id, ex.id)}
            style={{ width: 15, height: 15, marginTop: 2, accentColor: 'var(--orange)', flexShrink: 0 }} title="Select to group" />
          <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => startEdit(program, ex)}>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>
              {ex.letter && <span style={{ color: 'var(--orange-hot)' }}>{ex.letter}) </span>}{ex.name}
              {ex.video_url && <span style={{ marginLeft: 5, fontSize: 11, color: 'var(--orange-hot)' }}>▶</span>}
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{ex.kind === 'conditioning' ? (ex.description || 'Conditioning — click to add details') : exLine(ex)}</div>
          </div>
          <button onClick={() => deleteExercise(d.id, ex.id)} title="Remove"
            style={{ background: 'none', color: 'var(--muted)', fontSize: 11, flexShrink: 0 }}>✕</button>
        </div>

        {expanded === ex.id && edit && (
          <div style={{ marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '55px 1fr', gap: 6 }}>
              <input value={edit.letter} title="Letter" onChange={e => setEdit({ ...edit, letter: e.target.value })} style={{ padding: '6px 8px', fontSize: 12 }} />
              <input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} style={{ padding: '6px 8px', fontSize: 12 }} />
            </div>
            {edit.kind === 'conditioning' && (
              <textarea rows="3" placeholder="Conditioning description — format, rounds, pacing, notes" value={edit.description} onChange={e => setEdit({ ...edit, description: e.target.value })} style={{ fontSize: 12 }} />
            )}
            {edit.kind !== 'conditioning' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <select value={edit.metric} onChange={e => setEdit({ ...edit, metric: e.target.value })} style={{ padding: '6px 8px', fontSize: 12 }}>
                <option value="reps">Reps</option><option value="time">Time</option><option value="distance">Distance</option>
              </select>
              <select value={edit.progression_type} onChange={e => setEdit({ ...edit, progression_type: e.target.value })} style={{ padding: '6px 8px', fontSize: 12 }}>
                <option value="rir">RIR</option><option value="rpe">RPE</option><option value="percent">% of max</option>
              </select>
            </div>
            )}
            {edit.kind !== 'conditioning' && edit.progression_type === 'percent' && (
              <input placeholder="Based on lift (e.g. Squat)" value={edit.based_on_lift} onChange={e => setEdit({ ...edit, based_on_lift: e.target.value })} style={{ padding: '6px 8px', fontSize: 12 }} />
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <input placeholder="Rest (e.g. 3 mins)" value={edit.rest} onChange={e => setEdit({ ...edit, rest: e.target.value })} style={{ padding: '6px 8px', fontSize: 12 }} />
              <input placeholder="Video URL" value={edit.video_url} onChange={e => setEdit({ ...edit, video_url: e.target.value })} style={{ padding: '6px 8px', fontSize: 12 }} />
            </div>
            {edit.kind !== 'conditioning' && (
            <table className="data" style={{ fontSize: 12 }}>
              <thead><tr><th>Wk</th><th>Sets</th><th>{edit.metric === 'time' ? 'Time' : edit.metric === 'distance' ? 'Dist' : 'Reps'}</th><th>{targetLabel[edit.progression_type]}</th></tr></thead>
              <tbody>
                {editWeeks.map((r, i) => (
                  <tr key={i}>
                    <td className="muted">{i + 1}</td>
                    <td><input style={{ width: 44, padding: '4px 6px', fontSize: 12 }} value={r.sets} onChange={e => setEditWeeks(w => w.map((x, j) => j === i ? { ...x, sets: e.target.value } : x))} /></td>
                    <td><input style={{ width: 62, padding: '4px 6px', fontSize: 12 }} value={r.reps} onChange={e => setEditWeeks(w => w.map((x, j) => j === i ? { ...x, reps: e.target.value } : x))} /></td>
                    <td><input style={{ width: 52, padding: '4px 6px', fontSize: 12 }} value={r.target} onChange={e => setEditWeeks(w => w.map((x, j) => j === i ? { ...x, target: e.target.value } : x))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn" style={{ padding: '7px 14px', fontSize: 12 }} onClick={() => saveEdit(d.id, ex.id)}>Update</button>
              <button className="btn-ghost" style={{ padding: '7px 12px', fontSize: 12 }} onClick={() => setExpanded(null)}>Close</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="eyebrow">Training</div>
      <h1 style={{ fontSize: 28, margin: '6px 0 20px' }}>Programs</h1>

      <div className="card" style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
        <input placeholder="New program name (e.g. Upper/Lower 4x — Block 1)" value={newProgram} onChange={e => setNewProgram(e.target.value)} onKeyDown={e => e.key === 'Enter' && createProgram()} />
        <input inputMode="numeric" style={{ width: 90 }} value={newWeeks} onChange={e => setNewWeeks(e.target.value)} title="Weeks in block" placeholder="Weeks" />
        <button className="btn" style={{ whiteSpace: 'nowrap' }} onClick={createProgram}>Create</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {programs.map(p => {
          const assigned = assignments.filter(a => a.program_id === p.id)
          return (
            <div className="card" key={p.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <strong style={{ fontSize: 16 }}>{p.name}</strong>
                  <span className="muted" style={{ fontSize: 13, marginLeft: 8 }}>{p.weeks}-week block</span>
                  <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>
                    {assigned.length ? `Assigned to ${assigned.length} client(s)` : 'Not assigned'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select style={{ width: 'auto' }} defaultValue="" onChange={e => { assign(p.id, e.target.value); e.target.value = '' }}>
                    <option value="" disabled>Assign to…</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.full_name || c.id.slice(0, 8)}</option>)}
                  </select>
                  <button className="btn-ghost" onClick={() => openProgram(p.id)}>{open === p.id ? 'Close' : 'Open builder'}</button>
                  <button className="btn-ghost" style={{ color: 'var(--red)' }} onClick={() => deleteProgram(p.id)}>Delete</button>
                </div>
              </div>

              {assigned.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {assigned.map(a => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <span>{clients.find(c => c.id === a.client_id)?.full_name || 'Client'}</span>
                      <span className="muted">Week</span>
                      <select style={{ width: 'auto', padding: '4px 8px', fontSize: 13 }} value={a.current_week} onChange={e => setWeek(a.id, e.target.value)}>
                        {Array.from({ length: p.weeks || 4 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                      </select>
                      <span className="muted">starts</span>
                      <input type="date" style={{ width: 'auto', padding: '4px 8px', fontSize: 13 }} value={a.start_date || ''} onChange={e => setStartDate(a.id, e.target.value)} title="Week 1 Day 1 date — anchors the client's calendar" />
                    </div>
                  ))}
                </div>
              )}

              {open === p.id && (
                <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                    <span className="eyebrow" style={{ marginRight: 6 }}>Week</span>
                    {Array.from({ length: p.weeks || 4 }, (_, i) => (
                      <button key={i} className={viewWeek === i + 1 ? 'btn' : 'btn-ghost'}
                        style={{ padding: '6px 14px', fontSize: 13 }}
                        onClick={() => setViewWeek(i + 1)}>{i + 1}</button>
                    ))}
                    <span style={{ display: 'inline-flex', gap: 4, marginLeft: 14 }}>
                      <button className={track === 'exercise' ? 'btn' : 'btn-ghost'} style={{ padding: '6px 14px', fontSize: 13 }} onClick={() => setTrack('exercise')}>Exercise</button>
                      <button className={track === 'lifestyle' ? 'btn' : 'btn-ghost'} style={{ padding: '6px 14px', fontSize: 13 }} onClick={() => setTrack('lifestyle')}>Lifestyle</button>
                    </span>
                    <span className="muted" style={{ fontSize: 12.5, marginLeft: 8 }}>Viewing Week {viewWeek} targets · click an exercise to edit · check boxes to group</span>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(215px, 1fr))', gap: 8, minWidth: 1520 }}>
                      {[1, 2, 3, 4, 5, 6, 7].map(dn => (
                        <div key={dn} style={{ background: 'var(--steel)', borderRadius: 8, padding: 10, minHeight: 220, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className="eyebrow" style={{ fontSize: 10 }}>Day {dn}</span>
                            <button className="btn-ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => addWorkout(p.id, dn)}>+ Add</button>
                          </div>

                          {days.filter(d => d.day_number === dn && (d.track || 'exercise') === track).map(d => {
                            const list = exercises[d.id] || []
                            const groups = chunkGroups(list)
                            const selCount = selected[d.id]?.size || 0
                            const qa = quickAdd[d.id] || ''
                            const matches = track === 'exercise' && qa.trim() ? library.filter(l => (l.name + ' ' + l.category).toLowerCase().includes(qa.toLowerCase())).slice(0, 5) : []
                            const condMatches = track === 'exercise' && qa.trim() ? condLib.filter(l => (l.name + ' ' + l.format + ' ' + l.instructions).toLowerCase().includes(qa.toLowerCase())).slice(0, 4) : []
                            const lifeMatches = track === 'lifestyle' && qa.trim() ? lifeLib.filter(l => (l.name + ' ' + l.category + ' ' + l.instructions).toLowerCase().includes(qa.toLowerCase())).slice(0, 5) : []
                            return (
                              <div key={d.id} style={{ background: 'var(--coal)', border: '1px solid var(--line)', borderRadius: 8, padding: 10 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 6 }}>
                                  <strong style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--orange-hot)' }}>{d.day_label}</strong>
                                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                    <button className="btn-ghost" style={{ padding: '2px 7px', fontSize: 11 }} title="Notes, warmup, cooldown, video note" onClick={() => openDetails(d)}>✎</button>
                                    <select title="Move to day" style={{ width: 'auto', padding: '2px 6px', fontSize: 11 }} value={d.day_number} onChange={e => moveWorkout(p.id, d.id, e.target.value)}>
                                      {[1,2,3,4,5,6,7].map(n => <option key={n} value={n}>D{n}</option>)}
                                    </select>
                                    <button className="btn-ghost" style={{ padding: '2px 7px', fontSize: 11, color: 'var(--red)' }} onClick={() => deleteWorkout(p.id, d.id)}>✕</button>
                                  </div>
                                </div>

                                {detailsFor === d.id && (
                                  <div style={{ background: 'var(--steel)', borderRadius: 7, padding: 8, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <textarea rows="2" placeholder="Coach's notes for this workout" value={detailsForm.notes} onChange={e => setDetailsForm({ ...detailsForm, notes: e.target.value })} style={{ fontSize: 12 }} />
                                    <input placeholder="Loom video note URL (record with Loom, paste the share link)" value={detailsForm.video_note} onChange={e => setDetailsForm({ ...detailsForm, video_note: e.target.value })} style={{ padding: '6px 8px', fontSize: 12 }} />
                                    <textarea rows="2" placeholder="Warmup…" value={detailsForm.warmup} onChange={e => setDetailsForm({ ...detailsForm, warmup: e.target.value })} style={{ fontSize: 12 }} />
                                    <input placeholder="Warmup demo video URL" value={detailsForm.warmup_video} onChange={e => setDetailsForm({ ...detailsForm, warmup_video: e.target.value })} style={{ padding: '6px 8px', fontSize: 12 }} />
                                    <textarea rows="2" placeholder="Cooldown…" value={detailsForm.cooldown} onChange={e => setDetailsForm({ ...detailsForm, cooldown: e.target.value })} style={{ fontSize: 12 }} />
                                    <input placeholder="Cooldown demo video URL" value={detailsForm.cooldown_video} onChange={e => setDetailsForm({ ...detailsForm, cooldown_video: e.target.value })} style={{ padding: '6px 8px', fontSize: 12 }} />
                                    <div style={{ display: 'flex', gap: 6 }}>
                                      <button className="btn" style={{ padding: '7px 14px', fontSize: 12 }} onClick={() => saveDetails(p.id, d.id)}>Save details</button>
                                      <button className="btn-ghost" style={{ padding: '7px 12px', fontSize: 12 }} onClick={() => setDetailsFor(null)}>Close</button>
                                    </div>
                                  </div>
                                )}
                                {(d.notes || d.video_note) && detailsFor !== d.id && (
                                  <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>
                                    {d.notes}{d.video_note && <a href={d.video_note} target="_blank" rel="noreferrer" style={{ marginLeft: d.notes ? 6 : 0 }}>🎥 Video note</a>}
                                  </div>
                                )}
                                {d.warmup && detailsFor !== d.id && (
                                  <div style={{ background: 'var(--steel)', borderRadius: 6, padding: '6px 9px', marginBottom: 5, fontSize: 11.5 }}>
                                    <span className="eyebrow" style={{ fontSize: 9 }}>Warmup</span>
                                    <div className="muted" style={{ marginTop: 2 }}>{d.warmup}{d.warmup_video && <a href={d.warmup_video} target="_blank" rel="noreferrer" style={{ marginLeft: 6 }}>▶</a>}</div>
                                  </div>
                                )}

                                {groups.map((g, gi) => {
                                  const gc = GROUP_COLORS[((g.prefix.charCodeAt(0) || 65) - 65) % GROUP_COLORS.length]
                                  const isOver = dragOver.dayId === d.id && dragOver.index === gi && drag.dayId === d.id && drag.index !== gi
                                  return (
                                    <div key={gi}
                                      onDragEnter={e => { if (drag.dayId === d.id) e.preventDefault() }}
                                      onDragOver={e => { if (drag.dayId === d.id) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver({ dayId: d.id, index: gi }) } }}
                                      onDrop={e => { e.preventDefault(); if (drag.dayId === d.id) reorderChunks(d.id, drag.index, gi); setDrag({}); setDragOver({}) }}
                                      style={{ outline: isOver ? '2px dashed var(--orange)' : 'none', outlineOffset: 2, borderRadius: 7 }}>
                                      {g.grouped ? (
                                        <div style={{ border: `1px solid ${gc}`, borderLeft: `3px solid ${gc}`, borderRadius: 7, padding: '6px 6px 2px', marginBottom: 5 }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: gc }}>
                                              <span draggable
                                                onDragStart={e => { e.dataTransfer.setData('text/plain', String(gi)); e.dataTransfer.effectAllowed = 'move'; setDrag({ dayId: d.id, index: gi }) }}
                                                onDragEnd={() => { setDrag({}); setDragOver({}) }}
                                                title="Drag to reorder"
                                                style={{ cursor: 'grab', fontSize: 13, userSelect: 'none' }}>⠿</span>
                                              {g.items.length === 2 ? 'Superset' : 'Circuit'} {g.prefix}
                                            </span>
                                            <button className="btn-ghost" style={{ padding: '1px 7px', fontSize: 10 }} onClick={() => ungroup(d.id, g.prefix)}>Ungroup</button>
                                          </div>
                                          {g.items.map(ex => renderExercise(p, d, ex))}
                                        </div>
                                      ) : renderExercise(p, d, g.items[0], gi)}
                                    </div>
                                  )
                                })}

                                {selCount >= 2 && (
                                  <button className="btn" style={{ padding: '6px 12px', fontSize: 12, width: '100%', marginBottom: 6 }}
                                    onClick={() => groupSelected(d.id)}>
                                    Group {selCount} as {selCount === 2 ? 'superset' : 'circuit'}
                                  </button>
                                )}

                                {d.cooldown && detailsFor !== d.id && (
                                  <div style={{ background: 'var(--steel)', borderRadius: 6, padding: '6px 9px', marginBottom: 5, fontSize: 11.5 }}>
                                    <span className="eyebrow" style={{ fontSize: 9 }}>Cooldown</span>
                                    <div className="muted" style={{ marginTop: 2 }}>{d.cooldown}{d.cooldown_video && <a href={d.cooldown_video} target="_blank" rel="noreferrer" style={{ marginLeft: 6 }}>▶</a>}</div>
                                  </div>
                                )}
                                <input placeholder="+ Add exercise (type & Enter)" value={qa}
                                  onChange={e => setQuickAdd(q => ({ ...q, [d.id]: e.target.value }))}
                                  onKeyDown={e => e.key === 'Enter' && quickAddExercise(p, d.id, matches.length === 1 ? matches[0] : null)}
                                  style={{ padding: '7px 9px', fontSize: 12.5 }} />
                                {(matches.length > 0 || condMatches.length > 0 || lifeMatches.length > 0) && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
                                    {matches.map(m => (
                                      <button key={m.id} className="btn-ghost" style={{ padding: '5px 9px', fontSize: 12, textAlign: 'left' }}
                                        onClick={() => quickAddExercise(p, d.id, m)}>
                                        {m.name}{m.category ? <span className="muted"> · {m.category}</span> : ''}
                                      </button>
                                    ))}
                                    {condMatches.map(m => (
                                      <button key={m.id} className="btn-ghost" style={{ padding: '5px 9px', fontSize: 12, textAlign: 'left' }}
                                        onClick={() => quickAddExercise(p, d.id, { name: m.name, video_url: m.video_url || '' }, 'conditioning', [m.format, m.instructions].filter(Boolean).join(' — '))}>
                                        <span style={{ color: 'var(--orange-hot)', fontWeight: 800, fontSize: 10, marginRight: 5 }}>COND</span>{m.name}
                                      </button>
                                    ))}
                                    {lifeMatches.map(m => (
                                      <button key={m.id} className="btn-ghost" style={{ padding: '5px 9px', fontSize: 12, textAlign: 'left' }}
                                        onClick={() => quickAddExercise(p, d.id, { name: m.name, video_url: m.video_url || '' }, 'conditioning', m.instructions || '')}>
                                        <span style={{ color: '#3E8E7E', fontWeight: 800, fontSize: 10, marginRight: 5 }}>LIFE</span>{m.name}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                <button className="btn-ghost" style={{ padding: '5px 10px', fontSize: 11.5, width: '100%', marginTop: 5 }}
                                  onClick={() => quickAddExercise(p, d.id, null, 'conditioning')}>{track === 'lifestyle' ? '+ Lifestyle block' : '+ Conditioning block'}</button>
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
