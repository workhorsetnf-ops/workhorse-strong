// Coach: one client's day, CoachRx-style (Update 190). Week strip with a mark
// per day, streak, a month calendar, and that day's Rx with ✓ / ✕ next to each
// exercise, the client's effort and minutes, and "+ Add New" for a one-off
// workout just for this client on this date. Plus their AM/PM training schedule.
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, MessageSquare, Check, X, Plus, Dumbbell, HeartPulse, Thermometer, Snowflake, Trash2, ChevronLeft, ChevronRight, Link2, Unlink, ArrowUp, ArrowDown, ClipboardList, Clock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { localDateStr, mondayOf, weekDaysFrom, weekdayNumber, logDate, WEEKDAY_SHORT } from '../../lib/weeks'
import { addDays } from '../../lib/dashboard'
import { CONDITIONING_COLOR, loadProgramSchedule, sessionsOnDate } from '../../lib/conditioning'
import { dayStatus, rxGroups, sessionStreak, dateRange, EFFORT, effortOf, videoLinks, lettersFor, exerciseMark, cleanTrainTimes, toggleTrainTime, sessionTime } from '../../lib/clientRx'
import { rxLine } from '../client/DailyRx'
import Avatar from '../Avatar'

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const fmtDate = (ymd, o) => new Date(ymd + 'T00:00:00').toLocaleDateString(undefined, o)
const card = { background: 'var(--coal)', border: '1px solid var(--line)', borderRadius: 14, padding: 14 }
const block = { background: 'rgba(255,85,0,0.07)', border: '1px solid rgba(255,85,0,0.22)', borderRadius: 12, padding: '12px 14px' }

function Mark({ status, size = 12 }) {
  if (status === 'done') return <Check size={size} strokeWidth={3.5} color="var(--green)" aria-label="done" />
  if (status === 'missed') return <X size={size} strokeWidth={3.5} color="var(--red)" aria-label="missed" />
  if (status === 'planned') return <span aria-label="planned" style={{ width: size / 2, height: size / 2, borderRadius: size, background: 'var(--orange-hot)', display: 'inline-block' }} />
  return null
}

