// Home, CoachRx-style (Update 189): "Hi Anthony," + a line for the day, a
// Monday→Sunday strip with a mark per day (✓ trained, ✕ missed, • planned), and
// "Your Daily Rx" — the selected day's whole session laid out the way it'll be
// done: Warmup, A1/A2 joined by a line, B, Cooldown, with START WORKOUT on top.
// Same schedule rules as the Train tab and Calendar (moves, training days,
// rotations), via loadProgramSchedule + sessionsOnDate. Replaces TodayCard.
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Dumbbell, HeartPulse, Check, X, Thermometer, Snowflake, Bell } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { localDateStr, mondayOf, weekDaysFrom, weekdayNumber, logDate, repsSummary, targetSummary } from '../../lib/weeks'
import { CONDITIONING_COLOR, loadProgramSchedule, sessionsOnDate } from '../../lib/conditioning'
import { dayStatus, dailyLine, firstName, rxGroups } from '../../lib/clientRx'
import Avatar from '../Avatar'

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

// "4 × 6-8 @ RIR 2 · rest 2 min" for one exercise in a given block week
export function rxLine(ex, wk) {
  const wt = Array.isArray(ex.week_targets) ? ex.week_targets[(wk || 1) - 1] : null
  const reps = repsSummary(wt, ex)
  const target = targetSummary(wt, ex)
  const t = !target ? '' : ex.progression_type === 'percent' ? ` @ ${target}%` : ex.progression_type === 'rpe' ? ` @ RPE ${target}` : ` @ RIR ${target}`
  return `${reps}${t}${ex.rest ? ` · rest ${ex.rest}` : ''}`
}

