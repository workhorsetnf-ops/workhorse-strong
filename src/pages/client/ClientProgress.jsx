import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Sparkline from '../../lib/Sparkline'

const todayStr = () => new Date().toISOString().slice(0, 10)
const fmt = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export default function ClientProgress() {
  const { profile } = useAuth()
  const [logs, setLogs] = useState([])
  const [weight, setWeight] = useState('')
  const [steps, setSteps] = useState('')
  const [saved, setSaved] = useState(false)
  const [range, setRange] = useState(30)

  async function load() {
    const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)
    const { data } = await supabase.from('daily_logs').select('*')
      .eq('client_id', profile.id).gte('log_date', since).order('log_date')
    setLogs(data || [])
    const todays = (data || []).find(l => l.log_date === todayStr())
    if (todays) { setWeight(todays.weight ?? ''); setSteps(todays.steps ?? '') }
  }
  useEffect(() => { if (profile) load() }, [profile])

  async function save() {
    if (!weight && !steps) return
    await supabase.from('daily_logs').upsert({
      client_id: profile.id, log_date: todayStr(),
      weight: weight === '' ? null : +weight,
      steps: steps === '' ? null : +steps,
    }, { onConflict: 'client_id,log_date' })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
    load()
  }

  const windowed = logs.filter(l => l.log_date >= new Date(Date.now() - range * 864e5).toISOString().slice(0, 10))
  const weightData = windowed.map(l => ({ label: fmt(l.log_date), value: l.weight }))
  const stepsData = windowed.map(l => ({ label: fmt(l.log_date), value: l.steps }))
  const avgSteps = windowed.filter(l => l.steps).length
    ? Math.round(windowed.reduce((s, l) => s + (l.steps || 0), 0) / windowed.filter(l => l.steps).length)
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header>
        <div className="eyebrow">Track</div>
        <h1 style={{ fontSize: 24, marginTop: 4 }}>Daily Log</h1>
      </header>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="eyebrow" style={{ fontSize: 10 }}>Today</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label className="muted" style={{ fontSize: 12 }}>Weight (lbs)</label>
            <input inputMode="decimal" placeholder="e.g. 218.4" value={weight} onChange={e => setWeight(e.target.value)} />
          </div>
          <div>
            <label className="muted" style={{ fontSize: 12 }}>Steps</label>
            <input inputMode="numeric" placeholder="e.g. 8500" value={steps} onChange={e => setSteps(e.target.value)} />
          </div>
        </div>
        <button className="btn" onClick={save}>{saved ? 'Saved ✓' : 'Save today'}</button>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {[7, 30, 90].map(r => (
          <button key={r} className={range === r ? 'btn' : 'btn-ghost'} style={{ padding: '8px 16px', fontSize: 12.5 }} onClick={() => setRange(r)}>{r}d</button>
        ))}
      </div>

      <div className="card">
        <div className="eyebrow" style={{ fontSize: 10, marginBottom: 10 }}>Weight trend</div>
        <Sparkline data={weightData} color="#BF5700" unit=" lbs" />
      </div>

      <div className="card">
        <div className="eyebrow" style={{ fontSize: 10, marginBottom: 4 }}>Steps trend</div>
        {avgSteps && <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Average: {avgSteps.toLocaleString()}/day</div>}
        <Sparkline data={stepsData} color="#4A6FA5" unit=" steps" />
      </div>
    </div>
  )
}