export default function CoachClientDay() {
  const { clientId } = useParams()
  const today = localDateStr()
  const [selected, setSelected] = useState(today)
  const [client, setClient] = useState(null)
  const [data, setData] = useState(null)        // { schedule, moves, logs, missed, feedback }
  const [exByDay, setExByDay] = useState({})
  const [comments, setComments] = useState({})  // exercise_id -> count
  const [calOpen, setCalOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [schedOpen, setSchedOpen] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let gone = false
    supabase.from('profiles').select('id, full_name, avatar_url, email').eq('id', clientId).maybeSingle().then(({ data: p }) => { if (!gone) setClient(p) })
    const since = addDays(today, -120)
    Promise.all([
      loadProgramSchedule(supabase, clientId).catch(() => null),
      supabase.from('session_moves').select('*').eq('client_id', clientId),
      supabase.from('workout_logs').select('exercise_id, exercise_name, set_number, weight, reps, result_text, logged_date, logged_at, session_track').eq('client_id', clientId).gte('logged_at', since + 'T00:00:00').limit(20000),
      supabase.from('exercise_missed').select('*').eq('client_id', clientId).gte('missed_date', since),
      supabase.from('session_feedback').select('*').eq('client_id', clientId).gte('session_date', since),
    ]).then(([schedule, mv, lg, ms, fb]) => {
      if (gone) return
      setData({ schedule, moves: mv.data || [], logs: (lg.data || []).filter(l => l.session_track !== 'lifestyle'), missed: ms.error ? [] : ms.data || [], feedback: fb.error ? [] : fb.data || [] })
    })
    return () => { gone = true }
  }, [clientId, reload])

  const sessionsFor = d => (data?.schedule ? sessionsOnDate(d, data.schedule, data.moves) : []).filter(s => (s.track || 'exercise') !== 'lifestyle')
  const logged = useMemo(() => new Set((data?.logs || []).map(logDate).filter(Boolean)), [data])
  const countsFor = dates => Object.fromEntries(dates.map(d => [d, sessionsFor(d).length]))
  const week = useMemo(() => weekDaysFrom(mondayOf(selected)), [selected])
  const weekCounts = useMemo(() => countsFor(week), [data, week])
  const streak = useMemo(() => {
    if (!data) return null
    const dates = dateRange(today, 60)
    return sessionStreak(dates, today, countsFor(dates), logged)
  }, [data, logged])
  const daySessions = useMemo(() => sessionsFor(selected), [data, selected])

  useEffect(() => {
    const need = daySessions.map(s => s.id).filter(id => !exByDay[id])
    if (!need.length) return
    supabase.from('program_exercises').select('*').in('day_id', need).order('position').then(async ({ data: rows }) => {
      const by = Object.fromEntries(need.map(id => [id, []]))
      for (const r of rows || []) (by[r.day_id] ||= []).push(r)
      setExByDay(m => ({ ...m, ...by }))
      const ids = (rows || []).map(r => r.id)
      if (ids.length) {
        const { data: cs } = await supabase.from('exercise_comments').select('exercise_id').in('exercise_id', ids)
        const n = {}
        for (const c of cs || []) n[c.exercise_id] = (n[c.exercise_id] || 0) + 1
        setComments(m => ({ ...m, ...n }))
      }
    })
  }, [daySessions])

  const logsOn = (exId, d) => (data?.logs || []).filter(l => l.exercise_id === exId && logDate(l) === d)
  const missedOn = (exId, d) => (data?.missed || []).some(m => m.exercise_id === exId && m.missed_date === d)
  const feedbackFor = (dayId, d) => (data?.feedback || []).find(f => f.day_id === dayId && f.session_date === d)
  const times = data?.schedule?.assignment?.train_times || null

  async function deleteOneOff(s) {
    if (!confirm(`Delete "${s.day_label}" for this client? Anything they logged on it stays in their history.`)) return
    const { error } = await supabase.from('program_days').delete().eq('id', s.id)
    if (error) return alert('Couldn’t delete it: ' + error.message)
    setReload(n => n + 1)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
      <Link to="/coach/clients" style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 800, fontSize: 17, color: 'inherit', textDecoration: 'none' }}><ArrowLeft size={22} /> Clients</Link>

      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar url={client?.avatar_url} name={client?.full_name} size={44} />
        <h1 style={{ fontSize: 30, flex: 1, lineHeight: 1.05 }}>{client?.full_name || client?.email || 'Client'}</h1>
        <Link to={`/coach/logs/${clientId}`} className="btn-ghost" title="All logs" style={{ padding: 10, display: 'flex' }}><ClipboardList size={20} /></Link>
        <Link to="/coach/messages" className="btn" title="Message" style={{ padding: 10, display: 'flex' }}><MessageSquare size={20} /></Link>
      </header>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 24 }}>{fmtDate(selected, { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
        <span data-streak style={{ background: 'rgba(61,217,168,0.16)', color: 'var(--green)', fontWeight: 800, fontSize: 14, padding: '4px 10px', borderRadius: 8 }}>Streak: {streak ?? '–'} 🔥</span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => setSchedOpen(o => !o)} style={{ background: 'none', border: 'none', color: 'var(--orange-hot)', fontWeight: 800, letterSpacing: '.06em', fontSize: 13, cursor: 'pointer' }}>SCHEDULE</button>
        <button type="button" onClick={() => setCalOpen(true)} style={{ background: 'none', border: 'none', color: 'var(--orange-hot)', fontWeight: 800, letterSpacing: '.06em', fontSize: 13, cursor: 'pointer' }}>CALENDAR</button>
      </div>

      {schedOpen && data?.schedule?.assignment && (
        <TrainingSchedule assignment={data.schedule.assignment} onSaved={tt => setData(d => ({ ...d, schedule: { ...d.schedule, assignment: { ...d.schedule.assignment, train_times: tt } } }))} />
      )}
      {schedOpen && !data?.schedule?.assignment && <p className="muted" style={{ fontSize: 14 }}>Assign a program first to set their training schedule.</p>}

      <div role="tablist" aria-label="Week" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {week.map((d, i) => {
          const st = data ? dayStatus(d, today, weekCounts, logged) : 'rest'
          const sel = d === selected
          return (
            <button key={d} role="tab" aria-selected={sel} data-status={st} onClick={() => setSelected(d)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'inherit' }}>
              <span style={{ width: '100%', maxWidth: 52, aspectRatio: '1', borderRadius: '50%', position: 'relative', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 16,
                background: sel ? 'var(--orange)' : d > today ? 'var(--steel)' : 'var(--coal)', color: sel ? '#140A02' : 'var(--white)',
                border: d === today && !sel ? '2px solid var(--orange)' : '1px solid var(--line)' }}>
                <span style={{ position: 'absolute', top: 4, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}><Mark status={st} size={11} /></span>
                <span style={{ marginTop: 6 }}>{Number(d.slice(8))}</span>
              </span>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{DOW[i]}</span>
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 26 }}>DAILY RX</h2>
        <button type="button" className="btn-ghost" onClick={() => setAdding(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 16, borderRadius: 999 }}><Plus size={18} /> Add New</button>
      </div>

      {adding && <OneOffBuilder clientId={clientId} date={selected} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); setReload(n => n + 1) }} />}

      {!data ? <p className="muted">Loading…</p> : !daySessions.length ? (
        <div style={{ ...card, textAlign: 'center', padding: 24 }}>
          <strong style={{ fontSize: 17 }}>{logged.has(selected) ? 'Trained ✓ (unscheduled)' : 'Nothing Rx’d'}</strong>
          <p className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>Use + Add New to give them a workout for this day.</p>
        </div>
      ) : daySessions.map((s, si) => {
        const exs = exByDay[s.id]
        const fb = feedbackFor(s.id, selected)
        const e = effortOf(fb)
        const doneAny = (exs || []).some(x => logsOn(x.id, selected).length)
        const sessionMark = doneAny ? 'done' : selected < today ? 'missed' : null
        const nComments = (exs || []).reduce((n, x) => n + (comments[x.id] || 0), 0)
        const time = sessionTime(times, String(weekdayNumber(selected)), si, daySessions.length)
        return (
          <section key={s.id} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }} data-session={s.day_label}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {s.track === 'conditioning' ? <HeartPulse size={24} color={CONDITIONING_COLOR} /> : <Dumbbell size={24} color="var(--orange-hot)" />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 22, display: 'flex', alignItems: 'center', gap: 8 }}>{s.day_label} <Mark status={sessionMark} size={18} /></strong>
                <span className="muted" style={{ fontSize: 12.5 }}>{time ? `${time} · ` : ''}{s.oneOff ? 'One-off workout' : `Week ${s.wk}${s.blockName ? ' · ' + s.blockName : ''}`}{s.movedFrom ? ` · moved from ${fmtDate(s.movedFrom, { weekday: 'short' })}` : ''}</span>
              </div>
              <span title="Comments" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--steel)', borderRadius: 999, padding: '5px 11px', fontSize: 14 }}><MessageSquare size={15} /> {nComments}</span>
              {s.oneOff && <button type="button" className="btn-ghost" aria-label="Delete one-off workout" onClick={() => deleteOneOff(s)} style={{ padding: 8, display: 'flex' }}><Trash2 size={16} /></button>}
            </div>

            {(e || fb?.minutes) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ ...block, display: 'flex', alignItems: 'center', gap: 10 }}>
                  {e ? <>
                    <span style={{ width: 40, height: 40, borderRadius: 20, border: `2px solid ${EFFORT[e].color}`, display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 20, color: EFFORT[e].color }}>{e}</span>
                    <span><strong style={{ display: 'block', fontSize: 14 }}>{EFFORT[e].label}</strong><span className="muted" style={{ fontSize: 12.5 }}>{EFFORT[e].sub}</span></span>
                  </> : <span className="muted" style={{ fontSize: 13 }}>No effort rating</span>}
                </div>
                <div style={{ ...block, textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1 }}>{fb?.minutes || '–'}</div>
                  <div className="muted" style={{ fontSize: 13 }}>Minutes</div>
                </div>
              </div>
            )}

            {s.warmup && (
              <div style={block}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, letterSpacing: '.06em', marginBottom: 4 }}><Thermometer size={15} /> WARMUP</div>
                <p style={{ fontSize: 14.5, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{s.warmup}</p>
                {videoLinks(s.warmup_video).length > 0 && <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>▶ {videoLinks(s.warmup_video).map(v => v.label).join(' · ')}</p>}
              </div>
            )}

            {exs === undefined ? <p className="muted" style={{ fontSize: 13 }}>Loading…</p> : rxGroups(exs).map((g, gi) => (
              <div key={gi} style={block}>
                {g.items.map((ex, i) => {
                  const sets = logsOn(ex.id, selected)
                  const mark = exerciseMark(selected, today, sets.length > 0, missedOn(ex.id, selected))
                  return (
                    <div key={ex.id} data-ex={ex.name} data-mark={mark || ''} style={{ display: 'flex', gap: 12, position: 'relative', paddingBottom: i < g.items.length - 1 ? 14 : 0 }}>
                      {g.grouped && i < g.items.length - 1 && <span aria-hidden="true" style={{ position: 'absolute', left: 19, top: 40, bottom: 0, width: 2, background: 'var(--orange-hot)' }} />}
                      <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: '50%', border: '2px solid var(--orange-hot)', background: 'var(--black)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 14 }}>{ex.letter || '•'}</span>
                      <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                        <strong style={{ display: 'block', fontSize: 16 }}>{ex.name}</strong>
                        <div className="muted" style={{ fontSize: 13.5, whiteSpace: ex.kind === 'conditioning' ? 'pre-wrap' : undefined }}>{ex.kind === 'conditioning' ? (ex.description || '') : rxLine(ex, s.wk)}</div>
                        {sets.length > 0 && (
                          <div style={{ fontSize: 13, marginTop: 4, color: 'var(--green)' }}>
                            {ex.kind === 'conditioning' ? sets.map(x => x.result_text).filter(Boolean).join(' · ') || 'Logged'
                              : [...sets].sort((a, b) => a.set_number - b.set_number).map(x => `${x.weight ?? '–'}×${x.reps ?? '–'}`).join(', ')}
                          </div>
                        )}
                      </div>
                      <span style={{ paddingTop: 10 }}><Mark status={mark} size={20} /></span>
                    </div>
                  )
                })}
              </div>
            ))}

            {s.cooldown && (
              <div style={block}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, letterSpacing: '.06em', marginBottom: 4 }}><Snowflake size={15} /> COOLDOWN</div>
                <p style={{ fontSize: 14.5, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{s.cooldown}</p>
              </div>
            )}
          </section>
        )
      })}

      {calOpen && <MonthCalendar selected={selected} today={today} statusFor={d => (data ? dayStatus(d, today, countsFor([d]), logged) : 'rest')}
        onPick={d => { setSelected(d); setCalOpen(false) }} onClose={() => setCalOpen(false)} />}
    </div>
  )
}

