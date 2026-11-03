// Home: what the client is meant to do today (Update 162).
// Today's workout and conditioning from their program (Day 1 = Monday, moves
// applied, same rule as the Train tab and Calendar), plus today's Cardio Plan
// session, each with a button straight into it. On a rest day it says so and
// shows what's next.
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Dumbbell, HeartPulse, Check, Moon } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { localDateStr, weekdayNumber } from '../../lib/weeks'
import { CONDITIONING_COLOR, loadProgramSchedule, sessionsOnDate } from '../../lib/conditioning'
import { addDays } from '../../lib/dashboard'

export default function TodayCard({ profile }) {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const today = localDateStr()

  useEffect(() => {
    if (!profile) return
    let gone = false
    ;(async () => {
      const [schedule, { data: moves }, { data: plan, error: planErr }, { data: daily }] = await Promise.all([
        loadProgramSchedule(supabase, profile.id).catch(() => null),
        supabase.from('session_moves').select('*').eq('client_id', profile.id),
        supabase.from('client_cardio_plan').select('*').eq('client_id', profile.id),
        supabase.from('daily_logs').select('cardio_min').eq('client_id', profile.id).eq('log_date', today).maybeSingle(),
      ])
      const sessions = sessionsOnDate(today, schedule, moves || []).filter(s => (s.track || 'exercise') !== 'lifestyle')
      // which of today's sessions already have a set logged today
      const done = new Set()
      if (sessions.length) {
        const { data: exs } = await supabase.from('program_exercises').select('id, day_id').in('day_id', sessions.map(s => s.id))
        const dayOf = Object.fromEntries((exs || []).map(e => [e.id, e.day_id]))
        if (exs?.length) {
          const { data: logs } = await supabase.from('workout_logs').select('exercise_id').eq('client_id', profile.id)
            .eq('logged_date', today).in('exercise_id', exs.map(e => e.id))
          for (const l of logs || []) if (dayOf[l.exercise_id]) done.add(dayOf[l.exercise_id])
        }
      }
      const cardio = (planErr ? [] : plan || []).find(r => r.weekday === weekdayNumber(today) - 1 && (r.minutes || r.cardio_type) && r.cardio_type !== 'Rest') || null
      const cardioMin = Number(daily?.cardio_min) || 0
      // on a rest day: the next thing coming up this week
      let next = null
      if (!sessions.length && !cardio) {
        for (let i = 1; i <= 7 && !next; i++) {
          const d = addDays(today, i)
          const s = sessionsOnDate(d, schedule, moves || []).find(x => (x.track || 'exercise') !== 'lifestyle')
          const c = (planErr ? [] : plan || []).find(r => r.weekday === weekdayNumber(d) - 1 && (r.minutes || r.cardio_type) && r.cardio_type !== 'Rest')
          if (s || c) next = { date: d, label: s ? s.day_label : (c.cardio_type || 'Cardio') }
        }
      }
      if (!gone) setData({ hasProgram: !!schedule, sessions, done, cardio, cardioMin, next })
    })()
    return () => { gone = true }
  }, [profile?.id, today])

  if (!data || (!data.hasProgram && !data.cardio)) return null
  const { sessions, done, cardio, cardioMin, next } = data
  const cardioDone = cardio?.minutes ? cardioMin >= cardio.minutes : cardioMin > 0
  const open = s => navigate('/app/training', { state: { targetBlockId: s.block_id, targetWeek: s.wk, targetDayNumber: s.day_number, targetDayId: s.id } })
  const weekday = new Date(today + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long' })

  return (
    <div className="card" style={{ borderLeft: '3px solid var(--orange)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <div className="eyebrow" style={{ fontSize: 10 }}>Today · {weekday}</div>
        <Link to="/app/calendar" className="muted" style={{ fontSize: 11.5, fontWeight: 700, textDecoration: 'none' }}>Week →</Link>
      </div>

      {sessions.map(s => {
        const cardioSession = s.track === 'conditioning'
        const color = cardioSession ? CONDITIONING_COLOR : 'var(--orange-hot)'
        const isDone = done.has(s.id)
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--steel)', flexShrink: 0 }}>
              {cardioSession ? <HeartPulse size={18} color={color} /> : <Dumbbell size={18} color={color} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.day_label}</div>
              <div className="muted" style={{ fontSize: 11.5 }}>
                {cardioSession ? 'Conditioning' : 'Workout'} · Week {s.wk}{s.movedFrom ? ' · moved here' : ''}
              </div>
            </div>
            {isDone
              ? <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4 }}><Check size={15} /> Logged</span>
              : <button className="btn" onClick={() => open(s)} style={{ padding: '8px 14px', fontSize: 13, flexShrink: 0, ...(cardioSession ? { background: CONDITIONING_COLOR, borderColor: CONDITIONING_COLOR, color: '#06121B' } : {}) }}>Start</button>}
          </div>
        )
      })}

      {cardio && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--steel)', flexShrink: 0 }}>
            <HeartPulse size={18} color={CONDITIONING_COLOR} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: CONDITIONING_COLOR }}>
              {cardio.cardio_type || 'Cardio'}{cardio.minutes ? ` · ${cardio.minutes} min` : ''}
            </div>
            <div className="muted" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {[cardio.modality, cardio.zone, cardioMin ? `${cardioMin} min logged` : null].filter(Boolean).join(' · ') || 'Cardio plan'}
            </div>
          </div>
          {cardioDone
            ? <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4 }}><Check size={15} /> Done</span>
            : <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <Link to="/app/cardio" className="btn-ghost" style={{ padding: '8px 10px', fontSize: 12.5, textDecoration: 'none' }}>Plan</Link>
                <Link to="/app/progress" className="btn" style={{ padding: '8px 12px', fontSize: 12.5, textDecoration: 'none', background: CONDITIONING_COLOR, borderColor: CONDITIONING_COLOR, color: '#06121B' }}>Log mins</Link>
              </div>}
        </div>
      )}

      {!sessions.length && !cardio && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--steel)', flexShrink: 0 }}>
            <Moon size={18} color="var(--muted)" />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>Rest day</div>
            {next && <div className="muted" style={{ fontSize: 11.5 }}>
              Next: {next.label} · {new Date(next.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long' })}
            </div>}
          </div>
        </div>
      )}
    </div>
  )
}
