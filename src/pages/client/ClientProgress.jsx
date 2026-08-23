import { useEffect, useRef, useState } from 'react'
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
  const [measurements, setMeasurements] = useState([])
  const [mform, setMform] = useState({ waist: '', chest: '', arms: '', thighs: '', hips: '', neck: '' })
  const [msaved, setMsaved] = useState(false)

  // guards so the auto-save effects below don't fire while we're populating
  // fields FROM the database on load — only real user edits should trigger a save
  const dailyLoaded = useRef(false)
  const measurementsLoaded = useRef(false)

  async function load() {
    const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)
    const { data } = await supabase.from('daily_logs').select('*')
      .eq('client_id', profile.id).gte('log_date', since).order('log_date')
    setLogs(data || [])
    const todays = (data || []).find(l => l.log_date === todayStr())
    dailyLoaded.current = false
    if (todays) { setWeight(todays.weight ?? ''); setSteps(todays.steps ?? '') }
    setTimeout(() => { dailyLoaded.current = true }, 0)
  }
  async function loadMeasurements() {
    const since = new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10)
    const { data } = await supabase.from('body_measurements').select('*')
      .eq('client_id', profile.id).gte('log_date', since).order('log_date')
    setMeasurements(data || [])
    const latest = (data || [])[data.length - 1]
    measurementsLoaded.current = false
    if (latest && latest.log_date === todayStr()) {
      setMform({ waist: latest.waist ?? '', chest: latest.chest ?? '', arms: latest.arms ?? '', thighs: latest.thighs ?? '', hips: latest.hips ?? '', neck: latest.neck ?? '' })
    }
    setTimeout(() => { measurementsLoaded.current = true }, 0)
  }
  useEffect(() => { if (profile) { load(); loadMeasurements() } }, [profile])

  async function saveMeasurements() {
    if (!Object.values(mform).some(v => v !== '')) return
    const row = { client_id: profile.id, log_date: todayStr() }
    for (const k of ['waist','chest','arms','thighs','hips','neck']) row[k] = mform[k] === '' ? null : +mform[k]
    await supabase.from('body_measurements').upsert(row, { onConflict: 'client_id,log_date' })
    setMsaved(true); setTimeout(() => setMsaved(false), 2000)
    loadMeasurements()
  }

  // auto-save measurements ~1.2s after the user stops typing, so a value
  // they entered is safe on the server even if they leave without hitting Save
  useEffect(() => {
    if (!measurementsLoaded.current) return
    if (!Object.values(mform).some(v => v !== '')) return
    const t = setTimeout(saveMeasurements, 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mform])

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

  // auto-save weight/steps the same way — typing it in is enough, the
  // "Save today" button becomes a confirmation, not a requirement
  useEffect(() => {
    if (!dailyLoaded.current) return
    if (!weight && !steps) return
    const t = setTimeout(save, 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weight, steps])

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
        <p className="muted" style={{ fontSize: 11, marginTop: -4 }}>Auto-saves shortly after you stop typing — this button is just a quick confirmation.</p>
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

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="eyebrow" style={{ fontSize: 10 }}>Body measurements (in)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[['waist','Waist'],['chest','Chest'],['arms','Arms'],['thighs','Thighs'],['hips','Hips'],['neck','Neck']].map(([k,label]) => (
            <div key={k}>
              <label className="muted" style={{ fontSize: 11.5 }}>{label}</label>
              <input inputMode="decimal" value={mform[k]} onChange={e => setMform({ ...mform, [k]: e.target.value })} />
            </div>
          ))}
        </div>
        <button className="btn" onClick={saveMeasurements}>{msaved ? 'Saved ✓' : 'Save measurements'}</button>
        <p className="muted" style={{ fontSize: 11, marginTop: -4 }}>Auto-saves shortly after you stop typing — this button is just a quick confirmation.</p>
      </div>

      {measurements.length >= 2 && ['waist','chest','arms'].map(k => {
        const data = measurements.filter(m => m[k] !== null).map(m => ({ label: fmt(m.log_date), value: m[k] }))
        if (data.length < 2) return null
        return (
          <div className="card" key={k}>
            <div className="eyebrow" style={{ fontSize: 10, marginBottom: 10 }}>{k[0].toUpperCase() + k.slice(1)} trend</div>
            <Sparkline data={data} color="#3E8E7E" unit={'"'} />
          </div>
        )
      })}
    </div>
  )
}
