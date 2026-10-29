import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { localDateStr, daysBetween } from '../../lib/weeks'
import { CONDITIONING_COLOR, LIFESTYLE_COLOR, trackColor, withMoves } from '../../lib/conditioning'
import { eventsOn, eventIcons, EVENT_KINDS } from '../../lib/clientEvents'
import ShowsTravel from './ShowsTravel'

export default function ClientCalendar() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [startDate, setStartDate] = useState(null)
  const [allBlocks, setAllBlocks] = useState([])
  const [daysByBlock, setDaysByBlock] = useState({})   // blockId -> [days]
  const [dailyLogDates, setDailyLogDates] = useState(new Set())
  const [lastCheckin, setLastCheckin] = useState(null)
  const [checkinFormId, setCheckinFormId] = useState(null)
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const [selected, setSelected] = useState(null)
  const [moves, setMoves] = useState([]) // conditioning sessions the client moved
  const [events, setEvents] = useState([]) // shows & travel
  const loadEvents = () => profile && supabase.from('client_events').select('*').eq('client_id', profile.id).order('start_date')
    .then(({ data, error }) => setEvents(error ? [] : data || []))

  useEffect(() => {
    if (!profile) return
    supabase.from('program_assignments').select('program_id, start_date').eq('client_id', profile.id).maybeSingle()
      .then(async ({ data }) => {
        if (!data) return
        setStartDate(data.start_date || null)
        const { data: blocks } = await supabase.from('program_blocks').select('*').eq('program_id', data.program_id).order('position')
        setAllBlocks(blocks || [])
        const byBlock = {}
        for (const b of blocks || []) {
          const { data: d } = await supabase.from('program_days').select('*').eq('block_id', b.id).order('day_number').order('position')
          byBlock[b.id] = d || []
        }
        setDaysByBlock(byBlock)
      })
    loadEvents()
    supabase.from('session_moves').select('*').eq('client_id', profile.id)
      .then(({ data }) => setMoves(data || []))
    supabase.from('daily_logs').select('log_date').eq('client_id', profile.id)
      .then(({ data }) => setDailyLogDates(new Set((data || []).map(d => d.log_date))))
    supabase.from('checkins').select('submitted_at').eq('client_id', profile.id).order('submitted_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setLastCheckin(data?.submitted_at || null))
  }, [profile])

  function resolveBlock(diff) {
    const wkOverall = Math.floor(diff / 7) + 1
    let cursor = 0
    for (const b of allBlocks) {
      if (wkOverall <= cursor + (b.weeks || 4)) return { blk: b, wkInBlock: wkOverall - cursor }
      cursor += (b.weeks || 4)
    }
    return null
  }

  const { y, m } = month
  const first = new Date(y, m, 1)
  const offset = (first.getDay() + 6) % 7
  const numDays = new Date(y, m + 1, 0).getDate()
  const cells = [...Array(offset).fill(null), ...Array.from({ length: numDays }, (_, i) => i + 1)]
  const monthName = first.toLocaleString('default', { month: 'long', year: 'numeric' })
  const sd = startDate ? new Date(startDate + 'T00:00:00') : null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const lastCheckinDate = lastCheckin ? new Date(lastCheckin) : (sd || null)

  function daySessions(dayNum) {
    const ymd = localDateStr(new Date(y, m, dayNum))
    return withMoves(ymd, scheduledOn(ymd), scheduledOn, moves)
  }
  function scheduledOn(ymd) {
    if (!sd || allBlocks.length === 0) return []
    // whole calendar days, so a DST changeover can't shift a session a day
    const diff = daysBetween(startDate, new Date(ymd + 'T00:00:00'))
    if (diff === null || diff < 0) return []
    const resolved = resolveBlock(diff)
    if (!resolved) return []
    const dn = (diff % 7) + 1
    return (daysByBlock[resolved.blk.id] || []).filter(d => d.day_number === dn).map(d => ({ ...d, wk: resolved.wkInBlock, blockName: resolved.blk.name }))
  }

  function isCheckinDue(dayNum) {
    if (!lastCheckinDate) return false
    const date = new Date(y, m, dayNum)
    const diff = Math.round((date - lastCheckinDate) / 864e5)
    return diff > 0 && diff % 7 === 0
  }
  function loggedThatDay(dayNum) {
    const date = new Date(y, m, dayNum)
    return dailyLogDates.has(localDateStr(date))
  }

  const sel = selected ? daySessions(selected) : []
  const selDate = selected ? new Date(y, m, selected) : null

  function openWorkout(s) {
    navigate('/app/training', { state: { targetBlockId: s.block_id, targetWeek: s.wk, targetDayNumber: s.day_number } })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header>
        <div className="eyebrow">Everything, one view</div>
        <h1 style={{ fontSize: 24, marginTop: 4 }}>Calendar</h1>
      </header>

      <ShowsTravel profile={profile} events={events} onChange={loadEvents} />

      <div className="card" style={{ padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <button className="btn-ghost" style={{ padding: '6px 12px' }} onClick={() => setMonth(({ y, m }) => m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 })}>‹</button>
          <strong style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{monthName}</strong>
          <button className="btn-ghost" style={{ padding: '6px 12px' }} onClick={() => setMonth(({ y, m }) => m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 })}>›</button>
        </div>
        {!sd && <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>No program start date set yet — ask your coach.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>
          {['M','T','W','T','F','S','S'].map((d, i) => <div key={i} style={{ textAlign: 'center' }}>{d}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, gridAutoRows: '68px' }}>
          {cells.map((dayNum, i) => {
            if (dayNum === null) return <div key={i} />
            const sessions = daySessions(dayNum)
            const shown = sessions.slice(0, 2)
            const extra = sessions.length - shown.length
            const checkinDue = isCheckinDue(dayNum)
            const isToday = today.getTime() === new Date(y, m, dayNum).getTime()
            const logged = loggedThatDay(dayNum)
            return (
              <div key={i} onClick={() => setSelected(dayNum)}
                style={{ background: selected === dayNum ? 'var(--steel)' : 'var(--coal)', borderRadius: 6, padding: '3px 4px', border: isToday ? '1px solid var(--orange)' : '1px solid var(--line)', overflow: 'hidden', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: isToday ? 'var(--orange-hot)' : 'var(--muted)' }}>{dayNum}</span>
                  <span style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    {eventIcons(events, localDateStr(new Date(y, m, dayNum))) && <span style={{ fontSize: 9, lineHeight: 1 }}>{eventIcons(events, localDateStr(new Date(y, m, dayNum)))}</span>}
                    {logged && <span title="Logged" style={{ width: 5, height: 5, borderRadius: '50%', background: '#4A6FA5' }} />}
                    {checkinDue && <span title="Check-in due" style={{ width: 5, height: 5, borderRadius: '50%', background: '#9B7FE0' }} />}
                  </span>
                </div>
                {shown.map(s => (
                  <div key={s.id} style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', lineHeight: 1.3, color: trackColor(s.track), overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {s.movedFrom ? '↪ ' : ''}{s.day_label}
                  </div>
                ))}
                {extra > 0 && <div className="muted" style={{ fontSize: 7.5 }}>+{extra}</div>}
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap', fontSize: 10.5 }} className="muted">
          <span><span style={{ color: 'var(--orange-hot)' }}>■</span> Training</span>
          <span><span style={{ color: CONDITIONING_COLOR }}>■</span> Conditioning</span>
          <span><span style={{ color: LIFESTYLE_COLOR }}>■</span> Lifestyle</span>
          <span>↪ Moved</span>
          <span>🎤 Show · 📺 TV · ✈️ Travel</span>
          <span><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4A6FA5', display: 'inline-block', marginRight: 3 }} />Logged</span>
          <span><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#9B7FE0', display: 'inline-block', marginRight: 3 }} />Check-in due</span>
        </div>
      </div>

      {selected && (
        <div className="card">
          <strong style={{ fontSize: 14 }}>{selDate?.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</strong>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {eventsOn(events, localDateStr(selDate)).map(e => (
              <div key={e.id} style={{ fontSize: 13, fontWeight: 700 }}>{EVENT_KINDS[e.kind]?.icon} {e.title || EVENT_KINDS[e.kind]?.label}{e.location ? ` · ${e.location}` : ''}</div>
            ))}
            {sel.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'var(--steel)', borderRadius: 6, padding: '8px 10px' }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: trackColor(s.track) }}>{s.day_label}</span>
                  <span className="muted" style={{ fontSize: 11.5, marginLeft: 8 }}>
                    {s.blockName} · Wk {s.wk}
                    {s.movedFrom && ` · moved from ${new Date(s.movedFrom + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' })}`}
                  </span>
                </div>
                <button className="btn" style={{ padding: '7px 14px', fontSize: 12 }} onClick={() => openWorkout(s)}>
                  {(s.track || 'exercise') === 'lifestyle' ? 'Open day →' : s.track === 'conditioning' ? 'Start session →' : 'Start workout →'}
                </button>
              </div>
            ))}
            {sel.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Nothing scheduled.</p>}
            {isCheckinDue(selected) && (
              <div style={{ background: 'rgba(124,92,191,0.15)', borderRadius: 6, padding: '8px 10px', fontSize: 13, color: '#9B7FE0', fontWeight: 700 }}>Check-in due today</div>
            )}
            {loggedThatDay(selected) && (
              <div className="muted" style={{ fontSize: 12 }}>✓ Weight/steps logged this day</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
