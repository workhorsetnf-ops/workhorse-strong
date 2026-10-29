// Weekly review: lifting PRs the client set this week.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { logDate } from '../../lib/weeks'
import { prsInRange } from '../../lib/prs'

export default function WeekPrs({ clientId, days }) {
  const [prs, setPrs] = useState(null)
  useEffect(() => {
    setPrs(null)
    supabase.from('workout_logs').select('exercise_name, weight, reps, logged_date, logged_at, session_track').eq('client_id', clientId)
      .not('weight', 'is', null).not('reps', 'is', null).lte('logged_at', new Date(days[6] + 'T23:59:59').toISOString()).limit(10000)
      .then(({ data }) => setPrs(prsInRange((data || []).filter(r => r.session_track !== 'conditioning').map(r => ({ ...r, logged_date: logDate(r) })).filter(r => r.logged_date), days[0], days[6])))
  }, [clientId, days[0]])
  if (!prs || !prs.length) return null
  return (
    <div className="card" style={{ borderLeft: '3px solid var(--orange)' }}>
      <strong style={{ fontSize: 15 }}>🏆 PRs this week · {prs.length}</strong>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {prs.map((p, i) => <span key={i} style={{ fontSize: 13, padding: '4px 10px', borderRadius: 12, background: 'rgba(255,106,0,.14)' }}><strong>{p.name}</strong> {p.weight} × {p.reps}</span>)}
      </div>
    </div>
  )
}
