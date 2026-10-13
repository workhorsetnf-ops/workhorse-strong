import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { localDateStr, mondayOf, weekDaysFrom } from '../../lib/weeks'
import { weekCompliance } from '../coach/CoachHealth'

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export default function ClientSupplements() {
  const { profile } = useAuth()
  const [supps, setSupps] = useState([])
  const [logs, setLogs] = useState([])
  const [pending, setPending] = useState(new Set())
  const today = localDateStr()
  const days = weekDaysFrom(mondayOf(today))

  async function load() {
    const [{ data: s }, { data: l }] = await Promise.all([
      supabase.from('client_supplements').select('*').eq('client_id', profile.id).eq('active', true).order('position').order('created_at'),
      supabase.from('supplement_logs').select('id, supplement_id, log_date').eq('client_id', profile.id).gte('log_date', days[0]).lte('log_date', days[6]),
    ])
    setSupps(s || []); setLogs(l || [])
  }
  useEffect(() => { if (profile) load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [profile])

  const has = (id, d) => logs.some(l => l.supplement_id === id && l.log_date === d)

  // Tap to tick / untick today. Shown straight away, then written; a failed
  // write reloads so the screen never claims something that didn't save.
  async function toggle(s, d = today) {
    const key = `${s.id}|${d}`
    if (pending.has(key)) return
    setPending(p => new Set(p).add(key))
    const on = has(s.id, d)
    setLogs(prev => on ? prev.filter(l => !(l.supplement_id === s.id && l.log_date === d)) : [...prev, { supplement_id: s.id, log_date: d }])
    const { error } = on
      ? await supabase.from('supplement_logs').delete().eq('supplement_id', s.id).eq('log_date', d)
      : await supabase.from('supplement_logs').insert({ client_id: profile.id, supplement_id: s.id, log_date: d })
    setPending(p => { const n = new Set(p); n.delete(key); return n })
    if (error) load()
  }

  const doneToday = supps.filter(s => has(s.id, today)).length
  const compliance = weekCompliance(supps, logs, days, today)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header>
        <div className="eyebrow">Daily</div>
        <h1 style={{ fontSize: 24, marginTop: 4 }}>Supplements</h1>
      </header>

      {supps.length === 0 && (
        <div className="card muted" style={{ fontSize: 14 }}>Your coach hasn't set up a supplement plan for you yet.</div>
      )}

      {supps.length > 0 && <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="card" style={{ textAlign: 'center', padding: '12px 8px', borderTop: '3px solid var(--orange)' }}>
            <div className="muted" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>Today</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--orange-hot)' }}>{doneToday}/{supps.length}</div>
          </div>
          <div className="card" style={{ textAlign: 'center', padding: '12px 8px', borderTop: '3px solid var(--orange)' }}>
            <div className="muted" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>This week</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{compliance === null ? '—' : `${Math.round(compliance * 100)}%`}</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="eyebrow" style={{ fontSize: 10 }}>Tap when you've taken it</div>
          {supps.map(s => {
            const on = has(s.id, today)
            return (
              <button key={s.id} type="button" onClick={() => toggle(s)} aria-pressed={on}
                style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', padding: '12px 12px', borderRadius: 10, cursor: 'pointer', width: '100%',
                  border: '1px solid ' + (on ? 'var(--orange)' : 'var(--line)'), background: on ? 'rgba(255,106,0,0.14)' : 'transparent', color: 'inherit', font: 'inherit' }}>
                <span style={{ width: 30, height: 30, borderRadius: 15, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 900,
                  background: on ? 'var(--orange)' : 'transparent', border: on ? 'none' : '1.5px solid var(--line)', color: '#000' }}>{on ? '✓' : ''}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ display: 'block', fontSize: 15 }}>{s.name}</strong>
                  <span style={{ fontSize: 12.5, color: 'var(--orange-hot)', fontWeight: 700 }}>{s.dose}</span>
                  {s.timing && <span className="muted" style={{ fontSize: 12.5 }}> · {s.timing}</span>}
                  {s.notes && <span className="muted" style={{ display: 'block', fontSize: 11.5, fontStyle: 'italic', marginTop: 2 }}>{s.notes}</span>}
                </span>
              </button>
            )
          })}
        </div>

        <div className="card" style={{ overflowX: 'auto' }}>
          <div className="eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>This week</div>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th />
                {days.map((d, i) => (
                  <th key={d} style={{ fontSize: 11, fontWeight: 800, padding: '4px 2px', textAlign: 'center', color: d === today ? 'var(--orange-hot)' : 'var(--muted)' }}>{DAY_LETTERS[i]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {supps.map(s => (
                <tr key={s.id}>
                  <td style={{ fontSize: 12.5, fontWeight: 700, padding: '6px 6px 6px 0', borderTop: '1px solid var(--line)', whiteSpace: 'nowrap', maxWidth: 96, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</td>
                  {days.map(d => {
                    const on = has(s.id, d)
                    return (
                      <td key={d} style={{ borderTop: '1px solid var(--line)', padding: '2px 1px', textAlign: 'center' }}>
                        <button type="button" disabled={d > today} onClick={() => toggle(s, d)} aria-label={`${s.name} ${d}`}
                          style={{ width: 26, height: 26, padding: 0, borderRadius: 6, border: '1px solid ' + (on ? 'var(--orange)' : 'var(--line)'), background: on ? 'var(--orange)' : 'transparent',
                            color: '#000', fontWeight: 900, cursor: d > today ? 'default' : 'pointer', opacity: d > today ? 0.3 : 1 }}>{on ? '✓' : ''}</button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>Forgot to tick one earlier this week? Tap that day.</p>
        </div>
      </>}
    </div>
  )
}
