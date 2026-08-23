import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import RestTimer from '../../lib/RestTimer'
import PlateCalc from '../../lib/PlateCalc'

function roundTo5(n) { return Math.round(n / 5) * 5 }

function loomEmbed(url) {
  const m = (url || '').match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/)
  return m ? `https://www.loom.com/embed/${m[1]}` : null
}

const prefixOf = l => (l || '').replace(/[0-9]/g, '')
const isNumbered = l => /^[A-Z]+\d+$/.test(l || '')
const GROUP_COLORS = ['#BF5700', '#7C5CBF', '#3E8E7E', '#B0533E', '#4A6FA5', '#8E6E3E']

function chunkGroups(list) {
  const out = []
  for (const ex of list) {
    const prev = out[out.length - 1]
    const pfx = prefixOf(ex.letter)
    if (prev && isNumbered(ex.letter) && prev.prefix === pfx && prev.grouped) prev.items.push(ex)
    else out.push({ prefix: pfx, grouped: isNumbered(ex.letter), items: [ex] })
  }
  return out.map(g => ({ ...g, grouped: g.grouped && g.items.length > 1 }))
}

const BODYWEIGHT_SUBS = [
  ['Squat / leg press', 'Bodyweight squats, Bulgarian split squats, walking lunges'],
  ['Bench / chest press', 'Push-ups (feet elevated for more load), decline push-ups'],
  ['Row / lat pulldown', 'Inverted rows (table/bar), towel rows, doorway rows'],
  ['Overhead press', 'Pike push-ups, handstand hold/push-up progressions'],
  ['Deadlift / hinge', 'Single-leg RDLs (bodyweight), glute bridges, hip thrusts'],
  ['Core work', 'Planks, hollow holds, mountain climbers, leg raises'],
  ['Conditioning', 'Bodyweight circuits, burpees, jump rope if available, hill sprints'],
]

const todayStr = () => new Date().toISOString().slice(0, 10)

