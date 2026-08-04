import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const METRIC_LABEL = { steps: 'Total steps', workouts: 'Workouts logged', weight_loss: 'Weight lost (%)' }

export default function CoachChallenges() {
  const [challenges, setChallenges] = useState([])
  const [clients, setClients] = useState([])
  const [participants, setParticipants] = useState({}) // challengeId -> [clientIds]
  const [scores, setScores] = useState({})             // challengeId -> [{clientId, name, value}]
  const [form, setForm] = useState({ name: '', metric: 'steps', start_date: '', end_date: '' })
  const [open, setOpen] = useState(null)

  async function load() {
    const [{ data: ch }, { data: cl }, { data: pp }] = await Promise.all([
      supabase.from('challenges').select('*').order('start_date', { ascending: false }),
      supabase.from('profiles').select('id, full_name').eq('role', 'client').order('full_name'),
      supabase.from('challenge_participants').select('*'),
    ])
    setChallenges(ch || []); setClients(cl || [])
    const byChallenge = {}
    for (const p of pp || []) (byChallenge[p.challenge_id] ||= []).push(p.client_id)
    setParticipants(byChallenge)
  }
  useEffect(() => { load() }, [])

  async function createChallenge() {
    if (!form.name.trim() || !form.end_date) return
    await supabase.from('challenges').insert({
      name: form.name.trim(), metric: form.metric,
      start_date: form.start_date || new Date().toISOString().slice(0,10), end_date: form.end_date,
    })
    setForm({ name: '', metric: 'steps', start_date: '', end_date: '' })
    load()
  }

  async function toggleParticipant(challengeId, clientId) {
    const current = participants[challengeId] || []
    if (current.includes(clientId)) {
      await supabase.from('challenge_participants').delete().eq('challenge_id', challengeId).eq('client_id', clientId)
    } else {
      await supabase.from('challenge_participants').insert({ challenge_id: challengeId, client_id: clientId })
    }
    load()
  }

  async function deleteChallenge(id) {
    if (!confirm('Delete this challenge?')) return
    await supabase.from('challenges').delete().eq('id', id)
    if (open === id) setOpen(null)
    load()
  }

  async function computeScores(challenge) {
    const ids = participants[challenge.id] || []
    if (!ids.length) { setScores(s => ({ ...s, [challenge.id]: [] })); return }
    let rows = []
    if (challenge.metric === 'steps') {
      const { data } = await supabase.from('daily_logs').select('client_id, steps, log_date')
        .in('client_id', ids).gte('log_date', challenge.start_date).lte('log_date', challenge.end_date)
      const totals = {}
      for (const d of data || []) totals[d.client_id] = (totals[d.client_id] || 0) + (d.steps || 0)
      rows = ids.map(id => ({ clientId: id, value: totals[id] || 0, display: (totals[id] || 0).toLocaleString() }))
    } else if (challenge.metric === 'workouts') {
      const { data } = await supabase.from('workout_logs').select('client_id, logged_at')
        .in('client_id', ids).gte('logged_at', challenge.start_date).lte('logged_at', challenge.end_date + 'T23:59:59')
      const days = {}
      for (const d of data || []) { (days[d.client_id] ||= new Set()).add(d.logged_at.slice(0,10)) }
      rows = ids.map(id => ({ clientId: id, value: days[id]?.size || 0, display: `${days[id]?.size || 0} days` }))
    } else if (challenge.metric === 'weight_loss') {
      const { data } = await supabase.from('daily_logs').select('client_id, weight, log_date')
        .in('client_id', ids).gte('log_date', challenge.start_date).lte('log_date', challenge.end_date).order('log_date')
      rows = ids.map(id => {
        const entries = (data || []).filter(d => d.client_id === id && d.weight)
        if (entries.length < 2) return { clientId: id, value: 0, display: '—' }
        const first = entries[0].weight, last = entries[entries.length - 1].weight
        const pct = ((first - last) / first) * 100
        return { clientId: id, value: pct, display: `${pct.toFixed(1)}%` }
      })
    }
    rows.sort((a, b) => b.value - a.value)
    rows.forEach((r, i) => r.rank = i + 1)
    setScores(s => ({ ...s, [challenge.id]: rows }))
  }

  function openChallenge(ch) {
    if (open === ch.id) { setOpen(null); return }
    setOpen(ch.id)
    computeScores(ch)
  }

  const today = new Date().toISOString().slice(0,10)

  return (
    <div>
      <div className="eyebrow">Engagement</div>
      <h1 style={{ fontSize: 28, margin: '6px 0 20px' }}>Challenges</h1>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        <span className="eyebrow" style={{ fontSize: 10 }}>New challenge</span>
        <input placeholder="Name (e.g. August Step Challenge)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <select value={form.metric} onChange={e => setForm({ ...form, metric: e.target.value })}>
            <option value="steps">Total steps</option>
            <option value="workouts">Workouts logged</option>
            <option value="weight_loss">Weight lost (%)</option>
          </select>
          <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} title="Start date (defaults to today)" />
          <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} title="End date" />
        </div>
        <button className="btn" onClick={createChallenge} disabled={!form.name.trim() || !form.end_date}>Create challenge</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {challenges.map(ch => {
          const active = ch.start_date <= today && today <= ch.end_date
          const count = (participants[ch.id] || []).length
          return (
            <div className="card" key={ch.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <strong style={{ fontSize: 16 }}>{ch.name}</strong>
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, color: active ? 'var(--green)' : 'var(--muted)', textTransform: 'uppercase' }}>{active ? 'Active' : today > ch.end_date ? 'Ended' : 'Upcoming'}</span>
                  <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>
                    {METRIC_LABEL[ch.metric]} · {ch.start_date} → {ch.end_date} · {count} participant(s)
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-ghost" onClick={() => openChallenge(ch)}>{open === ch.id ? 'Close' : 'Manage / Leaderboard'}</button>
                  <button className="btn-ghost" style={{ color: 'var(--red)' }} onClick={() => deleteChallenge(ch.id)}>Delete</button>
                </div>
              </div>

              {open === ch.id && (
                <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
                  <div className="eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>Participants</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                    {clients.map(c => {
                      const inChallenge = (participants[ch.id] || []).includes(c.id)
                      return (
                        <button key={c.id} className={inChallenge ? 'btn' : 'btn-ghost'} style={{ padding: '6px 12px', fontSize: 12.5 }}
                          onClick={() => toggleParticipant(ch.id, c.id)}>{c.full_name || c.id.slice(0,8)}</button>
                      )
                    })}
                  </div>

                  <div className="eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>Leaderboard</div>
                  {(scores[ch.id] || []).length === 0 && <p className="muted" style={{ fontSize: 13 }}>Add participants to see rankings.</p>}
                  <table className="data">
                    <tbody>
                      {(scores[ch.id] || []).map(r => (
                        <tr key={r.clientId}>
                          <td style={{ width: 30, fontWeight: 800, color: r.rank === 1 ? 'var(--orange-hot)' : undefined }}>{r.rank}</td>
                          <td style={{ fontWeight: 700 }}>{clients.find(c => c.id === r.clientId)?.full_name || 'Client'}</td>
                          <td style={{ textAlign: 'right' }}>{r.display}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
        {challenges.length === 0 && <div className="card muted">No challenges yet — create one above.</div>}
      </div>
    </div>
  )
}
