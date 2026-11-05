// "How did that feel?" at the end of a workout (Update 169). One tap for
// effort 1-10, an optional note, saved once per session per day.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { localDateStr } from '../../lib/weeks'

export const FEEL = { 1: 'Barely tried', 3: 'Easy', 5: 'Solid', 7: 'Hard', 8: 'Very hard', 9: 'Near max', 10: 'Everything I had' }
export const feelLabel = n => FEEL[n] || FEEL[Object.keys(FEEL).map(Number).filter(k => k <= n).pop()] || ''

export default function SessionFeel({ profile, day, logged }) {
  const date = localDateStr()
  const [row, setRow] = useState(undefined)   // undefined = loading, null = not answered
  const [rpe, setRpe] = useState(null)
  const [note, setNote] = useState('')
  const [state, setState] = useState('')

  useEffect(() => {
    if (!profile || !day?.id) return
    setRow(undefined); setRpe(null); setNote(''); setState('')
    supabase.from('session_feedback').select('*').eq('client_id', profile.id).eq('day_id', day.id).eq('session_date', date).maybeSingle()
      .then(({ data, error }) => setRow(error ? 'off' : data || null))
  }, [profile?.id, day?.id, date])

  if (row === undefined || row === 'off' || !logged) return null   // nothing until a set is logged; hidden before the migration
  async function save() {
    setState('saving')
    const r = { client_id: profile.id, day_id: day.id, day_label: day.day_label || '', session_date: date, rpe, note: note.trim().slice(0, 500) }
    const { error } = await supabase.from('session_feedback').upsert(r, { onConflict: 'client_id,day_id,session_date' })
    if (error) return setState('Could not save: ' + error.message)
    setRow(r); setState('')
  }

  if (row && state !== 'edit') return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
      <span style={{ fontSize: 13.5, flex: 1 }}><span className="muted">Felt: </span><strong>{row.rpe}/10 · {feelLabel(row.rpe)}</strong>{row.note ? <span className="muted"> · {row.note}</span> : null}</span>
      <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => { setRpe(row.rpe); setNote(row.note || ''); setState('edit') }}>Change</button>
    </div>
  )
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, borderLeft: '3px solid var(--orange)' }}>
      <div>
        <strong style={{ fontSize: 15 }}>How did that feel?</strong>
        <div className="muted" style={{ fontSize: 12.5 }}>1 = barely tried · 10 = everything you had. Your coach sees this.</div>
      </div>
      <div role="group" aria-label="Session effort" style={{ display: 'grid', gridTemplateColumns: 'repeat(10, minmax(0, 1fr))', gap: 4 }}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
          <button key={n} type="button" aria-pressed={rpe === n} onClick={() => setRpe(n)}
            style={{ padding: '9px 0', borderRadius: 8, fontWeight: 800, fontSize: 14, cursor: 'pointer', border: 'none',
              background: rpe === n ? 'var(--orange)' : 'var(--steel)', color: rpe === n ? '#000' : 'inherit' }}>{n}</button>
        ))}
      </div>
      {rpe && <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--orange-hot)' }}>{feelLabel(rpe)}</div>}
      <input placeholder="Anything worth knowing? (optional: sleep, pain, energy, PR…)" maxLength={500} value={note} onChange={e => setNote(e.target.value)} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn" disabled={!rpe || state === 'saving'} onClick={save}>{state === 'saving' ? 'Saving…' : 'Save'}</button>
        {state && !['saving', 'edit'].includes(state) && <span style={{ color: 'var(--red)', fontSize: 12.5 }}>{state}</span>}
      </div>
    </div>
  )
}
