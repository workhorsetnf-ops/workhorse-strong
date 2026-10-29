// Weekly review: exercises the client swapped this week, and why.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const WHY = { taken: 'machine taken', hurts: 'it hurt', equipment: 'no equipment', other: 'other' }
const md = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' })

export default function WeekSwaps({ clientId, days }) {
  const [rows, setRows] = useState([])
  useEffect(() => {
    supabase.from('exercise_swaps').select('*').eq('client_id', clientId).gte('swap_date', days[0]).lte('swap_date', days[6]).order('swap_date')
      .then(({ data, error }) => setRows(error ? [] : data || []))
  }, [clientId, days[0]])
  if (!rows.length) return null
  return (
    <div className="card" style={{ borderLeft: `3px solid ${rows.some(r => r.reason === 'hurts') ? '#e5484d' : 'var(--line)'}` }}>
      <strong style={{ fontSize: 15 }}>⇄ Swaps this week · {rows.length}</strong>
      {rows.map(r => (
        <div key={r.id} style={{ fontSize: 13.5, marginTop: 6 }}>
          <span className="muted">{md(r.swap_date)}:</span> {r.from_name} → <strong>{r.alt_name}</strong>
          {r.reason && <span style={{ color: r.reason === 'hurts' ? '#e5484d' : 'var(--muted)', fontWeight: r.reason === 'hurts' ? 800 : 400 }}> ({WHY[r.reason]})</span>}
        </div>
      ))}
    </div>
  )
}
