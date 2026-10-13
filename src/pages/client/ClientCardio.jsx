import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { localDateStr, mondayOf, weekDaysFrom } from '../../lib/weeks'
import { WEEKDAYS, maxHR, zoneRanges, zoneText, planTotals } from '../../lib/cardio'

export default function ClientCardio() {
  const { profile } = useAuth()
  const [settings, setSettings] = useState(null)
  const [plan, setPlan] = useState([])
  const [daily, setDaily] = useState([])
  const today = localDateStr()
  const days = weekDaysFrom(mondayOf(today))

  useEffect(() => {
    if (!profile) return
    Promise.all([
      supabase.from('client_cardio_settings').select('*').eq('client_id', profile.id).maybeSingle(),
      supabase.from('client_cardio_plan').select('*').eq('client_id', profile.id).order('weekday'),
      supabase.from('daily_logs').select('log_date, cardio_min').eq('client_id', profile.id).gte('log_date', days[0]).lte('log_date', days[6]),
    ]).then(([{ data: s }, { data: p }, { data: d }]) => { setSettings(s || {}); setPlan(p || []); setDaily(d || []) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  if (!settings) return <p className="muted">Loading…</p>
  const hr = maxHR(settings)
  const totals = planTotals(plan)
  const logged = Object.fromEntries(daily.map(d => [d.log_date, d.cardio_min]))
  const weekLogged = daily.reduce((a, d) => a + (Number(d.cardio_min) || 0), 0)
  const pct = totals.total ? Math.min(100, Math.round((weekLogged / totals.total) * 100)) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header>
        <div className="eyebrow">Conditioning</div>
        <h1 style={{ fontSize: 24, marginTop: 4 }}>Cardio Plan</h1>
      </header>

      {plan.length === 0 && <div className="card muted" style={{ fontSize: 14 }}>Your coach hasn't set a cardio plan yet.</div>}

      {plan.length > 0 && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '3px solid var(--orange)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div className="eyebrow" style={{ fontSize: 10 }}>This week</div>
            <strong style={{ color: 'var(--orange-hot)', fontSize: 15 }}>{weekLogged} / {totals.total} min</strong>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'var(--steel)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--orange)' }} />
          </div>
          <div className="muted" style={{ fontSize: 12 }}>Zone 2 planned: {totals.zone2} min (target {settings.zone2_target ?? 120}) · HIIT: {totals.hiit}</div>
        </div>
      )}

      {plan.length > 0 && (
        <div className="card" style={{ padding: '12px 14px' }}>
          {WEEKDAYS.map((day, wd) => {
            const r = plan.find(p => p.weekday === wd)
            const date = days[wd]
            const isToday = date === today
            const mins = logged[date]
            const done = mins !== undefined && mins !== null && r?.minutes && Number(mins) >= Number(r.minutes)
            return (
              <div key={day} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 0', borderTop: wd ? '1px solid var(--line)' : 'none' }}>
                <div style={{ width: 44, flexShrink: 0, fontSize: 12, fontWeight: 800, color: isToday ? 'var(--orange-hot)' : 'var(--muted)' }}>{day.slice(0, 3).toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {r && (r.cardio_type || r.minutes)
                    ? <>
                        <strong style={{ fontSize: 14, color: 'var(--orange-hot)' }}>{r.cardio_type || 'Cardio'}</strong>
                        <span style={{ fontSize: 13 }}> · {r.modality || ''}{r.minutes ? ` · ${r.minutes} min` : ''}</span>
                        {r.zone && <div className="muted" style={{ fontSize: 11.5 }}>{r.zone} · {zoneText(r.zone, hr.bpm) || 'zone'}{r.notes ? ` · ${r.notes}` : ''}</div>}
                        {!r.zone && r.notes && <div className="muted" style={{ fontSize: 11.5 }}>{r.notes}</div>}
                      </>
                    : <span className="muted" style={{ fontSize: 13 }}>Rest</span>}
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, minWidth: 54, textAlign: 'right', color: done ? 'var(--orange-hot)' : 'var(--muted)' }}>
                  {mins !== undefined && mins !== null ? `${mins} min${done ? ' ✓' : ''}` : date <= today && r?.minutes ? '—' : ''}
                </div>
              </div>
            )
          })}
          <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>Log your cardio minutes each day in the <Link to="/app/progress" style={{ color: 'var(--orange-hot)', fontWeight: 700 }}>Daily Log</Link>.</p>
        </div>
      )}

      {hr.bpm && (
        <div className="card" style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <div className="eyebrow" style={{ fontSize: 10 }}>Your heart-rate zones</div>
            <span className="muted" style={{ fontSize: 11.5 }}>Max {hr.bpm} bpm</span>
          </div>
          {zoneRanges(hr.bpm).map(z => (
            <div key={z.zone} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: '1px solid var(--line)' }}>
              <strong style={{ width: 28, color: 'var(--orange-hot)' }}>{z.zone}</strong>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 13.5 }}>{z.name}</strong>
                <span className="muted" style={{ display: 'block', fontSize: 11.5 }}>{z.feel}</span>
              </span>
              <strong style={{ fontSize: 14, whiteSpace: 'nowrap' }}>{z.low}–{z.high}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
