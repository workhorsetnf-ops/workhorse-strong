import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

export default function ClientRecap() {
  const { profile } = useAuth()
  const [stats, setStats] = useState(null)

  useEffect(() => {
    if (!profile) return
    const since = new Date(); since.setDate(since.getDate() - 30)
    const sinceStr = since.toISOString()
    Promise.all([
      supabase.from('workout_logs').select('logged_at, weight, reps').eq('client_id', profile.id).gte('logged_at', sinceStr),
      supabase.from('daily_logs').select('log_date, weight, steps').eq('client_id', profile.id).gte('log_date', since.toISOString().slice(0,10)).order('log_date'),
      supabase.from('checkins').select('submitted_at').eq('client_id', profile.id).gte('submitted_at', sinceStr),
    ]).then(([{ data: logs }, { data: daily }, { data: checkins }]) => {
      const days = new Set((logs || []).map(l => l.logged_at.slice(0,10)))
      const totalVolume = (logs || []).reduce((s, l) => s + ((+l.weight || 0) * (+l.reps || 0)), 0)
      const weighed = (daily || []).filter(d => d.weight)
      const weightChange = weighed.length >= 2 ? weighed[weighed.length-1].weight - weighed[0].weight : null
      const avgSteps = (daily || []).filter(d => d.steps).length
        ? Math.round((daily || []).reduce((s,d) => s + (d.steps||0), 0) / (daily || []).filter(d => d.steps).length)
        : null
      setStats({
        sessions: days.size,
        volume: Math.round(totalVolume).toLocaleString(),
        weightChange,
        avgSteps,
        checkins: (checkins || []).length,
      })
    })
  }, [profile])

  if (!stats) return <div className="muted">Building your recap…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header>
        <div className="eyebrow">Last 30 days</div>
        <h1 style={{ fontSize: 26, marginTop: 4 }}>Your Month</h1>
      </header>

      <div className="card glow-behind" style={{ textAlign: 'center', padding: '28px 20px' }}>
        <div style={{ fontSize: 44, fontWeight: 900, color: 'var(--orange-hot)', fontFamily: "'Anton', sans-serif" }}>{stats.sessions}</div>
        <div className="muted" style={{ fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Sessions logged</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="card">
          <div style={{ fontSize: 22, fontWeight: 800 }}>{stats.volume}</div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>lbs moved (total volume)</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 22, fontWeight: 800, color: stats.weightChange === null ? undefined : stats.weightChange < 0 ? 'var(--green)' : 'var(--orange-hot)' }}>
            {stats.weightChange === null ? '—' : `${stats.weightChange > 0 ? '+' : ''}${stats.weightChange.toFixed(1)}`}
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>lbs weight change</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 22, fontWeight: 800 }}>{stats.avgSteps ? stats.avgSteps.toLocaleString() : '—'}</div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>avg daily steps</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 22, fontWeight: 800 }}>{stats.checkins}</div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>check-ins submitted</div>
        </div>
      </div>

      <div className="card" style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 14, lineHeight: 1.5 }}>
          {stats.sessions >= 12 ? "Strong month. That's real, consistent work." :
           stats.sessions >= 6 ? "Solid effort — let's keep building on this." :
           "A lighter month — let's talk about what's getting in the way."}
        </p>
      </div>
    </div>
  )
}
