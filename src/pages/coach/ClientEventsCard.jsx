// Coach Home: every client's shows, TV tapings and travel in the next 7 days.
// Hidden when there's nothing coming up (or before Update 146's SQL is run).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { localDateStr } from '../../lib/weeks'
import { addDays } from '../../lib/dashboard'
import { EVENT_KINDS, upcoming } from '../../lib/clientEvents'

const md = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

export default function ClientEventsCard() {
  const [rows, setRows] = useState([])
  const today = localDateStr()
  useEffect(() => {
    supabase.from('client_events').select('*, profiles(full_name)').gte('end_date', today).lte('start_date', addDays(today, 6)).order('start_date')
      .then(({ data, error }) => setRows(error ? [] : upcoming(data || [], today, addDays)))
  }, [])
  if (!rows.length) return null
  return (
    <div className="card" style={{ marginBottom: 20, borderLeft: '3px solid var(--orange-hot)' }}>
      <strong style={{ fontSize: 15 }}>🎤 Shows & travel · next 7 days</strong>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
        {rows.map(e => (
          <div key={e.id} style={{ display: 'flex', gap: 8, fontSize: 14, alignItems: 'baseline' }}>
            <span style={{ width: 22 }}>{EVENT_KINDS[e.kind]?.icon}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <Link to={`/coach/review/${e.client_id}`} style={{ fontWeight: 700, textDecoration: 'none', color: 'inherit' }}>{e.profiles?.full_name || 'Client'}</Link>
              <span className="muted"> · {e.title || EVENT_KINDS[e.kind]?.label}{e.location ? `, ${e.location}` : ''}</span>
            </span>
            <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
              {e.start_date === today ? 'Today' : md(e.start_date)}{e.end_date !== e.start_date ? ` → ${md(e.end_date)}` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
