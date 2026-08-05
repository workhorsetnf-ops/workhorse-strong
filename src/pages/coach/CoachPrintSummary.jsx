import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function CoachPrintSummary() {
  const { clientId } = useParams()
  const [data, setData] = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('profiles').select('*').eq('id', clientId).single(),
      supabase.from('program_assignments').select('*, programs(name)').eq('client_id', clientId).maybeSingle(),
      supabase.from('checkins').select('*').eq('client_id', clientId).order('submitted_at', { ascending: false }).limit(5),
      supabase.from('client_maxes').select('*').eq('client_id', clientId).order('lift_name'),
      supabase.from('client_ratings').select('*').eq('client_id', clientId).maybeSingle(),
    ]).then(([{ data: profile }, { data: assignment }, { data: checkins }, { data: maxes }, { data: rating }]) => {
      setData({ profile, assignment, checkins: checkins || [], maxes: maxes || [], rating })
      setTimeout(() => window.print(), 500)
    })
  }, [clientId])

  if (!data) return <div style={{ padding: 40 }}>Loading…</div>

  const { profile, assignment, checkins, maxes, rating } = data

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', color: '#111', background: '#fff', padding: 30, maxWidth: 800, margin: '0 auto' }}>
      <style>{`
        @media print { body { background: #fff !important; } .no-print { display: none; } }
        table { width: 100%; border-collapse: collapse; margin-top: 6px; }
        th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #ddd; font-size: 13px; }
        th { color: #666; font-size: 11px; text-transform: uppercase; }
        h2 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #BF5700; padding-bottom: 4px; margin-top: 22px; }
      `}</style>

      <div className="no-print" style={{ marginBottom: 16 }}>
        <button onClick={() => window.print()} style={{ padding: '8px 16px', background: '#BF5700', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}>Print / Save as PDF</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '3px solid #0A0A0A', paddingBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: '#BF5700', fontWeight: 700, letterSpacing: '0.1em' }}>WORKHORSE TRAINING &amp; NUTRITION</div>
          <h1 style={{ fontSize: 26, margin: '4px 0 0' }}>{profile?.full_name}</h1>
        </div>
        <div style={{ fontSize: 12, color: '#666', textAlign: 'right' }}>Generated {new Date().toLocaleDateString()}</div>
      </div>

      <h2>Overview</h2>
      <table>
        <tbody>
          <tr><td>Phase</td><td style={{ textTransform: 'capitalize' }}>{profile?.phase}</td></tr>
          <tr><td>Current program</td><td>{assignment?.programs?.name || '—'}</td></tr>
          <tr><td>Macros</td><td>{profile?.calories} kcal · P {profile?.protein_g} / C {profile?.carbs_g} / F {profile?.fat_g}</td></tr>
          {rating && (rating.retention || rating.mindset) && (
            <tr><td>Coach read</td><td>
              {rating.retention && <span>Retention: {rating.retention}  </span>}
              {rating.mindset && <span>Mindset: {rating.mindset}</span>}
            </td></tr>
          )}
        </tbody>
      </table>

      {maxes.length > 0 && (
        <>
          <h2>Training Maxes</h2>
          <table>
            <thead><tr><th>Lift</th><th>Max</th></tr></thead>
            <tbody>{maxes.map(m => <tr key={m.id}><td>{m.lift_name}</td><td>{m.max_weight} lbs</td></tr>)}</tbody>
          </table>
        </>
      )}

      <h2>Recent Check-Ins</h2>
      <table>
        <thead><tr><th>Date</th><th>Weight</th><th>Energy</th><th>Hunger</th><th>Notes</th></tr></thead>
        <tbody>
          {checkins.map(c => (
            <tr key={c.id}>
              <td>{new Date(c.submitted_at).toLocaleDateString()}</td>
              <td>{c.weight || '—'}</td>
              <td>{c.energy || '—'}/10</td>
              <td>{c.hunger || '—'}/10</td>
              <td style={{ maxWidth: 260 }}>{c.notes || '—'}</td>
            </tr>
          ))}
          {checkins.length === 0 && <tr><td colSpan="5">No check-ins yet.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
