import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { localDateStr } from '../../lib/weeks'
import { monthOf, monthDays, shiftMonth, monthLabel, monthStats, perfectStreak, pctText } from '../../lib/habits'
import { HabitGrid } from '../coach/CoachHabits'

function Stat({ label, value, accent }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '12px 6px', borderTop: '3px solid var(--orange)', minWidth: 0 }}>
      <div className="muted" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent ? 'var(--orange-hot)' : 'var(--white)' }}>{value}</div>
    </div>
  )
}

export default function ClientHabits() {
  const { profile } = useAuth()
  const today = localDateStr()
  const [month, setMonth] = useState(monthOf(today))
  const [habits, setHabits] = useState(null)
  const [logs, setLogs] = useState([])
  const [streakLogs, setStreakLogs] = useState([])
  const [pending, setPending] = useState(new Set())
  const days = monthDays(month)

  async function load() {
    const [{ data: h }, { data: l }, { data: s }] = await Promise.all([
      supabase.from('client_habits').select('*').eq('client_id', profile.id).eq('active', true).order('position').order('created_at'),
      supabase.from('habit_logs').select('habit_id, log_date').eq('client_id', profile.id).gte('log_date', days[0]).lte('log_date', days[days.length - 1]),
      supabase.from('habit_logs').select('habit_id, log_date').eq('client_id', profile.id).lte('log_date', today).order('log_date', { ascending: false }).limit(2000),
    ])
    setHabits(h || []); setLogs(l || []); setStreakLogs(s || [])
  }
  useEffect(() => { if (profile) load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [profile, month])

  // Tick shows straight away, then saves; a failed save reloads so the
  // screen never shows a tick that didn't stick.
  async function toggle(h, d = today) {
    const key = `${h.id}|${d}`
    if (pending.has(key) || d > today) return
    setPending(p => new Set(p).add(key))
    const on = logs.some(l => l.habit_id === h.id && l.log_date === d)
    const flip = list => (on ? list.filter(l => !(l.habit_id === h.id && l.log_date === d)) : [...list, { habit_id: h.id, log_date: d }])
    setLogs(flip); setStreakLogs(flip)
    const { error } = on
      ? await supabase.from('habit_logs').delete().eq('habit_id', h.id).eq('log_date', d)
      : await supabase.from('habit_logs').insert({ client_id: profile.id, habit_id: h.id, log_date: d })
    setPending(p => { const n = new Set(p); n.delete(key); return n })
    if (error) load()
  }

  if (!habits) return <p className="muted">Loading…</p>

  const stats = monthStats(habits, logs, days, today)
  const isThisMonth = month === monthOf(today)
  const todayDone = new Set(streakLogs.filter(l => l.log_date === today).map(l => l.habit_id))
  const doneToday = habits.filter(h => todayDone.has(h.id)).length
  const streak = perfectStreak(habits, streakLogs, today)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header>
        <div className="eyebrow">Daily</div>
        <h1 style={{ fontSize: 24, marginTop: 4 }}>Habit Tracker</h1>
      </header>

      {habits.length === 0 && <div className="card muted" style={{ fontSize: 14 }}>Your coach hasn't set your daily habits yet.</div>}

      {habits.length > 0 && <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <Stat label="Today" value={`${doneToday}/${habits.length}`} accent />
          <Stat label="Month" value={pctText(stats.overall)} />
          <Stat label="Streak" value={streak ? `${streak}🔥` : '0'} />
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="eyebrow" style={{ fontSize: 10 }}>Today · tap when done</div>
          {habits.map(h => {
            const on = todayDone.has(h.id)
            return (
              <button key={h.id} type="button" onClick={() => toggle(h)} aria-pressed={on}
                style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', padding: '12px 12px', borderRadius: 10, cursor: 'pointer', width: '100%',
                  border: '1px solid ' + (on ? 'var(--orange)' : 'var(--line)'), background: on ? 'rgba(255,106,0,0.14)' : 'transparent', color: 'inherit', font: 'inherit' }}>
                <span style={{ width: 30, height: 30, borderRadius: 15, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 900,
                  background: on ? 'var(--orange)' : 'transparent', border: on ? 'none' : '1.5px solid var(--line)', color: '#000' }}>{on ? '✓' : ''}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ display: 'block', fontSize: 15 }}>{h.name}</strong>
                  {h.target && <span style={{ fontSize: 12.5, color: 'var(--orange-hot)', fontWeight: 700 }}>{h.target}</span>}
                </span>
              </button>
            )
          })}
        </div>

        <div className="card" style={{ padding: '12px 0 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px 10px' }}>
            <button className="btn-ghost" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))} style={{ padding: '4px 8px' }}><ChevronLeft size={15} /></button>
            <strong style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '.04em' }}>{monthLabel(month)}</strong>
            <button className="btn-ghost" aria-label="Next month" disabled={isThisMonth} onClick={() => setMonth(shiftMonth(month, 1))} style={{ padding: '4px 8px', opacity: isThisMonth ? 0.3 : 1 }}><ChevronRight size={15} /></button>
          </div>
          <HabitGrid habits={habits} days={days} stats={stats} today={today} onToggle={toggle} compact />
          <p className="muted" style={{ fontSize: 11, margin: '8px 12px 0' }}>Swipe across for the whole month. Missed a tick? Tap that day.</p>
        </div>
      </>}
    </div>
  )
}