// Month grid pop-up, Monday first, with each day's mark. TODAY jumps back.
export function MonthCalendar({ selected, today, statusFor, onPick, onClose }) {
  const [ym, setYm] = useState(() => selected.slice(0, 7))
  const [y, m] = ym.split('-').map(Number)
  const first = `${ym}-01`
  const lead = weekdayNumber(first) - 1
  const daysIn = new Date(y, m, 0).getDate()
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`)]
  const shift = n => { const d = new Date(y, m - 1 + n, 1); setYm(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }
  return (
    <div role="dialog" aria-modal="true" aria-label="Calendar" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--coal)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, width: '100%', maxWidth: 460 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <button type="button" aria-label="Previous month" onClick={() => shift(-1)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}><ChevronLeft size={24} /></button>
          <strong style={{ fontSize: 19 }}>{new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
          <button type="button" aria-label="Next month" onClick={() => shift(1)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}><ChevronRight size={24} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center' }}>
          {WEEKDAY_SHORT.map(w => <span key={w} className="muted" style={{ fontSize: 12, fontWeight: 700, paddingBottom: 6 }}>{w.toUpperCase()}</span>)}
          {cells.map((d, i) => d ? (
            <button key={d} type="button" onClick={() => onPick(d)} data-cal={d} data-status={statusFor(d)}
              style={{ aspectRatio: '1', borderRadius: '50%', border: d === today ? '2px solid var(--orange)' : 'none', background: d === selected ? 'var(--orange)' : 'transparent',
                color: d === selected ? '#140A02' : 'inherit', fontSize: 16, fontWeight: 600, cursor: 'pointer', position: 'relative', display: 'grid', placeItems: 'center' }}>
              <span style={{ position: 'absolute', top: 2, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}><Mark status={statusFor(d)} size={10} /></span>
              {Number(d.slice(8))}
            </button>
          ) : <span key={'e' + i} />)}
        </div>
        <button type="button" onClick={() => onPick(today)} style={{ display: 'block', margin: '14px auto 0', background: 'none', border: 'none', borderBottom: '2px solid var(--orange)', color: 'inherit', fontWeight: 800, letterSpacing: '.06em', cursor: 'pointer', padding: '4px 2px' }}>TODAY</button>
      </div>
    </div>
  )
}

// CoachRx's Training Schedule: AM / PM per weekday, saved on the assignment.
function TrainingSchedule({ assignment, onSaved }) {
  const [tt, setTt] = useState(cleanTrainTimes(assignment.train_times))
  const [state, setState] = useState('')
  const on = (wd, half) => { const v = tt[wd]; return v === half || v === 'both' }
  async function save() {
    setState('saving')
    const value = Object.keys(tt).length ? tt : null
    const { error } = await supabase.from('program_assignments').update({ train_times: value }).eq('id', assignment.id)
    if (error) return setState('Couldn’t save: ' + error.message)
    setState('Saved'); onSaved(value)
  }
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <strong style={{ fontSize: 19, display: 'flex', alignItems: 'center', gap: 8 }}><Clock size={18} /> Training Schedule</strong>
      {WEEKDAY_SHORT.map((w, i) => {
        const wd = String(i + 1)
        return (
          <div key={w} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1, fontSize: 16 }}>{['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][i]}</span>
            {['am', 'pm'].map(h => (
              <button key={h} type="button" aria-pressed={on(wd, h)} aria-label={`${w} ${h.toUpperCase()}`} onClick={() => { setTt(cur => toggleTrainTime(cur, wd, h) || {}); setState('') }}
                style={{ width: 64, height: 40, borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: 'pointer', border: '1px solid ' + (on(wd, h) ? 'var(--orange)' : 'var(--line)'),
                  background: on(wd, h) ? 'var(--orange)' : 'var(--steel)', color: on(wd, h) ? '#140A02' : 'var(--muted)' }}>{h.toUpperCase()}</button>
            ))}
          </div>
        )
      })}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
        <button className="btn" onClick={save} disabled={state === 'saving'}>{state === 'saving' ? 'Saving…' : 'Save schedule'}</button>
        {state && state !== 'saving' && <span style={{ fontSize: 13, color: state === 'Saved' ? 'var(--green)' : 'var(--red)' }}>{state}</span>}
      </div>
      <p className="muted" style={{ fontSize: 12.5 }}>Shows as AM / PM on their Daily Rx. Which days each workout lands on is still set by their training days.</p>
    </div>
  )
}

// "+ Add New": a workout for this one client on this one date.
const blankRow = () => ({ key: Math.random().toString(36).slice(2), name: '', sets: '3', reps: '8-12', rest: '', kind: 'exercise', description: '', linked: false })

export function OneOffBuilder({ clientId, date, onClose, onSaved }) {
  const [title, setTitle] = useState('')
  const [warmup, setWarmup] = useState('')
  const [cooldown, setCooldown] = useState('')
  const [rows, setRows] = useState([blankRow()])
  const [lib, setLib] = useState([])
  const [openKey, setOpenKey] = useState(null)
  const [state, setState] = useState('')

  useEffect(() => {
    supabase.from('exercise_library').select('name, video_url, icon_url').order('name').then(({ data }) => setLib(data || []))
  }, [])
  const letters = lettersFor(rows)
  const upd = (i, patch) => setRows(rs => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  const move = (i, d) => setRows(rs => {
    const j = i + d
    if (j < 0 || j >= rs.length) return rs
    const n = [...rs]; [n[i], n[j]] = [n[j], n[i]]
    n[0] = { ...n[0], linked: false }
    return n
  })
  const remove = i => setRows(rs => { const n = rs.filter((_, k) => k !== i); if (n[0]) n[0] = { ...n[0], linked: false }; return n.length ? n : [blankRow()] })

  async function save() {
    const list = rows.filter(r => r.name.trim())
    if (!list.length) return setState('Add at least one exercise.')
    setState('saving')
    const { data: day, error } = await supabase.from('program_days').insert({
      client_id: clientId, on_date: date, day_label: title.trim() || 'Workout', day_number: weekdayNumber(date), track: 'exercise',
      warmup: warmup.trim(), cooldown: cooldown.trim(), position: 0, program_id: null, block_id: null,
    }).select().single()
    if (error) return setState(/client_id|on_date|program_id/.test(error.message) ? 'Run the Update 190 migration in Supabase first.' : 'Couldn’t save: ' + error.message)
    const ls = lettersFor(list)
    const byName = Object.fromEntries(lib.map(l => [l.name.toLowerCase(), l]))
    const { error: e2 } = await supabase.from('program_exercises').insert(list.map((r, i) => {
      const L = byName[r.name.trim().toLowerCase()]
      return {
        day_id: day.id, name: r.name.trim(), letter: ls[i], position: i, kind: r.kind,
        sets: Math.max(1, Number(r.sets) || 1), reps: String(r.reps || '').trim() || '8-12', rir: '', rest: String(r.rest || '').trim(),
        progression_type: 'rir', description: r.kind === 'conditioning' ? r.description.trim() : '', week_targets: [],
        video_url: L?.video_url || '', icon_url: L?.icon_url || null,
      }
    }))
    if (e2) { await supabase.from('program_days').delete().eq('id', day.id); return setState('Couldn’t save the exercises: ' + e2.message) }
    onSaved(day)
  }

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10, borderColor: 'var(--orange)' }} aria-label="Add new workout">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 21 }}>Add New Workout</strong>
        <span className="muted" style={{ fontSize: 13 }}>{fmtDate(date, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
      </div>
      <input placeholder="Workout Title (Optional)" value={title} onChange={e => setTitle(e.target.value)} />
      <textarea placeholder="Warmup (optional)" rows={2} value={warmup} onChange={e => setWarmup(e.target.value)} />
      <datalist id="oneoff-lib">{lib.map(l => <option key={l.name} value={l.name} />)}</datalist>

      {rows.map((r, i) => (
        <div key={r.key}>
          {i > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', margin: '-4px 0' }}>
              <button type="button" aria-pressed={r.linked} aria-label={r.linked ? 'Unlink from superset' : 'Link into a superset'} onClick={() => upd(i, { linked: !r.linked })}
                style={{ width: 34, height: 30, borderRadius: 8, border: '1px solid var(--line)', background: r.linked ? 'var(--orange)' : 'var(--steel)', color: r.linked ? '#140A02' : 'var(--muted)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                {r.linked ? <Link2 size={16} /> : <Unlink size={16} />}
              </button>
            </div>
          )}
          <div style={{ background: 'var(--steel)', borderRadius: 12, borderLeft: r.linked || rows[i + 1]?.linked ? '4px solid var(--orange)' : '4px solid transparent', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: '50%', border: '2px solid var(--orange-hot)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>{letters[i]}</span>
              <input list="oneoff-lib" aria-label={`Exercise ${i + 1}`} placeholder="Exercise name" value={r.name} onChange={e => upd(i, { name: e.target.value })} style={{ flex: 1 }} />
              <button type="button" aria-label="Exercise options" aria-expanded={openKey === r.key} onClick={() => setOpenKey(openKey === r.key ? null : r.key)} className="btn-ghost" style={{ padding: '6px 10px', fontSize: 18 }}>⋮</button>
            </div>
            {r.kind === 'conditioning'
              ? <textarea rows={3} placeholder={'10 burpees\n15 kettlebell swings\n20 cal row'} value={r.description} onChange={e => upd(i, { description: e.target.value })} />
              : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr 1.3fr', gap: 8 }}>
                  <label style={{ fontSize: 12 }}>Sets<input inputMode="numeric" value={r.sets} onChange={e => upd(i, { sets: e.target.value })} /></label>
                  <label style={{ fontSize: 12 }}>Reps<input value={r.reps} onChange={e => upd(i, { reps: e.target.value })} /></label>
                  <label style={{ fontSize: 12 }}>Rest<input placeholder="90s" value={r.rest} onChange={e => upd(i, { rest: e.target.value })} /></label>
                </div>
              )}
            {openKey === r.key && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" className="btn-ghost" onClick={() => upd(i, { kind: r.kind === 'conditioning' ? 'exercise' : 'conditioning' })} style={{ padding: '6px 10px', fontSize: 13 }}>{r.kind === 'conditioning' ? 'Make it a lift' : 'Make it conditioning'}</button>
                <button type="button" className="btn-ghost" aria-label="Move up" onClick={() => move(i, -1)} style={{ padding: '6px 10px' }}><ArrowUp size={14} /></button>
                <button type="button" className="btn-ghost" aria-label="Move down" onClick={() => move(i, 1)} style={{ padding: '6px 10px' }}><ArrowDown size={14} /></button>
                <button type="button" className="btn-ghost" onClick={() => remove(i)} style={{ padding: '6px 10px', fontSize: 13, color: 'var(--red)' }}>Remove</button>
              </div>
            )}
          </div>
        </div>
      ))}

      <button type="button" className="btn-ghost" onClick={() => setRows(rs => [...rs, blankRow()])} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', fontSize: 17, borderColor: 'var(--orange)' }}><Plus size={20} /> Add New</button>
      <textarea placeholder="Cooldown (optional)" rows={2} value={cooldown} onChange={e => setCooldown(e.target.value)} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn" onClick={save} disabled={state === 'saving'} style={{ flex: 1, height: 50, fontSize: 16 }}>{state === 'saving' ? 'Saving…' : 'Save Workout'}</button>
        <button className="btn-ghost" onClick={onClose} style={{ height: 50 }}>Cancel</button>
      </div>
      {state && state !== 'saving' && <p style={{ color: 'var(--red)', fontSize: 13 }}>{state}</p>}
    </div>
  )
}
