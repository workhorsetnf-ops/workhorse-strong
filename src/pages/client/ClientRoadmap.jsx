import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { typeOf, phaseWeeks, statusOf, caloriesOf } from '../../lib/phases'
import { PlannerTiles, PlannerTimeline, EventBanner } from '../coach/PhasePlanner'

const fmt = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

export default function ClientRoadmap() {
  const { profile } = useAuth()
  const [phases, setPhases] = useState(null)
  const [ev, setEv] = useState({})

  useEffect(() => {
    if (!profile) return
    supabase.from('client_phases').select('*').eq('client_id', profile.id).order('start_date').then(({ data }) => setPhases(data || []))
    supabase.from('profiles').select('event_name, event_date').eq('id', profile.id).single().then(({ data }) => setEv(data || {}))
  }, [profile])

  if (!phases) return <p className="muted">Loading…</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header>
        <div className="eyebrow">The big picture</div>
        <h1 style={{ fontSize: 24, marginTop: 4 }}>Your Roadmap</h1>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>Every phase of your plan, in order, and where you are right now.</p>
      </header>

      {phases.length === 0 && <div className="card muted" style={{ fontSize: 14 }}>Your coach hasn't mapped out your phases yet.</div>}

      {ev.event_date && <EventBanner name={ev.event_name} date={ev.event_date} compact />}
      {phases.length > 0 && <>
        <PlannerTiles phases={phases} compact />
        <div className="card">
          <div className="eyebrow" style={{ fontSize: 10, marginBottom: 10 }}>Timeline</div>
          <PlannerTimeline phases={phases} eventDate={ev.event_date} eventName={ev.event_name} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {phases.map((p, i) => {
            const st = statusOf(p)
            const ty = typeOf(p.phase_type)
            const cals = caloriesOf(p)
            return (
              <div key={p.id} className="card" style={{ borderLeft: `4px solid ${ty.color}`, opacity: st === 'COMPLETE' ? 0.6 : 1, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: 15 }}><span style={{ color: 'var(--orange-hot)' }}>{i + 1}.</span> {ty.label}{p.name && p.name !== ty.label ? ` · ${p.name}` : ''}</strong>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap',
                    background: st === 'CURRENT' ? 'var(--orange)' : 'transparent', color: st === 'CURRENT' ? '#000' : 'var(--muted)', border: st === 'CURRENT' ? 'none' : '1px solid var(--line)' }}>
                    {st === 'CURRENT' ? 'YOU ARE HERE' : st}
                  </span>
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{fmt(p.start_date)} – {fmt(p.end_date)} · {phaseWeeks(p)} weeks</div>
                {(cals || p.protein_g) && (
                  <div style={{ fontSize: 12.5, marginTop: 4 }}>
                    {cals ? <strong style={{ color: 'var(--orange-hot)' }}>{cals.toLocaleString()} kcal</strong> : null}
                    {p.protein_g ? <span className="muted"> · P {p.protein_g} / C {p.carbs_g ?? '—'} / F {p.fat_g ?? '—'}</span> : null}
                  </div>
                )}
                {p.notes && <p style={{ fontSize: 13.5, marginTop: 6, lineHeight: 1.5 }}>{p.notes}</p>}
              </div>
            )
          })}
        </div>
      </>}
    </div>
  )
}
