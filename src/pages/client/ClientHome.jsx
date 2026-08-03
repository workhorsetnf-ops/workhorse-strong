import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

export default function ClientHome() {
  const { profile, signOut } = useAuth()
  const [todayMacros, setTodayMacros] = useState({ p: 0, c: 0, f: 0 })
  const [weekWorkouts, setWeekWorkouts] = useState(0)

  useEffect(() => {
    if (!profile) return
    const today = new Date().toISOString().slice(0, 10)
    supabase.from('meal_logs').select('protein_g,carbs_g,fat_g')
      .eq('client_id', profile.id).eq('logged_on', today)
      .then(({ data }) => {
        const t = (data || []).reduce((a, m) => ({
          p: a.p + m.protein_g, c: a.c + m.carbs_g, f: a.f + m.fat_g
        }), { p: 0, c: 0, f: 0 })
        setTodayMacros(t)
      })
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString()
    supabase.from('workout_logs').select('logged_at')
      .eq('client_id', profile.id).gte('logged_at', weekAgo)
      .then(({ data }) => {
        const days = new Set((data || []).map(l => l.logged_at.slice(0, 10)))
        setWeekWorkouts(days.size)
      })
  }, [profile])

  const cals = todayMacros.p * 4 + todayMacros.c * 4 + todayMacros.f * 9

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="eyebrow">Workhorse Strong</div>
          <h1 style={{ fontSize: 26, marginTop: 4 }}>{profile?.full_name || 'Athlete'}</h1>
          <p className="muted" style={{ fontSize: 13, marginTop: 2, textTransform: 'capitalize' }}>
            Phase: {profile?.phase}
          </p>
        </div>
        <button className="btn-ghost" onClick={signOut}>Sign out</button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="card">
          <div className="stat-num">{weekWorkouts}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Sessions this week</div>
        </div>
        <div className="card">
          <div className="stat-num">{cals}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Calories today</div>
        </div>
      </div>

      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 12 }}>Today's macros</div>
        {[
          ['Protein', todayMacros.p, profile?.protein_g],
          ['Carbs', todayMacros.c, profile?.carbs_g],
          ['Fat', todayMacros.f, profile?.fat_g],
        ].map(([label, val, target]) => (
          <div key={label} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginBottom: 5 }}>
              <span>{label}</span>
              <span className="muted">{val} / {target || 0} g</span>
            </div>
            <div className="bar-track">
              <div className={`bar-fill${target && val > target ? ' over' : ''}`}
                style={{ width: `${target ? Math.min(100, (val / target) * 100) : 0}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
