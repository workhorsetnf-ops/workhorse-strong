import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

export default function ClientHome() {
  const { profile, signOut } = useAuth()
  const [todayMacros, setTodayMacros] = useState({ p: 0, c: 0, f: 0 })
  const [weekWorkouts, setWeekWorkouts] = useState(0)
  const [checkinDue, setCheckinDue] = useState(null) // { days, overdue }
  const [streak, setStreak] = useState(0)
  const [readiness, setReadiness] = useState(null)
  const [readinessSaved, setReadinessSaved] = useState(false)

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
    supabase.from('workout_logs').select('logged_at').eq('client_id', profile.id).order('logged_at', { ascending: false }).limit(60)
      .then(({ data }) => {
        const days = new Set((data || []).map(l => l.logged_at.slice(0,10)))
        let count = 0
        for (let back = 0; back < 60; back++) {
          const d = new Date(); d.setDate(d.getDate() - back)
          if (days.has(d.toISOString().slice(0,10))) count++
          else if (back > 0) break // allow today to be unlogged yet without breaking streak
        }
        setStreak(count)
      })
    supabase.from('daily_logs').select('readiness').eq('client_id', profile.id).eq('log_date', new Date().toISOString().slice(0,10)).maybeSingle()
      .then(({ data }) => setReadiness(data?.readiness ?? null))
    supabase.from('checkins').select('submitted_at').eq('client_id', profile.id)
      .order('submitted_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => {
        if (!data) { setCheckinDue({ days: null, overdue: false }); return }
        const days = Math.floor((Date.now() - new Date(data.submitted_at).getTime()) / 864e5)
        setCheckinDue({ days, overdue: days >= 8 })
      })
  }, [profile])

  async function saveReadiness(val) {
    setReadiness(val)
    await supabase.from('daily_logs').upsert({ client_id: profile.id, log_date: new Date().toISOString().slice(0,10), readiness: val }, { onConflict: 'client_id,log_date' })
    setReadinessSaved(true); setTimeout(() => setReadinessSaved(false), 1500)
  }

  const cals = todayMacros.p * 4 + todayMacros.c * 4 + todayMacros.f * 9

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <img src="/icon-192.png" alt="" style={{ width: 24, height: 24, borderRadius: 5, objectFit: 'cover' }} />
            <div className="eyebrow" style={{ margin: 0 }}>Workhorse Strong</div>
          </div>
          <h1 style={{ fontSize: 26, marginTop: 4 }}>{profile?.full_name || 'Athlete'}
            {streak >= 2 && <span style={{ fontSize: 14, marginLeft: 8, color: 'var(--orange-hot)', fontWeight: 800 }}>🔥 {streak}</span>}
          </h1>
          <p className="muted" style={{ fontSize: 13, marginTop: 2, textTransform: 'capitalize' }}>
            Phase: {profile?.phase}
          </p>
        </div>
        <button className="btn-ghost" onClick={signOut}>Sign out</button>
      </header>

      {checkinDue && (checkinDue.days === null || checkinDue.days >= 6) && (
        <Link to="/app/checkin" style={{ display: 'block', textDecoration: 'none' }}>
          <div className="card" style={{ borderLeft: `3px solid ${checkinDue.overdue ? 'var(--red)' : 'var(--orange)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: checkinDue.overdue ? 'var(--red)' : 'var(--orange-hot)' }}>
                {checkinDue.days === null ? 'Your first check-in is due' : checkinDue.overdue ? `Check-in overdue — last one ${checkinDue.days} days ago` : `Check-in due — last one ${checkinDue.days} days ago`}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Tap to submit now</div>
            </div>
            <span style={{ fontSize: 20 }}>→</span>
          </div>
        </Link>
      )}

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
        <div className="eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>How are you feeling today?</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[1,2,3,4,5].map(v => (
            <button key={v} onClick={() => saveReadiness(v)}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 15, fontWeight: 800,
                background: readiness === v ? 'var(--orange)' : 'var(--steel)',
                color: readiness === v ? '#fff' : 'var(--muted)',
              }}>{v}</button>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 10.5, marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
          <span>Rough</span><span>{readinessSaved ? 'Saved ✓' : 'Great'}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
        <Link to="/app/recap" style={{ textDecoration: 'none' }}>
          <div className="card" style={{ textAlign: 'center', padding: '16px 8px' }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>📊</div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>My Month</div>
          </div>
        </Link>
        <Link to="/app/roadmap" style={{ textDecoration: 'none' }}>
          <div className="card" style={{ textAlign: 'center', padding: '16px 10px' }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>🗺️</div>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>Your Roadmap</div>
          </div>
        </Link>
        <Link to="/app/resources" style={{ textDecoration: 'none' }}>
          <div className="card" style={{ textAlign: 'center', padding: '16px 10px' }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>📄</div>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>Resources</div>
          </div>
        </Link>
        <Link to="/app/community" style={{ textDecoration: 'none' }}>
          <div className="card" style={{ textAlign: 'center', padding: '16px 10px' }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>👥</div>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>Community</div>
          </div>
        </Link>
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
