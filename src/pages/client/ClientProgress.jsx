import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Sparkline from '../../lib/Sparkline'
import { localDateStr, lastNDays, summarizeWeek, dayHasData, DAILY_FIELDS } from '../../lib/weeks'

// Local date, not toISOString() — that's UTC and logged tonight's entry as tomorrow.
const todayStr = () => localDateStr()
const fmt = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const BOOL_FIELDS = ['nutrition_hit', 'trained']
const RATINGS = [['energy', 'Energy'], ['hunger', 'Hunger'], ['stress', 'Stress', 'lower is better'], ['digestion', 'Digestion']]

function toDb(row) {
  const out = {}
  for (const k of DAILY_FIELDS) {
    const v = row?.[k]
    if (BOOL_FIELDS.includes(k)) out[k] = typeof v === 'boolean' ? v : null
    else out[k] = v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v)
  }
  return out
}

// ---- 7-day table, shared with the check-in screens (client + coach) ----
const fmtNum = (v, dp = 0) => (v === null || v === undefined ? '' : Number(v).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp }))
const tick = v => (v === true ? '✓' : v === false ? '✗' : '')
export const WEEK_ROWS = [
  { label: 'Weight', key: 'weight', cell: v => fmtNum(v, 1), total: s => fmtNum(s.weight, 1), note: 'avg' },
  { label: 'Steps', key: 'steps', cell: v => (v === null || v === undefined ? '' : v >= 1000 ? (v / 1000).toFixed(1) + 'k' : fmtNum(v)), total: s => fmtNum(s.steps), note: 'avg' },
  { label: 'Sleep', key: 'sleep_hours', cell: v => fmtNum(v, 1), total: s => fmtNum(s.sleep_avg, 1), note: 'avg' },
  { label: 'On plan', key: 'nutrition_hit', cell: tick, total: s => (s.adherence === null ? '' : Math.round(s.adherence * 100) + '%'), note: '' },
  { label: 'Trained', key: 'trained', cell: tick, total: s => String(s.sessions ?? ''), note: 'days' },
  { label: 'Cardio', key: 'cardio_min', cell: v => fmtNum(v), total: s => fmtNum(s.cardio_min), note: 'min' },
  { label: 'Energy', key: 'energy', cell: v => fmtNum(v), total: s => fmtNum(s.energy, 1), note: 'avg' },
  { label: 'Hunger', key: 'hunger', cell: v => fmtNum(v), total: s => fmtNum(s.hunger, 1), note: 'avg' },
  { label: 'Stress', key: 'stress', cell: v => fmtNum(v), total: s => fmtNum(s.stress, 1), note: 'avg' },
  { label: 'Digestion', key: 'digestion', cell: v => fmtNum(v), total: s => fmtNum(s.digestion, 1), note: 'avg' },
]