export default function ClientTraining() {
  const { profile } = useAuth()
  const [program, setProgram] = useState(null)
  const [allBlocks, setAllBlocks] = useState([])
  const [block, setBlock] = useState(null)
  const [week, setWeek] = useState(1)
  const [startDate, setStartDate] = useState(null)
  const [calMode, setCalMode] = useState(false)
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const [days, setDays] = useState([])
  const [activeDay, setActiveDay] = useState(null)
  const [exercises, setExercises] = useState([])
  const [maxes, setMaxes] = useState({})
  const [log, setLog] = useState({})
  const [results, setResults] = useState({})
  const [lastLogged, setLastLogged] = useState({})   // exerciseId -> {weight, reps, date}
  const [openComments, setOpenComments] = useState(null)
  const [comments, setComments] = useState({})
  const [commentText, setCommentText] = useState('')
  const [commentCounts, setCommentCounts] = useState({})
  const [flagging, setFlagging] = useState(null)
  const [flagNote, setFlagNote] = useState('')
  const [flaggedIds, setFlaggedIds] = useState(new Set())
  const [awayMode, setAwayMode] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savingSets, setSavingSets] = useState(new Set()) // exerciseId-setNumber currently being auto-saved

  // debounce timers for auto-save, keyed per set (or per conditioning result)
  const saveTimers = useRef({})

  useEffect(() => {
    if (!profile) return
    supabase.from('program_assignments')
      .select('program_id, current_week, current_block_id, start_date, programs(id, name, notes, weeks)')
      .eq('client_id', profile.id).maybeSingle()
      .then(async ({ data }) => {
        if (!data) return
        setProgram(data.programs)
        setWeek(data.current_week || 1)
        setStartDate(data.start_date || null)
        const { data: bs } = await supabase.from('program_blocks').select('*').eq('program_id', data.program_id).order('position')
        setAllBlocks(bs || [])
        const activeBlock = (bs || []).find(b => b.id === data.current_block_id) || (bs || [])[0]
        setBlock(activeBlock || null)
        if (activeBlock) {
          const { data: d } = await supabase.from('program_days').select('*').eq('block_id', activeBlock.id).order('day_number').order('position')
          setDays(d || [])
        }
      })
    supabase.from('client_maxes').select('*').eq('client_id', profile.id)
      .then(({ data }) => {
        setMaxes(Object.fromEntries((data || []).map(m => [m.lift_name.toLowerCase(), m.max_weight])))
      })
  }, [profile])

  const blockWeeks = block?.weeks || program?.weeks || 4

  function weekTarget(ex) {
    const wt = Array.isArray(ex.week_targets) ? ex.week_targets[week - 1] : null
    return {
      sets: wt?.sets ?? ex.sets,
      reps: wt?.reps ?? ex.reps,
      target: wt?.target ?? ex.rir,
    }
  }

  function targetText(ex) {
    const { sets, reps, target } = weekTarget(ex)
    if (ex.progression_type === 'percent') {
      const max = maxes[(ex.based_on_lift || ex.name).toLowerCase()]
      const load = max ? ` → ${roundTo5(max * (+target / 100))} lbs` : ''
      return `${sets} × ${reps} @ ${target}%${load}${ex.rest ? ` · rest ${ex.rest}` : ''}`
    }
    if (ex.progression_type === 'rpe') return `${sets} × ${reps} @ RPE ${target}${ex.rest ? ` · rest ${ex.rest}` : ''}`
    return `${sets} × ${reps} @ RIR ${target}${ex.rest ? ` · rest ${ex.rest}` : ''}`
  }

  useEffect(() => {
    if (!activeDay) return
    supabase.from('program_exercises').select('*')
      .eq('day_id', activeDay.id).order('position')
      .then(({ data }) => {
        setExercises(data || [])
        const init = {}
        for (const ex of data || []) {
          const wt = Array.isArray(ex.week_targets) ? ex.week_targets[week - 1] : null
          const sets = wt?.sets ?? ex.sets
          init[ex.id] = Array.from({ length: sets }, () => ({ weight: '', reps: '', rir: '' }))
        }
        setLog(init)
        setResults({})
        const ids = (data || []).map(ex => ex.id)

        // pull most recent PRIOR logged set per exercise, for the "last time" hint
        if (ids.length) {
          supabase.from('workout_logs').select('exercise_id, weight, reps, rir, logged_at')
            .in('exercise_id', ids).order('logged_at', { ascending: false }).limit(200)
            .then(({ data: logs }) => {
              const seen = {}
              for (const l of logs || []) {
                if (!seen[l.exercise_id] && (l.weight || l.reps)) {
                  seen[l.exercise_id] = { weight: l.weight, reps: l.reps, rir: l.rir, date: l.logged_at }
                }
              }
              setLastLogged(seen)
            })
        } else setLastLogged({})

        // rehydrate anything ALREADY saved for TODAY — so switching away and back
        // shows what was actually saved, not a blank form
        if (ids.length) {
          supabase.from('workout_logs').select('exercise_id, set_number, weight, reps, rir, result_text')
            .eq('client_id', profile.id).eq('logged_date', todayStr()).in('exercise_id', ids)
            .then(({ data: todayLogs }) => {
              if (!todayLogs?.length) return
              setLog(prev => {
                const next = { ...prev }
                for (const row of todayLogs) {
                  if (!next[row.exercise_id]) continue
                  const idx = row.set_number - 1
                  if (idx >= 0 && idx < next[row.exercise_id].length) {
                    next[row.exercise_id] = next[row.exercise_id].map((s, j) =>
                      j === idx ? { weight: row.weight || '', reps: row.reps || '', rir: row.rir || '' } : s)
                  }
                }
                return next
              })
              const resultsInit = {}
              for (const row of todayLogs) if (row.result_text) resultsInit[row.exercise_id] = row.result_text
              if (Object.keys(resultsInit).length) setResults(r => ({ ...r, ...resultsInit }))
            })
        }

        if (ids.length) {
          supabase.from('exercise_comments').select('exercise_id').in('exercise_id', ids)
            .then(({ data }) => {
              const counts = {}
              for (const c of data || []) counts[c.exercise_id] = (counts[c.exercise_id] || 0) + 1
              setCommentCounts(counts)
            })
        } else setCommentCounts({})
        if (ids.length) {
          supabase.from('exercise_flags').select('exercise_id').eq('client_id', profile.id).eq('resolved', false).in('exercise_id', ids)
            .then(({ data }) => setFlaggedIds(new Set((data || []).map(f => f.exercise_id))))
        }
      })
  }, [activeDay, week])

  async function openExerciseComments(exId) {
    if (openComments === exId) { setOpenComments(null); return }
    setOpenComments(exId)
    const { data } = await supabase.from('exercise_comments').select('*').eq('exercise_id', exId).order('created_at')
    setComments(c => ({ ...c, [exId]: data || [] }))
  }

  async function sendExerciseComment(exId) {
    if (!commentText.trim()) return
    const body = commentText.trim()
    setCommentText('')
    await supabase.from('exercise_comments').insert({ exercise_id: exId, author_id: profile.id, body })
    const { data } = await supabase.from('exercise_comments').select('*').eq('exercise_id', exId).order('created_at')
    setComments(c => ({ ...c, [exId]: data || [] }))
    setCommentCounts(c => ({ ...c, [exId]: (c[exId] || 0) + 1 }))
  }

  async function submitFlag(exId) {
    if (!flagNote.trim()) return
    await supabase.from('exercise_flags').insert({ exercise_id: exId, client_id: profile.id, note: flagNote.trim() })
    setFlagNote(''); setFlagging(null)
    setFlaggedIds(f => new Set([...f, exId]))
  }

  // ---- auto-save: each set gets its own debounce timer, keyed so editing
  // Set 2 doesn't reset/cancel a pending save for Set 1 ----
  function autoSaveSet(exId, setNumber, s, exerciseName) {
    const key = `${exId}-${setNumber}`
    clearTimeout(saveTimers.current[key])
    saveTimers.current[key] = setTimeout(async () => {
      if (!s.weight && !s.reps) return // nothing worth saving yet
      setSavingSets(prev => new Set(prev).add(key))
      await supabase.from('workout_logs').upsert({
        client_id: profile.id, exercise_id: exId, exercise_name: exerciseName,
        set_number: setNumber, weight: s.weight || null, reps: s.reps || null, rir: s.rir || null,
        logged_date: todayStr(),
      }, { onConflict: 'client_id,exercise_id,set_number,logged_date' })
      setSavingSets(prev => { const n = new Set(prev); n.delete(key); return n })
    }, 900)
  }

  function updateSet(exId, i, field, value) {
    setLog(l => {
      const updated = l[exId].map((s, j) => j === i ? { ...s, [field]: value } : s)
      const ex = exercises.find(e => e.id === exId)
      autoSaveSet(exId, i + 1, updated[i], ex?.name)
      return { ...l, [exId]: updated }
    })
  }

  function autoSaveResult(exId, value, exerciseName) {
    const key = `result-${exId}`
    clearTimeout(saveTimers.current[key])
    saveTimers.current[key] = setTimeout(async () => {
      if (!value?.toString().trim()) return
      setSavingSets(prev => new Set(prev).add(key))
      await supabase.from('workout_logs').upsert({
        client_id: profile.id, exercise_id: exId, exercise_name: exerciseName,
        set_number: 1, result_text: value.toString().trim(),
        logged_date: todayStr(),
      }, { onConflict: 'client_id,exercise_id,set_number,logged_date' })
      setSavingSets(prev => { const n = new Set(prev); n.delete(key); return n })
    }, 900)
  }

  function updateResult(exId, value, exerciseName) {
    setResults(r => ({ ...r, [exId]: value }))
    autoSaveResult(exId, value, exerciseName)
  }

  // manual "Save workout" stays as a confirmation/backstop pass — uses the
  // same upsert key so it can never create a duplicate alongside auto-saves
  async function saveWorkout() {
    const rows = []
    for (const ex of exercises) {
      (log[ex.id] || []).forEach((s, i) => {
        if (s.weight || s.reps) rows.push({
          client_id: profile.id, exercise_id: ex.id, exercise_name: ex.name,
          set_number: i + 1, weight: s.weight || null, reps: s.reps || null, rir: s.rir || null,
          logged_date: todayStr(),
        })
      })
    }
    for (const ex of exercises) {
      if (ex.kind === 'conditioning' && (results[ex.id] || '').toString().trim()) {
        rows.push({
          client_id: profile.id, exercise_id: ex.id, exercise_name: ex.name, set_number: 1,
          result_text: results[ex.id].toString().trim(), logged_date: todayStr(),
        })
      }
    }
    if (!rows.length) return
    const { error } = await supabase.from('workout_logs')
      .upsert(rows, { onConflict: 'client_id,exercise_id,set_number,logged_date' })
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2500) }
  }

  if (!program) return (
    <div className="card">
      <h2 style={{ fontSize: 18 }}>No program yet</h2>
      <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>Your coach hasn't assigned a program. Message them from the Coach tab.</p>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header>
        <div className="eyebrow">Training · {block?.name || 'Block 1'} · Week {week} of {blockWeeks}</div>
        <h1 style={{ fontSize: 24, marginTop: 4 }}>{program.name}</h1>
        {program.notes && <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>{program.notes}</p>}
      </header>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className={calMode ? 'btn' : 'btn-ghost'} style={{ padding: '10px 14px', fontSize: 13 }}
          onClick={() => setCalMode(!calMode)}>📅</button>
        <button className={awayMode ? 'btn' : 'btn-ghost'} style={{ padding: '10px 14px', fontSize: 13 }}
          onClick={() => setAwayMode(!awayMode)} title="Traveling / no equipment">✈️</button>
        {!calMode && days.filter(d => (d.track || 'exercise') === 'exercise').map(d => (
          <button key={d.id} className={activeDay?.id === d.id ? 'btn' : 'btn-ghost'}
            style={{ padding: '10px 16px', fontSize: 13 }}
            onClick={() => setActiveDay(d)}>{d.day_label}</button>
        ))}
        {!calMode && days.filter(d => (d.track || 'exercise') === 'lifestyle').map(d => (
          <button key={d.id} className={activeDay?.id === d.id ? 'btn' : 'btn-ghost'}
            style={{ padding: '10px 16px', fontSize: 13, borderColor: activeDay?.id === d.id ? undefined : '#3E8E7E', color: activeDay?.id === d.id ? undefined : '#3E8E7E' }}
            onClick={() => setActiveDay(d)}>{d.day_label}</button>
        ))}
      </div>

      {awayMode && (
        <div className="card" style={{ borderLeft: '3px solid var(--orange)' }}>
          <div className="eyebrow" style={{ fontSize: 10, marginBottom: 4 }}>Away from the gym</div>
          <h2 style={{ fontSize: 17, marginBottom: 8 }}>Bodyweight substitutes</h2>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>No equipment where you're at? Sub in the closest movement pattern below, keep the same rep/RIR intent from your program, and log it as usual when you're back.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {BODYWEIGHT_SUBS.map(([label, subs]) => (
              <div key={label}>
                <strong style={{ fontSize: 13 }}>{label}</strong>
                <p className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{subs}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!awayMode && calMode && (() => {
        const { y, m } = calMonth
        const first = new Date(y, m, 1)
        const offset = (first.getDay() + 6) % 7 // Monday-first
        const numDays = new Date(y, m + 1, 0).getDate()
        const cells = [...Array(offset).fill(null), ...Array.from({ length: numDays }, (_, i) => i + 1)]
        const monthName = first.toLocaleString('default', { month: 'long', year: 'numeric' })
        const sd = startDate ? new Date(startDate + 'T00:00:00') : null
        const today = new Date(); today.setHours(0, 0, 0, 0)

        function resolveBlock(diff) {
          const wkOverall = Math.floor(diff / 7) + 1
          let cursor = 0
          for (const b of allBlocks) {
            if (wkOverall <= cursor + (b.weeks || 4)) return { blk: b, wkInBlock: wkOverall - cursor }
            cursor += (b.weeks || 4)
          }
          return null
        }
        function workoutsOn(dayNum) {
          if (!sd || allBlocks.length === 0) return []
          const date = new Date(y, m, dayNum)
          const diff = Math.round((date - sd) / 864e5)
          if (diff < 0) return []
          const resolved = resolveBlock(diff)
          if (!resolved) return []
          const dn = (diff % 7) + 1
          if (resolved.blk.id === block?.id) {
            return days.filter(d => d.day_number === dn).map(d => ({ ...d, wk: resolved.wkInBlock, blockId: resolved.blk.id }))
          }
          return [{ id: `ghost-${resolved.blk.id}-${dn}`, day_label: resolved.blk.name, track: 'exercise', wk: resolved.wkInBlock, blockId: resolved.blk.id, ghost: true }]
        }

        return (
          <div className="card" style={{ padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <button className="btn-ghost" style={{ padding: '6px 12px' }} onClick={() => setCalMonth(({ y, m }) => m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 })}>‹</button>
              <strong style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{monthName}</strong>
              <button className="btn-ghost" style={{ padding: '6px 12px' }} onClick={() => setCalMonth(({ y, m }) => m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 })}>›</button>
            </div>
            {!sd && <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>No start date set — ask your coach to set one so your schedule shows here.</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 4 }}>
              {['M','T','W','T','F','S','S'].map((d, i) => <div key={i} style={{ textAlign: 'center' }}>{d}</div>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, gridAutoRows: '64px' }}>
              {cells.map((dayNum, i) => {
                if (dayNum === null) return <div key={i} />
                const w = workoutsOn(dayNum)
                const isToday = today.getTime() === new Date(y, m, dayNum).getTime()
                const shown = w.slice(0, 2)
                const extra = w.length - shown.length
                return (
                  <div key={i} style={{ background: 'var(--steel)', borderRadius: 5, height: 64, overflow: 'hidden', padding: '3px 4px', border: isToday ? '1px solid var(--orange)' : '1px solid transparent' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: isToday ? 'var(--orange-hot)' : 'var(--muted)' }}>{dayNum}</div>
                    {shown.map(d => {
                      const label = d.day_label.length > 14 ? d.day_label.slice(0, 13) + '…' : d.day_label
                      return (
                        <button key={d.id}
                          onClick={async () => {
                            if (d.blockId !== block?.id) {
                              const nb = allBlocks.find(b => b.id === d.blockId)
                              setBlock(nb)
                              const { data: nd } = await supabase.from('program_days').select('*').eq('block_id', d.blockId).order('day_number').order('position')
                              setDays(nd || [])
                              if (d.ghost) { setWeek(d.wk); setCalMode(false); return }
                            }
                            setWeek(d.wk); setActiveDay(d); setCalMode(false)
                          }}
                          title={d.day_label}
                          style={{ display: 'block', width: '100%', maxWidth: '100%', textAlign: 'left', background: 'none', padding: '1px 0', fontSize: 8.5, fontWeight: 800, lineHeight: 1.25, textTransform: 'uppercase', letterSpacing: '0.02em', color: (d.track || 'exercise') === 'lifestyle' ? '#3E8E7E' : 'var(--orange-hot)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                          {label}
                        </button>
                      )
                    })}
                    {extra > 0 && <div className="muted" style={{ fontSize: 8, marginTop: 1 }}>+{extra} more</div>}
                  </div>
                )
              })}
            </div>
            <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
              <span style={{ color: 'var(--orange-hot)', fontWeight: 800 }}>■</span> Training · <span style={{ color: '#3E8E7E', fontWeight: 800 }}>■</span> Lifestyle — tap a session to open it
            </p>
          </div>
        )
      })()}

      {!calMode && !awayMode && activeDay && (activeDay.notes || activeDay.video_note || activeDay.warmup) && (
        <div className="card">
          {activeDay.notes && <p style={{ fontSize: 13.5, lineHeight: 1.5 }}>{activeDay.notes}</p>}
          {activeDay.video_note && (loomEmbed(activeDay.video_note)
            ? <iframe src={loomEmbed(activeDay.video_note)} style={{ width: '100%', height: 210, border: 'none', borderRadius: 8, marginTop: activeDay.notes ? 8 : 0 }} allowFullScreen title="Coach video note" />
            : <a href={activeDay.video_note} target="_blank" rel="noreferrer" style={{ display: 'inline-block', fontSize: 13, fontWeight: 800, marginTop: activeDay.notes ? 6 : 0 }}>🎥 Watch coach's video note</a>)}
          {activeDay.warmup && (
            <div style={{ marginTop: (activeDay.notes || activeDay.video_note) ? 10 : 0, borderLeft: '3px solid var(--orange)', paddingLeft: 10 }}>
              <span className="eyebrow" style={{ fontSize: 10 }}>Warmup</span>
              <p style={{ fontSize: 13.5, marginTop: 3, lineHeight: 1.5 }}>
                {activeDay.warmup}
                {activeDay.warmup_video && <a href={activeDay.warmup_video} target="_blank" rel="noreferrer" style={{ marginLeft: 6 }}>▶ demo</a>}
              </p>
            </div>
          )}
        </div>
      )}

      {!calMode && !awayMode && activeDay && chunkGroups(exercises).map((g, gi) => {
        const color = GROUP_COLORS[((g.prefix.charCodeAt(0) || 65) - 65) % GROUP_COLORS.length]
        const inner = g.items.map(ex => (
        <div className="card" key={ex.id} style={g.grouped ? { border: 'none', borderRadius: 8 } : undefined}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {ex.icon_url && <img className="thumb" src={ex.icon_url} alt="" style={{ width: 42, height: 42, borderRadius: 8, objectFit: 'cover', marginRight: -2 }} />}
            <strong style={{ fontSize: 15 }}>{ex.letter && <span style={{ color: 'var(--orange-hot)' }}>{ex.letter}) </span>}{ex.name}</strong>
            <button onClick={() => setFlagging(flagging === ex.id ? null : ex.id)} className="btn-ghost"
              style={{ padding: '3px 9px', fontSize: 11, marginLeft: 'auto', color: flaggedIds.has(ex.id) ? 'var(--red)' : undefined, borderColor: flaggedIds.has(ex.id) ? 'var(--red)' : undefined }}
              title="Flag pain or discomfort">⚠️</button>
            <button onClick={() => openExerciseComments(ex.id)} className="btn-ghost" style={{ padding: '3px 9px', fontSize: 11 }}>
              💬 {commentCounts[ex.id] > 0 ? commentCounts[ex.id] : ''}
            </button>
            {ex.kind !== 'conditioning' && <span style={{ color: 'var(--orange-hot)', fontSize: 13, fontWeight: 700 }}>{targetText(ex)}</span>}
          </div>
          {ex.kind !== 'conditioning' && lastLogged[ex.id] && (
            <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
              Last time: {lastLogged[ex.id].weight ? `${lastLogged[ex.id].weight} × ` : ''}{lastLogged[ex.id].reps}{lastLogged[ex.id].rir ? ` @ ${lastLogged[ex.id].rir}` : ''}
            </p>
          )}
          {flaggedIds.has(ex.id) && flagging !== ex.id && (
            <p style={{ fontSize: 11.5, color: 'var(--red)', margin: '2px 0 0' }}>⚠️ Flagged for your coach — they'll follow up.</p>
          )}
          {flagging === ex.id && (
            <div style={{ background: 'rgba(214,69,69,0.12)', border: '1px solid var(--red)', borderRadius: 8, padding: 10, margin: '6px 0' }}>
              <span className="eyebrow" style={{ fontSize: 10, color: 'var(--red)' }}>What's bothering you?</span>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input placeholder="e.g. sharp pinch in left shoulder on the way up" value={flagNote} onChange={e => setFlagNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitFlag(ex.id)} style={{ padding: '6px 8px', fontSize: 12.5 }} />
                <button className="btn-ghost" style={{ padding: '6px 10px', fontSize: 12, borderColor: 'var(--red)', color: 'var(--red)' }} onClick={() => submitFlag(ex.id)}>Flag</button>
              </div>
            </div>
          )}
          {openComments === ex.id && (
            <div style={{ background: 'var(--steel)', borderRadius: 8, padding: 10, margin: '6px 0' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                {(comments[ex.id] || []).map(c => (
                  <div key={c.id} style={{ fontSize: 12.5 }}>
                    <strong>{c.author_id === profile.id ? 'You' : 'Coach'}: </strong>{c.body}
                    <span className="muted" style={{ fontSize: 10.5, marginLeft: 6 }}>{new Date(c.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
                {(comments[ex.id] || []).length === 0 && <p className="muted" style={{ fontSize: 12 }}>No notes on this exercise yet.</p>}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input placeholder="Add a note or question…" value={commentText} onChange={e => setCommentText(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendExerciseComment(ex.id)} style={{ padding: '6px 8px', fontSize: 12.5 }} />
                <button className="btn-ghost" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => sendExerciseComment(ex.id)}>Send</button>
              </div>
            </div>
          )}
          {ex.kind === 'conditioning' && ex.description && (
            <p style={{ fontSize: 13.5, margin: '4px 0 8px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{ex.description}</p>
          )}
          {ex.kind !== 'conditioning' && ex.progression_type === 'percent' && !maxes[(ex.based_on_lift || ex.name).toLowerCase()] && (
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>No max on file for {ex.based_on_lift || ex.name} — ask your coach to set it.</p>
          )}
          {ex.notes && <p className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>{ex.notes}</p>}
          {ex.video_url && (
            <a href={ex.video_url} target="_blank" rel="noreferrer"
              style={{ display: 'inline-block', fontSize: 12.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              ▶ Watch demo
            </a>
          )}
          {ex.kind === 'conditioning' && !ex.tracking_type && (
            <input placeholder="Result (time, rounds, notes)" value={results[ex.id] || ''}
              onChange={e => updateResult(ex.id, e.target.value, ex.name)} style={{ marginTop: 4 }} />
          )}
          {ex.kind === 'conditioning' && ex.tracking_type === 'count' && (
            <input inputMode="numeric" placeholder="Count" value={results[ex.id] || ''}
              onChange={e => updateResult(ex.id, e.target.value, ex.name)} style={{ marginTop: 4 }} />
          )}
          {ex.kind === 'conditioning' && ex.tracking_type === 'time' && (
            <input type="time" value={results[ex.id] || ''}
              onChange={e => updateResult(ex.id, e.target.value, ex.name)} style={{ marginTop: 4 }} />
          )}
          {ex.kind === 'conditioning' && ex.tracking_type === 'yesno' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              {['Yes', 'No'].map(v => (
                <button key={v} type="button" className={results[ex.id] === v ? 'btn' : 'btn-ghost'}
                  style={{ flex: 1, padding: '10px 0', fontSize: 13 }}
                  onClick={() => updateResult(ex.id, v, ex.name)}>{v}</button>
              ))}
            </div>
          )}
          {ex.kind === 'conditioning' && ex.tracking_type === 'scale' && (
            <div style={{ marginTop: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                <span>Quality</span><span style={{ color: 'var(--orange-hot)' }}>{results[ex.id] || 5}/10</span>
              </div>
              <input type="range" min="1" max="10" value={results[ex.id] || 5}
                onChange={e => updateResult(ex.id, e.target.value, ex.name)}
                style={{ accentColor: 'var(--orange)', padding: 0 }} />
            </div>
          )}
          {ex.kind !== 'conditioning' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {(log[ex.id] || []).map((s, i) => {
              const isSaving = savingSets.has(`${ex.id}-${i + 1}`)
              return (
              <div key={i}>
                <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr 1fr 1fr auto', gap: 6, alignItems: 'center' }}>
                  <span className="muted" style={{ fontSize: 12, fontWeight: 800 }}>S{i + 1}</span>
                  <input inputMode="decimal" placeholder="lbs" value={s.weight} onChange={e => updateSet(ex.id, i, 'weight', e.target.value)} style={{ padding: '8px 10px', fontSize: 14 }} />
                  <input inputMode="numeric" placeholder={ex.metric === 'time' ? 'secs' : ex.metric === 'distance' ? 'dist' : 'reps'} value={s.reps} onChange={e => updateSet(ex.id, i, 'reps', e.target.value)} style={{ padding: '8px 10px', fontSize: 14 }} />
                  <input inputMode="numeric" placeholder={ex.progression_type === 'rpe' ? 'RPE' : 'RIR'} value={s.rir} onChange={e => updateSet(ex.id, i, 'rir', e.target.value)} style={{ padding: '8px 10px', fontSize: 14 }} />
                  <PlateCalc weight={s.weight} />
                </div>
                {isSaving && <p className="muted" style={{ fontSize: 10.5, margin: '2px 0 0 36px' }}>Saving…</p>}
              </div>
              )
            })}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
              <RestTimer restText={ex.rest} />
            </div>
          </div>
          )}
        </div>
        ))
        return g.grouped ? (
          <div key={gi} style={{ border: `1px solid ${color}`, borderLeft: `4px solid ${color}`, borderRadius: 10, padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color, padding: '2px 2px 0' }}>
              {g.items.length === 2 ? 'Superset' : 'Circuit'} {g.prefix} — alternate exercises each round
            </span>
            {inner}
          </div>
        ) : inner
      })}

      {!calMode && !awayMode && activeDay && activeDay.cooldown && (
        <div className="card" style={{ borderLeft: '3px solid var(--orange)' }}>
          <span className="eyebrow" style={{ fontSize: 10 }}>Cooldown</span>
          <p style={{ fontSize: 13.5, marginTop: 3, lineHeight: 1.5 }}>
            {activeDay.cooldown}
            {activeDay.cooldown_video && <a href={activeDay.cooldown_video} target="_blank" rel="noreferrer" style={{ marginLeft: 6 }}>▶ demo</a>}
          </p>
        </div>
      )}

      {!calMode && !awayMode && activeDay && exercises.length > 0 && (
        <button className="btn" onClick={saveWorkout}>{saved ? 'Workout saved ✓' : 'Save workout'}</button>
      )}
      {!calMode && !awayMode && activeDay && exercises.length > 0 && (
        <p className="muted" style={{ fontSize: 11, textAlign: 'center', marginTop: -8 }}>Every set saves automatically a moment after you enter it — this button is just a final confirmation.</p>
      )}
    </div>
  )
}
