// Client Home: on a show/TV day, a fuel timeline built from their macros and
// timed to their bell time. The day before, a one-line heads-up.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { localDateStr } from '../../lib/weeks'
import { addDays } from '../../lib/dashboard'
import { fuelPlan, tomorrowTip } from '../../lib/showFuel'

export default function ShowFuelCard({ profile }) {
  const [show, setShow] = useState(null)       // { event, when: 'today'|'tomorrow' }
  const [weight, setWeight] = useState(null)
  const [open, setOpen] = useState(true)
  useEffect(() => {
    if (!profile?.id) return
    const today = localDateStr(), tomorrow = addDays(today, 1)
    supabase.from('client_events').select('*').eq('client_id', profile.id).in('kind', ['show', 'tv'])
      .lte('start_date', tomorrow).gte('end_date', today).order('start_date')
      .then(({ data, error }) => {
        if (error || !data?.length) return
        const t = data.find(e => e.start_date <= today && e.end_date >= today)
        setShow(t ? { event: t, when: 'today' } : { event: data[0], when: 'tomorrow' })
      })
    supabase.from('daily_logs').select('weight').eq('client_id', profile.id).not('weight', 'is', null).order('log_date', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setWeight(data?.weight ? Number(data.weight) : null))
  }, [profile?.id])
  if (!show) return null
  const name = show.event.title || (show.event.kind === 'tv' ? 'TV taping' : 'Show')

  if (show.when === 'tomorrow') {
    return (
      <div className="card" style={{ borderLeft: '3px solid var(--orange)' }}>
        <strong style={{ fontSize: 15 }}>🎤 {name} tomorrow</strong>
        <p style={{ fontSize: 14, margin: '6px 0 0', lineHeight: 1.5 }}>{tomorrowTip}</p>
        {!show.event.start_time && <Link to="/app/calendar" style={{ fontSize: 12.5, color: 'var(--orange)' }}>Add your bell time and tomorrow’s fuel plan gets exact times →</Link>}
      </div>
    )
  }

  const plan = fuelPlan({ macros: { p: profile.protein_g, c: profile.carbs_g, f: profile.fat_g }, weightLb: weight, bell: show.event.start_time })
  return (
    <div className="card" style={{ borderColor: 'var(--orange)' }}>
      <button onClick={() => setOpen(o => !o)} style={{ background: 'none', width: '100%', textAlign: 'left', color: 'inherit', padding: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 16 }}>🎤 Show-day fuel plan · {name}</strong>
        <span className="muted" style={{ fontSize: 12 }}>{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <>
          {!plan.timed && <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>No bell time set, so times are relative. <Link to="/app/calendar" style={{ color: 'var(--orange)' }}>Add it on your Calendar</Link> for exact times.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 10 }}>
            {plan.steps.map((s, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '92px 1fr', gap: 10, padding: '8px 0', borderTop: i ? '1px solid var(--line)' : 'none' }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--orange-hot)' }}>{s.when}</div>
                <div><div style={{ fontWeight: 800, fontSize: 14 }}>{s.title}</div><div className="muted" style={{ fontSize: 13, lineHeight: 1.45 }}>{s.body}</div></div>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 11.5, margin: '8px 0 0' }}>{plan.note} Your coach’s plan always wins if it’s different.</p>
        </>
      )}
    </div>
  )
}
