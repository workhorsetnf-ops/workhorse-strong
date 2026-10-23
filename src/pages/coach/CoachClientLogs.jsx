import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronLeft, Utensils, Dumbbell } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { localDateStr, lastNDays, setTargets, resolveAssignment } from '../../lib/weeks'
import { latestCalls, CALL_STYLE } from '../../lib/progression'
import { CONDITIONING_COLOR } from '../../lib/conditioning'

// Local dates throughout — toISOString() is UTC and moved evening logs onto the next day.
function last7Dates() { return lastNDays(7) }

// The date a set belongs to: logged_date when present (what the client's screen
// saved it under), else the LOCAL date of logged_at for older rows.
export function logDay(l) {
  return l.logged_date || (l.logged_at ? localDateStr(new Date(l.logged_at)) : null)
}

// Monday of the week a Y-M-D falls in, as Y-M-D.
export function weekStartStr(day) {
  const [y, m, d] = day.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7))
  return localDateStr(dt)
}

// Best set from a list of logged sets: heaviest load, reps breaking ties.
// Bodyweight work (no load) is judged on reps; conditioning on its result text.
export function bestSet(sets) {
  let best = null
  for (const s of sets) {
    const w = parseFloat(s.weight), r = parseFloat(s.reps)
    const hasW = !isNaN(w) && w > 0, hasR = !isNaN(r) && r > 0
    if (!hasW && !hasR) continue
    const cand = { weight: hasW ? w : 0, reps: hasR ? r : 0 }
    if (!best || cand.weight > best.weight || (cand.weight === best.weight && cand.reps > best.reps)) best = cand
  }
  if (best) return { ...best, text: best.weight ? `${best.weight}×${best.reps || '–'}` : `BW×${best.reps}` }
  const res = sets.find(s => (s.result_text || '').trim())
  return res ? { weight: 0, reps: 0, text: res.result_text.trim(), result: true } : null
}

