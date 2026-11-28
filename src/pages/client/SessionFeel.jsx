// "Rate Your Effort" at the end of a workout. Started as 1-10 (Update 169);
// since Update 190 it's CoachRx's 1-5 scale plus minutes. rpe (1-10) is still
// saved alongside, mapped from the effort, for the weekly review and AI check-in.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { localDateStr } from '../../lib/weeks'
import { EFFORT, effortOf, effortToRpe, cleanMinutes } from '../../lib/clientRx'

export const FEEL = { 1: 'Barely tried', 3: 'Easy', 5: 'Solid', 7: 'Hard', 8: 'Very hard', 9: 'Near max', 10: 'Everything I had' }
export const feelLabel = n => FEEL[n] || FEEL[Object.keys(FEEL).map(Number).filter(k => k <= n).pop()] || ''

// Upsert one answer. Before the Update 190 migration the effort/minutes columns
// don't exist, so fall back to rpe only rather than losing the answer.
export async function saveFeedback(profile, day, { effort, minutes, note }, date = localDateStr()) {
  const base = { client_id: profile.id, day_id: day.id, day_label: day.day_label || '', session_date: date, rpe: effortToRpe(effort) }
  if (note !== undefined) base.note = String(note || '').trim().slice(0, 500)
  const full = { ...base, effort, minutes: cleanMinutes(minutes) }
  let { error } = await supabase.from('session_feedback').upsert(full, { onConflict: 'client_id,day_id,session_date' })
  if (error && /effort|minutes/i.test(error.message || '')) ({ error } = await supabase.from('session_feedback').upsert(base, { onConflict: 'client_id,day_id,session_date' }))
  return { row: full, error }
}

export function EffortOptions({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Session effort" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1, 2, 3, 4, 5].map(n => {
        const e = EFFORT[n], on = value === n
        return (
          <button key={n} type="button" role="radio" aria-checked={on} onClick={() => onChange(n)}
            style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 20px', borderRadius: 999, cursor: 'pointer', textAlign: 'left', color: 'inherit',
              border: `1.5px solid ${on ? e.color : 'var(--line)'}`, background: on ? `${e.color}22` : 'var(--coal)' }}>
            <span style={{ fontSize: 30, fontWeight: 900, color: e.color, width: 24, textAlign: 'center' }}>{n}</span>
            <span>
              <strong style={{ display: 'block', fontSize: 16, letterSpacing: '.02em' }}>{e.label}</strong>
              <span className="muted" style={{ fontSize: 14 }}>{e.sub}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default function SessionFeel({ profile, day, logged }) {
  const date = localDateStr()
  const [row, setRow] = useState(undefined)   // undefined = loading, null = not answered
  const [effort, setEffort] = useState(null)
  const [minutes, setMinutes] = useState('')
  const [note, setNote] = useState('')
  const [state, setState] = useState('')

  useEffect(() => {
    if (!profile || !day?.id) return
    setRow(undefined); setEffort(null); setMinutes(''); setNote(''); setState('')
    supabase.from('session_feedback').select('*').eq('client_id', profile.id).eq('day_id', day.id).eq('session_date', date).maybeSingle()
      .then(({ data, error }) => setRow(error ? 'off' : data || null))
  }, [profile?.id, day?.id, date])

  if (row === undefined || row === 'off' || !logged) return null   // nothing until a set is logged; hidden before the migration
  async function save() {
    setState('saving')
    const { row: r, error } = await saveFeedback(profile, day, { effort, minutes, note })
    if (error) return setState('Could not save: ' + error.message)
    setRow({ ...r, note: note.trim() }); setState('')
  }

  const e = effortOf(row)
  if (row && state !== 'edit') return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
      <span style={{ fontSize: 13.5, flex: 1 }}>
        <span className="muted">Effort: </span>
        <strong style={{ color: EFFORT[e]?.color }}>{e}/5 · {EFFORT[e]?.label}</strong>
        {row.minutes ? <span className="muted"> · {row.minutes} min</span> : null}
        {row.note ? <span className="muted"> · {row.note}</span> : null}
      </span>
      <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => { setEffort(e); setMinutes(row.minutes ? String(row.minutes) : ''); setNote(row.note || ''); setState('edit') }}>Change</button>
    </div>
  )
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, borderLeft: '3px solid var(--orange)' }}>
      <div>
        <strong style={{ fontSize: 17 }}>Rate your effort</strong>
        <div className="muted" style={{ fontSize: 12.5 }}>Your coach sees this.</div>
      </div>
      <EffortOptions value={effort} onChange={setEffort} />
      <label style={{ fontSize: 14 }}>How many minutes was your workout?
        <input inputMode="numeric" placeholder='e.g. "30"' value={minutes} onChange={ev => setMinutes(ev.target.value)} style={{ marginTop: 6 }} />
      </label>
      <input placeholder="Anything worth knowing? (optional: sleep, pain, energy, PR…)" maxLength={500} value={note} onChange={ev => setNote(ev.target.value)} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn" disabled={!effort || state === 'saving'} onClick={save}>{state === 'saving' ? 'Saving…' : 'Save'}</button>
        {state && !['saving', 'edit'].includes(state) && <span style={{ color: 'var(--red)', fontSize: 12.5 }}>{state}</span>}
      </div>
    </div>
  )
}