export default function DailyRx({ profile }) {
  const navigate = useNavigate()
  const today = localDateStr()
  const week = useMemo(() => weekDaysFrom(mondayOf(today)), [today])
  const [selected, setSelected] = useState(today)
  const [data, setData] = useState(null)       // { schedule, moves, logged:Set, plan }
  const [exByDay, setExByDay] = useState({})   // day_id -> exercises

  useEffect(() => {
    if (!profile?.id) return
    let gone = false
    ;(async () => {
      const [schedule, { data: moves }, { data: logs }, { data: plan, error: planErr }] = await Promise.all([
        loadProgramSchedule(supabase, profile.id).catch(() => null),
        supabase.from('session_moves').select('*').eq('client_id', profile.id),
        supabase.from('workout_logs').select('logged_date, logged_at, session_track').eq('client_id', profile.id).gte('logged_at', week[0] + 'T00:00:00').limit(2000),
        supabase.from('client_cardio_plan').select('*').eq('client_id', profile.id),
      ])
      const logged = new Set((logs || []).filter(l => l.session_track !== 'lifestyle').map(logDate).filter(Boolean))
      if (!gone) setData({ schedule, moves: moves || [], logged, plan: planErr ? [] : plan || [] })
    })()
    return () => { gone = true }
  }, [profile?.id, today])

  const sessionsFor = d => (data?.schedule ? sessionsOnDate(d, data.schedule, data.moves) : []).filter(s => (s.track || 'exercise') !== 'lifestyle')
  const counts = useMemo(() => Object.fromEntries(week.map(d => [d, sessionsFor(d).length])), [data, week])
  const daySessions = useMemo(() => sessionsFor(selected), [data, selected])

  // exercises for whatever day is showing, fetched once per session
  useEffect(() => {
    const need = daySessions.map(s => s.id).filter(id => !exByDay[id])
    if (!need.length) return
    supabase.from('program_exercises').select('*').in('day_id', need).order('position')
      .then(({ data: rows }) => {
        const by = Object.fromEntries(need.map(id => [id, []]))
        for (const r of rows || []) (by[r.day_id] ||= []).push(r)
        setExByDay(m => ({ ...m, ...by }))
      })
  }, [daySessions])

  const cardio = (data?.plan || []).find(r => r.weekday === weekdayNumber(selected) - 1 && (r.minutes || r.cardio_type) && r.cardio_type !== 'Rest') || null
  const open = (s, startNow) => navigate('/app/training', { state: { targetBlockId: s.block_id, targetWeek: s.wk, targetDayNumber: s.day_number, targetDayId: s.id, startNow } })
  const isToday = selected === today
  const doneSelected = data?.logged.has(selected)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Link to="/app/profile" aria-label="My profile" style={{ flexShrink: 0 }}>
          <Avatar url={profile?.avatar_url} name={profile?.full_name} size={56} ring="2px solid var(--orange)" />
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 24, lineHeight: 1.1 }}>Hi {firstName(profile?.full_name)},</h1>
          <p className="muted" style={{ fontSize: 14, fontStyle: 'italic', marginTop: 4, lineHeight: 1.35 }}>{dailyLine(today)}</p>
        </div>
        <Link to="/app/reminders" aria-label="Reminders" style={{ flexShrink: 0, width: 42, height: 42, borderRadius: 10, background: 'var(--orange)', display: 'grid', placeItems: 'center', color: '#140A02' }}>
          <Bell size={20} />
        </Link>
      </header>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <strong style={{ fontSize: 19 }}>{new Date(selected + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
          <Link to="/app/calendar" style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', textDecoration: 'none', color: 'var(--orange-hot)' }}>Calendar</Link>
        </div>
        <div role="tablist" aria-label="This week" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
          {week.map((d, i) => {
            const st = data ? dayStatus(d, today, counts, data.logged) : 'rest'
            const sel = d === selected
            return (
              <button key={d} role="tab" aria-selected={sel} data-status={st} onClick={() => setSelected(d)}
                aria-label={`${new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long' })}: ${st}`}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'inherit' }}>
                <span style={{ width: '100%', maxWidth: 46, aspectRatio: '1', borderRadius: '50%', position: 'relative', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 16,
                  background: sel ? 'var(--orange)' : 'var(--steel)', color: sel ? '#140A02' : 'var(--white)',
                  outline: d === today && !sel ? '2px solid var(--orange)' : 'none' }}>
                  <span style={{ position: 'absolute', top: 3, left: 0, right: 0, height: 11, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    {st === 'done' && <Check size={11} strokeWidth={3.5} color={sel ? '#140A02' : 'var(--green)'} />}
                    {st === 'missed' && <X size={11} strokeWidth={3.5} color={sel ? '#140A02' : 'var(--red)'} />}
                    {st === 'planned' && <span style={{ width: 6, height: 6, borderRadius: 3, background: sel ? '#140A02' : 'var(--orange-hot)' }} />}
                  </span>
                  <span style={{ marginTop: 6 }}>{Number(d.slice(8))}</span>
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: sel ? 'var(--orange-hot)' : 'var(--muted)' }}>{DOW[i]}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: 22, letterSpacing: '.02em', textTransform: 'uppercase', marginBottom: 10 }}>{isToday ? 'Your Daily Rx' : 'Rx for ' + new Date(selected + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long' })}</h2>

        {!data ? null : !data.schedule && !cardio ? (
          <div className="card" style={{ textAlign: 'center', padding: '22px 16px' }}>
            <strong style={{ fontSize: 17 }}>No program yet</strong>
            <p className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>Your coach will load it here. <Link to="/app/messages">Message your coach</Link></p>
          </div>
        ) : !daySessions.length && !cardio ? (
          <div className="card" style={{ textAlign: 'center', padding: '22px 16px' }}>
            <strong style={{ fontSize: 18 }}>{doneSelected ? 'Trained ✓' : 'Nothing Rx’d today'}</strong>
            <p className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
              {doneSelected ? 'Bonus session logged.' : <>Rest and recover. Expecting something? <Link to="/app/messages">Message your coach</Link></>}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {daySessions.map(s => (
              <SessionRx key={s.id} s={s} exercises={exByDay[s.id]} done={doneSelected}
                canStart={selected <= today} onStart={() => open(s, true)} onOpen={() => open(s, false)} />
            ))}
            {cardio && (
              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <HeartPulse size={22} color={CONDITIONING_COLOR} />
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: 16, color: CONDITIONING_COLOR }}>{cardio.cardio_type || 'Cardio'}{cardio.minutes ? ` · ${cardio.minutes} min` : ''}</strong>
                  <div className="muted" style={{ fontSize: 12.5 }}>{[cardio.modality, cardio.zone].filter(Boolean).join(' · ') || 'Cardio plan'}</div>
                </div>
                <Link to="/app/progress" className="btn-ghost" style={{ padding: '8px 12px', fontSize: 13, textDecoration: 'none' }}>Log mins</Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Letter({ l, color = 'var(--orange-hot)' }) {
  return <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: '50%', border: `2px solid ${color}`, background: 'var(--black)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 14 }}>{l || '•'}</span>
}

const blockCard = { background: 'rgba(255,85,0,0.07)', border: '1px solid rgba(255,85,0,0.22)', borderRadius: 14, padding: '14px 16px' }

function SessionRx({ s, exercises, done, canStart, onStart, onOpen }) {
  const cond = s.track === 'conditioning'
  const groups = rxGroups(exercises || [])
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14 }}>
      <button type="button" onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', padding: 0, color: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
        {cond ? <HeartPulse size={22} color={CONDITIONING_COLOR} /> : <Dumbbell size={22} color="var(--orange-hot)" />}
        <span style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ display: 'block', fontSize: 21, lineHeight: 1.1 }}>{s.day_label}</strong>
          <span className="muted" style={{ fontSize: 12.5 }}>{cond ? 'Conditioning' : 'Workout'} · Week {s.wk}{s.movedFrom ? ' · moved here' : ''}</span>
        </span>
        {done && <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--green)', display: 'flex', gap: 4, alignItems: 'center' }}><Check size={15} /> Logged</span>}
      </button>

      {canStart && (
        <button className="btn" onClick={onStart} style={{ height: 52, fontSize: 17, letterSpacing: '.04em', ...(cond ? { background: CONDITIONING_COLOR, borderColor: CONDITIONING_COLOR, color: '#06121B' } : {}) }}>
          {done ? 'OPEN WORKOUT' : 'START WORKOUT'}
        </button>
      )}

      {s.warmup && (
        <div style={blockCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, letterSpacing: '.06em', fontSize: 13.5, marginBottom: 6 }}><Thermometer size={16} /> WARMUP</div>
          <p style={{ fontSize: 15, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{s.warmup}</p>
        </div>
      )}

      {exercises === undefined && <div className="muted" style={{ fontSize: 13 }}>Loading…</div>}

      {groups.map((g, gi) => (
        <div key={gi} style={blockCard}>
          {g.items.map((ex, i) => (
            <div key={ex.id} style={{ display: 'flex', gap: 12, position: 'relative', paddingBottom: i < g.items.length - 1 ? 16 : 0 }}>
              {g.grouped && i < g.items.length - 1 && <span aria-hidden="true" style={{ position: 'absolute', left: 19, top: 40, bottom: 0, width: 2, background: 'var(--orange-hot)' }} />}
              <Letter l={ex.letter} />
              <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                <strong style={{ display: 'block', fontSize: 16 }}>{ex.name}</strong>
                {ex.kind === 'conditioning'
                  ? <p style={{ fontSize: 14, lineHeight: 1.45, marginTop: 3, whiteSpace: 'pre-wrap' }}>{ex.description || ex.notes || ''}</p>
                  : <div className="muted" style={{ fontSize: 14, marginTop: 3 }}>{rxLine(ex, s.wk)}</div>}
              </div>
            </div>
          ))}
        </div>
      ))}

      {s.cooldown && (
        <div style={blockCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, letterSpacing: '.06em', fontSize: 13.5, marginBottom: 6 }}><Snowflake size={16} /> COOLDOWN</div>
          <p style={{ fontSize: 15, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{s.cooldown}</p>
        </div>
      )}
    </div>
  )
}