// { weeks: [Y-M-D mondays oldest→newest], rows: [{ name, cells: { monday: {text, trend} } }] }
// trend: 'up' beat the previous logged week, 'down' went backwards, null otherwise.
export function buildWeekGrid(logs, todayStr = localDateStr(), nWeeks = 6) {
  const thisMon = weekStartStr(todayStr)
  const weeks = Array.from({ length: nWeeks }, (_, i) => {
    const [y, m, d] = thisMon.split('-').map(Number)
    return localDateStr(new Date(y, m - 1, d - 7 * (nWeeks - 1 - i)))
  })
  const byEx = {}
  const lastSeen = {}
  for (const l of logs) {
    const day = logDay(l)
    if (!day || !l.exercise_name) continue
    const wk = weekStartStr(day)
    if (!weeks.includes(wk)) continue
    ;((byEx[l.exercise_name] ||= {})[wk] ||= []).push(l)
    if (!lastSeen[l.exercise_name] || day > lastSeen[l.exercise_name]) lastSeen[l.exercise_name] = day
  }
  const rows = Object.keys(byEx)
    .sort((a, b) => (lastSeen[b] || '').localeCompare(lastSeen[a] || '') || a.localeCompare(b))
    .map(name => {
      const cells = {}
      let prev = null
      for (const wk of weeks) {
        const b = byEx[name][wk] ? bestSet(byEx[name][wk]) : null
        if (!b) continue
        let trend = null
        if (prev && !b.result && !prev.result) {
          if (b.weight > prev.weight || (b.weight === prev.weight && b.reps > prev.reps)) trend = 'up'
          else if (b.weight < prev.weight || (b.weight === prev.weight && b.reps < prev.reps)) trend = 'down'
        }
        cells[wk] = { text: b.text, trend }
        prev = b
      }
      return { name, cells }
    })
  return { weeks, rows }
}
function fmtDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function CoachClientLogs() {
  const { clientId } = useParams()
  const [profile, setProfile] = useState(null)
  const [mealsByDay, setMealsByDay] = useState({})
  const [workoutDays, setWorkoutDays] = useState([])
  const [grid, setGrid] = useState({ weeks: [], rows: [] })
  const [openDay, setOpenDay] = useState(null)
  const [loading, setLoading] = useState(true)
  const [calls, setCalls] = useState([])

  useEffect(() => {
    const since30 = localDateStr(new Date(Date.now() - 30 * 864e5))
    const since6wk = new Date(Date.now() - 44 * 864e5).toISOString()
    Promise.all([
      supabase.from('profiles').select('*').eq('id', clientId).single(),
      supabase.from('meal_logs').select('*').eq('client_id', clientId).gte('logged_on', last7Dates()[0]).order('logged_at', { ascending: true }),
      supabase.from('workout_logs').select('*').eq('client_id', clientId).gte('logged_at', since6wk).order('logged_at', { ascending: false }),
    ]).then(([{ data: prof }, { data: meals }, { data: logs }]) => {
      setProfile(prof)

      const byDay = {}
      for (const m of meals || []) (byDay[m.logged_on] ||= []).push(m)
      setMealsByDay(byDay)

      setGrid(buildWeekGrid(logs || []))
      const byWorkoutDay = {}
      for (const l of logs || []) {
        const day = logDay(l)
        if (!day || day < since30) continue
        if (!byWorkoutDay[day]) byWorkoutDay[day] = {}
        if (!byWorkoutDay[day][l.exercise_name]) byWorkoutDay[day][l.exercise_name] = []
        byWorkoutDay[day][l.exercise_name].push(l)
      }
      const days = Object.entries(byWorkoutDay)
        .map(([date, exercises]) => ({ date, exercises }))
        .sort((a, b) => new Date(b.date) - new Date(a.date))
      setWorkoutDays(days)

      setLoading(false)
      loadCalls(logs || [])
    })
  }, [clientId])

  // Progression calls: latest session of each exercise vs this week's targets
  async function loadCalls(logs) {
    const ids = [...new Set(logs.map(l => l.exercise_id).filter(Boolean))]
    if (!ids.length) return
    const [{ data: exs }, { data: asg }] = await Promise.all([
      supabase.from('program_exercises').select('*').in('id', ids),
      supabase.from('program_assignments').select('*').eq('client_id', clientId).maybeSingle(),
    ])
    let week = 1
    if (asg) {
      const { data: blocks } = await supabase.from('program_blocks').select('*').eq('program_id', asg.program_id).order('position')
      week = resolveAssignment(asg, blocks || []).weekInBlock || 1
    }
    const exById = Object.fromEntries((exs || []).map(e => [e.id, e]))
    setCalls(latestCalls(logs, exById, week, logDay, setTargets))
  }

  if (loading) return <div className="muted">Loading…</div>

  const dates = last7Dates()
  const targetCals = profile?.calories || 0

  return (
    <div>
      <Link to="/coach/clients" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 6, fontSize: 13 }}>
        <ChevronLeft size={15} /> Back to Clients
      </Link>
      <div className="eyebrow">Activity</div>
      <h1 style={{ fontSize: 28, margin: '6px 0 20px' }}>{profile?.full_name || 'Client'}'s Logs</h1>

      {calls.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Dumbbell size={17} strokeWidth={2} color="var(--orange-hot)" />
            <strong style={{ fontSize: 15 }}>Next session calls</strong>
          </div>
          <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>From each lift's last session against its rep range and RIR target. The client sees the same call in their app.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {calls.map(c => {
              const st = CALL_STYLE[c.call.call]
              return (
                <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '34px minmax(140px, 1fr) minmax(160px, 2fr)', gap: 10, alignItems: 'center', padding: '6px 8px', borderRadius: 8, background: 'var(--steel)' }}>
                  <span style={{ height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13, background: st.bg, color: st.color }}>{st.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: 13.5 }}>{c.name}</strong>
                    <div className="muted" style={{ fontSize: 11.5 }}>{fmtDate(c.date)}: {c.sets.map(s => `${s.weight ? s.weight + '×' : ''}${s.reps || '–'}${s.rir !== null && s.rir !== undefined && s.rir !== '' ? ' @' + s.rir : ''}`).join(', ')}</div>
                  </div>
                  <div style={{ fontSize: 12.5 }}><strong>{c.call.title}.</strong> <span className="muted">{c.call.detail}</span></div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Utensils size={17} strokeWidth={2} color="var(--orange-hot)" />
          <strong style={{ fontSize: 15 }}>Food Log — last 7 days</strong>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {dates.map(date => {
            const dayMeals = mealsByDay[date] || []
            const totals = dayMeals.reduce((a, m) => ({
              p: a.p + (m.protein_g || 0), c: a.c + (m.carbs_g || 0), f: a.f + (m.fat_g || 0),
            }), { p: 0, c: 0, f: 0 })
            const cals = totals.p * 4 + totals.c * 4 + totals.f * 9
            const pct = targetCals ? Math.min(100, Math.round((cals / targetCals) * 100)) : 0
            const hit = targetCals && cals >= targetCals * 0.85 && cals <= targetCals * 1.15
            return (
              <div key={date}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: dayMeals.length ? 'pointer' : 'default' }}
                  onClick={() => dayMeals.length && setOpenDay(openDay === date ? null : date)}>
                  <span style={{ fontSize: 12.5, width: 92, flexShrink: 0 }}>{fmtDate(date)}</span>
                  <div className="bar-track" style={{ flex: 1 }}>
                    <div className={`bar-fill${!targetCals ? '' : (cals > targetCals * 1.15 ? ' over' : '')}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span style={{ fontSize: 12.5, fontWeight: 700, width: 130, textAlign: 'right', color: dayMeals.length === 0 ? 'var(--muted)' : hit ? 'var(--green)' : 'var(--orange-hot)' }}>
                    {dayMeals.length === 0 ? 'Not logged' : `${cals} / ${targetCals || '—'} kcal`}
                  </span>
                </div>
                {openDay === date && dayMeals.length > 0 && (
                  <div style={{ marginLeft: 102, marginTop: 6, marginBottom: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {dayMeals.map(m => (
                      <div key={m.id} className="muted" style={{ fontSize: 12.5 }}>
                        {m.meal_name} — P {m.protein_g} · C {m.carbs_g} · F {m.fat_g}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Dumbbell size={17} strokeWidth={2} color="var(--orange-hot)" />
          <strong style={{ fontSize: 15 }}>Best set by week</strong>
        </div>
        <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>Heaviest set each week (reps break ties). ▲ beat the week before, ▼ went backwards.</p>
        {grid.rows.length === 0
          ? <p className="muted" style={{ fontSize: 13.5 }}>No workouts logged in the last 6 weeks.</p>
          : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', fontSize: 11, padding: '6px 8px', position: 'sticky', left: 0, background: 'var(--coal)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Exercise</th>
                    {grid.weeks.map((wk, i) => {
                      const current = i === grid.weeks.length - 1
                      return (
                        <th key={wk} style={{ fontSize: 11, padding: '6px 6px', textAlign: 'center', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '.04em',
                          color: current ? '#000' : 'var(--muted)', background: current ? 'var(--orange)' : 'transparent', borderRadius: 6 }}>
                          {current ? 'This wk' : 'Wk of'}<div style={{ fontWeight: 600, fontSize: 10.5 }}>{new Date(wk + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {grid.rows.map(r => (
                    <tr key={r.name}>
                      <td style={{ fontSize: 13, fontWeight: 700, padding: '8px', borderTop: '1px solid var(--line)', position: 'sticky', left: 0, background: 'var(--coal)', whiteSpace: 'nowrap' }}>{r.name}</td>
                      {grid.weeks.map(wk => {
                        const c = r.cells[wk]
                        return (
                          <td key={wk} style={{ fontSize: 13, textAlign: 'center', padding: '8px 6px', borderTop: '1px solid var(--line)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
                            color: !c ? 'var(--muted)' : c.trend === 'up' ? 'var(--orange-hot)' : c.trend === 'down' ? 'var(--red)' : 'var(--white)', fontWeight: c?.trend === 'up' ? 800 : 600 }}>
                            {c ? c.text : '—'}{c?.trend === 'up' && ' ▲'}{c?.trend === 'down' && ' ▼'}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Dumbbell size={17} strokeWidth={2} color="var(--orange-hot)" />
          <strong style={{ fontSize: 15 }}>Training Log — last 30 days</strong>
        </div>
        {workoutDays.length === 0 && <p className="muted" style={{ fontSize: 13.5 }}>No workouts logged in this window.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {workoutDays.map(day => (
            <div key={day.date}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>{fmtDate(day.date)}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {Object.entries(day.exercises).map(([name, sets]) => {
                  const cond = sets.some(x => x.session_track === 'conditioning')
                  return (
                    <div key={name} style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span>
                        {name}
                        {cond && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, letterSpacing: '.05em', color: CONDITIONING_COLOR }}>CONDITIONING</span>}
                      </span>
                      <span className="muted" style={{ textAlign: 'right' }}>
                        {sets.map(s => s.result_text || `${s.weight ? s.weight + '×' : ''}${s.reps || ''}${s.rir ? '@' + s.rir : ''}`).filter(Boolean).join(', ') || `${sets.length} set(s)`}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
