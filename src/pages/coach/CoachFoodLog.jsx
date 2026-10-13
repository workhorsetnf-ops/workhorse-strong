import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { localDateStr, mondayOf, weekDaysFrom } from '../../lib/weeks'
import { weekTable } from '../../lib/foodlog'
import { calcMacros, bmrOf, ACTIVITY } from '../../lib/macros'
import { WeekTotals, DayLog } from './FoodLogViews'

const shift = (d, n) => { const [y, m, dd] = d.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, dd + n)); return t.toISOString().slice(0, 10) }
const md = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })

// Coach view of a client's food log: the sheet's DAILY TOTALS for any week, tap a day for its log.
export function CoachFoodLog({ clientId, targets }) {
  const today = localDateStr()
  const [monday, setMonday] = useState(mondayOf(today))
  const [logs, setLogs] = useState([])
  const [day, setDay] = useState(today)
  const days = weekDaysFrom(monday)

  async function load() {
    const { data } = await supabase.from('meal_logs').select('*').eq('client_id', clientId).gte('logged_on', days[0]).lte('logged_on', days[6]).order('logged_at')
    setLogs(data || [])
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientId, monday])
  useEffect(() => { if (!days.includes(day)) setDay(days.includes(today) ? today : days[0]) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [monday])

  async function remove(id) {
    if (!window.confirm('Remove this line from their food log?')) return
    await supabase.from('meal_logs').delete().eq('id', id)
    load()
  }

  const table = weekTable(logs, days, targets, today)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="btn-ghost" aria-label="Previous week" onClick={() => setMonday(shift(monday, -7))} style={{ padding: '4px 8px' }}><ChevronLeft size={15} /></button>
        <strong style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '.04em' }}>Week of {new Date(monday + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
        <button className="btn-ghost" aria-label="Next week" disabled={monday >= mondayOf(today)} onClick={() => setMonday(shift(monday, 7))} style={{ padding: '4px 8px' }}><ChevronRight size={15} /></button>
        <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>{table.onTarget} of {table.loggedDays} logged days on target · tap a day to see what they ate</span>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <WeekTotals table={table} targets={targets} today={today} selected={day} onPick={setDay} />
      </div>
      <div>
        <div style={{ borderBottom: '3px solid var(--orange)', paddingBottom: 4, marginBottom: 8, color: 'var(--orange-hot)', fontWeight: 900, fontSize: 13, letterSpacing: '.08em', textTransform: 'uppercase' }}>Food log · {md(day)}</div>
        <div style={{ maxWidth: 760 }}><DayLog logs={logs.filter(l => l.logged_on === day)} onRemove={remove} /></div>
      </div>
      <p className="muted" style={{ fontSize: 11.5 }}>On target = calories within 5% and protein at 95%+ of target.</p>
    </div>
  )
}

