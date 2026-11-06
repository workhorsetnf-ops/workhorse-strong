// Coach: build the next block of a program from the one before it (Update 175).
// Same days, same week-to-week pattern a notch harder. Swap exercises or change
// the method on any of them, then save; clients on the program roll into it.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { buildLibraryIndex, findInLibrary, withLibrary } from '../../lib/parse'
import { DEFAULT_STEP, METHODS, nextExercise, weeksPreview, nextBlockName, rolloverStart } from '../../lib/nextBlock'
import { mondayOf, localDateStr } from '../../lib/weeks'

export default function NextBlockBuilder({ program, block, blocks, assignments, library, onDone, onClose }) {
  const [days, setDays] = useState(null)
  const [exs, setExs] = useState({})       // dayId -> exercises
  const [rots, setRots] = useState([])
  const [name, setName] = useState(nextBlockName(block.name, blocks.length))
  const [weeks, setWeeks] = useState(block.weeks || 4)
  const [step, setStep] = useState(DEFAULT_STEP)
  const [plan, setPlan] = useState({})     // exId -> { name, method, custom, customType }
  const [roll, setRoll] = useState(true)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    ;(async () => {
      const [{ data: d }, { data: r }] = await Promise.all([
        supabase.from('program_days').select('*').eq('block_id', block.id).order('day_number').order('position'),
        supabase.from('program_rotations').select('*').eq('block_id', block.id).order('position'),
      ])
      const ids = (d || []).map(x => x.id)
      const { data: e } = ids.length ? await supabase.from('program_exercises').select('*').in('day_id', ids).order('position') : { data: [] }
      const by = {}
      for (const x of e || []) (by[x.day_id] ||= []).push(x)
      setDays(d || []); setExs(by); setRots(r || [])
    })()
  }, [block.id])

  const libIndex = useMemo(() => buildLibraryIndex(library || []), [library])
  const W = Math.max(1, Math.min(16, Number(weeks) || 1))
  const lifting = d => (d.track || 'exercise') === 'exercise'
  const built = useMemo(() => {
    const out = {}
    for (const list of Object.values(exs)) for (const ex of list) {
      const p = plan[ex.id] || {}
      const r = nextExercise(ex, p, W, block.weeks || 4, step)
      out[ex.id] = r
    }
    return out
  }, [exs, plan, W, step, block.weeks])
  const setP = (id, patch) => setPlan(p => ({ ...p, [id]: { ...(p[id] || {}), ...patch } }))
  const manual = assignments.filter(a => a.program_id === program.id && a.week_mode !== 'auto')
  const errors = Object.values(built).filter(b => b.error).length

  async function save() {
    if (errors) return setErr('Fix the custom lines marked in red first.')
    setBusy('Building…'); setErr('')
    try {
      const order = [...blocks].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      const at = order.findIndex(b => b.id === block.id) + 1
      // make room right after the source block
      for (const b of order.slice(at).reverse()) await supabase.from('program_blocks').update({ position: (b.position ?? 0) + 1 }).eq('id', b.id)
      const { data: nb, error: be } = await supabase.from('program_blocks').insert({ program_id: program.id, name: name.trim() || nextBlockName(block.name, blocks.length), weeks: W, position: (block.position ?? 0) + 1 }).select().single()
      if (be || !nb) throw new Error(be?.message || 'Could not create the block')
      const rotMap = {}
      for (const r of rots) {
        const { data: nr } = await supabase.from('program_rotations').insert({ block_id: nb.id, name: r.name, position: r.position }).select().single()
        if (nr) rotMap[r.id] = nr.id
      }
      for (const d of days) {
        const { id, block_id, created_at, ...rest } = d
        const { data: nd, error: de } = await supabase.from('program_days').insert({ ...rest, block_id: nb.id, rotation_id: d.rotation_id ? rotMap[d.rotation_id] || null : null }).select().single()
        if (de || !nd) throw new Error(de?.message || 'Could not copy a day')
        const rows = (exs[d.id] || []).map(ex => {
          let row = lifting(d) ? built[ex.id].row : { ...ex }
          const p = plan[ex.id] || {}
          const newName = (p.name ?? ex.name).trim()
          if (lifting(d) && newName && newName !== ex.name) {
            row = withLibrary({ ...row, name: newName, video_url: '', icon_url: null, notes: '' }, findInLibrary(libIndex, newName))
          }
          const { id: _i, day_id, created_at: _c, ...copy } = row
          return { ...copy, day_id: nd.id }
        })
        if (rows.length) {
          const { error: ee } = await supabase.from('program_exercises').insert(rows)
          if (ee) throw new Error(ee.message)
        }
      }
      const total = order.reduce((s, b) => s + (Number(b.weeks) || 0), 0) + W
      await supabase.from('programs').update({ weeks: total }).eq('id', program.id)
      // manual-week clients: keep their place, switch to automatic so they roll on
      if (roll && manual.length) {
        const monday = mondayOf(localDateStr())
        for (const a of manual) {
          await supabase.from('program_assignments').update({ week_mode: 'auto', start_date: rolloverStart(a, order, monday) }).eq('id', a.id)
        }
      }
      setBusy(''); onDone?.(nb)
    } catch (e) { setErr(e.message); setBusy('') }
  }

  const stepInput = (k, label, opts) => (
    <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>{label}
      <select value={step[k]} onChange={e => setStep(s => ({ ...s, [k]: Number(e.target.value) }))} style={{ width: 'auto', padding: '4px 8px', fontSize: 12.5 }}>
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )

  return (
    <div className="card" style={{ marginTop: 12, borderLeft: '3px solid var(--orange)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow" style={{ fontSize: 10 }}>Next block from “{block.name}”</div>
          <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>Same days and the same week-to-week pattern, a notch harder. Swap any exercise or change its method below, then build.</p>
        </div>
        <button className="btn-ghost" onClick={onClose} style={{ padding: '5px 10px', fontSize: 12 }}>Close</button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Block name" style={{ flex: 1, minWidth: 180 }} />
        <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>Weeks
          <input inputMode="numeric" value={weeks} onChange={e => setWeeks(e.target.value)} style={{ width: 60, padding: '5px 8px' }} />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '8px 10px', background: 'var(--coal)', borderRadius: 10 }}>
        <strong style={{ fontSize: 12.5, width: '100%' }}>Step up (every exercise you keep)</strong>
        {stepInput('rir', 'RIR', [[0, 'same'], [1, '−1 (min 0)'], [2, '−2']])}
        {stepInput('rpe', 'RPE', [[0, 'same'], [0.5, '+0.5'], [1, '+1']])}
        {stepInput('pct', '%', [[0, 'same'], [2.5, '+2.5%'], [5, '+5%']])}
        {stepInput('reps', 'Reps', [[-2, '−2'], [-1, '−1'], [0, 'same'], [1, '+1'], [2, '+2']])}
      </div>

      {!days && <p className="muted" style={{ fontSize: 13, margin: 0 }}>Loading the block…</p>}
      {days?.map(d => (
        <div key={d.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
          <strong style={{ fontSize: 13.5 }}>Day {d.day_number} · {d.day_label}{!lifting(d) && <span className="muted" style={{ fontWeight: 500 }}> · copied as is</span>}</strong>
          {lifting(d) && (exs[d.id] || []).map(ex => {
            const p = plan[ex.id] || {}
            const b = built[ex.id] || {}
            if (ex.kind === 'conditioning') return <div key={ex.id} className="muted" style={{ fontSize: 12.5 }}>{ex.letter && `${ex.letter}) `}{ex.name} · conditioning, copied as is</div>
            return (
              <div key={ex.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 0' }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ color: 'var(--orange-hot)', fontWeight: 800, minWidth: 24, fontSize: 13 }}>{ex.letter}</span>
                  <input list="nb-lib" value={p.name ?? ex.name} onChange={e => setP(ex.id, { name: e.target.value })} aria-label={`Exercise for ${ex.name}`}
                    style={{ flex: 1, minWidth: 160, padding: '5px 8px', fontSize: 13, borderColor: (p.name ?? ex.name) !== ex.name ? 'var(--orange)' : undefined }} />
                  <select value={p.method || 'keep'} onChange={e => setP(ex.id, { method: e.target.value })} aria-label={`Method for ${ex.name}`} style={{ width: 'auto', padding: '5px 8px', fontSize: 12.5 }}>
                    {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                {p.method === 'custom' && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingLeft: 30 }}>
                    <input value={p.custom || ''} onChange={e => setP(ex.id, { custom: e.target.value })} placeholder="e.g. 4x6-8 @1  or  5@8, 8@7, 8@7"
                      style={{ flex: 1, minWidth: 180, padding: '5px 8px', fontSize: 13, borderColor: b.error ? 'var(--red)' : undefined }} />
                    <select value={p.customType || ex.progression_type || 'rir'} onChange={e => setP(ex.id, { customType: e.target.value })} style={{ width: 'auto', padding: '5px 8px', fontSize: 12.5 }}>
                      <option value="rir">RIR</option><option value="rpe">RPE</option><option value="percent">%</option>
                    </select>
                  </div>
                )}
                <div className="muted" style={{ fontSize: 11.5, paddingLeft: 30, color: b.error ? 'var(--red)' : undefined }}>
                  {b.error || weeksPreview(b.row)}
                </div>
              </div>
            )
          })}
        </div>
      ))}
      <datalist id="nb-lib">{(library || []).map(l => <option key={l.id} value={l.name} />)}</datalist>

      {manual.length > 0 && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
          <input type="checkbox" checked={roll} onChange={e => setRoll(e.target.checked)} style={{ width: 'auto', marginTop: 3 }} />
          <span>Roll {manual.length} client{manual.length === 1 ? '' : 's'} on manual weeks straight into the new block when this one ends. They stay on the week they’re on now and switch to automatic weeks.</span>
        </label>
      )}
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>Clients on automatic weeks roll into it on their own.</p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn" disabled={!days || !!busy} onClick={save}>{busy || `Build ${name || 'block'}`}</button>
        {err && <span style={{ color: 'var(--red)', fontSize: 13 }}>{err}</span>}
      </div>
    </div>
  )
}
