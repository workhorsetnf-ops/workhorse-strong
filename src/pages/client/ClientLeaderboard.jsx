import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

const METRIC_LABEL = { steps: 'Total steps', workouts: 'Workouts logged', weight_loss: 'Weight lost (%)' }

export default function ClientLeaderboard() {
  const { profile } = useAuth()
  const [challenges, setChallenges] = useState([])
  const [boards, setBoards] = useState({})

  useEffect(() => {
    if (!profile) return
    supabase.from('challenge_participants').select('challenge_id, challenges(*)').eq('client_id', profile.id)
      .then(async ({ data }) => {
        const chs = (data || []).map(d => d.challenges).filter(Boolean)
        setChallenges(chs)
        for (const ch of chs) {
          const { data: parts } = await supabase.from('challenge_participants').select('client_id, profiles(id, full_name)').eq('challenge_id', ch.id)
          const ids = (parts || []).map(p => p.client_id)
          const nameOf = id => parts.find(p => p.client_id === id)?.profiles?.full_name || 'Athlete'
          let rows = []
          if (ch.metric === 'steps') {
            const { data: logs } = await supabase.from('daily_logs').select('client_id, steps, log_date')
              .in('client_id', ids).gte('log_date', ch.start_date).lte('log_date', ch.end_date)
            const totals = {}
            for (const l of logs || []) totals[l.client_id] = (totals[l.client_id] || 0) + (l.steps || 0)
            rows = ids.map(id => ({ id, name: nameOf(id), value: totals[id] || 0, display: (totals[id] || 0).toLocaleString() }))
          } else if (ch.metric === 'workouts') {
            const { data: logs } = await supabase.from('workout_logs').select('client_id, logged_at')
              .in('client_id', ids).gte('logged_at', ch.start_date).lte('logged_at', ch.end_date + 'T23:59:59')
            const days = {}
            for (const l of logs || []) (days[l.client_id] ||= new Set()).add(l.logged_at.slice(0,10))
            rows = ids.map(id => ({ id, name: nameOf(id), value: days[id]?.size || 0, display: `${days[id]?.size || 0} days` }))
          } else {
            const { data: logs } = await supabase.from('daily_logs').select('client_id, weight, log_date')
              .in('client_id', ids).gte('log_date', ch.start_date).lte('log_date', ch.end_date).order('log_date')
            rows = ids.map(id => {
              const entries = (logs || []).filter(l => l.client_id === id && l.weight)
              if (entries.length < 2) return { id, name: nameOf(id), value: 0, display: '—' }
              const pct = ((entries[0].weight - entries[entries.length-1].weight) / entries[0].weight) * 100
              return { id, name: nameOf(id), value: pct, display: `${pct.toFixed(1)}%` }
            })
          }
          rows.sort((a, b) => b.value - a.value)
          rows.forEach((r, i) => r.rank = i + 1)
          setBoards(b => ({ ...b, [ch.id]: rows }))
        }
      })
  }, [profile])

  const today = new Date().toISOString().slice(0,10)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header>
        <div className="eyebrow">Compete</div>
        <h1 style={{ fontSize: 24, marginTop: 4 }}>Challenges</h1>
      </header>

      {challenges.length === 0 && <p className="muted" style={{ fontSize: 13.5 }}>No active challenges — your coach will add you to one.</p>}

      {challenges.map(ch => {
        const active = ch.start_date <= today && today <= ch.end_date
        const rows = boards[ch.id] || []
        const me = rows.find(r => r.id === profile.id)
        return (
          <div className="card" key={ch.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <strong style={{ fontSize: 16 }}>{ch.name}</strong>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{METRIC_LABEL[ch.metric]} · ends {ch.end_date}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 800, color: active ? 'var(--green)' : 'var(--muted)', textTransform: 'uppercase' }}>{active ? 'Live' : 'Ended'}</span>
            </div>
            {me && (
              <div style={{ marginTop: 10, background: 'var(--steel)', borderRadius: 8, padding: '8px 12px', fontSize: 13.5, fontWeight: 700 }}>
                You're #{me.rank} of {rows.length} — {me.display}
              </div>
            )}
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {rows.map(r => (
                <div key={r.id} style={{
                  display: 'flex', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 6,
                  background: r.id === profile.id ? 'var(--steel)' : 'transparent',
                  border: r.id === profile.id ? '1px solid var(--orange)' : '1px solid transparent',
                }}>
                  <span style={{ fontSize: 13.5 }}>
                    <span style={{ fontWeight: 800, color: r.rank === 1 ? 'var(--orange-hot)' : 'var(--muted)', marginRight: 8 }}>{r.rank}</span>
                    {r.name}{r.id === profile.id ? ' (you)' : ''}
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 700 }}>{r.display}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
