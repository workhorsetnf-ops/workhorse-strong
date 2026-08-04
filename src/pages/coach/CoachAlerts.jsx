import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

function daysAgo(dateStr) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 864e5)
}

export default function CoachAlerts() {
  const [alerts, setAlerts] = useState(null)

  async function load() {
    const results = []
    const [{ data: clients }, { data: assignments }, { data: blocksAll }, { data: checkins }, { data: dailyLogs }, { data: workoutLogs }, { data: daysAll }] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'client'),
      supabase.from('program_assignments').select('*'),
      supabase.from('program_blocks').select('*'),
      supabase.from('checkins').select('client_id, submitted_at, weight').order('submitted_at', { ascending: false }),
      supabase.from('daily_logs').select('client_id, log_date, weight').order('log_date', { ascending: false }),
      supabase.from('workout_logs').select('client_id, logged_at').order('logged_at', { ascending: false }),
      supabase.from('program_days').select('id, block_id, day_number, track'),
    ])

    const nameOf = id => clients?.find(c => c.id === id)?.full_name || 'A client'

    for (const c of clients || []) {
      const a = assignments?.find(x => x.client_id === c.id)

      // --- Block ending soon ---
      if (a) {
        const block = blocksAll?.find(b => b.id === a.current_block_id)
        if (block) {
          const remaining = (block.weeks || 4) - (a.current_week || 1)
          if (remaining <= 0) {
            results.push({ type: 'block', severity: 'high', client: c, text: `${nameOf(c.id)}'s "${block.name}" ends this week — plan the next block or a deload.` })
          } else if (remaining === 1) {
            results.push({ type: 'block', severity: 'med', client: c, text: `${nameOf(c.id)}'s "${block.name}" has 1 week left.` })
          }
        }

        // --- Missed workouts: expected training days in the last 7 with no log ---
        if (a.start_date && block) {
          const sd = new Date(a.start_date + 'T00:00:00')
          const today = new Date(); today.setHours(0,0,0,0)
          const clientWorkoutDates = new Set((workoutLogs || []).filter(w => w.client_id === c.id).map(w => w.logged_at.slice(0,10)))
          let missed = 0
          for (let back = 1; back <= 7; back++) {
            const d = new Date(today); d.setDate(d.getDate() - back)
            const diff = Math.round((d - sd) / 864e5)
            if (diff < 0) continue
            const dn = (diff % 7) + 1
            const hasTrainingDay = (daysAll || []).some(day => day.block_id === a.current_block_id && day.day_number === dn && (day.track || 'exercise') === 'exercise')
            if (hasTrainingDay && !clientWorkoutDates.has(d.toISOString().slice(0,10))) missed++
          }
          if (missed >= 2) {
            results.push({ type: 'missed', severity: missed >= 3 ? 'high' : 'med', client: c, text: `${nameOf(c.id)} missed ${missed} training day(s) logged in the last week.` })
          }
        }
      }

      // --- No check-in in 10+ days ---
      const lastCheckin = checkins?.find(x => x.client_id === c.id)
      if (lastCheckin) {
        const ago = daysAgo(lastCheckin.submitted_at)
        if (ago >= 10) results.push({ type: 'checkin', severity: ago >= 14 ? 'high' : 'med', client: c, text: `${nameOf(c.id)} hasn't submitted a check-in in ${ago} days.` })
        else if (ago >= 6) results.push({ type: 'checkin-due', severity: 'due', client: c, text: `${nameOf(c.id)}'s check-in is due — last one ${ago} days ago (they'll see a reminder in their app).` })
      } else {
        results.push({ type: 'checkin-due', severity: 'due', client: c, text: `${nameOf(c.id)} hasn't submitted a first check-in yet.` })
      }

      // --- Weight milestone: 5lb increments off starting weight (from daily_logs) ---
      const clientDaily = (dailyLogs || []).filter(l => l.client_id === c.id && l.weight)
      if (clientDaily.length >= 2) {
        const latest = clientDaily[0]
        const earliest = clientDaily[clientDaily.length - 1]
        const change = latest.weight - earliest.weight
        const milestoneCrossed = Math.floor(Math.abs(change) / 5)
        if (milestoneCrossed >= 1) {
          const dir = change < 0 ? 'down' : 'up'
          results.push({ type: 'milestone', severity: 'good', client: c, text: `🎉 ${nameOf(c.id)} is ${dir} ${Math.abs(change).toFixed(1)} lbs since ${new Date(earliest.log_date).toLocaleDateString()}.` })
        }
      }

      // --- Consistency streak: 4+ consecutive weekly check-ins ---
      const clientCheckins = (checkins || []).filter(x => x.client_id === c.id)
      if (clientCheckins.length >= 4) {
        results.push({ type: 'streak', severity: 'good', client: c, text: `🔥 ${nameOf(c.id)} has submitted ${clientCheckins.length} check-ins in a row — great consistency.` })
      }
    }

    const order = { high: 0, med: 1, due: 2, good: 3 }
    results.sort((x, y) => order[x.severity] - order[y.severity])
    setAlerts(results)
  }

  useEffect(() => { load() }, [])

  const groups = {
    high: alerts?.filter(a => a.severity === 'high') || [],
    med: alerts?.filter(a => a.severity === 'med') || [],
    due: alerts?.filter(a => a.severity === 'due') || [],
    good: alerts?.filter(a => a.severity === 'good') || [],
  }

  const badge = { high: { c: 'var(--red)', l: 'Needs attention' }, med: { c: 'var(--orange-hot)', l: 'Heads up' }, due: { c: '#4A6FA5', l: 'Coming due' }, good: { c: 'var(--green)', l: 'Wins' } }

  return (
    <div>
      <div className="eyebrow">Overview</div>
      <h1 style={{ fontSize: 28, margin: '6px 0 6px' }}>Alerts</h1>
      <p className="muted" style={{ fontSize: 14, marginBottom: 22 }}>
        Checked whenever you open this page — missed workouts, blocks wrapping up, quiet clients, and milestones worth a shoutout.
      </p>

      {alerts === null && <div className="card muted">Checking your roster…</div>}
      {alerts?.length === 0 && <div className="card muted">Nothing flagged right now — roster looks on track.</div>}

      {['high', 'med', 'due', 'good'].map(sev => groups[sev].length > 0 && (
        <div key={sev} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: badge[sev].c, marginBottom: 8 }}>{badge[sev].l}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {groups[sev].map((a, i) => (
              <div key={i} className="card" style={{ borderLeft: `3px solid ${badge[sev].c}`, padding: '12px 16px' }}>
                <span style={{ fontSize: 14 }}>{a.text}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
