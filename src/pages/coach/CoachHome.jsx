import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

function startOfWeek(d = new Date()) {
  const day = (d.getDay() + 6) % 7 // Monday = 0
  const monday = new Date(d); monday.setDate(d.getDate() - day); monday.setHours(0,0,0,0)
  return monday
}
function daysAgo(dateStr) { return Math.floor((Date.now() - new Date(dateStr).getTime()) / 864e5) }

export default function CoachHome() {
  const [clients, setClients] = useState([])
  const [statuses, setStatuses] = useState({})     // clientId -> { exercise, lifestyle, checkin }
  const [contacted, setContacted] = useState(new Set())
  const [filter, setFilter] = useState('all')
  const [feedTab, setFeedTab] = useState('exercises')
  const [feed, setFeed] = useState([])
  const [openItem, setOpenItem] = useState(null)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [onboarding, setOnboarding] = useState({})

  async function load() {
    setLoading(true)
    const [{ data: cl }, { data: assigns }, { data: workoutLogs }, { data: dailyLogs }, { data: checkins }, { data: msgs }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, protein_g, calories').eq('role', 'client').order('full_name'),
      supabase.from('program_assignments').select('*'),
      supabase.from('workout_logs').select('client_id, exercise_name, logged_at, weight, reps, rir, result_text').order('logged_at', { ascending: false }).limit(400),
      supabase.from('daily_logs').select('client_id, log_date, weight, steps').order('log_date', { ascending: false }).limit(200),
      supabase.from('checkins').select('client_id, submitted_at, notes, weight').order('submitted_at', { ascending: false }).limit(100),
      supabase.from('messages').select('sender_id, recipient_id, created_at'),
    ])
    setClients(cl || [])

    const weekStart = startOfWeek()
    const contactedSet = new Set()
    for (const m of msgs || []) {
      if (new Date(m.created_at) >= weekStart && cl?.some(c => c.id === m.recipient_id)) contactedSet.add(m.recipient_id)
    }
    setContacted(contactedSet)

    const st = {}
    for (const c of cl || []) {
      const hasAssignment = assigns?.some(a => a.client_id === c.id)
      const lastWorkout = workoutLogs?.find(w => w.client_id === c.id)
      const exerciseDue = hasAssignment && (!lastWorkout || daysAgo(lastWorkout.logged_at) >= 3)
      const lastDaily = dailyLogs?.find(d => d.client_id === c.id)
      const lifestyleDue = !lastDaily || daysAgo(lastDaily.log_date) >= 2
      const lastCheckin = checkins?.find(ci => ci.client_id === c.id)
      const checkinDue = !lastCheckin || daysAgo(lastCheckin.submitted_at) >= 6
      st[c.id] = { exercise: exerciseDue, lifestyle: lifestyleDue, checkin: checkinDue }
    }
    setStatuses(st)

    const onb = {}
    for (const c of cl || []) {
      const items = [
        { label: 'Program assigned', done: assigns?.some(a => a.client_id === c.id) },
        { label: 'Start date set', done: !!assigns?.find(a => a.client_id === c.id)?.start_date },
        { label: 'Macros set', done: (c.protein_g > 0 || c.calories > 0) },
        { label: 'First workout logged', done: workoutLogs?.some(w => w.client_id === c.id) },
        { label: 'First check-in submitted', done: checkins?.some(ci => ci.client_id === c.id) },
      ]
      const done = items.filter(i => i.done).length
      onb[c.id] = { items, pct: Math.round(done / items.length * 100) }
    }
    setOnboarding(onb)

    buildFeed(feedTab, cl || [], workoutLogs || [], dailyLogs || [], checkins || [])
    setLoading(false)
  }

  function buildFeed(tab, cl, workoutLogs, dailyLogs, checkins) {
    const nameOf = id => cl.find(c => c.id === id)?.full_name || 'Client'
    if (tab === 'exercises') {
      const byDay = {}
      for (const w of workoutLogs) {
        const key = w.client_id + w.logged_at.slice(0,10)
        if (!byDay[key]) byDay[key] = { client_id: w.client_id, date: w.logged_at, items: [] }
        byDay[key].items.push(w.exercise_name)
      }
      setFeed(Object.values(byDay).slice(0, 15).map(d => ({
        id: d.client_id + d.date, client_id: d.client_id, name: nameOf(d.client_id), date: d.date,
        title: 'Workout logged', body: [...new Set(d.items)].slice(0,5).join(', '),
      })))
    } else if (tab === 'lifestyle') {
      setFeed(dailyLogs.slice(0, 15).map(d => ({
        id: d.client_id + d.log_date, client_id: d.client_id, name: nameOf(d.client_id), date: d.log_date,
        title: 'Daily log', body: [d.weight ? `${d.weight} lbs` : null, d.steps ? `${d.steps.toLocaleString()} steps` : null].filter(Boolean).join(' · ') || 'Logged',
      })))
    } else {
      setFeed(checkins.slice(0, 15).map(c => ({
        id: c.client_id + c.submitted_at, client_id: c.client_id, name: nameOf(c.client_id), date: c.submitted_at,
        title: 'Weekly check-in', body: c.notes || (c.weight ? `${c.weight} lbs` : 'Submitted'),
      })))
    }
  }

  useEffect(() => { load() }, [])

  async function sendComment(item) {
    if (!comment.trim()) return
    await supabase.from('messages').insert({ sender_id: (await supabase.auth.getUser()).data.user.id, recipient_id: item.client_id, body: `Re: ${item.title} (${new Date(item.date).toLocaleDateString()}) — ${comment.trim()}` })
    setComment(''); setOpenItem(null)
    load()
  }

  const counts = {
    exercise: clients.filter(c => statuses[c.id]?.exercise).length,
    lifestyle: clients.filter(c => statuses[c.id]?.lifestyle).length,
    checkin: clients.filter(c => statuses[c.id]?.checkin).length,
  }
  const filtered = clients.filter(c => {
    const s = statuses[c.id]
    if (!s) return false
    if (filter === 'all') return s.exercise || s.lifestyle || s.checkin
    return s[filter]
  })

  const initials = name => (name || '?').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase()

  if (loading) return <div className="muted">Loading your dashboard…</div>

  return (
    <div>
      <div className="eyebrow">Home</div>
      <h1 style={{ fontSize: 28, margin: '6px 0 16px' }}>Needs Attention</h1>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button className={filter === 'all' ? 'btn' : 'btn-ghost'} style={{ padding: '7px 14px', fontSize: 13 }} onClick={() => setFilter('all')}>All</button>
        <button className={filter === 'exercise' ? 'btn' : 'btn-ghost'} style={{ padding: '7px 14px', fontSize: 13 }} onClick={() => setFilter('exercise')}>Exercise due ({counts.exercise})</button>
        <button className={filter === 'lifestyle' ? 'btn' : 'btn-ghost'} style={{ padding: '7px 14px', fontSize: 13 }} onClick={() => setFilter('lifestyle')}>Lifestyle due ({counts.lifestyle})</button>
        <button className={filter === 'checkin' ? 'btn' : 'btn-ghost'} style={{ padding: '7px 14px', fontSize: 13 }} onClick={() => setFilter('checkin')}>Check-in due ({counts.checkin})</button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
        {filtered.length === 0 && <div style={{ padding: 16 }} className="muted">Nobody flagged right now — roster's on track.</div>}
        {filtered.map((c, i) => {
          const s = statuses[c.id]
          return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: i < filtered.length - 1 ? '1px solid var(--line)' : 'none', flexWrap: 'wrap' }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--steel)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{initials(c.full_name)}</div>
              <strong style={{ fontSize: 14, minWidth: 110 }}>{c.full_name || 'Client'}</strong>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {s.exercise && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: 'rgba(191,87,0,0.18)', color: 'var(--orange-hot)' }}>Exercise due</span>}
                {s.lifestyle && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: 'rgba(62,142,126,0.18)', color: '#3E8E7E' }}>Lifestyle due</span>}
                {s.checkin && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: 'rgba(124,92,191,0.18)', color: '#9B7FE0' }}>Check-in due</span>}
              </div>
              <Link to="/coach/messages" style={{ marginLeft: 'auto', fontSize: 16 }} title="Message">💬</Link>
            </div>
          )
        })}
      </div>

      {(() => {
        const newClients = clients.filter(c => onboarding[c.id] && onboarding[c.id].pct < 100).sort((a,b) => onboarding[a.id].pct - onboarding[b.id].pct)
        if (newClients.length === 0) return null
        return (
          <div className="card" style={{ marginBottom: 24 }}>
            <strong style={{ fontSize: 15 }}>New Client Checklist</strong>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 2, marginBottom: 12 }}>Fills itself in automatically as you set each client up.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {newClients.map(c => {
                const o = onboarding[c.id]
                return (
                  <div key={c.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <strong style={{ fontSize: 13.5 }}>{c.full_name || 'Client'}</strong>
                      <span className="muted" style={{ fontSize: 12 }}>{o.pct}%</span>
                    </div>
                    <div className="bar-track" style={{ marginBottom: 6 }}><div className="bar-fill" style={{ width: `${o.pct}%` }} /></div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {o.items.map((it, i) => (
                        <span key={i} style={{ fontSize: 11.5, color: it.done ? 'var(--green)' : 'var(--muted)' }}>{it.done ? '✓' : '○'} {it.label}</span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <strong style={{ fontSize: 15 }}>Touchpoints ({clients.length ? Math.round(contacted.size / clients.length * 100) : 0}%)</strong>
          <span className="muted" style={{ fontSize: 12.5 }}>{contacted.size} of {clients.length} clients contacted this week</span>
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {clients.map(c => (
            <div key={c.id} style={{ textAlign: 'center' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--steel)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800, border: contacted.has(c.id) ? '2px solid var(--green)' : '2px solid var(--line)' }}>{initials(c.full_name)}</div>
              <div className="muted" style={{ fontSize: 10.5, marginTop: 4, maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <strong style={{ fontSize: 15 }}>Activity Feed</strong>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['exercises','Exercises'],['lifestyle','Lifestyle'],['checkins','Weekly Check-Ins']].map(([k,l]) => (
              <button key={k} className={feedTab === k ? 'btn' : 'btn-ghost'} style={{ padding: '6px 12px', fontSize: 12.5 }} onClick={() => { setFeedTab(k); load() }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {feed.map(item => (
            <div key={item.id} style={{ borderBottom: '1px solid var(--line)', padding: '10px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setOpenItem(openItem === item.id ? null : item.id)}>
                <div>
                  <strong style={{ fontSize: 13.5 }}>{item.name}</strong>
                  <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>{item.title}</span>
                </div>
                <span className="muted" style={{ fontSize: 12 }}>{new Date(item.date).toLocaleDateString()}</span>
              </div>
              <p style={{ fontSize: 13, marginTop: 4, color: 'var(--muted)' }}>{item.body}</p>
              {openItem === item.id && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input placeholder="Write a comment…" value={comment} onChange={e => setComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendComment(item)} />
                  <button className="btn" style={{ padding: '8px 16px', fontSize: 12.5 }} onClick={() => sendComment(item)}>Send</button>
                </div>
              )}
            </div>
          ))}
          {feed.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Nothing logged yet.</p>}
        </div>
      </div>
    </div>
  )
}
