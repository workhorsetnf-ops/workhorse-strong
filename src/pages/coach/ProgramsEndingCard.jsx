// Coach Home: clients whose program runs out in the next 2 weeks (or already
// has), soonest first, so the next block gets built in time. Update 186.
// Hidden when nobody is close. Goes away on its own once the next block is
// added to their program or a new program is assigned.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Hammer } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { localDateStr } from '../../lib/weeks'
import { loadEnding, whenText } from '../../lib/programEnd'

const md = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

export default function ProgramsEndingCard() {
  const [rows, setRows] = useState([])
  useEffect(() => { loadEnding(supabase, localDateStr()).then(setRows).catch(() => setRows([])) }, [])
  if (!rows.length) return null
  const over = rows.some(r => r.end.daysLeft < 0)
  return (
    <div className="card" style={{ marginBottom: 20, borderLeft: `3px solid ${over ? 'var(--red)' : 'var(--orange-hot)'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <strong style={{ fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}>
          <Hammer size={16} strokeWidth={2} /> Programs ending soon
        </strong>
        <Link to="/coach/programs" className="muted" style={{ fontSize: 13 }}>Programs →</Link>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
        {rows.map(r => {
          const late = r.end.daysLeft < 0, close = r.end.daysLeft <= 7
          return (
            <div key={r.assignment.id} style={{ display: 'flex', gap: 8, fontSize: 14, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <Link to={`/coach/review/${r.client.id}`} style={{ fontWeight: 700, textDecoration: 'none', color: 'inherit' }}>{r.client.full_name || 'Client'}</Link>
                <span className="muted"> · {r.program?.name || 'Program'}</span>
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', color: late ? 'var(--red)' : close ? 'var(--orange-hot)' : 'var(--muted)' }}>
                {whenText(r.end.daysLeft).replace(/^./, c => c.toUpperCase())}
              </span>
              <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }} title={r.end.estimate ? 'Manual weeks: assumes you move them on a week at a time' : undefined}>
                last day {md(r.end.endDate)}{r.end.estimate ? '*' : ''}
              </span>
            </div>
          )
        })}
      </div>
      {rows.some(r => r.end.estimate) && (
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>* Manual weeks: assumes you move them on one week at a time.</div>
      )}
    </div>
  )
}