export function WeekTable({ summary, selected, onPick }) {
  const daily = summary?.daily || []
  const today = todayStr()
  // WEEK sits right after the labels so the number that matters is never
  // scrolled off a phone screen; the days follow and can scroll if needed.
  const th = { padding: '5px 2px', fontSize: 10.5, fontWeight: 800, textAlign: 'center', whiteSpace: 'nowrap' }
  const td = { padding: '7px 2px', fontSize: 12, textAlign: 'center', borderTop: '1px solid var(--line)', whiteSpace: 'nowrap' }
  const weekCell = { background: 'rgba(255,90,0,0.10)', borderLeft: '1px solid var(--line)', borderRight: '1px solid var(--line)' }
  return (
    <div style={{ overflowX: 'auto', margin: '0 -6px' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left', position: 'sticky', left: 0, background: 'var(--coal)' }}></th>
            <th style={{ ...th, ...weekCell, color: 'var(--orange-hot)', padding: '5px 6px' }}>WEEK</th>
            {daily.map(d => {
              const dt = new Date(d.date + 'T00:00:00')
              const isSel = d.date === selected
              return (
                <th key={d.date} onClick={onPick ? () => onPick(d.date) : undefined}
                  style={{ ...th, cursor: onPick ? 'pointer' : 'default', borderRadius: 6,
                    background: isSel ? 'var(--orange)' : 'transparent', color: isSel ? '#000' : d.date === today ? 'var(--orange-hot)' : 'var(--white)' }}>
                  {dt.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2).toUpperCase()}
                  <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.75 }}>{dt.getDate()}</div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {WEEK_ROWS.map(r => (
            <tr key={r.key}>
              <td style={{ ...td, textAlign: 'left', fontWeight: 700, fontSize: 12, paddingRight: 6, position: 'sticky', left: 0, background: 'var(--coal)' }}>{r.label}</td>
              <td style={{ ...td, ...weekCell, fontWeight: 800, fontSize: 13, color: 'var(--orange-hot)', padding: '7px 6px' }}>
                {r.total(summary)}{r.total(summary) && r.note ? <span className="muted" style={{ fontSize: 9, fontWeight: 600, marginLeft: 2 }}>{r.note}</span> : null}
              </td>
              {daily.map(d => {
                const v = d[r.key]
                const color = v === true ? 'var(--orange-hot)' : v === false ? 'var(--red)' : 'var(--white)'
                return <td key={d.date} style={{ ...td, color, fontWeight: typeof v === 'boolean' ? 800 : 500 }}>{r.cell(v)}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Pill({ active, onClick, children, danger }) {
  return (
    <button type="button" onClick={onClick}
      style={{
        padding: '9px 0', fontSize: 14, fontWeight: 800, borderRadius: 8, cursor: 'pointer',
        border: '1px solid ' + (active ? (danger ? '#c0392b' : 'var(--orange)') : 'var(--line)'),
        background: active ? (danger ? '#7a1f1f' : 'var(--orange)') : 'transparent',
        color: active ? (danger ? '#fff' : '#000') : 'var(--white)',
      }}>{children}</button>
  )
}

export default function ClientProgress() {
  const { profile } = useAuth()
  const [logs, setLogs] = useState([])
  const [workoutDates, setWorkoutDates] = useState(new Set())
  const [selected, setSelected] = useState(todayStr())
  const [saveState, setSaveState] = useState('')   // '', 'saving', 'saved', 'error'
  const [range, setRange] = useState(30)
  const [measurements, setMeasurements] = useState([])
  const [mform, setMform] = useState({ waist: '', chest: '', arms: '', thighs: '', hips: '', neck: '' })
  const [msaved, setMsaved] = useState(false)

  // logsRef always holds the latest rows so a delayed save writes what the
  // client typed last, not a stale snapshot from when the timer started
  const logsRef = useRef([])
  useEffect(() => { logsRef.current = logs }, [logs])
  const timers = useRef({})          // date -> pending save timer
  const measurementsLoaded = useRef(false)

  async function load() {
    const since = localDateStr(new Date(Date.now() - 90 * 864e5))
    const sinceWorkouts = new Date(Date.now() - 9 * 864e5).toISOString()
    const [{ data }, { data: wl }] = await Promise.all([
      supabase.from('daily_logs').select('*').eq('client_id', profile.id).gte('log_date', since).order('log_date'),
      supabase.from('workout_logs').select('logged_at').eq('client_id', profile.id).gte('logged_at', sinceWorkouts),
    ])
    setLogs(data || [])
    setWorkoutDates(new Set((wl || []).map(w => localDateStr(new Date(w.logged_at)))))
  }
  async function loadMeasurements() {
    const since = localDateStr(new Date(Date.now() - 180 * 864e5))
    const { data } = await supabase.from('body_measurements').select('*')
      .eq('client_id', profile.id).gte('log_date', since).order('log_date')
    setMeasurements(data || [])
    const latest = (data || [])[(data || []).length - 1]
    measurementsLoaded.current = false
    if (latest && latest.log_date === todayStr()) {
      setMform({ waist: latest.waist ?? '', chest: latest.chest ?? '', arms: latest.arms ?? '', thighs: latest.thighs ?? '', hips: latest.hips ?? '', neck: latest.neck ?? '' })
    }
    setTimeout(() => { measurementsLoaded.current = true }, 0)
  }
  useEffect(() => { if (profile) { load(); loadMeasurements() } }, [profile])

  async function persist(date) {
    delete timers.current[date]
    const row = logsRef.current.find(l => l.log_date === date)
    if (!row) return
    setSaveState('saving')
    const { error } = await supabase.from('daily_logs')
      .upsert({ client_id: profile.id, log_date: date, ...toDb(row) }, { onConflict: 'client_id,log_date' })
    setSaveState(error ? 'error' : 'saved')
  }

  // Leaving the page mid-edit used to lose data. Any save still waiting on its
  // timer fires immediately on the way out instead of being dropped.
  useEffect(() => () => {
    for (const date of Object.keys(timers.current)) {
      clearTimeout(timers.current[date])
      persist(date)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setField(key, value) {
    const date = selected
    setLogs(prev => {
      const i = prev.findIndex(l => l.log_date === date)
      const next = [...prev]
      if (i === -1) next.push({ client_id: profile.id, log_date: date, [key]: value })
      else next[i] = { ...next[i], [key]: value }
      next.sort((a, b) => a.log_date.localeCompare(b.log_date))
      logsRef.current = next
      return next
    })
    setSaveState('saving')
    clearTimeout(timers.current[date])
    timers.current[date] = setTimeout(() => persist(date), 900)
  }
  const toggle = (key, val) => setField(key, row[key] === val ? null : val)

  async function saveMeasurements() {
    if (!Object.values(mform).some(v => v !== '')) return
    const r = { client_id: profile.id, log_date: todayStr() }
    for (const k of ['waist', 'chest', 'arms', 'thighs', 'hips', 'neck']) r[k] = mform[k] === '' ? null : +mform[k]
    await supabase.from('body_measurements').upsert(r, { onConflict: 'client_id,log_date' })
    setMsaved(true); setTimeout(() => setMsaved(false), 2000)
    loadMeasurements()
  }
  useEffect(() => {
    if (!measurementsLoaded.current) return
    if (!Object.values(mform).some(v => v !== '')) return
    const t = setTimeout(saveMeasurements, 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mform])

  const byDate = useMemo(() => Object.fromEntries(logs.map(l => [l.log_date, l])), [logs])
  const week = lastNDays(7)
  const summary = useMemo(() => summarizeWeek(week, byDate, workoutDates), [byDate, workoutDates, week.join()])
  const row = byDate[selected] || {}
  const val = k => (row[k] === null || row[k] === undefined ? '' : row[k])
  const autoTrained = workoutDates.has(selected)

  const sinceRange = localDateStr(new Date(Date.now() - range * 864e5))
  const windowed = logs.filter(l => l.log_date >= sinceRange)
  const weightData = windowed.filter(l => l.weight !== null && l.weight !== '' && l.weight !== undefined).map(l => ({ label: fmt(l.log_date), value: Number(l.weight) }))
  const stepsData = windowed.filter(l => l.steps !== null && l.steps !== '' && l.steps !== undefined).map(l => ({ label: fmt(l.log_date), value: Number(l.steps) }))
  const avgSteps = stepsData.length ? Math.round(stepsData.reduce((s, l) => s + l.value, 0) / stepsData.length) : null
  const selLabel = selected === todayStr() ? 'Today' : new Date(selected + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header>
        <div className="eyebrow">Track</div>
        <h1 style={{ fontSize: 24, marginTop: 4 }}>Daily Log</h1>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>Fill this in every day. Your weekly check-in averages it for you.</p>
      </header>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
          {week.map(d => {
            const dt = new Date(d + 'T00:00:00')
            const isSel = d === selected
            const logged = dayHasData(byDate[d]) || workoutDates.has(d)
            return (
              <button key={d} type="button" onClick={() => setSelected(d)}
                style={{ padding: '7px 0 6px', borderRadius: 9, cursor: 'pointer', border: '1px solid ' + (isSel ? 'var(--orange)' : 'var(--line)'),
                  background: isSel ? 'var(--orange)' : 'transparent', color: isSel ? '#000' : 'var(--white)' }}>
                <div style={{ fontSize: 10.5, fontWeight: 800 }}>{dt.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3).toUpperCase()}</div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{dt.getDate()}</div>
                <div style={{ width: 6, height: 6, borderRadius: 3, margin: '2px auto 0', background: logged ? (isSel ? '#000' : 'var(--orange)') : 'transparent' }} />
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div className="eyebrow" style={{ fontSize: 11 }}>{selLabel}</div>
          <span className="muted" style={{ fontSize: 11.5, color: saveState === 'error' ? 'var(--red)' : undefined }}>
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : saveState === 'error' ? 'Not saved — check your connection' : ''}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[['weight', 'Weight (lbs)', 'decimal', 'e.g. 218.4'], ['steps', 'Steps', 'numeric', 'e.g. 8500'],
            ['sleep_hours', 'Sleep (hrs)', 'decimal', 'e.g. 7.5'], ['cardio_min', 'Cardio (min)', 'numeric', '0']].map(([k, label, mode, ph]) => (
            <div key={k}>
              <label className="muted" style={{ fontSize: 12 }}>{label}</label>
              <input inputMode={mode} placeholder={ph} value={val(k)} onChange={e => setField(k, e.target.value)} />
            </div>
          ))}
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 5 }}>Hit your nutrition plan?</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Pill active={row.nutrition_hit === true} onClick={() => toggle('nutrition_hit', true)}>✓ Yes</Pill>
            <Pill active={row.nutrition_hit === false} danger onClick={() => toggle('nutrition_hit', false)}>✗ No</Pill>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 5 }}>Trained today?</div>
          {autoTrained
            ? <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--orange-hot)' }}>✓ Workout logged — counted automatically</div>
            : <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Pill active={row.trained === true} onClick={() => toggle('trained', true)}>✓ Yes</Pill>
                <Pill active={row.trained === false} onClick={() => toggle('trained', false)}>Rest day</Pill>
              </div>}
          {!autoTrained && <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>Use this for ring work or anything you didn't log in Training.</p>}
        </div>

        {RATINGS.map(([k, label, hint]) => (
          <div key={k}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginBottom: 5 }}>
              <span>{label} <span className="muted" style={{ fontWeight: 500, fontSize: 11.5 }}>{hint ? `(1–10, ${hint})` : '(1–10)'}</span></span>
              <span style={{ color: 'var(--orange-hot)' }}>{val(k) !== '' ? `${val(k)}/10` : ''}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 4 }}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                <Pill key={n} active={Number(row[k]) === n} onClick={() => toggle(k, n)}>{n}</Pill>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <div className="eyebrow" style={{ fontSize: 10 }}>Last 7 days</div>
          <span className="muted" style={{ fontSize: 11.5 }}>{summary.days_weighed}/7 weigh-ins</span>
        </div>
        <WeekTable summary={summary} selected={selected} onPick={setSelected} />
        <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>Tap a day to edit it. The WEEK column is exactly what goes into your check-in.</p>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {[7, 30, 90].map(r => (
          <button key={r} className={range === r ? 'btn' : 'btn-ghost'} style={{ padding: '8px 16px', fontSize: 12.5 }} onClick={() => setRange(r)}>{r}d</button>
        ))}
      </div>

      <div className="card">
        <div className="eyebrow" style={{ fontSize: 10, marginBottom: 10 }}>Weight trend</div>
        <Sparkline data={weightData} color="#FF5A00" unit=" lbs" />
      </div>

      <div className="card">
        <div className="eyebrow" style={{ fontSize: 10, marginBottom: 4 }}>Steps trend</div>
        {avgSteps && <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Average: {avgSteps.toLocaleString()}/day</div>}
        <Sparkline data={stepsData} color="#4A6FA5" unit=" steps" />
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="eyebrow" style={{ fontSize: 10 }}>Body measurements (in)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[['waist', 'Waist'], ['chest', 'Chest'], ['arms', 'Arms'], ['thighs', 'Thighs'], ['hips', 'Hips'], ['neck', 'Neck']].map(([k, label]) => (
            <div key={k}>
              <label className="muted" style={{ fontSize: 11.5 }}>{label}</label>
              <input inputMode="decimal" value={mform[k]} onChange={e => setMform({ ...mform, [k]: e.target.value })} />
            </div>
          ))}
        </div>
        <button className="btn" onClick={saveMeasurements}>{msaved ? 'Saved ✓' : 'Save measurements'}</button>
        <p className="muted" style={{ fontSize: 11, marginTop: -4 }}>Auto-saves shortly after you stop typing — this button is just a quick confirmation.</p>
      </div>

      {measurements.length >= 2 && ['waist', 'chest', 'arms'].map(k => {
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
