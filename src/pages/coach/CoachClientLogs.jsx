import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronLeft, Utensils, Dumbbell } from 'lucide-react'
import { supabase } from '../../lib/supabase'

function last7Dates() {
  const out = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}
function fmtDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function CoachClientLogs() {
  const { clientId } = useParams()
  const [profile, setProfile] = useState(null)
  const [mealsByDay, setMealsByDay] = useState({})
  const [workoutDays, setWorkoutDays] = useState([])
  const [openDay, setOpenDay] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const since30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
    Promise.all([
      supabase.from('profiles').select('*').eq('id', clientId).single(),
      supabase.from('meal_logs').select('*').eq('client_id', clientId).gte('logged_on', last7Dates()[0]).order('logged_at', { ascending: true }),
      supabase.from('workout_logs').select('*').eq('client_id', clientId).gte('logged_at', since30).order('logged_at', { ascending: false }),
    ]).then(([{ data: prof }, { data: meals }, { data: logs }]) => {
      setProfile(prof)

      const byDay = {}
      for (const m of meals || []) (byDay[m.logged_on] ||= []).push(m)
      setMealsByDay(byDay)

      const byWorkoutDay = {}
      for (const l of logs || []) {
        const day = l.logged_at.slice(0, 10)
        if (!byWorkoutDay[day]) byWorkoutDay[day] = {}
        if (!byWorkoutDay[day][l.exercise_name]) byWorkoutDay[day][l.exercise_name] = []
        byWorkoutDay[day][l.exercise_name].push(l)
      }
      const days = Object.entries(byWorkoutDay)
        .map(([date, exercises]) => ({ date, exercises }))
        .sort((a, b) => new Date(b.date) - new Date(a.date))
      setWorkoutDays(days)

      setLoading(false)
    })
  }, [clientId])

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
                {Object.entries(day.exercises).map(([name, sets]) => (
                  <div key={name} style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span>{name}</span>
                    <span className="muted" style={{ textAlign: 'right' }}>
                      {sets.map((s, i) => `${s.weight ? s.weight + '×' : ''}${s.reps || ''}${s.rir ? '@' + s.rir : ''}`).filter(Boolean).join(', ') || `${sets.length} set(s)`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
