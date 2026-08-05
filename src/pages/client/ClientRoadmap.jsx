import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

const TYPE_COLOR = { cut: '#BF5700', build: '#4A6FA5', recomp: '#7C5CBF', maintain: '#3E8E7E', peak: '#E06A00' }
const TYPE_LABEL = { cut: 'Cut', build: 'Build', recomp: 'Recomp', maintain: 'Maintain', peak: 'Peak' }

export default function ClientRoadmap() {
  const { profile } = useAuth()
  const [phases, setPhases] = useState([])

  useEffect(() => {
    if (!profile) return
    supabase.from('client_phases').select('*').eq('client_id', profile.id).order('start_date').then(({ data }) => setPhases(data || []))
  }, [profile])

  const today = new Date().toISOString().slice(0,10)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header>
        <div className="eyebrow">The big picture</div>
        <h1 style={{ fontSize: 24, marginTop: 4 }}>Your Roadmap</h1>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>Where each phase of training and nutrition fits into the year.</p>
      </header>

      {phases.length === 0 && <p className="muted" style={{ fontSize: 13.5 }}>Your coach hasn't mapped out phases yet.</p>}

      <div style={{ position: 'relative', paddingLeft: 4 }}>
        {phases.map((p, i) => {
          const current = p.start_date <= today && today <= p.end_date
          const past = p.end_date < today
          const color = TYPE_COLOR[p.phase_type]
          return (
            <div key={p.id} style={{ display: 'flex', gap: 12, opacity: past ? 0.55 : 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16 }}>
                <div style={{ width: 14, height: 14, borderRadius: '50%', background: current ? color : 'var(--steel)', border: `2px solid ${color}`, flexShrink: 0, marginTop: 4 }} />
                {i < phases.length - 1 && <div style={{ width: 2, flex: 1, background: 'var(--line)', marginTop: 2 }} />}
              </div>
              <div className="card" style={{ flex: 1, marginBottom: 14, borderLeft: `3px solid ${color}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 15 }}>{p.name}</strong>
                  <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color }}>{TYPE_LABEL[p.phase_type]}</span>
                  {current && <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--green)', textTransform: 'uppercase' }}>● You are here</span>}
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                  {new Date(p.start_date).toLocaleDateString(undefined,{month:'short',day:'numeric'})} – {new Date(p.end_date).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}
                </div>
                {(p.protein_g || p.calories) && (
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                    {p.calories ? `${p.calories} kcal · ` : ''}P {p.protein_g || '—'} / C {p.carbs_g || '—'} / F {p.fat_g || '—'}
                  </div>
                )}
                {p.notes && <p style={{ fontSize: 13.5, marginTop: 6, lineHeight: 1.5 }}>{p.notes}</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
