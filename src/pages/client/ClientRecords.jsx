// Records: best set and heaviest weight for every lift, plus recent PRs.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { localDateStr, logDate } from '../../lib/weeks'
import { addDays } from '../../lib/dashboard'
import { recordBoard, prsInRange } from '../../lib/prs'

const md = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export default function ClientRecords({ clientId: forClient }) {
  const { profile } = useAuth()
  const id = forClient || profile?.id
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  useEffect(() => {
    if (!id) return
    supabase.from('workout_logs').select('exercise_name, weight, reps, logged_date, logged_at').eq('client_id', id)
      .not('weight', 'is', null).not('reps', 'is', null).order('logged_at').limit(10000)
      .then(({ data }) => setRows((data || []).map(r => ({ ...r, logged_date: logDate(r) })).filter(r => r.logged_date)))
  }, [id])
  const today = localDateStr()
  const board = useMemo(() => (rows ? recordBoard(rows) : []), [rows])
  const recent = useMemo(() => (rows ? prsInRange(rows, addDays(today, -30), today) : []), [rows, today])
  const shown = board.filter(b => !q || b.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!forClient && <header><div className="eyebrow">Progress</div><h1 style={{ fontSize: 24, marginTop: 4 }}>🏆 Records</h1></header>}
      {!rows && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && <div className="card muted" style={{ fontSize: 14 }}>Log some sets with weight and reps and your records show up here.</div>}
      {recent.length > 0 && (
        <div className="card" style={{ borderLeft: '3px solid var(--orange)' }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>PRs in the last 30 days · {recent.length}</div>
          {recent.slice(0, 8).map((p, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14, padding: '5px 0', borderTop: i ? '1px solid var(--line)' : 'none' }}>
              <span><strong>{p.name}</strong> <span className="muted">· {p.weight} × {p.reps}</span></span>
              <span className="muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{md(p.date)}</span>
            </div>
          ))}
        </div>
      )}
      {board.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 12 }}><input placeholder="Find a lift…" value={q} onChange={e => setQ(e.target.value)} /></div>
          {shown.map(b => (
            <div key={b.name} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, padding: '10px 14px', borderTop: '1px solid var(--line)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14.5 }}>{b.name}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  Heaviest {b.top.weight} × {b.top.reps} ({md(b.top.date)}){b.best && (b.best.weight !== b.top.weight || b.best.reps !== b.top.reps) ? ` · Best set ${b.best.weight} × ${b.best.reps}` : ''}
                </div>
              </div>
              {b.best && <div style={{ textAlign: 'right' }}><div style={{ fontWeight: 900, fontSize: 18, color: 'var(--orange-hot)' }}>{Math.round(b.best.e1rm)}</div><div className="muted" style={{ fontSize: 10.5 }}>est. 1RM</div></div>}
            </div>
          ))}
        </div>
      )}
      {!forClient && <Link to="/app/progress" className="muted" style={{ fontSize: 13 }}>← Back to Log</Link>}
    </div>
  )
}
