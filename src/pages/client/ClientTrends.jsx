// Trends, CoachRx-style (Update 189): Day / Week / Month toggle over what the
// client already logs — readiness, steps, sleep, calories, bodyweight and
// training days. Read-only; the "Log today" button goes to the existing Log page.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { localDateStr, logDate } from '../../lib/weeks'
import { countedLogs } from '../../lib/foodlog'
import Sparkline from '../../lib/Sparkline'
import { avgOf, caloriesByDate, dateRange, seriesFrom, tickLabel } from '../../lib/clientRx'

const SPANS = [['day', 'Day', 1], ['week', 'Week', 7], ['month', 'Month', 30]]
const fmt = (v, dp = 0) => (v == null ? '–' : Number(v).toLocaleString(undefined, { maximumFractionDigits: dp, minimumFractionDigits: 0 }))

// Bars with a dashed target line; empty days stay as a short grey stub.
function Bars({ series, max, target, color = 'var(--orange)', span }) {
  const top = Math.max(max || 0, target || 0, ...series.map(p => p.value || 0)) || 1
  return (
    <div>
      <div style={{ position: 'relative', height: 120, display: 'flex', alignItems: 'flex-end', gap: span > 7 ? 2 : 8 }}>
        {target ? <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: `${(target / top) * 100}%`, borderTop: '1.5px dashed var(--muted)', opacity: 0.6 }} /> : null}
        {series.map(p => (
          <div key={p.date} title={`${p.date}: ${p.value ?? 'nothing logged'}`} style={{ flex: 1, height: p.value != null ? `${Math.max(3, (p.value / top) * 100)}%` : 3,
            background: p.value != null ? (target && p.value >= target ? 'var(--green)' : color) : 'var(--line)', borderRadius: 3 }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: span > 7 ? 2 : 8, marginTop: 6 }}>
        {series.map((p, i) => (
          <span key={p.date} className="muted" style={{ flex: 1, textAlign: 'center', fontSize: 11, visibility: span > 7 && i % 5 !== 4 && i !== series.length - 1 ? 'hidden' : 'visible' }}>{tickLabel(p.date, span)}</span>
        ))}
      </div>
    </div>
  )
}

function Panel({ title, value, unit, sub, children }) {
  return (
    <section className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <h2 style={{ fontSize: 22 }}>{title}</h2>
        <span style={{ textAlign: 'right' }}>
          <strong style={{ fontSize: 22 }}>{value}</strong>{unit && <span className="muted" style={{ fontSize: 13 }}> {unit}</span>}
          {sub && <span className="muted" style={{ display: 'block', fontSize: 12 }}>{sub}</span>}
        </span>
      </div>
      {children}
    </section>
  )
}

