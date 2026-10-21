import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { normalizeTarget, normalizeReps, dash, effortText, effortMeaning } from '../../lib/targets'
import { rotationForWeek, weeksForRotation, defaultRotationName, overallWeek, resolveBlockWeek, setTargets, compactSetRows, repsSummary, targetSummary, hasVariedSets } from '../../lib/weeks'
import { parseProgramText, parseBlockText, blockExerciseRows } from '../../lib/parse'
import NotesBox from './NotesBox'

const GROUP_COLORS = ['#FF6A00', '#7C5CBF', '#3E8E7E', '#B0533E', '#4A6FA5', '#8E6E3E']
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

// ---------------------------------------------------------------------------
// Table view: the same program data as the card builder, laid out like a
// spreadsheet. Each workout is a table, each week a column group of
// Sets / Reps / Target. It reads and writes program_exercises.week_targets
// exactly the way the card editor does, so the two views can be swapped freely.
// ---------------------------------------------------------------------------

// Every week the block has, falling back to the exercise's base values for any
// week that was never filled in (older exercises, or a block lengthened later).
export function weekTargetsFor(ex, weeks) {
  const wt = Array.isArray(ex.week_targets) ? ex.week_targets : []
  return Array.from({ length: weeks }, (_, i) => wt[i]
    ? { ...wt[i], ...(Array.isArray(wt[i].setRows) ? { setRows: wt[i].setRows.map(r => ({ ...r })) } : {}) }
    : { sets: ex.sets ?? 3, reps: String(ex.reps ?? ''), target: String(ex.rir ?? '2') })
}

// The database patch for one edited cell. Week 1 also writes the top-level
// sets/reps/rir, because older screens read those as the exercise's default.
export function cellPatch(ex, weeks, weekIdx, field, raw) {
  const wts = weekTargetsFor(ex, weeks)
  const value = String(raw ?? '').trim()
  const cur = wts[weekIdx]
  if (field === 'sets') {
    const n = parseInt(value, 10)
    if (!n || n < 1) return null           // blank or 0 sets is never saved
    cur.sets = Math.min(n, 20)
    // keep per-set rows the same length as the set count: extra sets copy the
    // last row (usually the back-off pattern), fewer sets drop from the end
    if (Array.isArray(cur.setRows) && cur.setRows.length) {
      const last = cur.setRows[cur.setRows.length - 1]
      cur.setRows = Array.from({ length: cur.sets }, (_, i) => ({ ...(cur.setRows[i] || last) }))
    }
  } else if (field === 'reps') {
    cur.reps = normalizeReps(value)
  } else if (field === 'target') {
    const n = normalizeTarget(value)
    if (!n.ok) return null              // not a number or a low-high range
    cur.target = n.value
  } else return null
  const patch = { week_targets: wts }
  if (weekIdx === 0) {
    patch.sets = +wts[0].sets || 3
    patch.reps = String(wts[0].reps ?? '')
    patch.rir = String(wts[0].target ?? '')
  }
  return patch
}

// Copy one week's numbers (including any per-set rows) into another week.
export function copyWeekPatch(ex, weeks, fromIdx, toIdx) {
  const wts = weekTargetsFor(ex, weeks)
  const src = wts[fromIdx]
  wts[toIdx] = { ...src, ...(Array.isArray(src.setRows) ? { setRows: src.setRows.map(r => ({ ...r })) } : {}) }
  const patch = { week_targets: wts }
  if (toIdx === 0) {
    patch.sets = +wts[0].sets || 3
    patch.reps = String(wts[0].reps ?? '')
    patch.rir = String(wts[0].target ?? '')
  }
  return patch
}

// Per-set rows for one week (or every week it runs) as a database patch.
// rows = [{reps, target}] or null to go back to one range. Rows are fitted to
// each week's own set count, and setRows is dropped when nothing actually varies.
export function setRowsPatch(ex, weeks, weekIdxs, rows) {
  const wts = weekTargetsFor(ex, weeks)
  if (rows) rows = rows.map(r => ({ ...r, reps: normalizeReps(r.reps), target: normalizeTarget(r.target).ok ? normalizeTarget(r.target).value : String(r.target ?? '').trim() }))
  for (const i of weekIdxs) {
    if (!wts[i]) continue
    if (!rows) { const { setRows, ...rest } = wts[i]; wts[i] = rest; continue }
    const n = +wts[i].sets || rows.length || 1
    const last = rows[rows.length - 1] || { reps: wts[i].reps, target: wts[i].target }
    wts[i] = compactSetRows({ ...wts[i], setRows: Array.from({ length: n }, (_, k) => ({ ...(rows[k] || last) })) })
  }
  const patch = { week_targets: wts }
  if (weekIdxs.includes(0)) {
    patch.sets = +wts[0].sets || 3
    patch.reps = String(wts[0].reps ?? '')
    patch.rir = String(wts[0].target ?? '')
  }
  return patch
}

// Swap an exercise with its neighbour. Positions are renumbered 0..n-1 first so
// rows that were saved with duplicate/blank positions can still move.
export function reorderPatches(list, exId, dir) {
  const sorted = [...list].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const i = sorted.findIndex(e => e.id === exId), j = i + dir
  if (i < 0 || j < 0 || j >= sorted.length) return []
  ;[sorted[i], sorted[j]] = [sorted[j], sorted[i]]
  // only write the rows whose position actually changed
  return sorted.map((e, k) => ({ id: e.id, position: k }))
    .filter(x => (list.find(e => e.id === x.id).position ?? -1) !== x.position)
}

const TARGET_LABEL = { rir: 'RIR', rpe: 'RPE', percent: '%' }