// The sheet's MACRO CALCULATOR, using the Workhorse rules. Apply writes the targets to the client.
export function MacroCalculator({ client, onApplied }) {
  const [latestW, setLatestW] = useState(null)
  const [f, setF] = useState(null)
  const [saved, setSaved] = useState('')

  useEffect(() => {
    supabase.from('daily_logs').select('weight, log_date').eq('client_id', client.id).not('weight', 'is', null).order('log_date', { ascending: false }).limit(1)
      .then(({ data }) => {
        const w = data?.[0]?.weight ?? null
        setLatestW(w)
        const h = Number(client.height_in) || 0
        setF({
          sex: client.sex || 'male', weightLbs: w ?? '', hft: h ? Math.floor(h / 12) : '', hin: h ? h % 12 : '', age: client.age ?? '',
          bf: client.body_fat ?? '', activity: client.activity_level || 'light-schedule',
          goal: ['cut', 'build'].includes(client.phase) ? client.phase : client.phase === 'maintain' ? 'maintain' : 'recomp',
        })
      })
  }, [client])

  if (!f) return <p className="muted">Loading…</p>
  const ready = +f.weightLbs > 0 && +f.age > 0 && +f.hft > 0
  const inp = { weightLbs: +f.weightLbs, age: +f.age, sex: f.sex, hft: +f.hft, hin: +f.hin || 0, bf: f.bf === '' ? null : +f.bf, activity: f.activity, goal: f.goal === 'recomp' ? 'maintain' : f.goal }
  const r = ready ? calcMacros(inp) : null
  const bmr = ready ? bmrOf(inp) : null
  const cur = { kcal: Number(client.calories) || (client.protein_g * 4 + client.carbs_g * 4 + client.fat_g * 9), p: client.protein_g || 0, c: client.carbs_g || 0, f: client.fat_g || 0 }
  const rows = r ? [['Calories', r.target, cur.kcal, ''], ['Protein', r.protein, cur.p, ' g'], ['Fat', r.fat, cur.f, ' g'], ['Carbs', r.carbs, cur.c, ' g']] : []

  async function apply() {
    await supabase.from('profiles').update({
      protein_g: r.protein, carbs_g: r.carbs, fat_g: r.fat, calories: r.protein * 4 + r.carbs * 4 + r.fat * 9,
      age: +f.age, height_in: +f.hft * 12 + (+f.hin || 0), sex: f.sex, activity_level: f.activity, body_fat: f.bf === '' ? null : +f.bf,
    }).eq('id', client.id)
    setSaved('Targets applied ✓'); setTimeout(() => setSaved(''), 2500)
    onApplied?.()
  }

  const lab = { color: 'var(--muted)', fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }
  const rowS = i => ({ display: 'grid', gridTemplateColumns: '150px 1fr', alignItems: 'center', gap: 10, padding: '6px 10px', background: i % 2 ? 'var(--steel)' : 'var(--coal)' })
  const th = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', color: '#000', background: 'var(--orange)', padding: '8px 6px', textAlign: 'center' }
  const td = { padding: '9px 6px', borderTop: '1px solid var(--line)', textAlign: 'center', fontSize: 14 }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18, alignItems: 'start' }}>
      <div>
        <div style={{ borderBottom: '3px solid var(--orange)', paddingBottom: 4, marginBottom: 8, color: 'var(--orange-hot)', fontWeight: 900, fontSize: 13, letterSpacing: '.08em' }}>INPUTS</div>
        <div style={{ borderRadius: 8, overflow: 'hidden' }}>
          <div style={rowS(0)}><span style={lab}>Sex</span><select value={f.sex} onChange={e => setF({ ...f, sex: e.target.value })}><option value="male">Male</option><option value="female">Female</option></select></div>
          <div style={rowS(1)}><span style={lab}>Body weight (lb)</span><div><input inputMode="decimal" value={f.weightLbs} onChange={e => setF({ ...f, weightLbs: e.target.value })} />{latestW && <span className="muted" style={{ fontSize: 11 }}>Latest logged: {latestW} lb</span>}</div></div>
          <div style={rowS(2)}><span style={lab}>Height</span><div style={{ display: 'flex', gap: 6 }}><input inputMode="numeric" placeholder="ft" value={f.hft} onChange={e => setF({ ...f, hft: e.target.value })} /><input inputMode="numeric" placeholder="in" value={f.hin} onChange={e => setF({ ...f, hin: e.target.value })} /></div></div>
          <div style={rowS(3)}><span style={lab}>Age</span><input inputMode="numeric" value={f.age} onChange={e => setF({ ...f, age: e.target.value })} /></div>
          <div style={rowS(4)}><span style={lab}>Body fat % (opt.)</span><input inputMode="decimal" value={f.bf} onChange={e => setF({ ...f, bf: e.target.value })} /></div>
          <div style={rowS(5)}><span style={lab}>Activity</span><select value={f.activity} onChange={e => setF({ ...f, activity: e.target.value })}>{ACTIVITY.map(([k, l, m]) => <option key={k} value={k}>{l} ({m})</option>)}</select></div>
          <div style={rowS(6)}><span style={lab}>Goal</span><select value={f.goal} onChange={e => setF({ ...f, goal: e.target.value })}><option value="cut">Cut</option><option value="recomp">Recomp</option><option value="maintain">Maintenance</option><option value="build">Build</option></select></div>
        </div>
      </div>

      <div>
        <div style={{ borderBottom: '3px solid var(--orange)', paddingBottom: 4, marginBottom: 8, color: 'var(--orange-hot)', fontWeight: 900, fontSize: 13, letterSpacing: '.08em' }}>TARGETS</div>
        {!ready ? <div className="card muted" style={{ fontSize: 13 }}>Enter weight, height and age to see suggested targets.</div> : <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div className="card" style={{ padding: '8px 10px', textAlign: 'center' }}><div style={lab}>BMR</div><div style={{ fontWeight: 900, fontSize: 20 }}>{bmr.toLocaleString()}</div><div className="muted" style={{ fontSize: 10.5 }}>Mifflin-St Jeor</div></div>
            <div className="card" style={{ padding: '8px 10px', textAlign: 'center' }}><div style={lab}>TDEE</div><div style={{ fontWeight: 900, fontSize: 20 }}>{r.tdee.toLocaleString()}</div><div className="muted" style={{ fontSize: 10.5 }}>BMR × {ACTIVITY.find(a => a[0] === f.activity)?.[2]}</div></div>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr><th style={{ ...th, textAlign: 'left', paddingLeft: 10 }}>Target</th><th style={th}>Suggested</th><th style={th}>Current</th><th style={th}>Diff</th></tr></thead>
              <tbody>
                {rows.map(([l, s, c, u], i) => (
                  <tr key={l} style={{ background: i % 2 ? 'var(--steel)' : 'var(--coal)' }}>
                    <td style={{ ...td, textAlign: 'left', paddingLeft: 10, fontWeight: 800, textTransform: 'uppercase', fontSize: 13 }}>{l}</td>
                    <td style={{ ...td, color: 'var(--orange-hot)', fontWeight: 900, fontSize: 16 }}>{s.toLocaleString()}{u}</td>
                    <td style={td}>{c ? `${c.toLocaleString()}${u}` : '—'}</td>
                    <td style={{ ...td, color: 'var(--muted)' }}>{c ? `${s - c > 0 ? '+' : ''}${(s - c).toLocaleString()}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {r.notes.map((n, i) => <p key={i} className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>• {n}</p>)}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
            <button className="btn" onClick={apply} style={{ padding: '9px 18px', fontSize: 13 }}>Apply to {client.full_name?.split(' ')[0] || 'client'}</button>
            {saved && <span style={{ color: 'var(--orange-hot)', fontSize: 12.5, fontWeight: 700 }}>{saved}</span>}
          </div>
        </>}
        <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>Workhorse rules: protein 1 g/lb (lean mass +20% at 250+ lb and high body fat) · fat 0.35 g/lb on a cut, 0.40 otherwise (50 g floor) · carbs fill the rest · cut −500 kcal (never below 10× bodyweight), build +300.</p>
      </div>
    </div>
  )
}
