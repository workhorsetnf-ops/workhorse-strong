// Pick which weekday each program day runs on (Update 164). Used by the coach
// (Programs → assignment row) and by the client (Train tab and Calendar).
// The program is written as Day 1, Day 2…; by default Day N runs on weekday N
// (Day 1 = Monday). This stores only the days that differ.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { WEEKDAY_SHORT, dayWeekday, dayMapOrNull } from '../lib/weeks'

// One row per program Day N that has something in it, with its session names.
export function programDayRows(days) {
  const by = new Map()
  for (const d of days || []) {
    const dn = Number(d.day_number)
    if (!(dn >= 1 && dn <= 7)) continue
    if (!by.has(dn)) by.set(dn, { dayNumber: dn, labels: [], tracks: new Set() })
    const r = by.get(dn)
    const label = String(d.day_label || '').trim()
    if (label && !r.labels.includes(label)) r.labels.push(label)
    r.tracks.add(d.track || 'exercise')
  }
  return [...by.values()].sort((a, b) => a.dayNumber - b.dayNumber)
    .map(r => ({ dayNumber: r.dayNumber, labels: r.labels, tracks: [...r.tracks] }))
}

// "Mon · Tue · Thu · Fri" for the days that have training on them.
export function daysSummary(rows, map) {
  const wds = [...new Set(rows.filter(r => r.tracks.some(t => t !== 'lifestyle')).map(r => dayWeekday(r.dayNumber, map)))].sort((a, b) => a - b)
  return wds.map(w => WEEKDAY_SHORT[w - 1]).join(' · ')
}

// Weekdays that would get more than one program day.
export function doubledUp(rows, map) {
  const count = {}
  for (const r of rows) if (r.tracks.some(t => t !== 'lifestyle')) { const w = dayWeekday(r.dayNumber, map); count[w] = (count[w] || 0) + 1 }
  return Object.keys(count).filter(w => count[w] > 1).map(Number).sort((a, b) => a - b)
}

// Save: the coach writes the assignment directly; a client goes through
// set_my_training_days(), which can only touch their own assignment.
export async function saveTrainingDays({ asCoach, assignmentId, map }) {
  const clean = dayMapOrNull(map)
  if (asCoach) return supabase.from('program_assignments').update({ day_map: clean }).eq('id', assignmentId)
  return supabase.rpc('set_my_training_days', { new_map: clean })
}

export default function TrainingDays({ programId, initialMap, asCoach = false, assignmentId = null, clientName = '', onSaved, onClose }) {
  const [rows, setRows] = useState(null)
  const [map, setMap] = useState(() => ({ ...(initialMap || {}) }))
  const [state, setState] = useState('')
  const [base, setBase] = useState(() => dayMapOrNull(initialMap)) // what's saved right now

  useEffect(() => {
    if (!programId) return
    supabase.from('program_days').select('day_number, day_label, track, position').eq('program_id', programId).order('day_number').order('position')
      .then(({ data }) => setRows(programDayRows(data || [])))
  }, [programId])

  function pick(dn, wd) {
    setState('')
    setMap(m => { const n = { ...m }; if (wd === dn) delete n[dn]; else n[dn] = wd; return n })
  }
  async function save() {
    setState('saving')
    const { error } = await saveTrainingDays({ asCoach, assignmentId, map })
    if (error) return setState(/set_my_training_days|day_map/.test(error.message) ? 'This needs an update on the coach’s side first.' : 'Could not save: ' + error.message)
    setState('saved')
    setBase(dayMapOrNull(map))
    onSaved?.(dayMapOrNull(map))
  }

  const changed = JSON.stringify(dayMapOrNull(map)) !== JSON.stringify(base)
  const custom = !!dayMapOrNull(map)
  const doubles = rows ? doubledUp(rows, map) : []

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, borderLeft: '3px solid var(--orange)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <div>
          <div className="eyebrow" style={{ fontSize: 10 }}>{asCoach ? `Training days${clientName ? ` · ${clientName}` : ''}` : 'My training days'}</div>
          <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>
            {asCoach ? 'Pick the weekday each program day runs on for this client.' : 'Can’t train on the days the program is written for? Pick the days that work for you.'}
          </p>
        </div>
        {onClose && <button className="btn-ghost" onClick={onClose} style={{ padding: '5px 10px', fontSize: 12 }}>Close</button>}
      </div>

      {!rows && <p className="muted" style={{ fontSize: 13, margin: 0 }}>Loading…</p>}
      {rows && rows.length === 0 && <p className="muted" style={{ fontSize: 13, margin: 0 }}>This program has no days yet.</p>}
      {rows && rows.map(r => {
        const on = dayWeekday(r.dayNumber, map)
        return (
          <div key={r.dayNumber}>
            <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 5 }}>
              Day {r.dayNumber}{r.labels.length ? <span className="muted" style={{ fontWeight: 600 }}> · {r.labels.join(' / ')}</span> : null}
            </div>
            <div role="group" aria-label={`Day ${r.dayNumber} weekday`} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
              {WEEKDAY_SHORT.map((w, i) => {
                const wd = i + 1, sel = wd === on
                return (
                  <button key={w} type="button" aria-pressed={sel} onClick={() => pick(r.dayNumber, wd)}
                    style={{ padding: '7px 0', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer',
                      background: sel ? 'var(--orange)' : 'var(--steel)', color: sel ? '#000' : 'inherit',
                      border: wd === r.dayNumber && !sel ? '1px dashed var(--muted)' : '1px solid transparent' }}
                    title={wd === r.dayNumber ? 'Program default' : undefined}>{w}</button>
                )
              })}
            </div>
          </div>
        )
      })}

      {rows && rows.length > 0 && (
        <>
          <div style={{ fontSize: 13 }}><span className="muted">Training on: </span><strong>{daysSummary(rows, map) || '—'}</strong></div>
          {doubles.length > 0 && (
            <div style={{ fontSize: 12.5, background: 'rgba(229,72,77,.1)', borderRadius: 8, padding: '7px 10px' }}>
              Two sessions on {doubles.map(w => WEEKDAY_SHORT[w - 1]).join(', ')}. Fine if that{'’'}s a double day; otherwise move one.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn" onClick={save} disabled={!changed || state === 'saving'}>{state === 'saving' ? 'Saving…' : 'Save days'}</button>
            {custom && <button className="btn-ghost" onClick={() => { setMap({}); setState('') }}>Back to program days</button>}
            {state === 'saved' && <span style={{ fontSize: 13, color: 'var(--green)' }}>Saved. Calendar and Train now use these days.</span>}
            {state && !['saved', 'saving'].includes(state) && <span style={{ fontSize: 13, color: 'var(--red)' }}>{state}</span>}
          </div>
        </>
      )}
    </div>
  )
}