export function ProgramTable({ block, dayList, exercisesByDay, runWeeks, previewWeek, setPreviewWeek, onPatch, onAdd, onDelete, onOpenCards, library = [], onReload, onAddDay, onRenameDay, onDeleteDay, track = 'exercise' }) {
  const weeks = block.weeks || 4
  const [draft, setDraft] = useState({})       // `${exId}|${weekIdx}|${field}` -> text being typed
  const [selEx, setSelEx] = useState(null)     // { dayId, exId } shown in the preview
  const [adding, setAdding] = useState({})     // dayId -> new exercise name
  const [busy, setBusy] = useState(0)
  const [open, setOpen] = useState(null)       // exercise id with its detail strip open (per-set, order, video)
  const [rowDraft, setRowDraft] = useState({}) // `${exId}|${weekIdx}` -> [{reps,target}] being edited
  const [bad, setBad] = useState({})           // cell key -> true when the typed target isn't a number or range
  const [newDay, setNewDay] = useState({ dn: '', label: '' })
  const [renaming, setRenaming] = useState({}) // dayId -> label being typed
  const cells = useRef({})
  const sortEx = arr => [...(arr || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

  // Plain fields on the exercise itself (letter, rest, video) save on blur.
  async function commitField(dayId, ex, field, transform = v => v) {
    const key = `${ex.id}|f|${field}`
    if (!(key in draft)) return
    const val = transform(String(draft[key]).trim())
    setDraft(dr => { const n = { ...dr }; delete n[key]; return n })
    if (val === String(ex[field] ?? '')) return
    setBusy(b => b + 1)
    await onPatch(dayId, ex.id, { [field]: val })
    setBusy(b => b - 1)
  }
  const fieldInput = (dayId, ex, field, ph, width, transform) => {
    const key = `${ex.id}|f|${field}`
    return (
      <input className="pt-mini" aria-label={`${ex.name} ${field}`} placeholder={ph} style={{ width }}
        value={key in draft ? draft[key] : String(ex[field] ?? '')}
        onFocus={() => setSelEx({ dayId, exId: ex.id })}
        onChange={e => setDraft(dr => ({ ...dr, [key]: e.target.value }))}
        onBlur={() => commitField(dayId, ex, field, transform)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }} />
    )
  }

  // ---- per-set editing, inline ----
  function rowsFor(ex, wi) {
    const k = `${ex.id}|${wi}`
    if (rowDraft[k]) return rowDraft[k]
    const t = weekTargetsFor(ex, weeks)[wi]
    const n = +t.sets || 1
    return Array.from({ length: n }, (_, i) => ({ reps: String(t.setRows?.[i]?.reps ?? t.reps ?? ''), target: String(t.setRows?.[i]?.target ?? t.target ?? '') }))
  }
  function editSetRow(ex, wi, i, field, value) {
    const rows = rowsFor(ex, wi).map((r, k) => (k === i ? { ...r, [field]: value } : r))
    setRowDraft(d => ({ ...d, [`${ex.id}|${wi}`]: rows }))
  }
  async function saveSetRows(dayId, ex, wi, everyWeek = false) {
    const k = `${ex.id}|${wi}`
    const rows = rowsFor(ex, wi)
    setRowDraft(d => { const n = { ...d }; delete n[k]; return n })
    setBusy(b => b + 1)
    await onPatch(dayId, ex.id, setRowsPatch(ex, weeks, everyWeek ? runWeeks.map(w => w - 1) : [wi], rows))
    setBusy(b => b - 1)
  }
  async function clearSetRowsTable(dayId, ex, wi) {
    setRowDraft(d => { const n = { ...d }; delete n[`${ex.id}|${wi}`]; return n })
    setBusy(b => b + 1)
    await onPatch(dayId, ex.id, setRowsPatch(ex, weeks, [wi], null))
    setBusy(b => b - 1)
  }
  async function move(dayId, ex, dir) {
    const patches = reorderPatches(exercisesByDay[dayId] || [], ex.id, dir)
    if (!patches.length) return
    setBusy(b => b + 1)
    for (const pt of patches) await onPatch(dayId, pt.id, { position: pt.position })
    setBusy(b => b - 1)
    onReload?.(dayId)
  }

  const allEx = dayList.flatMap(d => (exercisesByDay[d.id] || []).map(ex => ({ d, ex })))
  const current = allEx.find(x => x.ex.id === selEx?.exId) || allEx.find(x => x.ex.kind !== 'conditioning') || null

  async function commit(dayId, ex, weekIdx, field) {
    const key = `${ex.id}|${weekIdx}|${field}`
    if (!(key in draft)) return
    const raw = draft[key]
    if (field === 'target' && !normalizeTarget(raw).ok) { setBad(b => ({ ...b, [key]: true })); return }
    setBad(b => { if (!b[key]) return b; const n = { ...b }; delete n[key]; return n })
    setDraft(dr => { const n = { ...dr }; delete n[key]; return n })
    const before = weekTargetsFor(ex, weeks)[weekIdx]?.[field]
    if (String(before ?? '') === String(raw).trim()) return
    const patch = cellPatch(ex, weeks, weekIdx, field, raw)
    if (!patch) return
    setBusy(b => b + 1)
    await onPatch(dayId, ex.id, patch)
    setBusy(b => b - 1)
  }

  async function commitName(dayId, ex) {
    const key = `${ex.id}|name`
    if (!(key in draft)) return
    const name = String(draft[key]).trim()
    setDraft(dr => { const n = { ...dr }; delete n[key]; return n })
    if (!name || name === ex.name) return
    setBusy(b => b + 1)
    await onPatch(dayId, ex.id, { name })
    setBusy(b => b - 1)
  }

  async function copyForward(dayId, weekNum) {
    const at = runWeeks.indexOf(weekNum)
    const to = runWeeks[at + 1]
    if (!to) return
    setBusy(b => b + 1)
    for (const ex of (exercisesByDay[dayId] || []).filter(e => e.kind !== 'conditioning')) {
      await onPatch(dayId, ex.id, copyWeekPatch(ex, weeks, weekNum - 1, to - 1))
    }
    setBusy(b => b - 1)
  }

  // Enter moves DOWN to the same column on the next row, like a spreadsheet;
  // Tab already moves right on its own.
  function moveDown(dayId, exIdx, col) {
    const list = sortEx(exercisesByDay[dayId]).filter(e => e.kind !== 'conditioning')
    const next = list[exIdx + 1]
    const el = next && cells.current[`${next.id}|${col}`]
    if (el) el.focus()
    else document.activeElement?.blur()
  }

  const cellInput = (dayId, ex, exIdx, weekIdx, field, value, opts = {}) => {
    const key = `${ex.id}|${weekIdx}|${field}`
    return (
      <input
        ref={el => { cells.current[`${ex.id}|${weekIdx}|${field}`] = el }}
        className={`pt-cell pt-box${field === 'target' ? ' pt-target' : ''}${bad[key] ? ' pt-bad' : ''}`}
        aria-label={`${ex.name} week ${weekIdx + 1} ${field === 'target' ? TARGET_LABEL[ex.progression_type || 'rir'] + ' target' : field}`}
        aria-invalid={bad[key] ? 'true' : undefined}
        placeholder={field === 'target' ? ({ rir: '1-2', rpe: '8', percent: '75' }[ex.progression_type || 'rir']) : field === 'reps' ? '8-12' : ''}
        inputMode={field === 'sets' ? 'numeric' : undefined}
        value={key in draft ? draft[key] : String(value ?? '')}
        readOnly={opts.readOnly}
        title={bad[key] ? 'Use a number or a range, e.g. 2 or 1-2' : opts.title}
        onFocus={() => { setSelEx({ dayId, exId: ex.id }); setPreviewWeek(weekIdx + 1) }}
        onChange={e => setDraft(dr => ({ ...dr, [key]: e.target.value }))}
        onBlur={() => commit(dayId, ex, weekIdx, field)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); moveDown(dayId, exIdx, `${weekIdx}|${field}`) } }}
        style={opts.readOnly ? { color: 'var(--muted)', fontStyle: 'italic' } : undefined}
      />
    )
  }

  const gridCols = `30px minmax(190px, 1.4fr) repeat(${runWeeks.length}, minmax(168px, 1fr)) 34px`
  const minW = 30 + 190 + runWeeks.length * 168 + 34

  // ---- preview of what the client sees for the selected exercise ----
  let preview = null
  if (current && current.ex.kind !== 'conditioning') {
    const ex = current.ex
    const wk = Math.min(Math.max(previewWeek, 1), weeks)
    const t = weekTargetsFor(ex, weeks)[wk - 1]
    const n = Math.max(0, Math.min(12, +t.sets || 0))
    const rows = Array.from({ length: n }, (_, i) => ({
      reps: t.setRows?.[i]?.reps ?? t.reps,
      target: t.setRows?.[i]?.target ?? t.target,
    }))
    const label = TARGET_LABEL[ex.progression_type || 'rir']
    preview = { ex, wk, t, rows, label }
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
      <style>{`
        .pt-cell{width:100%;min-width:0;height:34px;box-sizing:border-box;padding:0 6px;border:1px solid transparent;border-radius:6px;background:transparent;color:inherit;font:inherit;font-size:14px;font-weight:500;text-align:center;font-variant-numeric:tabular-nums}
        .pt-box{border-color:#3d3d3d;background:#121212}
        .pt-box::placeholder{color:#5c5c5c}
        .pt-target{color:var(--orange-hot);font-weight:800}
        .pt-bad{border-color:#e5484d!important;background:rgba(229,72,77,.12)!important}
        .pt-cell:hover{border-color:#6a6a6a}
        .pt-cell:focus{outline:none;border-color:var(--orange);background:rgba(255,106,0,0.12)}
        .pt-table{border:1px solid #4a4a4a;border-radius:10px;overflow:hidden;background:var(--coal)}
        .pt-head{background:var(--orange);color:#000}
        .pt-sub{background:#0f0f0f;border-bottom:2px solid var(--orange)}
        .pt-row:nth-child(even) > .pt-grid{background:#202020}
        .pt-wk{border-left:2px solid #555}
        .pt-sep{border-left:1px solid #333}
        .pt-name{text-align:left;font-weight:600}
        .pt-mini{height:24px;box-sizing:border-box;padding:0 5px;border:1px solid var(--line);border-radius:5px;background:transparent;color:inherit;font:inherit;font-size:11.5px;text-align:center}
        .pt-mini:focus{outline:none;border-color:var(--orange);background:rgba(255,106,0,0.10)}
        .pt-mini::placeholder{color:var(--muted);opacity:.7}
      `}</style>

      <datalist id="pt-library">
        {library.filter(l => (l.kind || 'exercise') === 'exercise').map(l => <option key={l.id} value={l.name} />)}
      </datalist>
      <div style={{ flex: '999 1 640px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="muted" style={{ fontSize: 12.5 }}>
            Click a cell and type. Tab moves right, Enter moves down. Changes save when you leave the cell. ▸ opens set-by-set targets.
          </span>
          <span className="muted" style={{ fontSize: 12 }}>{busy > 0 ? 'Saving…' : 'All changes saved'}</span>
        </div>

        {dayList.length === 0 && (
          <div style={{ border: '1px dashed var(--orange)', borderRadius: 10, padding: 14, fontSize: 13.5 }}>
            <strong>No workouts yet.</strong> <span className="muted">Add the first one below: pick a day, name it (e.g. Upper A), then type exercises straight into the table.</span>
          </div>
        )}

        {dayList.map(d => {
          const list = sortEx(exercisesByDay[d.id])
          const lifts = list.filter(e => e.kind !== 'conditioning')
          const firstWk = runWeeks[0] || 1
          const totalSets = lifts.reduce((s, e) => s + (+weekTargetsFor(e, weeks)[firstWk - 1]?.sets || 0), 0)
          return (
            <section key={d.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {d.id in renaming ? (
                  <input autoFocus value={renaming[d.id]} aria-label="Workout name" onChange={e => setRenaming(r => ({ ...r, [d.id]: e.target.value }))}
                    onBlur={async () => { const v = (renaming[d.id] || '').trim(); setRenaming(r => { const n = { ...r }; delete n[d.id]; return n }); if (v && v !== d.day_label) await onRenameDay?.(d, v) }}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(r => { const n = { ...r }; delete n[d.id]; return n }) }}
                    style={{ maxWidth: 240, padding: '4px 8px', fontSize: 14, fontWeight: 800 }} />
                ) : (
                  <strong style={{ fontSize: 15, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--orange-hot)' }}>Day {d.day_number}: {d.day_label}</strong>
                )}
                <span className="muted" style={{ fontSize: 12.5 }}>{lifts.length} exercise{lifts.length === 1 ? '' : 's'} · {totalSets} sets in week {firstWk}</span>
                {onRenameDay && !(d.id in renaming) && <button type="button" className="btn-ghost" onClick={() => setRenaming(r => ({ ...r, [d.id]: d.day_label }))} style={{ padding: '2px 9px', fontSize: 11 }}>Rename</button>}
                {onDeleteDay && <button type="button" className="btn-ghost" onClick={() => onDeleteDay(d)} style={{ padding: '2px 9px', fontSize: 11, color: 'var(--muted)' }}>Delete workout</button>}
              </div>
              <div className="pt-table" style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: minW }}>
                  <div className="pt-head" style={{ display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center' }}>
                    <div />
                    <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.08em', padding: '8px 8px' }}>EXERCISE</div>
                    {runWeeks.map((wk, wi) => (
                      <div key={wk} className="pt-wk" style={{ borderLeftColor: 'rgba(0,0,0,.35)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', gap: 6, background: wk === previewWeek ? '#ff8a33' : undefined }}>
                        <button type="button" onClick={() => setPreviewWeek(wk)}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#000', fontSize: 13, fontWeight: 900, letterSpacing: '.04em' }}>
                          WEEK {wk}
                        </button>
                        {wi < runWeeks.length - 1 && lifts.length > 0 && (
                          <button type="button" title={`Copy week ${wk} into week ${runWeeks[wi + 1]}`}
                            onClick={() => copyForward(d.id, wk)} style={{ padding: '2px 8px', fontSize: 11, fontWeight: 800, borderRadius: 5, border: '1px solid rgba(0,0,0,.45)', background: 'rgba(0,0,0,.12)', color: '#000', cursor: 'pointer' }}>
                            Copy →
                          </button>
                        )}
                      </div>
                    ))}
                    <div />
                  </div>
                  <div className="pt-sub" style={{ display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center' }}>
                    <div />
                    <div className="muted" style={{ fontSize: 10, padding: '5px 8px' }}>Name · letter · rest</div>
                    {runWeeks.map(wk => {
                      const types = [...new Set(lifts.map(e => e.progression_type || 'rir'))]
                      const tl = types.length === 1 ? TARGET_LABEL[types[0]] : 'Effort'
                      return (
                        <div key={wk} className="pt-wk" style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.3fr 1fr', gap: 2, fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', textAlign: 'center', padding: '5px 5px' }}>
                          <span style={{ color: 'var(--muted)' }}>Sets</span><span style={{ color: 'var(--muted)' }}>Reps</span><span style={{ color: 'var(--orange-hot)' }}>{tl === '%' ? '% target' : `${tl} target`}</span>
                        </div>
                      )
                    })}
                    <div />
                  </div>

                  {list.map(ex => {
                    const isCond = ex.kind === 'conditioning'
                    const exIdx = lifts.indexOf(ex)
                    const on = current?.ex.id === ex.id
                    const wts = weekTargetsFor(ex, weeks)
                    const nameKey = `${ex.id}|name`
                    const isOpen = open === ex.id
                    return (
                      <div key={ex.id} className="pt-row">
                      <div className="pt-grid" style={{ display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center', borderBottom: isOpen ? 'none' : '1px solid #3a3a3a', background: on || isOpen ? 'rgba(255,106,0,0.08)' : undefined, boxShadow: on || isOpen ? 'inset 3px 0 0 var(--orange)' : undefined }}>
                        <button type="button" onClick={() => { setOpen(isOpen ? null : ex.id); setSelEx({ dayId: d.id, exId: ex.id }) }}
                          aria-expanded={isOpen} aria-label={`${isOpen ? 'Close' : 'Open'} details for ${ex.name}`} title="Per-set targets, order, video"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: isOpen ? 'var(--orange-hot)' : 'var(--muted)', fontSize: 11, fontWeight: 800, padding: 0, height: 34 }}>
                          {isOpen ? '▾' : '▸'}<div style={{ fontSize: 11 }}>{ex.letter || '·'}</div>
                        </button>
                        <div style={{ padding: '3px 4px', minWidth: 0 }}>
                          <input className="pt-cell pt-name" aria-label={`Exercise name, ${ex.name}`}
                            ref={el => { cells.current[`${ex.id}|name`] = el }}
                            value={nameKey in draft ? draft[nameKey] : ex.name}
                            onFocus={() => setSelEx({ dayId: d.id, exId: ex.id })}
                            onChange={e => setDraft(dr => ({ ...dr, [nameKey]: e.target.value }))}
                            onBlur={() => commitName(d.id, ex)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }} />
                          {isCond
                            ? <div className="muted" style={{ fontSize: 10.5, padding: '0 6px' }}>Conditioning · edit in Cards</div>
                            : <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '1px 6px 3px', flexWrap: 'wrap' }}>
                                {fieldInput(d.id, ex, 'letter', 'A1', 38, v => v.toUpperCase().replace(/\s+/g, ''))}
                                {fieldInput(d.id, ex, 'rest', 'rest', 58)}
                                <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 5px', borderRadius: 4, border: '1px solid var(--orange)', color: 'var(--orange-hot)' }} title="Change RIR / RPE / % in Cards view">{TARGET_LABEL[ex.progression_type || 'rir']}</span>
                                {ex.video_url
                                  ? <a href={ex.video_url} target="_blank" rel="noreferrer" title={ex.video_url} style={{ fontSize: 10.5, fontWeight: 800 }}>▶ video</a>
                                  : <span className="muted" style={{ fontSize: 10.5 }}>no video</span>}
                              </div>}
                        </div>
                        {runWeeks.map(wk => {
                          const wi = wk - 1
                          const t = wts[wi]
                          const perSet = Array.isArray(t.setRows)
                          return (
                            <div key={wk} className="pt-wk" style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.3fr 1fr', gap: 4, padding: '5px 6px', background: wk === previewWeek ? 'rgba(255,106,0,0.05)' : undefined }}>
                              {isCond ? (
                                <span className="muted" style={{ gridColumn: '1 / -1', textAlign: 'center', fontSize: 12 }}>—</span>
                              ) : (
                                <>
                                  {cellInput(d.id, ex, exIdx, wi, 'sets', t.sets)}
                                  {perSet
                                    ? <button type="button" className="pt-cell" title="Per-set reps — click to edit" onClick={() => { setOpen(ex.id); setPreviewWeek(wk); setSelEx({ dayId: d.id, exId: ex.id }) }}
                                        style={{ color: 'var(--orange-hot)', cursor: 'pointer', fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.setRows.map(r => r.reps).join(', ')}</button>
                                    : cellInput(d.id, ex, exIdx, wi, 'reps', t.reps)}
                                  {perSet
                                    ? <button type="button" className="pt-cell" title="Per-set targets — click to edit" onClick={() => { setOpen(ex.id); setPreviewWeek(wk); setSelEx({ dayId: d.id, exId: ex.id }) }}
                                        style={{ color: 'var(--orange-hot)', cursor: 'pointer', fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.setRows.map(r => dash(r.target)).join(' / ')}</button>
                                    : cellInput(d.id, ex, exIdx, wi, 'target', t.target)}
                                </>
                              )}
                            </div>
                          )
                        })}
                        <button type="button" aria-label={`Remove ${ex.name}`} title="Remove exercise"
                          onClick={() => { if (window.confirm(`Remove ${ex.name} from ${d.day_label}?`)) onDelete(d.id, ex.id) }}
                          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13, height: 34 }}>✕</button>
                      </div>
                      {isOpen && (
                        <div style={{ borderBottom: '1px solid var(--line)', background: 'rgba(255,106,0,0.035)', padding: '8px 10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
                            <button type="button" className="btn-ghost" disabled={list.indexOf(ex) === 0} onClick={() => move(d.id, ex, -1)} style={{ padding: '3px 9px', fontSize: 12 }}>↑ Up</button>
                            <button type="button" className="btn-ghost" disabled={list.indexOf(ex) === list.length - 1} onClick={() => move(d.id, ex, 1)} style={{ padding: '3px 9px', fontSize: 12 }}>↓ Down</button>
                            <span className="muted" style={{ marginLeft: 6 }}>Video link</span>
                            {fieldInput(d.id, ex, 'video_url', 'Paste YouTube / Loom / Drive link', 280)}
                            <span className="muted" style={{ fontSize: 11 }}>Superset: give exercises the same letter + a number (A1, A2).</span>
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
                            <span className="muted">Note for client</span>
                            {fieldInput(d.id, ex, 'notes', 'Cue or instruction, e.g. “Stop if jump height drops”', 420)}
                          </div>
                          {!isCond && (
                            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${runWeeks.length}, minmax(150px, 1fr))`, gap: 10, overflowX: 'auto' }}>
                              {runWeeks.map(wk => {
                                const wi = wk - 1
                                const t = wts[wi]
                                const perSet = Array.isArray(t.setRows)
                                const dirty = !!rowDraft[`${ex.id}|${wi}`]
                                const rows = rowsFor(ex, wi)
                                return (
                                  <div key={wk} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 8, background: 'var(--coal)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                                      <strong style={{ fontSize: 12 }}>Week {wk}</strong>
                                      <span className="muted" style={{ fontSize: 10.5 }}>{perSet ? 'set by set' : 'one range'}</span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '26px 1fr 1fr', gap: 4, fontSize: 9.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>
                                      <span>Set</span><span style={{ textAlign: 'center' }}>Reps</span><span style={{ textAlign: 'center' }}>{TARGET_LABEL[ex.progression_type || 'rir']}</span>
                                    </div>
                                    {rows.map((r, i) => (
                                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '26px 1fr 1fr', gap: 4, marginBottom: 3, alignItems: 'center' }}>
                                        <span style={{ fontSize: 12, fontWeight: 800 }}>{i + 1}</span>
                                        <input className="pt-mini" aria-label={`${ex.name} week ${wk} set ${i + 1} reps`} value={r.reps} onChange={e => editSetRow(ex, wi, i, 'reps', e.target.value)} />
                                        <input className="pt-mini" aria-label={`${ex.name} week ${wk} set ${i + 1} target`} value={r.target} onChange={e => editSetRow(ex, wi, i, 'target', e.target.value)} />
                                      </div>
                                    ))}
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                                      <button type="button" className={dirty ? 'btn' : 'btn-ghost'} disabled={!dirty} onClick={() => saveSetRows(d.id, ex, wi)} style={{ padding: '3px 8px', fontSize: 11 }}>Save</button>
                                      {runWeeks.length > 1 && <button type="button" className="btn-ghost" onClick={() => saveSetRows(d.id, ex, wi, true)} style={{ padding: '3px 8px', fontSize: 11 }} title="Use this set pattern in every week">Every week</button>}
                                      {perSet && <button type="button" className="btn-ghost" onClick={() => clearSetRowsTable(d.id, ex, wi)} style={{ padding: '3px 8px', fontSize: 11 }}>One range</button>}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                      </div>
                    )
                  })}

                  <div style={{ padding: '6px 8px', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input list="pt-library" placeholder="+ Add exercise — start typing to search your library" value={adding[d.id] || ''}
                      onChange={e => setAdding(a => ({ ...a, [d.id]: e.target.value }))}
                      onKeyDown={async e => {
                        if (e.key !== 'Enter') return
                        const name = (adding[d.id] || '').trim()
                        if (!name) return
                        setAdding(a => ({ ...a, [d.id]: '' }))
                        await onAdd(d.id, name)
                      }}
                      style={{ padding: '7px 9px', fontSize: 12.5, maxWidth: 360 }} />
                  </div>
                </div>
              </div>
            </section>
          )
        })}
        {onAddDay && (
          <form onSubmit={async e => {
              e.preventDefault()
              const label = newDay.label.trim()
              const dn = +newDay.dn || (Math.max(0, ...dayList.map(x => x.day_number)) % 7) + 1
              if (!label) return
              setNewDay({ dn: '', label: '' })
              await onAddDay(dn, label)
            }}
            style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', border: '1px solid #4a4a4a', borderRadius: 10, padding: '10px 12px', background: 'var(--coal)' }}>
            <strong style={{ fontSize: 12.5, color: 'var(--orange-hot)', letterSpacing: '.06em' }}>+ ADD {track === 'lifestyle' ? 'LIFESTYLE CARD' : 'WORKOUT'}</strong>
            <select value={newDay.dn} onChange={e => setNewDay(n => ({ ...n, dn: e.target.value }))} aria-label="Day" style={{ width: 'auto', padding: '6px 8px', fontSize: 13 }}>
              <option value="">Next day</option>
              {[1, 2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>Day {n}</option>)}
            </select>
            <input value={newDay.label} onChange={e => setNewDay(n => ({ ...n, label: e.target.value }))} placeholder={track === 'lifestyle' ? 'e.g. Recovery' : 'Workout name, e.g. Upper A'} aria-label="Workout name" style={{ maxWidth: 260, padding: '6px 9px', fontSize: 13 }} />
            <button type="submit" className="btn" disabled={!newDay.label.trim()} style={{ padding: '7px 14px', fontSize: 12.5 }}>Add</button>
          </form>
        )}
        <p className="muted" style={{ fontSize: 11.5 }}>
          Targets take a single number or a range: type <strong style={{ color: 'var(--white)' }}>2</strong> or <strong style={{ color: 'var(--white)' }}>1-2</strong>. Click ▸ on a row for set-by-set targets, order and the video link. Icons, conditioning and comments are in{' '}
          <button type="button" onClick={onOpenCards} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--orange-hot)', cursor: 'pointer', fontSize: 11.5, fontWeight: 700 }}>Cards view</button>.
        </p>
      </div>

      <aside aria-label="Client preview" style={{ flex: '1 1 300px', maxWidth: 360, border: '1px solid var(--line)', borderRadius: 12, background: 'var(--coal)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10, position: 'sticky', top: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 13.5 }}>Client preview</strong>
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {runWeeks.map(wk => (
              <button key={wk} type="button" className={wk === previewWeek ? 'btn' : 'btn-ghost'} onClick={() => setPreviewWeek(wk)}
                style={{ padding: '3px 8px', fontSize: 11.5 }}>W{wk}</button>
            ))}
          </div>
        </div>
        {!preview && <p className="muted" style={{ fontSize: 12.5 }}>Click any exercise to see how the client will log it.</p>}
        {preview && (
          <div style={{ border: '8px solid var(--steel)', borderRadius: 30, padding: '16px 12px 20px', display: 'flex', flexDirection: 'column', gap: 9, background: 'var(--black, #0B0B0C)' }}>
            <div className="eyebrow" style={{ fontSize: 10, textAlign: 'center' }}>Week {preview.wk}</div>
            <div>
              <strong style={{ fontSize: 15 }}>{preview.ex.name}</strong>
              <div style={{ fontSize: 12, color: 'var(--orange-hot)', fontWeight: 700, marginTop: 2 }}>
                {preview.t.setRows
                  ? preview.rows.map(r => dash(r.reps)).join(', ')
                  : `${preview.t.sets} × ${dash(preview.t.reps)}`}
                {preview.ex.rest ? ` · rest ${preview.ex.rest}` : ''}
              </div>
              {(() => {
                // per-set weeks show each set's target, not the base value they no longer use
                const type = preview.ex.progression_type || 'rir'
                const uniq = [...new Set(preview.rows.map(r => String(r.target ?? '')))]
                const tg = preview.t.setRows ? uniq.join(' / ') : preview.t.target
                if (!tg) return null
                return (
                  <div style={{ marginTop: 6, border: '1px solid var(--orange)', borderRadius: 8, padding: '6px 8px', background: 'rgba(255,106,0,0.08)' }}>
                    <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.06em', color: 'var(--orange-hot)' }}>TARGET {effortText(type, tg).toUpperCase()}</div>
                    {uniq.length === 1 && <div style={{ fontSize: 10.5, marginTop: 1 }}>{effortMeaning(type, tg)}</div>}
                  </div>
                )
              })()}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr) 48px 40px 36px 28px', gap: 4, fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>
              <span>Set</span><span>Last</span><span style={{ textAlign: 'center' }}>Lbs</span><span style={{ textAlign: 'center' }}>Reps</span><span style={{ textAlign: 'center' }}>{preview.label === '%' ? 'RIR' : preview.label}</span><span />
            </div>
            {preview.rows.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr) 48px 40px 36px 28px', gap: 4, alignItems: 'center' }}>
                <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
                  <strong style={{ fontSize: 13 }}>{i + 1}</strong>
                  <span className="muted" style={{ fontSize: 9.5 }}>{r.reps}</span>
                </span>
                <span className="muted" style={{ fontSize: 11 }}>—</span>
                <span style={{ height: 30, border: '1px solid var(--line)', borderRadius: 6 }} />
                <span style={{ height: 30, border: '1px solid var(--line)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--muted)' }}>{String(r.reps ?? '').split('-')[0]}</span>
                <span style={{ height: 30, border: '1px solid var(--line)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--muted)' }}>{preview.label === '%' ? '' : dash(r.target)}</span>
                <span style={{ width: 24, height: 24, borderRadius: 12, border: '1.5px solid var(--line)' }} />
              </div>
            ))}
            <p className="muted" style={{ fontSize: 10.5, textAlign: 'center', marginTop: 2 }}>The client's own last-session numbers fill the Last column.</p>
          </div>
        )}
      </aside>
    </div>
  )
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
  const [pasteDay, setPasteDay] = useState(null)   // day id whose paste box is open
  const [pasteText, setPasteText] = useState('')
  const [pasteBusy, setPasteBusy] = useState(false)
  const [blockPasteOpen, setBlockPasteOpen] = useState(false) // whole-block paste panel
  const [blockPasteText, setBlockPasteText] = useState('')
  const [blockPasteBusy, setBlockPasteBusy] = useState(false)
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
  // 'cards' (the original builder) or 'table' (spreadsheet view); remembered on this device
  const [layout, setLayoutState] = useState(() => {
    try { return localStorage.getItem('ws_program_layout') === 'table' ? 'table' : 'cards' } catch { return 'cards' }
  })
  function setLayout(v) {
    setLayoutState(v)
    try { localStorage.setItem('ws_program_layout', v) } catch { /* private mode etc. — just don't remember */ }
  }

  // Table view saves one cell at a time: show the change straight away, then write it.
  // If the write fails, reload that day so the screen never shows something unsaved.
  async function patchExercise(dayId, exId, patch) {
    setExercises(prev => ({ ...prev, [dayId]: (prev[dayId] || []).map(e => e.id === exId ? { ...e, ...patch } : e) }))
    const { error } = await supabase.from('program_exercises').update(patch).eq('id', exId)
    if (error) { alert('Save failed: ' + error.message); loadDay(dayId) }
    return !error
  }

  // Adding from the table reuses the card builder's insert, picking up the
  // library entry's video/icon when the typed name matches one exactly.
  async function addFromTable(block, dayId, name) {
    const lib = library.find(l => l.name.trim().toLowerCase() === name.toLowerCase())
    await quickAddExercise(block, dayId, lib || { name })
  }

  async function load() {
    const [{ data: p }, { data: c }, { data: a }] = await Promise.all([
      supabase.from('programs').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name').eq('role', 'client').neq('status', 'exited').order('full_name'),
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

  // ---- paste a whole day ----
  // Everything is previewed before anything is written. A parser that quietly
  // guessed wrong would put bad numbers in a client's program, so the coach
  // confirms what was understood first.
  function openPaste(dayId) {
    setPasteDay(prev => (prev === dayId ? null : dayId))
    setPasteText('')
  }

  async function commitPaste(block, dayId) {
    const rows = parseProgramText(pasteText).filter(r => r.name && !r.issues.length)
    if (!rows.length) return
    setPasteBusy(true)
    const list = exercises[dayId] || []
    const weeks = block.weeks || 4
    const used = new Set(list.map(e => (e.letter || '').toUpperCase()).filter(Boolean))
    const payload = rows.map((r, i) => {
      const sets = r.sets || 3
      const reps = r.reps || defaultReps('reps')
      const target = r.target || '2'
      const base = { sets, reps: String(reps), target: String(target) }
      // setRows only rides along when the line actually specified per-set work
      const entry = r.setRows
        ? { ...base, setRows: r.setRows.map(x => ({ reps: String(x.reps), target: String(x.target) })) }
        : base
      // Keep a typed letter if it's free, otherwise fall back to the next
      // available one so pasting twice can't create two exercise A's.
      let letter = (r.letter || '').toUpperCase()
      if (!letter || used.has(letter)) letter = nextFreeLetter([...list, ...payloadSoFar(used)])
      used.add(letter)
      return {
        day_id: dayId, name: r.name, kind: 'exercise', description: '',
        tracking_type: '', letter,
        video_url: '', notes: r.notes || '', icon_url: null,
        metric: r.metric || 'reps', rest: r.rest || '', progression_type: r.progression_type || 'rir',
        sets, reps: String(reps), rir: String(target),
        week_targets: Array.from({ length: weeks }, () => ({ ...entry, setRows: entry.setRows ? entry.setRows.map(x => ({ ...x })) : undefined })),
        position: list.length + i,
      }
    })
    // strip the undefined setRows key so it never lands in the JSON as null
    for (const p of payload) p.week_targets = p.week_targets.map(w => (w.setRows ? w : (({ setRows, ...rest }) => rest)(w)))
    await supabase.from('program_exercises').insert(payload)
    setPasteBusy(false)
    setPasteDay(null)
    setPasteText('')
    loadDay(dayId)
  }

  // ---- paste a whole block ----
  // Every workout heading becomes a new workout in this block, and each line's
  // " > " week chain fills week_targets, so the progression is built in.
  // Same rule as the day paste: preview first, and lines it can't read are
  // shown and skipped rather than guessed at.
  async function commitBlockPaste(block) {
    const weeks = block.weeks || 4
    const { days: pDays } = parseBlockText(blockPasteText, weeks)
    const ready = pDays
      .map(d => ({ ...d, good: d.exercises.filter(e => e.name && !e.issues.length) }))
      .filter(d => d.good.length || d.warmup)
    if (!ready.length) return
    setBlockPasteBusy(true)
    const rot = (rotations[block.id]?.length ? activeRot : null) || null
    let pos = days[block.id]?.length || 0
    let made = 0
    for (const d of ready) {
      const { data: newDay, error } = await supabase.from('program_days').insert({
        program_id: block.program_id || open, block_id: block.id, day_label: d.label, day_number: d.dayNumber,
        position: pos++, track: 'exercise', rotation_id: rot, warmup: d.warmup || '',
      }).select().single()
      if (error || !newDay) {
        alert(`Stopped at "${d.label}": ${error?.message || 'could not create the workout'}.\n${made} workout(s) before it were added.`)
        break
      }
      if (d.good.length) {
        const rows = blockExerciseRows(d.good, weeks).map(r => ({ ...r, day_id: newDay.id }))
        const { error: exErr } = await supabase.from('program_exercises').insert(rows)
        if (exErr) {
          alert(`"${d.label}" was created but its exercises didn't save: ${exErr.message}.\n${made} workout(s) before it were added in full.`)
          break
        }
      }
      made++
    }
    setBlockPasteBusy(false)
    if (made === ready.length) { setBlockPasteOpen(false); setBlockPasteText('') }
    setTrack('exercise')
    loadDays(block.id)
  }

  // "3 × 5-6 RIR 2" for one week entry, or "4-6@2, 8-10@2" when sets differ
  function weekText(w, type) {
    if (w.setRows) return w.setRows.map(x => `${x.reps}${x.target !== '' ? '@' + x.target : ''}`).join(', ')
    const eff = effortText(type, w.target)
    return `${w.sets} × ${dash(w.reps)}${eff ? ' ' + eff : ''}`
  }

  function renderBlockPaste(block) {
    const weeks = block.weeks || 4
    const { days: pDays, skipped } = parseBlockText(blockPasteText, weeks)
    const rots = rotations[block.id] || []
    const rotName = rots.length ? (rots.find(r => r.id === activeRot)?.name || '') : ''
    const existing = (days[block.id] || []).length
    let goodCount = 0
    let dayCount = 0
    for (const d of pDays) {
      const g = d.exercises.filter(e => e.name && !e.issues.length).length
      goodCount += g
      if (g || d.warmup) dayCount++
    }
    return (
      <div className="card" style={{ padding: 12, marginBottom: 14, border: '1px solid var(--orange)', boxSizing: 'border-box', maxWidth: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          <strong style={{ fontSize: 14 }}>Paste whole block → {block.name} ({weeks} weeks)</strong>
          <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => { setBlockPasteOpen(false); setBlockPasteText('') }}>Close</button>
        </div>
        <textarea rows={10} value={blockPasteText} onChange={e => setBlockPasteText(e.target.value)}
          placeholder={'=== Day 1: Upper A ===\nWarm-up: 5 min bike, band pull-aparts\nPogo Hops 2x15 rest 60s > 2x20 > 3x20 | Quick, stiff ankles\nA) Smith Bench 3x5-6 RIR 2 rest 3 min > 3x4-6 RIR 2 > 3x3-5 RIR 1-2 > 3x3-4 RIR 1\nB) Lat Pulldown 2x4-8 RIR 2 > RIR 2 > RIR 1-2 > RIR 0-1\n\n=== Day 2: Lower A ===\nA) Smith RDL 3x5-6 RIR 2 > 3x4-6 RIR 2 > 3x3-5 RIR 1-2 > 3x3-4 RIR 1'}
          style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '8px 10px', fontSize: 12.5, fontFamily: 'inherit', resize: 'vertical' }} />
        <p className="muted" style={{ fontSize: 11, margin: '6px 0 0' }}>
          Start each workout with a heading: <code>=== Day 1: Upper A ===</code> (the day number is optional). Then one exercise per line, same as the day paste.
          Put <code> &gt; </code> between weeks: <code>3x5-6 RIR 2 &gt; 3x4-6 RIR 2 &gt; 3x3-5 RIR 1</code>. A week that leaves something out keeps it from the week before
          (<code>&gt; RIR 1</code> only changes the target), and the last week repeats to the end of the block. Name, letter, rest and the note after <code>|</code> are set once, on week 1.
          A line starting <code>Warm-up:</code> goes in that workout's warm-up box. No target means none is shown to the client — good for jumps, holds and intervals.
        </p>

        {(pDays.length > 0 || skipped.length > 0) && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pDays.map((d, di) => {
              const good = d.exercises.filter(e => e.name && !e.issues.length)
              const bad = d.exercises.filter(e => !e.name || e.issues.length)
              const rows = blockExerciseRows(good, weeks)
              return (
                <div key={di} style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                  <strong style={{ fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--orange-hot)' }}>
                    Day {d.dayNumber}: {d.label}
                  </strong>
                  <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>{good.length} exercise{good.length === 1 ? '' : 's'}</span>
                  {d.warmup && <p className="muted" style={{ fontSize: 11, margin: '2px 0', fontStyle: 'italic' }}>Warm-up: {d.warmup.replace(/\n/g, ' · ')}</p>}
                  {rows.map((r, i) => {
                    const wts = r.week_targets
                    const same = wts.every(w => JSON.stringify(w) === JSON.stringify(wts[0]))
                    const src = good[i]
                    return (
                      <div key={i} style={{ fontSize: 11.5, margin: '4px 0' }}>
                        <span style={{ color: 'var(--orange)' }}>{r.letter || '·'}</span> <strong>{r.name}</strong>
                        {r.metric !== 'reps' && <span style={{ color: 'var(--orange)' }}> · {r.metric}</span>}
                        {r.rest && <span className="muted"> · rest {r.rest}</span>}
                        <div className="muted" style={{ paddingLeft: 12 }}>
                          {same
                            ? <>All weeks: {weekText(wts[0], r.progression_type)}</>
                            : wts.map((w, wi) => (
                              <span key={wi} style={{ display: 'inline-block', marginRight: 10 }}>
                                <span style={{ color: 'var(--orange)' }}>W{wi + 1}</span> {weekText(w, r.progression_type)}
                              </span>
                            ))}
                        </div>
                        {r.notes && <div className="muted" style={{ paddingLeft: 12, fontStyle: 'italic' }}>📝 {r.notes}</div>}
                        {src.warnings.map((m, wi) => <div key={wi} style={{ paddingLeft: 12, color: 'var(--orange-hot)' }}>⚠ {m}</div>)}
                      </div>
                    )
                  })}
                  {bad.map((e, i) => (
                    <p key={`b${i}`} style={{ fontSize: 11, margin: '3px 0', color: 'var(--red)' }}>
                      skipped: {e.raw}<br /><span style={{ paddingLeft: 12 }}>→ {e.issues.join('; ') || 'no exercise name'}</span>
                    </p>
                  ))}
                </div>
              )
            })}
            {skipped.map((s, i) => (
              <p key={`s${i}`} style={{ fontSize: 11, margin: '2px 0', color: 'var(--red)' }}>skipped: {s.raw} → {s.why}</p>
            ))}
          </div>
        )}

        {pDays.length === 0 && blockPasteText.trim() && (
          <p style={{ fontSize: 11.5, marginTop: 8, color: 'var(--red)' }}>No workout headings found. Start each workout with a line like === Day 1: Upper A ===</p>
        )}

        <button className="btn" disabled={!dayCount || blockPasteBusy}
          style={{ padding: '8px 14px', fontSize: 13, width: '100%', marginTop: 10, opacity: dayCount && !blockPasteBusy ? 1 : 0.4 }}
          onClick={() => commitBlockPaste(block)}>
          {blockPasteBusy ? 'Building…' : `Create ${dayCount} workout${dayCount === 1 ? '' : 's'} · ${goodCount} exercise${goodCount === 1 ? '' : 's'}`}
        </button>
        <p className="muted" style={{ fontSize: 10.5, marginTop: 4 }}>
          Adds new workouts to this block{rotName ? ` in ${rotName}` : ''}.{existing ? ` The ${existing} workout${existing === 1 ? '' : 's'} already here stay as they are.` : ''}
        </p>
      </div>
    )
  }

  // nextFreeLetter works off a list of exercise-shaped objects; this adapts the
  // letters already claimed during this paste into that shape.
  function payloadSoFar(used) {
    return [...used].map(l => ({ letter: l }))
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
      icon_url: ex.icon_url || '', notes: ex.notes || '',
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
      description: edit.description || '', icon_url: edit.icon_url || null, notes: (edit.notes || '').trim(),
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
    // Read the per-set data when there is any, so the card shows what the CLIENT
    // will actually see rather than a base rep range the sets aren't using.
    const entry = wt ? { ...wt, sets } : { sets, reps, target }
    const repsPart = repsSummary(entry, ex)
    const targetPart = targetSummary(entry, ex)
    const t = ex.progression_type === 'percent' ? `${targetPart}%` : ex.progression_type === 'rpe' ? `RPE ${targetPart}` : `RIR ${targetPart}`
    return `${repsPart} @ ${t}${ex.rest ? `, rest ${ex.rest}` : ''}`
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
            <textarea rows="2" placeholder="Note for client (cue or instruction)" value={edit.notes} onChange={e => setEdit({ ...edit, notes: e.target.value })} style={{ fontSize: 12 }} />
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
                        <td>
                          {r.setRows && hasVariedSets({ ...r, sets: +r.sets || 3 }, ex) ? (
                            // The base box would sit here showing a range these
                            // sets aren't using, which reads as "it didn't save".
                            <button className="btn-ghost" disabled={!runs}
                              title="Per-set reps — click to edit"
                              style={{ width: 74, padding: '4px 5px', fontSize: 11, color: 'var(--orange)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                              onClick={() => runs && openPerSet(i)}>
                              {repsSummary({ ...r, sets: +r.sets || 3 }, ex)}
                            </button>
                          ) : (
                            <input disabled={!runs} style={{ width: 74, padding: '4px 5px', fontSize: 12 }} value={r.reps} onChange={e => setEditWeeks(w => w.map((x, j) => j === i ? { ...x, reps: e.target.value } : x))} />
                          )}
                        </td>
                        <td><input disabled={!runs} style={{ width: 46, padding: '4px 5px', fontSize: 12, borderColor: runs ? 'var(--orange)' : 'var(--line)' }} value={r.target} onChange={e => setEditWeeks(w => w.map((x, j) => j === i ? { ...x, target: e.target.value } : x))} /></td>
                        <td>
                          <button className="btn-ghost" disabled={!runs}
                            title={r.setRows ? 'This week has per-set targets' : 'Give each set its own reps and load'}
                            style={{ padding: '3px 6px', fontSize: 10.5, opacity: runs ? 1 : 0.4, color: r.setRows ? 'var(--orange)' : undefined }}
                            onClick={() => runs && openPerSet(i)}>
                            {r.setRows ? '⋮' : 'per set'}
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
                                <div key={si} style={{ display: 'grid', gridTemplateColumns: '26px minmax(0,1fr) minmax(0,1fr)', gap: 5, alignItems: 'center', marginBottom: 4 }}>
                                  <span className="muted" style={{ fontSize: 11, fontWeight: 800 }}>S{si + 1}</span>
                                  <input placeholder="reps" style={{ width: '100%', minWidth: 0, padding: '4px 6px', fontSize: 12 }}
                                    value={row.reps ?? ''} onChange={e => updateSetRow(openSetRows, si, 'reps', e.target.value)} />
                                  <input placeholder={edit.progression_type === 'percent' ? '%' : edit.progression_type === 'rpe' ? 'RPE' : 'RIR'}
                                    style={{ width: '100%', minWidth: 0, padding: '4px 6px', fontSize: 12, borderColor: 'var(--orange)' }}
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

              {open === p.id && (
                <div style={{ marginTop: 10 }}>
                  <NotesBox label="Program instructions" value={p.notes} rows={8}
                    hint="Clients see this at the top of their Train page: how the program works, how to warm up, RIR, rest, what to log."
                    placeholder={'How this program works:\n• Warm up with the first 2–3 exercises, then the jumps/throws at full effort.\n• RIR = reps left in the tank. Stop each set at the target.\n• Supersets (A1/A2): one set of each, then rest.\n• Log every set so I can adjust next week.'}
                    onSave={async v => { await supabase.from('programs').update({ notes: v }).eq('id', p.id); load() }} />
                </div>
              )}

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
                    {activeBlock && (
                      <button className={blockPasteOpen ? 'btn' : 'btn-ghost'} style={{ padding: '6px 12px', fontSize: 13 }}
                        onClick={() => setBlockPasteOpen(o => !o)}>⇩ Paste whole block</button>
                    )}
                    {pBlocks.length > 1 && activeBlock && (
                      <button className="btn-ghost" style={{ padding: '6px 10px', fontSize: 12, color: 'var(--red)' }} onClick={() => deleteBlock(p.id, activeBlock.id)}>Delete block</button>
                    )}
                  </div>

                  {activeBlock && (
                    <>
                      {blockPasteOpen && renderBlockPaste(activeBlock)}
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
                              <span role="group" aria-label="Builder layout" style={{ display: 'inline-flex', gap: 4, marginLeft: 14 }}>
                                <button className={layout === 'cards' ? 'btn' : 'btn-ghost'} aria-pressed={layout === 'cards'} style={{ padding: '6px 14px', fontSize: 13 }} onClick={() => setLayout('cards')}>Cards</button>
                                <button className={layout === 'table' ? 'btn' : 'btn-ghost'} aria-pressed={layout === 'table'} style={{ padding: '6px 14px', fontSize: 13 }} onClick={() => setLayout('table')}>Table</button>
                              </span>
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

                      {layout === 'table' ? (() => {
                        const rots = rotations[activeBlock.id] || []
                        const runWeeks = rots.length
                          ? weeksForRotation(rots, activeRot, activeBlock.weeks || 4)
                          : Array.from({ length: activeBlock.weeks || 4 }, (_, i) => i + 1)
                        // same filter as the card columns: this track, and this rotation
                        // (every-week days show under every rotation tab)
                        const dayList = (days[activeBlock.id] || [])
                          .filter(d => (d.track || 'exercise') === track && (!rots.length || !d.rotation_id || d.rotation_id === activeRot))
                          .sort((a, b) => (a.day_number - b.day_number) || ((a.position ?? 0) - (b.position ?? 0)))
                        return (
                          <ProgramTable
                            key={`${activeBlock.id}-${activeRot || 'all'}-${track}`}
                            block={activeBlock}
                            dayList={dayList}
                            exercisesByDay={exercises}
                            runWeeks={runWeeks.length ? runWeeks : [1]}
                            previewWeek={viewWeek}
                            setPreviewWeek={setViewWeek}
                            onPatch={patchExercise}
                            onAdd={(dayId, name) => addFromTable(activeBlock, dayId, name)}
                            onDelete={deleteExercise}
                            onOpenCards={() => setLayout('cards')}
                            library={library}
                            onReload={loadDay}
                            track={track}
                            onAddDay={async (dn, label) => {
                              const { error } = await supabase.from('program_days').insert({
                                program_id: open, block_id: activeBlock.id, day_label: label, day_number: dn,
                                position: (days[activeBlock.id]?.length || 0), track,
                                rotation_id: (rots.length ? activeRot : null) || null,
                              })
                              if (error) { alert('Could not add workout: ' + error.message); return }
                              loadDays(activeBlock.id)
                            }}
                            onRenameDay={async (day, label) => { await supabase.from('program_days').update({ day_label: label }).eq('id', day.id); loadDays(activeBlock.id) }}
                            onDeleteDay={day => deleteWorkout(activeBlock.id, day.id)}
                          />
                        )
                      })() : (
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

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                                      <NotesBox label="Day notes" value={d.notes} hint="Shown at the top of this workout for the client."
                                        placeholder={'Focus today: explosive intent on every jump.\nKeep rest honest — use the timer.'}
                                        onSave={async v => { await supabase.from('program_days').update({ notes: v }).eq('id', d.id); loadDays(activeBlock.id) }} />
                                      <NotesBox label="Warm-up" value={d.warmup} rows={5} hint="Shown above the exercises as the warm-up to do first."
                                        placeholder={'3 min easy bike\n90/90 hip switches x 8\nBand pull-aparts x 15'}
                                        onSave={async v => { await supabase.from('program_days').update({ warmup: v }).eq('id', d.id); loadDays(activeBlock.id) }} />
                                    </div>
                                    <button className="btn-ghost" style={{ padding: '5px 9px', fontSize: 11.5, width: '100%', marginTop: 4 }}
                                      onClick={() => openPaste(d.id)}>
                                      {pasteDay === d.id ? 'Cancel paste' : '⇩ Paste whole day'}
                                    </button>

                                    {pasteDay === d.id && (() => {
                                      const parsed = parseProgramText(pasteText)
                                      const good = parsed.filter(r => r.name && !r.issues.length)
                                      const bad = parsed.filter(r => !r.name || r.issues.length)
                                      return (
                                        <div style={{ marginTop: 5, border: '1px solid var(--line)', borderRadius: 8, padding: 7, maxWidth: '100%', boxSizing: 'border-box' }}>
                                          <textarea rows={6} value={pasteText} onChange={e => setPasteText(e.target.value)}
                                            placeholder={'A) Incline chest press 3x8-12 @2\nB) Pec deck 3x10-15 RIR 1\nBack squat 4-9@1, 6-12@2'}
                                            style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '6px 8px', fontSize: 12, fontFamily: 'inherit', resize: 'vertical' }} />
                                          {parsed.length > 0 && (
                                            <div style={{ marginTop: 5 }}>
                                              <span className="eyebrow" style={{ fontSize: 9.5 }}>Will add {good.length}</span>
                                              {/* Preview before writing: a mis-read line is obvious here and
                                                  invisible once it's in a client's program. */}
                                              {good.map((r, i) => (
                                                <p key={i} className="muted" style={{ fontSize: 11, margin: '2px 0' }}>
                                                  <span style={{ color: 'var(--orange)' }}>{r.letter || '·'}</span> {r.name}
                                                  {' — '}
                                                  {r.setRows
                                                    ? r.setRows.map(x => `${x.reps}@${x.target}`).join(', ')
                                                    : `${r.sets || 3} × ${r.reps || '8-12'} @ ${r.progression_type === 'rpe' ? 'RPE ' : ''}${r.target || '2'}${r.rest ? ` · rest ${r.rest}` : ''}`}
                                                  {r.metric !== 'reps' && <span style={{ color: 'var(--orange)' }}> · {r.metric}</span>}
                                                  {r.notes && <span style={{ display: 'block', paddingLeft: 12, fontStyle: 'italic' }}>📝 {r.notes}</span>}
                                                </p>
                                              ))}
                                              {bad.map((r, i) => (
                                                <p key={`b${i}`} style={{ fontSize: 11, margin: '2px 0', color: 'var(--red)' }}>
                                                  skipped: {r.raw || '(blank)'}
                                                </p>
                                              ))}
                                            </div>
                                          )}
                                          <button className="btn" disabled={!good.length || pasteBusy}
                                            style={{ padding: '6px 12px', fontSize: 12, width: '100%', marginTop: 6, opacity: good.length && !pasteBusy ? 1 : 0.4 }}
                                            onClick={() => commitPaste(activeBlock, d.id)}>
                                            {pasteBusy ? 'Adding…' : `Add ${good.length} exercise${good.length === 1 ? '' : 's'}`}
                                          </button>
                                          <p className="muted" style={{ fontSize: 10, marginTop: 4 }}>
                                            One exercise per line. Sets/reps and target are optional — anything missing uses 3 × 8-12 @ RIR 2. Timed work: 6x20s on / 90s off RPE 9 (use “min” for minutes; “m” is metres). Add a note after a bar: Box Jump 3x3 | Stop if height drops.
                                          </p>
                                        </div>
                                      )
                                    })()}
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
                      )}
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