export default function ClientTrends() {
  const { profile } = useAuth()
  const [span, setSpan] = useState('week')
  const [rows, setRows] = useState(null)   // { daily, meals, trained:Set }
  const today = localDateStr()

  useEffect(() => {
    if (!profile?.id) return
    let gone = false
    const since = dateRange(today, 30)[0]
    Promise.all([
      supabase.from('daily_logs').select('log_date, weight, steps, sleep_hours, readiness, energy').eq('client_id', profile.id).gte('log_date', since).lte('log_date', today),
      supabase.from('meal_logs').select('protein_g, carbs_g, fat_g, meal, logged_on').eq('client_id', profile.id).gte('logged_on', since).lte('logged_on', today),
      supabase.from('workout_logs').select('logged_date, logged_at, session_track').eq('client_id', profile.id).gte('logged_at', since + 'T00:00:00').limit(5000),
    ]).then(([d, m, w]) => {
      if (gone) return
      setRows({
        daily: d.data || [],
        meals: countedLogs(m.data || []),
        trained: new Set((w.data || []).filter(l => l.session_track !== 'lifestyle').map(logDate).filter(Boolean)),
      })
    })
    return () => { gone = true }
  }, [profile?.id, today])

  const n = SPANS.find(s => s[0] === span)[2]
  const dates = useMemo(() => dateRange(today, n), [today, n])
  const p = profile || {}
  const calTarget = (p.protein_g || 0) * 4 + (p.carbs_g || 0) * 4 + (p.fat_g || 0) * 9 || null

  const view = useMemo(() => {
    if (!rows) return null
    const cal = caloriesByDate(rows.meals)
    return {
      readiness: seriesFrom(rows.daily, dates, 'readiness'),
      steps: seriesFrom(rows.daily, dates, 'steps'),
      sleep: seriesFrom(rows.daily, dates, 'sleep_hours'),
      weight: seriesFrom(rows.daily, dates, 'weight'),
      calories: dates.map(d => ({ date: d, value: cal[d] != null ? Math.round(cal[d]) : null })),
      trained: dates.filter(d => rows.trained.has(d)).length,
    }
  }, [rows, dates])

  const headline = (series, dp = 0) => (n === 1 ? fmt(series[0]?.value, dp) : fmt(avgOf(series), dp))
  const subFor = n === 1 ? 'today' : `avg · last ${n} days`
  const loggedDays = s => s.filter(x => x.value != null).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 30 }}>Trends</h1>
        <Link to="/app/progress" className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', fontSize: 14, textDecoration: 'none' }}><Plus size={16} /> Log today</Link>
      </header>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <strong style={{ fontSize: 18 }}>
          {n === 1 ? new Date(today + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
            : `${new Date(dates[0] + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(today + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
        </strong>
        <div role="radiogroup" aria-label="Range" style={{ display: 'flex', gap: 6 }}>
          {SPANS.map(([k, label]) => (
            <button key={k} role="radio" aria-checked={span === k} onClick={() => setSpan(k)}
              style={{ padding: '7px 13px', fontSize: 14, borderRadius: 8, cursor: 'pointer', fontWeight: 700,
                border: '1px solid ' + (span === k ? 'var(--orange)' : 'var(--line)'), background: span === k ? 'var(--steel)' : 'transparent', color: span === k ? 'var(--white)' : 'var(--muted)' }}>{label}</button>
          ))}
        </div>
      </div>

      {!view ? <div className="muted" style={{ fontSize: 14 }}>Loading…</div> : (
        <>
          <Panel title="Readiness" value={headline(view.readiness, 1)} unit="/ 5" sub={subFor}>
            {n > 1 ? <Bars series={view.readiness} max={5} span={n} /> : null}
            {!loggedDays(view.readiness) && <p className="muted" style={{ fontSize: 13 }}>No readiness logged {n === 1 ? 'today' : 'in this range'} yet.</p>}
          </Panel>
          <Panel title="Movement" value={headline(view.steps)} unit="steps" sub={p.steps_target ? `${subFor} · goal ${Number(p.steps_target).toLocaleString()}` : subFor}>
            {n > 1 ? <Bars series={view.steps} target={p.steps_target || null} span={n} /> : null}
            {!loggedDays(view.steps) && <p className="muted" style={{ fontSize: 13 }}>No steps logged {n === 1 ? 'today' : 'in this range'} yet.</p>}
          </Panel>
          <Panel title="Recovery" value={headline(view.sleep, 1)} unit="hrs sleep" sub={subFor}>
            {n > 1 ? <Bars series={view.sleep} target={7} color="#4A9BD1" span={n} /> : null}
            {!loggedDays(view.sleep) && <p className="muted" style={{ fontSize: 13 }}>No sleep logged {n === 1 ? 'today' : 'in this range'} yet.</p>}
          </Panel>
          <Panel title="Nutrition" value={headline(view.calories)} unit="kcal" sub={calTarget ? `${subFor} · target ${calTarget.toLocaleString()}` : subFor}>
            {n > 1 ? <Bars series={view.calories} target={calTarget} span={n} /> : null}
            {!loggedDays(view.calories) && <p className="muted" style={{ fontSize: 13 }}>No food logged {n === 1 ? 'today' : 'in this range'} yet. <Link to="/app/nutrition">Log food</Link></p>}
          </Panel>
          <Panel title="Bodyweight" value={n === 1 ? fmt(view.weight[0]?.value, 1) : fmt(avgOf(view.weight), 1)} unit="lb" sub={subFor}>
            {n > 1 ? <Sparkline data={view.weight.map(x => ({ label: new Date(x.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value: x.value }))} unit=" lb" /> : null}
          </Panel>
          <Panel title="Training" value={n === 1 ? (view.trained ? 'Trained ✓' : '–') : view.trained} unit={n === 1 ? '' : `day${view.trained === 1 ? '' : 's'} trained`} sub={n === 1 ? 'today' : `last ${n} days`} />
        </>
      )}
    </div>
  )
}
