import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { rotationForWeek, weeksForRotation, defaultRotationName, overallWeek, resolveBlockWeek, setTargets, compactSetRows, repsSummary } from '../../lib/weeks'

const GROUP_COLORS = ['#FF5A00', '#7C5CBF', '#3E8E7E', '#B0533E', '#4A6FA5', '#8E6E3E']
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
function chunkGroups(exList) {
  const out = []
  for (const ex of exList) {
    const prev = out[out.length - 1]
    const pfx = prefixOf(ex.letter)
    if (prev && isNumbered(ex.letter) && prev.prefix === pfx && prev.grouped) prev.items.push(ex)
    else out.push({ prefix: pfx, grouped: isNumbered(ex.letter), items: [ex] })
  }
  return out.map(g => ({ ...g, grouped: g.grouped && g.items.length > 1 }))
}

export default function CoachPrograms() {
  const [programs, setPrograms] = useState([])
  const [clients, setClients] = useState([])
  const [assignments, setAssignments] = useState([])
  const [open, setOpen] = useState(null)          // program id open
  const [blocks, setBlocks] = useState({})        // programId -> [blocks]
  const [openBlock, setOpenBlock] = useState(null) // block id open
  const [viewWeek, setViewWeek] = useState(1)
  const [track, setTrack] = useState('exercise')
  const [days, setDays] = useState({})            // blockId -> [days]
  const [rotations, setRotations] = useState({})  // blockId -> [rotations]
  const [activeRot, setActiveRot] = useState(null) // rotation id being edited, or null
  const [openSetRows, setOpenSetRows] = useState(null) // which week row has its per-set editor open
  const [exercises, setExercises] = useState({})  // dayId -> [exercises]
  const [newProgram, setNewProgram] = useState('')
  const [newWeeks, setNewWeeks] = useState(4)
  const [library, setLibrary] = useState([])
  const [condLib, setCondLib] = useState([])
  const [lifeLib, setLifeLib] = useState([])
  const [quickAdd, setQuickAdd] = useState({})
  const [expanded, setExpanded] = useState(null)
  const [edit, setEdit] = useState(null)
  const [editWeeks, setEditWeeks] = useState([])
  const [selected, setSelected] = useState({})
  const [drag, setDrag] = useState({})
  const [dragOver, setDragOver] = useState({})
  const [dayDrag, setDayDrag] = useState(null)      // workout day being dragged: { dayId }
  const [dayDragOverDn, setDayDragOverDn] = useState(null)  // which Day N column is being hovered
  const [exComments, setExComments] = useState({})
  const [exCommentText, setExCommentText] = useState('')
  const [coachUserId, setCoachUserId] = useState(null)

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
    supabase.auth.getUser().then(({ data }) => setCoachUserId(data?.user?.id || null))
    supabase.from('exercise_library').select('*').order('name').then(({ data }) => setLibrary(data || []))
    supabase.from('conditioning_library').select('*').order('name').then(({ data }) => setCondLib(data || []))
    supabase.from('lifestyle_library').select('*').order('name').then(({ data }) => setLifeLib(data || []))
  }, [])

  async function loadBlocks(programId) {
    const { data: b } = await supabase.from('program_blocks').select('*').eq('program_id', programId).order('position')
    setBlocks(prev => ({ ...prev, [programId]: b || [] }))
    return b || []
  }
  async function loadDay(dayId) {
    const { data: e } = await supabase.from('program_exercises').select('*').eq('day_id', dayId).order('position')
    setExercises(prev => ({ ...prev, [dayId]: e || [] }))
  }
  async function loadRotations(blockId) {
    const { data: r } = await supabase.from('program_rotations').select('*').eq('block_id', blockId).order('position')
    setRotations(prev => ({ ...prev, [blockId]: r || [] }))
    return r || []
  }

  async function loadDays(blockId) {
    const { data: d } = await supabase.from('program_days').select('*').eq('block_id', blockId).order('position')
    setDays(prev => ({ ...prev, [blockId]: d || [] }))
    for (const day of d || []) loadDay(day.id)
  }

  async function openProgram(programId) {
    if (open === programId) { setOpen(null); setOpenBlock(null); return }
    setOpen(programId); setOpenBlock(null); setSelected({})
    const bs = await loadBlocks(programId)
    if (bs[0]) openBlockView(bs[0])
  }

  async function openBlockView(block) {
    setOpenBlock(block.id); setViewWeek(1); setTrack('exercise'); setExpanded(null)
    loadDays(block.id)
    const r = await loadRotations(block.id)
    setActiveRot(r[0]?.id || null)
  }

  async function createProgram() {
    if (!newProgram.trim()) return
    const weeks = +newWeeks || 4
    const { data: prog } = await supabase.from('programs').insert({ name: newProgram.trim(), weeks }).select().single()
    if (prog) await supabase.from('program_blocks').insert({ program_id: prog.id, name: 'Block 1', weeks, position: 0 })
    setNewProgram(''); load()
  }

  async function addBlock(programId) {
    const name = prompt('Block name (e.g. Block 2 — Strength):', `Block ${(blocks[programId]?.length || 0) + 1}`)
    if (!name) return
    const weeks = +prompt('Weeks in this block:', '4') || 4
    await supabase.from('program_blocks').insert({ program_id: programId, name, weeks, position: (blocks[programId]?.length || 0) })
    // recompute program total weeks
    const bs = await loadBlocks(programId)
    const total = bs.reduce((s, b) => s + b.weeks, 0) + weeks
    await supabase.from('programs').update({ weeks: total }).eq('id', programId)
    load(); loadBlocks(programId)
  }

  async function renameBlock(programId, block) {
    const name = prompt('Block name:', block.name)
    if (!name) return
    const weeks = +prompt('Weeks in this block:', block.weeks) || block.weeks
    await supabase.from('program_blocks').update({ name, weeks }).eq('id', block.id)
    const bs = await loadBlocks(programId)
    const total = bs.reduce((s, b) => s + (b.id === block.id ? weeks : b.weeks), 0)
    await supabase.from('programs').update({ weeks: total }).eq('id', programId)
    load()
  }

  async function deleteBlock(programId, blockId) {
    if (!confirm('Delete this block and all its workouts?')) return
    await supabase.from('program_blocks').delete().eq('id', blockId)
    if (openBlock === blockId) setOpenBlock(null)
    const bs = await loadBlocks(programId)
    const total = bs.reduce((s, b) => s + b.weeks, 0)
    await supabase.from('programs').update({ weeks: total }).eq('id', programId)
    load()
  }

  // ---- rotations ----
  // Two rotations is the normal case (an A week and a B week), so the first
  // click creates the pair rather than making him add one, then the other.
  async function startRotations(blockId) {
    if (!confirm('Split this block into alternating weeks?\n\nRotation A runs weeks 1, 3, 5…\nRotation B runs weeks 2, 4, 6…\n\nWorkouts already in this block stay put and run every week until you assign them to a rotation.')) return
    const rows = [0, 1].map(i => ({ block_id: blockId, name: defaultRotationName(i), position: i }))
    await supabase.from('program_rotations').insert(rows)
    const r = await loadRotations(blockId)
    setActiveRot(r[0]?.id || null)
    setViewWeek(1)
  }

  async function addRotation(blockId) {
    const list = rotations[blockId] || []
    const name = prompt('Rotation name:', defaultRotationName(list.length))
    if (!name) return
    await supabase.from('program_rotations').insert({ block_id: blockId, name: name.trim(), position: list.length })
    loadRotations(blockId)
  }

  async function renameRotation(blockId, rot) {
    const name = prompt('Rotation name:', rot.name)
    if (!name || name.trim() === rot.name) return
    await supabase.from('program_rotations').update({ name: name.trim() }).eq('id', rot.id)
    loadRotations(blockId)
  }

  async function deleteRotation(blockId, rot) {
    const list = rotations[blockId] || []
    const affected = (days[blockId] || []).filter(d => d.rotation_id === rot.id).length
    const warn = affected
      ? `\n\n${affected} workout(s) are in this rotation. They will NOT be deleted — they'll go back to running every week, and you can reassign them.`
      : ''
    const tail = list.length === 2
      ? '\n\nWith only one rotation left the block stops alternating and every workout runs every week.'
      : ''
    if (!confirm(`Delete "${rot.name}"?${warn}${tail}`)) return
    await supabase.from('program_rotations').delete().eq('id', rot.id)
    const r = await loadRotations(blockId)
    setActiveRot(r[0]?.id || null)
    setViewWeek(1)
    loadDays(blockId)
  }

  async function setDayRotation(blockId, dayId, rotationId) {
    await supabase.from('program_days').update({ rotation_id: rotationId || null }).eq('id', dayId)
    loadDays(blockId)
  }

  async function addWorkout(blockId, dayNumber) {
    const label = prompt(track === 'lifestyle' ? 'Lifestyle card name:' : 'Workout name (e.g. Upper A):', track === 'lifestyle' ? 'Lifestyle' : 'Workout')
    if (!label) return
    const { error } = await supabase.from('program_days').insert({
      program_id: open, block_id: blockId, day_label: label, day_number: dayNumber,
      position: (days[blockId]?.length || 0), track,
      rotation_id: (rotations[blockId]?.length ? activeRot : null) || null,
    })
    if (error) { alert('Could not add workout: ' + error.message); return }
    loadDays(blockId)
  }
  async function moveWorkout(blockId, dayId, dayNumber) {
    await supabase.from('program_days').update({ day_number: +dayNumber }).eq('id', dayId)
    loadDays(blockId)
  }
  async function renameWorkout(blockId, day) {
    const label = prompt('Workout name:', day.day_label)
    if (!label || !label.trim()) return
    await supabase.from('program_days').update({ day_label: label.trim() }).eq('id', day.id)
    loadDays(blockId)
  }
  async function deleteWorkout(blockId, dayId) {
    if (!confirm('Delete this workout and its exercises?')) return
    await supabase.from('program_days').delete().eq('id', dayId)
    loadDays(blockId)
  }

  function currentBlockObj() {
    for (const arr of Object.values(blocks)) {
      const b = arr.find(x => x.id === openBlock)
      if (b) return b
    }
    return null
  }

  async function quickAddExercise(block, dayId, fromLib, kind = 'exercise', desc = '') {
    const text = (fromLib?.name || quickAdd[dayId] || '').trim() || (kind === 'conditioning' ? 'Conditioning' : '')
    if (!text) return
    const list = exercises[dayId] || []
    const metric = fromLib?.metric || 'reps'
    const weeks = block.weeks || 4
    await supabase.from('program_exercises').insert({
      day_id: dayId, name: text, kind, description: desc,
      tracking_type: fromLib?.tracking_type || '',
      letter: nextFreeLetter(list),
      video_url: fromLib?.video_url || '', notes: fromLib?.notes || '', icon_url: fromLib?.icon_url || null,
      metric, rest: '', progression_type: 'rir', sets: 3, reps: defaultReps(metric), rir: '2',
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

  async function loadExComments(exId) {
    const { data } = await supabase.from('exercise_comments').select('*').eq('exercise_id', exId).order('created_at')
    setExComments(c => ({ ...c, [exId]: data || [] }))
  }
  async function sendExComment(exId) {
    if (!exCommentText.trim() || !coachUserId) return
    const body = exCommentText.trim()
    setExCommentText('')
    await supabase.from('exercise_comments').insert({ exercise_id: exId, author_id: coachUserId, body })
    loadExComments(exId)
  }

  function startEdit(block, ex) {
    if (expanded === ex.id) { setExpanded(null); return }
    setExpanded(ex.id)
    loadExComments(ex.id)
    setEdit({
      letter: ex.letter || '', name: ex.name, video_url: ex.video_url || '', rest: ex.rest || '',
      metric: ex.metric || 'reps', progression_type: ex.progression_type || 'rir',
      based_on_lift: ex.based_on_lift || '', kind: ex.kind || 'exercise', description: ex.description || '',
      icon_url: ex.icon_url || '',
    })
    const weeks = block.weeks || 4
    const wt = Array.isArray(ex.week_targets) ? ex.week_targets : []
    setEditWeeks(Array.from({ length: weeks }, (_, i) => ({
      sets: wt[i]?.sets ?? ex.sets, reps: wt[i]?.reps ?? ex.reps, target: wt[i]?.target ?? ex.rir ?? '2',
      ...(Array.isArray(wt[i]?.setRows) ? { setRows: wt[i].setRows } : {}),
    })))
    setOpenSetRows(null)
  }

  // Open the per-set editor for one week, seeded from that week's base values so
  // it starts as what's already programmed rather than a row of empty boxes.
  function openPerSet(weekIdx) {
    if (openSetRows === weekIdx) { setOpenSetRows(null); return }
    setEditWeeks(w => w.map((x, j) => {
      if (j !== weekIdx || Array.isArray(x.setRows)) return x
      const n = +x.sets || 3
      return { ...x, setRows: Array.from({ length: n }, () => ({ reps: String(x.reps ?? ''), target: String(x.target ?? '') })) }
    }))
    setOpenSetRows(weekIdx)
  }

  function updateSetRow(weekIdx, setIdx, field, value) {
    setEditWeeks(w => w.map((x, j) => {
      if (j !== weekIdx) return x
      const n = +x.sets || 3
      const rows = Array.from({ length: n }, (_, i) => x.setRows?.[i] || { reps: String(x.reps ?? ''), target: String(x.target ?? '') })
      rows[setIdx] = { ...rows[setIdx], [field]: value }
      return { ...x, setRows: rows }
    }))
  }

  // Copy one week's set structure across every week this exercise runs. Loads
  // usually progress week to week, but the SHAPE of the session rarely changes,
  // so retyping it in eight columns is the wrong default.
  function applySetRowsToAllWeeks(weekIdx) {
    setEditWeeks(w => {
      const src = w[weekIdx]
      if (!src?.setRows) return w
      return w.map((x, j) => j === weekIdx ? x : ({ ...x, setRows: src.setRows.map(r => ({ ...r })) }))
    })
  }

  function clearSetRows(weekIdx) {
    setEditWeeks(w => w.map((x, j) => {
      if (j !== weekIdx) return x
      const { setRows, ...rest } = x
      return rest
    }))
    setOpenSetRows(null)
  }

  async function uploadExerciseIcon(file) {
    if (!file) return
    const path = `${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('exercise-icons').upload(path, file)
    if (error) { alert('Upload failed: ' + error.message); return }
    const { data } = supabase.storage.from('exercise-icons').getPublicUrl(path)
    setEdit(e => ({ ...e, icon_url: data.publicUrl }))
  }

  async function saveEdit(dayId, exId) {
    await supabase.from('program_exercises').update({
      letter: edit.letter.trim().toUpperCase(), name: edit.name.trim(), video_url: edit.video_url.trim(),
      rest: edit.rest.trim(), metric: edit.metric, progression_type: edit.progression_type,
      based_on_lift: edit.progression_type === 'percent' ? edit.based_on_lift.trim() : '',
      description: edit.description || '', icon_url: edit.icon_url || null,
      sets: +editWeeks[0]?.sets || 3, reps: String(editWeeks[0]?.reps ?? ''),
      week_targets: editWeeks.map(r => {
        const sets = +r.sets || 3
        const entry = { sets, reps: String(r.reps), target: String(r.target) }
        if (Array.isArray(r.setRows)) {
          entry.setRows = Array.from({ length: sets }, (_, i) => ({
            reps: String(r.setRows[i]?.reps ?? ''), target: String(r.setRows[i]?.target ?? ''),
          }))
        }
        // strip it back out if every set ended up matching the base, so opening
        // the editor and changing nothing leaves no stale data behind
        return compactSetRows(entry)
      }),
    }).eq('id', exId)
    setExpanded(null)
    loadDay(dayId)
  }

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
      await supabase.from('program_exercises').update({ letter: free }).eq('id', e.id)
    }
    loadDay(dayId)
  }

  async function reorderChunks(dayId, from, to) {
    if (from == null || to == null || from === to) return
    const chunks = chunkGroups(exercises[dayId] || [])
    const [moved] = chunks.splice(from, 1)
    chunks.splice(to, 0, moved)
    let pos = 0, li = 0
    for (const c of chunks) {
      const L = String.fromCharCode(65 + li); li++
      for (let i = 0; i < c.items.length; i++) {
        await supabase.from('program_exercises').update({ position: pos++, letter: c.grouped ? `${L}${i + 1}` : L }).eq('id', c.items[i].id)
      }
    }
    loadDay(dayId)
  }

  async function assign(programId, clientId) {
    if (!clientId) return
    const bs = blocks[programId] || await loadBlocks(programId)
    await supabase.from('program_assignments').upsert({
      program_id: programId, client_id: clientId, current_week: 1, current_block_id: bs[0]?.id || null,
    }, { onConflict: 'client_id' })
    load()
  }
  async function setWeek(assignmentId, week) {
    await supabase.from('program_assignments').update({ current_week: +week }).eq('id', assignmentId)
    load()
  }
  async function setAssignBlock(assignmentId, blockId) {
    await supabase.from('program_assignments').update({ current_block_id: blockId, current_week: 1 }).eq('id', assignmentId)
    load()
  }
  async function setWeekMode(assignmentId, mode) {
    await supabase.from('program_assignments').update({ week_mode: mode }).eq('id', assignmentId)
    load()
  }
  async function setStartDate(assignmentId, date) {
    await supabase.from('program_assignments').update({ start_date: date || null }).eq('id', assignmentId)
    load()
  }
  async function duplicateProgram(program) {
    const newName = prompt('Name for the duplicate:', `${program.name} (Copy)`)
    if (!newName) return
    const { data: newProg } = await supabase.from('programs').insert({ name: newName.trim(), weeks: program.weeks }).select().single()
    if (!newProg) return
    const srcBlocks = await supabase.from('program_blocks').select('*').eq('program_id', program.id).order('position')
    for (const b of srcBlocks.data || []) {
      const { data: newBlock } = await supabase.from('program_blocks').insert({ program_id: newProg.id, name: b.name, weeks: b.weeks, position: b.position }).select().single()
      if (!newBlock) continue
      // rotations first, so each copied day can point at the COPY of its rotation
      // rather than at the original program's row
      const rotMap = {}
      const srcRots = await supabase.from('program_rotations').select('*').eq('block_id', b.id).order('position')
      for (const r of srcRots.data || []) {
        const { data: newRot } = await supabase.from('program_rotations')
          .insert({ block_id: newBlock.id, name: r.name, position: r.position }).select().single()
        if (newRot) rotMap[r.id] = newRot.id
      }
      const srcDays = await supabase.from('program_days').select('*').eq('block_id', b.id).order('position')
      for (const d of srcDays.data || []) {
        const { data: newDay } = await supabase.from('program_days').insert({
          program_id: newProg.id, block_id: newBlock.id, day_label: d.day_label, day_number: d.day_number,
          track: d.track, position: d.position, notes: d.notes, video_note: d.video_note,
          warmup: d.warmup, warmup_video: d.warmup_video, cooldown: d.cooldown, cooldown_video: d.cooldown_video,
          rotation_id: d.rotation_id ? (rotMap[d.rotation_id] || null) : null,
        }).select().single()
        if (!newDay) continue
        const srcEx = await supabase.from('program_exercises').select('*').eq('day_id', d.id).order('position')
        for (const ex of srcEx.data || []) {
          const { id, day_id, ...rest } = ex
          await supabase.from('program_exercises').insert({ ...rest, day_id: newDay.id })
        }
      }
    }
    load()
    alert(`"${newName}" created — find it at the top of your programs list.`)
  }

  async function renameProgram(program) {
    const name = prompt('Program name:', program.name)
    if (!name || !name.trim()) return
    await supabase.from('programs').update({ name: name.trim() }).eq('id', program.id)
    load()
  }

  async function deleteProgram(id) {
    if (!confirm('Delete this program and all its blocks/workouts?')) return
    await supabase.from('programs').delete().eq('id', id)
    setOpen(null); setOpenBlock(null); load()
  }

  const targetLabel = { rir: 'RIR', rpe: 'RPE', percent: '% of max' }

  function exLine(ex) {
    const wt = Array.isArray(ex.week_targets) ? ex.week_targets[viewWeek - 1] : null
    const sets = wt?.sets ?? ex.sets, reps = wt?.reps ?? ex.reps, target = wt?.target ?? ex.rir
    const t = ex.progression_type === 'percent' ? `${target}%` : ex.progression_type === 'rpe' ? `RPE ${target}` : `RIR ${target}`
    return `${sets} × ${reps} @ ${t}${ex.rest ? `, rest ${ex.rest}` : ''}`
  }

  function renderExercise(block, d, ex, dragIdx = null) {
    const sel = selected[d.id]?.has(ex.id)
    // A day inherits its run-weeks from the rotation it sits in. A day with no
    // rotation runs every week, and weeksForRotation returns all weeks for it.
    const editRunWeeks = weeksForRotation(rotations[block.id] || [], d.rotation_id, block.weeks || 4)
    return (
      <div key={ex.id}
        draggable={dragIdx !== null && expanded !== ex.id}
        onDragStart={e => { if (dragIdx === null || expanded === ex.id) return; e.dataTransfer.setData('text/plain', String(dragIdx)); e.dataTransfer.effectAllowed = 'move'; setDrag({ dayId: d.id, index: dragIdx }) }}
        onDragEnd={() => { setDrag({}); setDragOver({}) }}
        style={{ background: 'var(--steel)', borderRadius: 6, padding: '7px 9px', marginBottom: 4, cursor: dragIdx !== null && expanded !== ex.id ? 'grab' : 'default' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
          {dragIdx !== null && <span title="Drag to reorder" style={{ color: 'var(--muted)', fontSize: 13, lineHeight: '17px', flexShrink: 0, userSelect: 'none' }}>⠿</span>}
          <input type="checkbox" checked={!!sel} onChange={() => toggleSelect(d.id, ex.id)}
            style={{ width: 15, height: 15, marginTop: 2, accentColor: 'var(--orange)', flexShrink: 0 }} title="Select to group" />
          {ex.icon_url && <img className="thumb" src={ex.icon_url} alt="" style={{ width: 36, height: 36, borderRadius: 7, objectFit: 'cover', flexShrink: 0 }} />}
          <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => startEdit(block, ex)}>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>
              {ex.letter && <span style={{ color: 'var(--orange-hot)' }}>{ex.letter}) </span>}{ex.name}
              {ex.video_url && <span style={{ marginLeft: 5, fontSize: 11, color: 'var(--orange-hot)' }}>▶</span>}
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{ex.kind === 'conditioning' ? (ex.description || 'Conditioning — click to add details') : exLine(ex)}</div>
          </div>
          <button onClick={() => deleteExercise(d.id, ex.id)} title="Remove" style={{ background: 'none', color: 'var(--muted)', fontSize: 11, flexShrink: 0 }}>✕</button>
        </div>

        {expanded === ex.id && edit && (
          <div style={{ marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {edit.icon_url && <img src={edit.icon_url} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover' }} />}
              <label className="btn-ghost" style={{ padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>
                {edit.icon_url ? 'Replace icon' : '+ Icon'}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadExerciseIcon(e.target.files[0])} />
              </label>
              {edit.icon_url && <button className="btn-ghost" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setEdit(e => ({ ...e, icon_url: '' }))}>Remove</button>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '55px 1fr', gap: 6 }}>
              <input value={edit.letter} title="Letter" onChange={e => setEdit({ ...edit, letter: e.target.value })} style={{ padding: '6px 8px', fontSize: 12 }} />
              <input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} style={{ padding: '6px 8px', fontSize: 12 }} />
            </div>
            {edit.kind === 'conditioning' && (
              <textarea rows="3" placeholder="Conditioning description" value={edit.description} onChange={e => setEdit({ ...edit, description: e.target.value })} style={{ fontSize: 12 }} />
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
              <input placeholder="Based on lift" value={edit.based_on_lift} onChange={e => setEdit({ ...edit, based_on_lift: e.target.value })} style={{ padding: '6px 8px', fontSize: 12 }} />
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <input placeholder="Rest" value={edit.rest} onChange={e => setEdit({ ...edit, rest: e.target.value })} style={{ padding: '6px 8px', fontSize: 12 }} />
              <input placeholder="Video URL" value={edit.video_url} onChange={e => setEdit({ ...edit, video_url: e.target.value })} style={{ padding: '6px 8px', fontSize: 12 }} />
            </div>
            {edit.kind !== 'conditioning' && (
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table className="data" style={{ fontSize: 12, minWidth: 230 }}>
                  <thead><tr><th>Wk</th><th>Sets</th><th>{edit.metric === 'time' ? 'Time' : edit.metric === 'distance' ? 'Dist' : 'Reps'}</th><th style={{ color: 'var(--orange-hot)' }}>{targetLabel[edit.progression_type]}</th><th></th></tr></thead>
                  <tbody>
                    {editWeeks.map((r, i) => {
                      // week_targets stays indexed by CALENDAR week, so rotation A
                      // fills 1,3,5,7 and the weeks it never sees are greyed out
                      // rather than hidden — the week numbers still line up.
                      const runs = editRunWeeks.includes(i + 1)
                      return (
                      <tr key={i} style={{ opacity: runs ? 1 : 0.32 }}>
                        <td className="muted">{i + 1}{!runs && <span style={{ fontSize: 9.5, marginLeft: 3 }}>—</span>}</td>
                        <td><input disabled={!runs} title={runs ? '' : 'This rotation does not run in week ' + (i + 1)} style={{ width: 40, padding: '4px 5px', fontSize: 12 }} value={r.sets} onChange={e => setEditWeeks(w => w.map((x, j) => j === i ? { ...x, sets: e.target.value } : x))} /></td>
                        <td><input disabled={!runs} style={{ width: 50, padding: '4px 5px', fontSize: 12 }} value={r.reps} onChange={e => setEditWeeks(w => w.map((x, j) => j === i ? { ...x, reps: e.target.value } : x))} /></td>
                        <td><input disabled={!runs} style={{ width: 46, padding: '4px 5px', fontSize: 12, borderColor: runs ? 'var(--orange)' : 'var(--line)' }} value={r.target} onChange={e => setEditWeeks(w => w.map((x, j) => j === i ? { ...x, target: e.target.value } : x))} /></td>
                        <td>
                          <button className="btn-ghost" disabled={!runs}
                            title={r.setRows ? 'This week has per-set targets' : 'Give each set its own reps and load'}
                            style={{ padding: '3px 7px', fontSize: 10.5, opacity: runs ? 1 : 0.4, color: r.setRows ? 'var(--orange)' : undefined }}
                            onClick={() => runs && openPerSet(i)}>
                            {r.setRows ? repsSummary({ ...r, sets: +r.sets || 3 }, ex) : 'per set'}
                          </button>
                        </td>
                      </tr>
                      )
                    })}
                    {/* The per-set editor sits directly under the week it belongs
                        to, so it's obvious which week you're editing. */}
                    {openSetRows !== null && editWeeks[openSetRows] && (
                      <tr>
                        <td colSpan={5} style={{ paddingTop: 6 }}>
                          <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
                              <span className="eyebrow" style={{ fontSize: 10 }}>Week {openSetRows + 1} · per set</span>
                              <span style={{ display: 'flex', gap: 6 }}>
                                <button className="btn-ghost" style={{ padding: '3px 8px', fontSize: 11 }}
                                  onClick={() => applySetRowsToAllWeeks(openSetRows)}>Same every week</button>
                                <button className="btn-ghost" style={{ padding: '3px 8px', fontSize: 11, color: 'var(--red)' }}
                                  onClick={() => clearSetRows(openSetRows)}>Back to one range</button>
                              </span>
                            </div>
                            {Array.from({ length: +editWeeks[openSetRows].sets || 3 }, (_, si) => {
                              const row = editWeeks[openSetRows].setRows?.[si] || {}
                              return (
                                <div key={si} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                                  <span className="muted" style={{ fontSize: 11, fontWeight: 800 }}>S{si + 1}</span>
                                  <input placeholder="reps" style={{ padding: '4px 6px', fontSize: 12 }}
                                    value={row.reps ?? ''} onChange={e => updateSetRow(openSetRows, si, 'reps', e.target.value)} />
                                  <input placeholder={edit.progression_type === 'percent' ? '%' : edit.progression_type === 'rpe' ? 'RPE' : 'RIR'}
                                    style={{ padding: '4px 6px', fontSize: 12, borderColor: 'var(--orange)' }}
                                    value={row.target ?? ''} onChange={e => updateSetRow(openSetRows, si, 'target', e.target.value)} />
                                </div>
                              )
                            })}
                            <p className="muted" style={{ fontSize: 10.5, marginTop: 4 }}>
                              Leave a box empty to use week {openSetRows + 1}'s main value for that set.
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            <div>
              <span className="eyebrow" style={{ fontSize: 10 }}>Notes on this exercise (visible to client)</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 140, overflowY: 'auto', marginTop: 6 }}>
                {(exComments[ex.id] || []).map(c => (
                  <div key={c.id} style={{ fontSize: 12 }}>
                    <strong>{c.author_id === coachUserId ? 'You' : 'Client'}: </strong>{c.body}
                  </div>
                ))}
                {(exComments[ex.id] || []).length === 0 && <p className="muted" style={{ fontSize: 11.5 }}>No notes yet.</p>}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input placeholder="Cue, correction, or note for next time…" value={exCommentText} onChange={e => setExCommentText(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendExComment(ex.id)} style={{ padding: '6px 8px', fontSize: 12 }} />
                <button className="btn-ghost" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => sendExComment(ex.id)}>Add</button>
              </div>
            </div>
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
        <input placeholder="New program name (e.g. Off-Season 12-Week)" value={newProgram} onChange={e => setNewProgram(e.target.value)} onKeyDown={e => e.key === 'Enter' && createProgram()} />
        <input inputMode="numeric" style={{ width: 130 }} value={newWeeks} onChange={e => setNewWeeks(e.target.value)} title="Weeks in first block" placeholder="Block 1 weeks" />
        <button className="btn" style={{ whiteSpace: 'nowrap' }} onClick={createProgram}>Create</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {programs.map(p => {
          const assigned = assignments.filter(a => a.program_id === p.id)
          const pBlocks = blocks[p.id] || []
          const activeBlock = pBlocks.find(b => b.id === openBlock)
          return (
            <div className="card" key={p.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <strong onClick={() => renameProgram(p)} title="Click to rename" style={{ fontSize: 16, cursor: 'pointer' }}>{p.name} <span style={{ fontSize: 11, opacity: 0.6 }}>✎</span></strong>
                  <span className="muted" style={{ fontSize: 13, marginLeft: 8 }}>{p.weeks} total weeks</span>
                  <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>{assigned.length ? `Assigned to ${assigned.length} client(s)` : 'Not assigned'}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select style={{ width: 'auto' }} defaultValue="" onChange={e => { assign(p.id, e.target.value); e.target.value = '' }}>
                    <option value="" disabled>Assign to…</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.full_name || c.id.slice(0, 8)}</option>)}
                  </select>
                  <button className="btn-ghost" onClick={() => openProgram(p.id)}>{open === p.id ? 'Close' : 'Open builder'}</button>
                  <button className="btn-ghost" onClick={() => duplicateProgram(p)}>Duplicate</button>
                  <button className="btn-ghost" style={{ color: 'var(--red)' }} onClick={() => deleteProgram(p.id)}>Delete</button>
                </div>
              </div>

              {assigned.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {assigned.map(a => {
                    const auto = a.week_mode === 'auto'
                    // what auto WOULD put them on right now, shown next to the
                    // toggle so switching a client over is never a guess
                    const derived = resolveBlockWeek(blocks[p.id] || [], overallWeek(a.start_date))
                    return (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, flexWrap: 'wrap' }}>
                      <span style={{ minWidth: 90 }}>{clients.find(c => c.id === a.client_id)?.full_name || 'Client'}</span>
                      <select style={{ width: 'auto', padding: '4px 8px', fontSize: 13 }} value={a.current_block_id || ''} onChange={e => setAssignBlock(a.id, e.target.value)} disabled={auto}>
                        {(blocks[p.id] || []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                      <span className="muted">week</span>
                      <select style={{ width: 'auto', padding: '4px 8px', fontSize: 13 }} value={a.current_week} onChange={e => setWeek(a.id, e.target.value)} disabled={auto}>
                        {Array.from({ length: (blocks[p.id] || []).find(b => b.id === a.current_block_id)?.weeks || 4 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                      </select>
                      <span className="muted">starts</span>
                      <input type="date" style={{ width: 'auto', padding: '4px 8px', fontSize: 13 }} value={a.start_date || ''} onChange={e => setStartDate(a.id, e.target.value)} title="Block 1 / Week 1 / Day 1 date" />
                      <button className={auto ? 'btn' : 'btn-ghost'} style={{ padding: '4px 10px', fontSize: 12 }}
                        title={a.start_date
                          ? 'Advance this client\u2019s week automatically from their start date'
                          : 'Set a start date first \u2014 auto has nothing to count from'}
                        onClick={() => setWeekMode(a.id, auto ? 'manual' : 'auto')}>
                        {auto ? 'Auto' : 'Manual'}
                      </button>
                      {auto && (
                        <span className="muted" style={{ fontSize: 12 }}>
                          {derived ? `now on ${derived.block.name} · week ${derived.weekInBlock}` : 'no start date — falling back to the week above'}
                        </span>
                      )}
                      {!auto && derived && (
                        <span className="muted" style={{ fontSize: 12, opacity: 0.75 }}>
                          auto would be {derived.block.name} · wk {derived.weekInBlock}
                        </span>
                      )}
                    </div>
                    )
                  })}
                </div>
              )}

              {open === p.id && (
                <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                    <span className="eyebrow" style={{ marginRight: 4 }}>Blocks</span>
                    {pBlocks.map(b => (
                      <span key={b.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                        <button className={openBlock === b.id ? 'btn' : 'btn-ghost'} style={{ padding: '6px 12px', fontSize: 13, borderRadius: '8px 0 0 8px' }}
                          onClick={() => openBlockView(b)}>
                          {b.name} <span className="muted" style={{ fontSize: 11 }}>({b.weeks}w)</span>
                        </button>
                        <button className={openBlock === b.id ? 'btn' : 'btn-ghost'} title="Rename or change week count"
                          style={{ padding: '6px 9px', fontSize: 12, borderRadius: '0 8px 8px 0', borderLeft: openBlock === b.id ? '1px solid rgba(255,255,255,0.25)' : '1px solid var(--line)' }}
                          onClick={() => renameBlock(p.id, b)}>✎</button>
                      </span>
                    ))}
                    <button className="btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => addBlock(p.id)}>+ Block</button>
                    {pBlocks.length > 1 && activeBlock && (
                      <button className="btn-ghost" style={{ padding: '6px 10px', fontSize: 12, color: 'var(--red)' }} onClick={() => deleteBlock(p.id, activeBlock.id)}>Delete block</button>
                    )}
                  </div>

                  {activeBlock && (
                    <>
                      {(() => {
                        const rots = rotations[activeBlock.id] || []
                        const runWeeks = rots.length
                          ? weeksForRotation(rots, activeRot, activeBlock.weeks || 4)
                          : Array.from({ length: activeBlock.weeks || 4 }, (_, i) => i + 1)
                        return (
                          <>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                              <span className="eyebrow" style={{ marginRight: 4 }}>Rotation</span>
                              {rots.length === 0 && (
                                <>
                                  <span className="muted" style={{ fontSize: 12.5 }}>Every week is the same in this block.</span>
                                  <button className="btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => startRotations(activeBlock.id)}>+ Alternate weeks</button>
                                </>
                              )}
                              {rots.map(r => (
                                <span key={r.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
                                  <button className={activeRot === r.id ? 'btn' : 'btn-ghost'}
                                    style={{ padding: '6px 12px', fontSize: 13, borderRadius: '8px 0 0 8px' }}
                                    onClick={() => { setActiveRot(r.id); setViewWeek(weeksForRotation(rots, r.id, activeBlock.weeks || 4)[0] || 1) }}>
                                    {r.name}
                                    <span className="muted" style={{ fontSize: 11, marginLeft: 5 }}>
                                      wk {weeksForRotation(rots, r.id, activeBlock.weeks || 4).join(', ')}
                                    </span>
                                  </button>
                                  <button className={activeRot === r.id ? 'btn' : 'btn-ghost'} title="Rename"
                                    style={{ padding: '6px 9px', fontSize: 12, borderRadius: 0, borderLeft: activeRot === r.id ? '1px solid rgba(255,255,255,0.25)' : '1px solid var(--line)' }}
                                    onClick={() => renameRotation(activeBlock.id, r)}>✎</button>
                                  <button className={activeRot === r.id ? 'btn' : 'btn-ghost'} title="Delete rotation"
                                    style={{ padding: '6px 9px', fontSize: 12, borderRadius: '0 8px 8px 0', color: 'var(--red)', borderLeft: activeRot === r.id ? '1px solid rgba(255,255,255,0.25)' : '1px solid var(--line)' }}
                                    onClick={() => deleteRotation(activeBlock.id, r)}>✕</button>
                                </span>
                              ))}
                              {rots.length > 0 && (
                                <button className="btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => addRotation(activeBlock.id)}>+ Rotation</button>
                              )}
                            </div>

                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                              <span className="eyebrow" style={{ marginRight: 6 }}>Week</span>
                              {Array.from({ length: activeBlock.weeks || 4 }, (_, i) => {
                                const wk = i + 1
                                const runs = runWeeks.includes(wk)
                                return (
                                  <button key={i} className={viewWeek === wk ? 'btn' : 'btn-ghost'} disabled={!runs}
                                    title={runs ? '' : 'This rotation does not run in week ' + wk}
                                    style={{ padding: '6px 14px', fontSize: 13, opacity: runs ? 1 : 0.3, cursor: runs ? 'pointer' : 'default' }}
                                    onClick={() => runs && setViewWeek(wk)}>{wk}</button>
                                )
                              })}
                              <span style={{ display: 'inline-flex', gap: 4, marginLeft: 14 }}>
                                <button className={track === 'exercise' ? 'btn' : 'btn-ghost'} style={{ padding: '6px 14px', fontSize: 13 }} onClick={() => setTrack('exercise')}>Exercise</button>
                                <button className={track === 'lifestyle' ? 'btn' : 'btn-ghost'} style={{ padding: '6px 14px', fontSize: 13 }} onClick={() => setTrack('lifestyle')}>Lifestyle</button>
                              </span>
                              <span className="muted" style={{ fontSize: 12.5, marginLeft: 8 }}>
                                {activeBlock.name} · Week {viewWeek} of {activeBlock.weeks}
                                {rots.length > 0 && ` · ${rotationForWeek(rots, viewWeek)?.name || ''}`}
                              </span>
                            </div>
                          </>
                        )
                      })()}

                      <div style={{ overflowX: 'auto' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(215px, 1fr))', gap: 8, minWidth: 1520 }}>
                          {[1, 2, 3, 4, 5, 6, 7].map(dn => (
                            <div key={dn}
                              onDragOver={e => { if (dayDrag) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDayDragOverDn(dn) } }}
                              onDragLeave={() => setDayDragOverDn(dg => dg === dn ? null : dg)}
                              onDrop={e => {
                                e.preventDefault()
                                if (dayDrag) { moveWorkout(activeBlock.id, dayDrag.dayId, dn) }
                                setDayDrag(null); setDayDragOverDn(null)
                              }}
                              style={{ background: 'var(--steel)', borderRadius: 8, padding: 10, minHeight: 220, display: 'flex', flexDirection: 'column', gap: 8, outline: dayDragOverDn === dn ? '2px dashed var(--orange)' : 'none', outlineOffset: 2 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span className="eyebrow" style={{ fontSize: 10 }}>Day {dn}</span>
                                <button className="btn-ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => addWorkout(activeBlock.id, dn)}>+ Add</button>
                              </div>

                              {(days[activeBlock.id] || []).filter(d => {
                                if (d.day_number !== dn || (d.track || 'exercise') !== track) return false
                                const rots = rotations[activeBlock.id] || []
                                if (!rots.length) return true
                                // every-week days (no rotation) show under every tab,
                                // because that's exactly when the client sees them
                                return !d.rotation_id || d.rotation_id === activeRot
                              }).map(d => {
                                const list = exercises[d.id] || []
                                const groups = chunkGroups(list)
                                const selCount = selected[d.id]?.size || 0
                                const qa = quickAdd[d.id] || ''
                                const matches = track === 'exercise' && qa.trim() ? library.filter(l => (l.name + ' ' + l.category).toLowerCase().includes(qa.toLowerCase())).slice(0, 5) : []
                                const condMatches = track === 'exercise' && qa.trim() ? condLib.filter(l => (l.name + ' ' + l.format + ' ' + l.instructions).toLowerCase().includes(qa.toLowerCase())).slice(0, 4) : []
                                const lifeMatches = track === 'lifestyle' && qa.trim() ? lifeLib.filter(l => (l.name + ' ' + l.category + ' ' + l.instructions).toLowerCase().includes(qa.toLowerCase())).slice(0, 5) : []
                                return (
                                  <div key={d.id}
                                    draggable
                                    onDragStart={e => { e.dataTransfer.setData('text/plain', d.id); e.dataTransfer.effectAllowed = 'move'; setDayDrag({ dayId: d.id }) }}
                                    onDragEnd={() => { setDayDrag(null); setDayDragOverDn(null) }}
                                    style={{ background: 'var(--coal)', border: '1px solid var(--line)', borderRadius: 8, padding: 10, cursor: 'grab' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 6 }}>
                                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <span title="Drag to move to another day" style={{ color: 'var(--muted)', fontSize: 13, userSelect: 'none' }}>⠿</span>
                                        <strong onClick={() => renameWorkout(activeBlock.id, d)} title="Click to rename"
                                          style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--orange-hot)', cursor: 'pointer' }}>{d.day_label} <span style={{ fontSize: 10, opacity: 0.6 }}>✎</span></strong>
                                      </span>
                                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                        {(rotations[activeBlock.id] || []).length > 0 && (
                                          <select title="Which rotation this workout belongs to"
                                            style={{ width: 'auto', padding: '2px 6px', fontSize: 11, borderColor: d.rotation_id ? 'var(--line)' : '#3E8E7E', color: d.rotation_id ? undefined : '#3E8E7E' }}
                                            value={d.rotation_id || ''} onChange={e => setDayRotation(activeBlock.id, d.id, e.target.value)}>
                                            <option value="">Every wk</option>
                                            {(rotations[activeBlock.id] || []).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                          </select>
                                        )}
                                        <select title="Move to day" style={{ width: 'auto', padding: '2px 6px', fontSize: 11 }} value={d.day_number} onChange={e => moveWorkout(activeBlock.id, d.id, e.target.value)}>
                                          {[1,2,3,4,5,6,7].map(n => <option key={n} value={n}>D{n}</option>)}
                                        </select>
                                        <button className="btn-ghost" style={{ padding: '2px 7px', fontSize: 11, color: 'var(--red)' }} onClick={() => deleteWorkout(activeBlock.id, d.id)}>✕</button>
                                      </div>
                                    </div>

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
                                                  <span draggable onDragStart={e => { e.dataTransfer.setData('text/plain', String(gi)); e.dataTransfer.effectAllowed = 'move'; setDrag({ dayId: d.id, index: gi }) }} onDragEnd={() => { setDrag({}); setDragOver({}) }} style={{ cursor: 'grab', fontSize: 13, userSelect: 'none' }}>⠿</span>
                                                  {g.items.length === 2 ? 'Superset' : 'Circuit'} {g.prefix}
                                                </span>
                                                <button className="btn-ghost" style={{ padding: '1px 7px', fontSize: 10 }} onClick={() => ungroup(d.id, g.prefix)}>Ungroup</button>
                                              </div>
                                              {g.items.map(ex => renderExercise(activeBlock, d, ex))}
                                            </div>
                                          ) : renderExercise(activeBlock, d, g.items[0], gi)}
                                        </div>
                                      )
                                    })}

                                    {selCount >= 2 && (
                                      <button className="btn" style={{ padding: '6px 12px', fontSize: 12, width: '100%', marginBottom: 6 }} onClick={() => groupSelected(d.id)}>
                                        Group {selCount} as {selCount === 2 ? 'superset' : 'circuit'}
                                      </button>
                                    )}

                                    <input placeholder="+ Add exercise (type & Enter)" value={qa}
                                      onChange={e => setQuickAdd(q => ({ ...q, [d.id]: e.target.value }))}
                                      onKeyDown={e => e.key === 'Enter' && quickAddExercise(activeBlock, d.id, matches.length === 1 ? matches[0] : null)}
                                      style={{ padding: '7px 9px', fontSize: 12.5 }} />
                                    {(matches.length > 0 || condMatches.length > 0 || lifeMatches.length > 0) && (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
                                        {matches.map(m => (
                                          <button key={m.id} className="btn-ghost" style={{ padding: '5px 9px', fontSize: 12, textAlign: 'left' }} onClick={() => quickAddExercise(activeBlock, d.id, m)}>
                                            {m.name}{m.category ? <span className="muted"> · {m.category}</span> : ''}
                                          </button>
                                        ))}
                                        {condMatches.map(m => (
                                          <button key={m.id} className="btn-ghost" style={{ padding: '5px 9px', fontSize: 12, textAlign: 'left' }}
                                            onClick={() => quickAddExercise(activeBlock, d.id, { name: m.name, video_url: m.video_url || '' }, 'conditioning', [m.format, m.instructions].filter(Boolean).join(' — '))}>
                                            <span style={{ color: 'var(--orange-hot)', fontWeight: 800, fontSize: 10, marginRight: 5 }}>COND</span>{m.name}
                                          </button>
                                        ))}
                                        {lifeMatches.map(m => (
                                          <button key={m.id} className="btn-ghost" style={{ padding: '5px 9px', fontSize: 12, textAlign: 'left' }}
                                            onClick={() => quickAddExercise(activeBlock, d.id, { name: m.name, video_url: m.video_url || '', tracking_type: m.tracking_type || '' }, 'conditioning', [m.instructions, m.reminder_time ? `Log by ${m.reminder_time}` : ''].filter(Boolean).join(' · '))}>
                                            <span style={{ color: '#3E8E7E', fontWeight: 800, fontSize: 10, marginRight: 5 }}>LIFE</span>{m.name}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                    <button className="btn-ghost" style={{ padding: '5px 10px', fontSize: 11.5, width: '100%', marginTop: 5 }}
                                      onClick={() => quickAddExercise(activeBlock, d.id, null, 'conditioning')}>{track === 'lifestyle' ? '+ Lifestyle block' : '+ Conditioning block'}</button>
                                  </div>
                                )
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
