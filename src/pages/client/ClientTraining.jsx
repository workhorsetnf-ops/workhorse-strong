import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { dash, effortText, effortMeaning } from '../../lib/targets'
import { progressionCall, CALL_STYLE } from '../../lib/progression'
import { supabase } from '../../lib/supabase'
import { resolveAssignment, rotationForWeek, dayShowsInWeek, daysBetween, resolveBlockWeek, localDateStr, logDate } from '../../lib/weeks'
import { useAuth } from '../../context/AuthContext'
import RestTimer from '../../lib/RestTimer'
import IntervalTimer from '../../lib/IntervalTimer'
import PlateCalc from '../../lib/PlateCalc'
import { CONDITIONING_COLOR, LIFESTYLE_COLOR, trackColor, programWeekDates, scheduledDate, withMoves, effectiveDate, workUnit, UNIT_LABEL, secondsToUnit } from '../../lib/conditioning'
import { eventAdvice, eventIcons } from '../../lib/clientEvents'
import { bestOf, prFor, nameKey } from '../../lib/prs'
import { alternativesFor, applySwap, REASONS } from '../../lib/swaps'
import { addDays as addDaysStr } from '../../lib/dashboard'

function roundTo5(n) { return Math.round(n / 5) * 5 }

function loomEmbed(url) {
  const m = (url || '').match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/)
  return m ? `https://www.loom.com/embed/${m[1]}` : null
}

const prefixOf = l => (l || '').replace(/[0-9]/g, '')
const isNumbered = l => /^[A-Z]+\d+$/.test(l || '')
const GROUP_COLORS = ['#FF6A00', '#7C5CBF', '#3E8E7E', '#B0533E', '#4A6FA5', '#8E6E3E']

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

// Local date. toISOString() is UTC, which filed every set logged after 8pm
// Eastern under TOMORROW and threw off "last session" and weekly counts.
const todayStr = () => localDateStr()

// Rows arrive newest first. For each exercise, the first day we meet that isn't
// today (and has a real value) is "last session"; we keep every set from that day.
export function buildLastSession(logs, today) {
  const out = {}
  for (const l of logs) {
    if (!l.weight && !l.reps) continue
    const day = l.logged_date || (l.logged_at || '').slice(0, 10)
    if (!day || day >= today) continue
    const cur = out[l.exercise_id]
    if (!cur) out[l.exercise_id] = { date: day, sets: {} }
    else if (cur.date !== day) continue
    const sets = out[l.exercise_id].sets
    if (!sets[l.set_number]) sets[l.set_number] = { weight: l.weight || '', reps: l.reps || '', rir: l.rir || '' }
  }
  return out
}

// More weight than last time, or the same weight for more reps.
export function beatLast(cur, last) {
  if (!cur || !last) return false
  const w = parseFloat(cur.weight), r = parseFloat(cur.reps)
  const lw = parseFloat(last.weight), lr = parseFloat(last.reps)
  if (isNaN(w) || isNaN(r) || isNaN(lw) || isNaN(lr)) return false
  return w > lw || (w === lw && r > lr)
}

// Per-set targets for one week: setRows (per-set programming) where present,
// padded from the week's base values and cut to the set count.
export function setTargetsFor(wt, base) {
  const rows = Array.isArray(wt?.setRows) ? wt.setRows : []
  return Array.from({ length: base.sets || 0 }, (_, i) => ({
    reps: rows[i]?.reps ?? base.reps,
    target: rows[i]?.target ?? rows[i]?.rir ?? base.target,
  }))
}

const GRID_COLS = '34px minmax(0, 1fr) 62px 50px 44px 42px'
// Up to `max` most recent sessions before today, per exercise, newest first:
// { exId: [{ date, sets: { [setNumber]: {weight, reps} } }] }
export function buildHistory(logs, today, max = 3) {
  const out = {}
  for (const l of logs) {
    if (!l.weight && !l.reps) continue
    const day = l.logged_date || (l.logged_at || '').slice(0, 10)
    if (!day || day >= today) continue
    const list = out[l.exercise_id] || (out[l.exercise_id] = [])
    let sess = list.find(s => s.date === day)
    if (!sess) {
      if (list.length >= max) continue
      sess = { date: day, sets: {} }
      list.push(sess)
    }
    if (!sess.sets[l.set_number]) sess.sets[l.set_number] = { weight: l.weight || '', reps: l.reps || '' }
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => (a.date < b.date ? 1 : -1))
  return out
}

// The coach types rest however they like: "150s", "90", "2:30", "2 min", "90 sec".
export function parseRest(text) {
  const t = String(text || '').toLowerCase()
  let m = t.match(/(\d+)\s*:\s*(\d{1,2})/)
  if (m) return +m[1] * 60 + +m[2]
  m = t.match(/(\d+(?:\.\d+)?)\s*(?:m\b|min)/)
  if (m) return Math.round(+m[1] * 60)
  m = t.match(/(\d+)/)
  return m ? +m[1] : 0
}

export function fmtClock(s) {
  const m = Math.floor(s / 60), r = s % 60
  return `${m}:${r < 10 ? '0' : ''}${r}`
}

const GRID_COLS_BIG ='34px minmax(0, 1fr) 70px 58px 50px 46px'
// conditioning pieces log one number per round (time or distance), no load or RIR
const GRID_COLS_CARDIO = '34px minmax(0, 1fr) 96px 42px'
const GRID_COLS_CARDIO_BIG = '34px minmax(0, 1fr) 110px 46px'

// The number in a prescribed piece of work, in the unit it's logged in:
// "30s" -> 30, "20 min" -> 20, "1:30" -> 90, "400m" -> 400.
export function workNumber(work, unit) {
  const t = String(work || '').toLowerCase().trim()
  const mm = t.match(/^(\d+):([0-5]\d)$/)
  if (mm) return String(unit === 'min' ? Math.round((+mm[1] * 60 + +mm[2]) / 60) : +mm[1] * 60 + +mm[2])
  const m = t.match(/(\d+(?:\.\d+)?)/)
  return m ? String(Math.round(+m[1])) : ''
}
const cellStyleBig = {
  width: '100%', height: 50, boxSizing: 'border-box', padding: '0 4px', borderRadius: 11,
  fontSize: 18, fontWeight: 700, textAlign: 'center', fontVariantNumeric: 'tabular-nums',
}
const cellStyle = {
  width: '100%', height: 42, boxSizing: 'border-box', padding: '0 4px', borderRadius: 9,
  fontSize: 16, fontWeight: 600, textAlign: 'center', fontVariantNumeric: 'tabular-nums',
}

export default function ClientTraining() {
  const { profile } = useAuth()
  const [program, setProgram] = useState(null)
  const [allBlocks, setAllBlocks] = useState([])
  const [block, setBlock] = useState(null)
  const [week, setWeek] = useState(1)
  const [startDate, setStartDate] = useState(null)
  const [calMode, setCalMode] = useState(false)
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const [rotations, setRotations] = useState([])
  const [moves, setMoves] = useState([]) // session_moves: sessions the client moved within a week
  const [events, setEvents] = useState([]) // shows & travel (Update 146)
  const [days, setDays] = useState([])
  const [activeDay, setActiveDay] = useState(null)
  const [baseExercises, setExercises] = useState([])
  // exercise swaps (Update 152): coach-approved alternatives and today's swaps
  const [swapLib, setSwapLib] = useState({ library: [], alts: [] })
  const [swaps, setSwaps] = useState({})          // program exercise id -> today's swap row
  const [swapFor, setSwapFor] = useState(null)    // exercise whose swap sheet is open
  const [swapReason, setSwapReason] = useState('taken')
  const libById = useMemo(() => Object.fromEntries(swapLib.library.map(l => [l.id, l])), [swapLib])
  const exercises = useMemo(() => baseExercises.map(ex => applySwap(ex, swaps[ex.id], libById)), [baseExercises, swaps, libById])
  const [maxes, setMaxes] = useState({})
  const [log, setLog] = useState({})
  const [results, setResults] = useState({})
  // exerciseId -> { date, sets: { [setNumber]: {weight, reps, rir} } } — the most
  // recent session BEFORE today, so each row can show what that set did last time
  const [lastSession, setLastSession] = useState({})
  const [doneSets, setDoneSets] = useState(new Set()) // `${exId}-${setNumber}` the client has ticked off
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
  // personal records (Update 151): earlier bests per exercise, and today's PR sets
  const bestCache = useRef({})
  const [prSets, setPrSets] = useState({})      // key -> label
  const [prToast, setPrToast] = useState(null)
  async function checkPr(key, exerciseName, s) {
    if (!s.weight || !s.reps || !exerciseName) return
    const k = nameKey(exerciseName)
    if (!bestCache.current[k]) {
      const { data } = await supabase.from('workout_logs').select('weight, reps, logged_date, logged_at').eq('client_id', profile.id)
        .ilike('exercise_name', exerciseName).not('weight', 'is', null).limit(3000)
      bestCache.current[k] = bestOf((data || []).filter(r => logDate(r) && logDate(r) < todayStr()))
    }
    const pr = prFor(s, bestCache.current[k])
    setPrSets(m => { const n = { ...m }; if (pr) n[key] = pr.label; else delete n[key]; return n })
    if (pr) { setPrToast(`🏆 New PR · ${exerciseName}: ${pr.label}`); setTimeout(() => setPrToast(t => (t && t.includes(exerciseName) ? null : t)), 4500) }
  }
  // every logging input, keyed `${exId}|${setIndex}|${field}`, so Enter can hop to
  // the next cell the way Tab moves across a spreadsheet row
  const cellRefs = useRef({})

  // ---- focus mode: overview → one exercise (or superset) per screen → done ----
  const [viewMode, setViewModeState] = useState(() => {
    try { return localStorage.getItem('ws_train_view') === 'list' ? 'list' : 'focus' } catch { return 'focus' }
  })
  function setViewMode(v) {
    setViewModeState(v)
    try { localStorage.setItem('ws_train_view', v) } catch { /* not remembered, that's all */ }
  }
  const [screen, setScreen] = useState('overview') // 'overview' | 'focus' | 'done'
  const [step, setStep] = useState(0)
  const [rest, setRest] = useState(null)           // { ends, total, buzzed }
  const [now, setNow] = useState(() => Date.now())
  const [history, setHistory] = useState({})
  const [histOpen, setHistOpen] = useState({})
  const touchStart = useRef(null)
  const steps = chunkGroups(exercises)

  // a new workout always opens on its overview
  useEffect(() => { setScreen('overview'); setStep(0); setRest(null) }, [activeDay?.id])

  // tick while a rest is running; buzz once when it hits zero
  useEffect(() => {
    if (!rest || rest.buzzed) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [rest])
  useEffect(() => {
    if (rest && !rest.buzzed && now >= rest.ends) {
      try { navigator.vibrate?.(300) } catch { /* not supported */ }
      setRest(r => (r ? { ...r, buzzed: true } : r))
    }
  }, [now, rest])

  useEffect(() => {
    if (!profile) return
    supabase.from('program_assignments')
      .select('program_id, current_week, current_block_id, start_date, week_mode, programs(id, name, notes, weeks)')
      .eq('client_id', profile.id).maybeSingle()
      .then(async ({ data }) => {
        if (!data) return
        setProgram(data.programs)
        setStartDate(data.start_date || null)
        const { data: bs } = await supabase.from('program_blocks').select('*').eq('program_id', data.program_id).order('position')
        setAllBlocks(bs || [])
        // On 'auto' this walks the start date forward on its own; on 'manual' it's
        // whatever the coach last set. Either way one helper decides, so the day
        // tabs and the calendar below can't disagree about what week it is.
        const pos = resolveAssignment(data, bs || [])
        const activeBlock = pos.block
        setWeek(pos.weekInBlock)
        setBlock(activeBlock || null)
        if (activeBlock) {
          const [{ data: d }, { data: r }] = await Promise.all([
            supabase.from('program_days').select('*').eq('block_id', activeBlock.id).order('day_number').order('position'),
            supabase.from('program_rotations').select('*').eq('block_id', activeBlock.id).order('position'),
          ])
          setDays(d || [])
          setRotations(r || [])
        }
      })
    loadMoves()
    loadEvents()
    supabase.from('client_maxes').select('*').eq('client_id', profile.id)
      .then(({ data }) => {
        setMaxes(Object.fromEntries((data || []).map(m => [m.lift_name.toLowerCase(), m.max_weight])))
      })
  }, [profile])

  const blockWeeks = block?.weeks || program?.weeks || 4

  async function loadEvents() {
    if (!profile) return
    const { data, error } = await supabase.from('client_events').select('*').eq('client_id', profile.id)
      .gte('end_date', addDaysStr(localDateStr(), -14)).order('start_date')
    setEvents(error ? [] : data || [])
  }

  async function loadMoves() {
    if (!profile) return
    const { data } = await supabase.from('session_moves').select('*').eq('client_id', profile.id)
    setMoves(data || [])
  }

  // Move a conditioning session to another day of this program week.
  // Moving it back to where the program put it just removes the move.
  async function moveSession(day, fromDate, toDate) {
    if (!profile || !fromDate || !toDate) return
    const prev = moves
    const rest = moves.filter(m => !(m.day_id === day.id && m.from_date === fromDate))
    setMoves(toDate === fromDate ? rest : [...rest, { client_id: profile.id, day_id: day.id, from_date: fromDate, to_date: toDate }])
    const { error } = toDate === fromDate
      ? await supabase.from('session_moves').delete().eq('client_id', profile.id).eq('day_id', day.id).eq('from_date', fromDate)
      : await supabase.from('session_moves').upsert({ client_id: profile.id, day_id: day.id, from_date: fromDate, to_date: toDate }, { onConflict: 'client_id,day_id,from_date' })
    if (error) { setMoves(prev); alert("Couldn't move it: " + error.message) }
  }

  // Which kind of session is open, and what unit a piece on it is logged in.
  // Lifting days always use the normal weight / reps / RIR grid.
  const sessionTrack = activeDay?.track || 'exercise'
  const cardioDay = sessionTrack === 'conditioning'
  function unitFor(ex) {
    if (!cardioDay || ex.kind === 'conditioning') return null
    return workUnit(weekTarget(ex).reps, ex.metric)
  }

  function weekTarget(ex) {
    const wt = Array.isArray(ex.week_targets) ? ex.week_targets[week - 1] : null
    return {
      sets: wt?.sets ?? ex.sets,
      reps: wt?.reps ?? ex.reps,
      target: wt?.target ?? ex.rir,
    }
  }

  function exSetTargets(ex) {
    const wt = Array.isArray(ex.week_targets) ? ex.week_targets[week - 1] : null
    return setTargetsFor(wt, weekTarget(ex))
  }

  // Load for a %-based set, from the client's max on file
  function percentLoad(ex, target) {
    if (ex.progression_type !== 'percent') return ''
    const max = maxes[(ex.based_on_lift || ex.name).toLowerCase()]
    return max && target ? String(roundTo5(max * (+target / 100))) : ''
  }

  // What last session says to do today (add weight / add reps / hold / drop)
  function progressFor(ex) {
    if (ex.kind === 'conditioning' || unitFor(ex)) return null
    const last = lastSession[ex.id]
    if (!last || !last.sets) return null
    const nums = Object.keys(last.sets).map(Number).sort((a, b) => a - b)
    return progressionCall(nums.map(n => last.sets[n]), exSetTargets(ex), ex.progression_type || 'rir')
  }

  // What a blank cell should suggest: last session's value for that set, else the program target
  function suggestion(ex, i, field) {
    if (field === 'weight') {
      const pc = progressFor(ex)
      const lw = Number(lastSession[ex.id]?.sets?.[i + 1]?.weight) || 0
      // move every set by the same jump the top set gets
      if (pc && (pc.call === 'up' || pc.call === 'drop') && lw) {
        const top = Math.max(...Object.values(lastSession[ex.id].sets).map(x => Number(x.weight) || 0))
        if (top && pc.nextWeight) return String(Math.round((lw * pc.nextWeight / top) / 2.5) * 2.5)
      }
    }
    const last = lastSession[ex.id]?.sets?.[i + 1]
    if (last?.[field]) return String(last[field])
    const t = exSetTargets(ex)[i] || {}
    if (field === 'weight') return percentLoad(ex, t.target)
    if (field === 'reps') return t.reps ? (unitFor(ex) ? workNumber(t.reps, unitFor(ex)) : String(t.reps).split('-')[0]) : ''
    if (field === 'rir') return ex.progression_type === 'percent' ? '' : dash(t.target ?? '')
    return ''
  }

  // Fill a set's EMPTY cells (never overwrites what they typed) with real numbers only:
  // last session's value for that set, or a %-based prescribed load. A rep range
  // alone is never turned into a guessed number. Then save it.
  function fillSet(ex, i, rows) {
    const s = rows[i]
    const last = lastSession[ex.id]?.sets?.[i + 1] || {}
    const t = exSetTargets(ex)[i] || {}
    const filled = {
      // the progression call's load when there is one (up / drop), else last time's
      weight: s.weight || suggestion(ex, i, 'weight') || (last.weight ? String(last.weight) : percentLoad(ex, t.target)),
      reps: s.reps || (last.reps ? String(last.reps) : '') || (unitFor(ex) ? workNumber(t.reps, unitFor(ex)) : ''),
      rir: s.rir || (last.rir ? String(last.rir) : ''),
    }
    if (unitFor(ex)) { filled.weight = s.weight || ''; filled.rir = s.rir || '' }
    autoSaveSet(ex.id, i + 1, filled, ex.name)
    return filled
  }

  function copyLastWeek(ex) {
    const rows = log[ex.id] || []
    const next = rows.map((_, i) => fillSet(ex, i, rows))
    setLog(l => ({ ...l, [ex.id]: next }))
  }

  function toggleDone(ex, i) {
    const key = `${ex.id}-${i + 1}`
    if (doneSets.has(key)) {
      setDoneSets(d => { const n = new Set(d); n.delete(key); return n })
      return
    }
    const rows = log[ex.id] || []
    const filled = fillSet(ex, i, rows)
    setLog(l => ({ ...l, [ex.id]: (l[ex.id] || []).map((s, j) => j === i ? filled : s) }))
    if (filled.weight || filled.reps) {
      setDoneSets(d => new Set(d).add(key))
      maybeStartRest(ex)
    }
  }

  // In focus mode, ticking a set starts the rest timer — but in a superset only
  // the LAST exercise of the round does, so A1 → A2 runs back to back.
  function maybeStartRest(ex) {
    if (viewMode !== 'focus' || screen !== 'focus') return
    const st = steps[step]
    const lastLift = st && [...st.items].reverse().find(e => e.kind !== 'conditioning')
    if (!lastLift || lastLift.id !== ex.id) return
    const secs = parseRest(ex.rest)
    if (secs) { setRest({ ends: Date.now() + secs * 1000, total: secs }); setNow(Date.now()) }
  }

  function goStep(n) {
    if (n >= steps.length) {
      saveWorkout()
      setRest(null)
      setScreen('done')
    } else {
      setStep(Math.max(0, n))
      setScreen('focus')
    }
    try { window.scrollTo({ top: 0 }) } catch { /* jsdom etc. */ }
  }

  function exDoneCount(ex) {
    if (ex.kind === 'conditioning') return { done: (results[ex.id] || '').toString().trim() ? 1 : 0, total: 1 }
    const total = (log[ex.id] || []).length
    let done = 0
    for (let i = 1; i <= total; i++) if (doneSets.has(`${ex.id}-${i}`)) done++
    return { done, total }
  }

  // Enter moves weight → reps → RIR → next set's weight → next exercise
  function focusNext(exId, i, field) {
    const keys = []
    for (const ex of exercises) {
      if (ex.kind === 'conditioning') continue
      const order = unitFor(ex) ? ['reps'] : ['weight', 'reps', 'rir']
      ;(log[ex.id] || []).forEach((_, j) => order.forEach(f => keys.push(`${ex.id}|${j}|${f}`)))
    }
    const at = keys.indexOf(`${exId}|${i}|${field}`)
    const nextEl = at >= 0 ? cellRefs.current[keys[at + 1]] : null
    if (nextEl) nextEl.focus()
    else document.activeElement?.blur()
  }

  function targetText(ex) {
    const { sets, reps, target } = weekTarget(ex)
    if (target === '' || target === null || target === undefined) return `${sets} × ${dash(reps)}${ex.rest ? ` · rest ${ex.rest}` : ''}`
    if (ex.progression_type === 'percent') {
      const max = maxes[(ex.based_on_lift || ex.name).toLowerCase()]
      const load = max ? ` → ${roundTo5(max * (+target / 100))} lbs` : ''
      return `${sets} × ${reps} @ ${target}%${load}${ex.rest ? ` · rest ${ex.rest}` : ''}`
    }
    if (ex.progression_type === 'rpe') return `${sets} × ${dash(reps)} @ RPE ${dash(target)}${ex.rest ? ` · rest ${ex.rest}` : ''}`
    return `${sets} × ${dash(reps)} @ RIR ${dash(target)}${ex.rest ? ` · rest ${ex.rest}` : ''}`
  }

  function progressNote(ex) {
    const pc = progressFor(ex)
    if (!pc) return null
    const st = CALL_STYLE[pc.call]
    return (
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '0 0 8px', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--coal)' }}>
        <span style={{ flexShrink: 0, minWidth: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13, background: st.bg, color: st.color }}>{st.icon}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.06em', color: 'var(--muted)' }}>TODAY, BASED ON LAST TIME</div>
          <strong style={{ fontSize: 14 }}>{pc.title}</strong>
          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.4 }}>{pc.detail}</div>
        </div>
      </div>
    )
  }

  // The effort target spelled out, so "RIR 1-2" is never a mystery.
  function effortBox(ex) {
    if (ex.kind === 'conditioning') return null
    const type = ex.progression_type || 'rir'
    const sets = exSetTargets(ex)
    const uniq = [...new Set(sets.map(t => String(t.target ?? '')).filter(Boolean))]
    if (!uniq.length) return null
    const label = uniq.length === 1 ? effortText(type, uniq[0]) : `${type === 'rpe' ? 'RPE' : type === 'percent' ? '%' : 'RIR'} ${uniq.map(dash).join(' / ')} (see each set)`
    return (
      <div style={{ margin: '6px 0 8px', border: '1px solid var(--orange)', borderRadius: 10, padding: '8px 10px', background: 'rgba(255,106,0,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.08em', color: 'var(--orange-hot)' }}>TARGET</span>
          <strong style={{ fontSize: 16 }}>{label}</strong>
        </div>
        {uniq.length === 1 && <div style={{ fontSize: 12.5, marginTop: 2 }}>{effortMeaning(type, uniq[0])}</div>}
        {type === 'rir' && (
          <details style={{ marginTop: 4 }}>
            <summary className="muted" style={{ fontSize: 11.5, cursor: 'pointer' }}>What's RIR?</summary>
            <p className="muted" style={{ fontSize: 12, marginTop: 4, lineHeight: 1.45 }}>
              Reps In Reserve: how many more good reps you could have done when you stopped. RIR 2 = you could have done 2 more. RIR 1-2 = finish the set with 1 or 2 left. In the RIR box, log what you actually had left.
            </p>
          </details>
        )}
      </div>
    )
  }

  // If the week moves (calendar jump, or auto mode rolling over) and the day
  // that's open belongs to the other rotation, drop it rather than leaving the
  // client logging a workout that isn't scheduled this week.
  useEffect(() => {
    if (activeDay && !dayShowsInWeek(activeDay, rotations, week)) setActiveDay(null)
  }, [week, rotations])

  useEffect(() => {
    if (!profile) return
    Promise.all([
      supabase.from('exercise_library').select('id, name, video_url, icon_url'),
      supabase.from('exercise_alternatives').select('*'),
    ]).then(([l, a]) => setSwapLib({ library: l.data || [], alts: a.error ? [] : a.data || [] }))
  }, [profile?.id])
  useEffect(() => {
    if (!profile) return
    supabase.from('exercise_swaps').select('*').eq('client_id', profile.id).eq('swap_date', todayStr())
      .then(({ data, error }) => { if (!error) setSwaps(Object.fromEntries((data || []).map(w => [w.exercise_id, w]))) })
  }, [profile?.id, activeDay?.id])
  async function doSwap(ex, alt) {
    const row = { client_id: profile.id, exercise_id: ex.id, swap_date: todayStr(), from_name: ex.swappedFrom || ex.name, alt_library_id: alt.id, alt_name: alt.name, reason: swapReason }
    setSwaps(m => ({ ...m, [ex.id]: row })); setSwapFor(null)
    const { error } = await supabase.from('exercise_swaps').upsert(row, { onConflict: 'client_id,exercise_id,swap_date' })
    if (error) alert('Swap shows for now but wasn’t saved: ' + error.message)
  }
  async function undoSwap(ex) {
    setSwaps(m => { const n = { ...m }; delete n[ex.id]; return n }); setSwapFor(null)
    await supabase.from('exercise_swaps').delete().eq('client_id', profile.id).eq('exercise_id', ex.id).eq('swap_date', todayStr())
  }
  function swapButton(ex) {
    if (ex.kind === 'conditioning') return null
    return <button onClick={() => { setSwapReason('taken'); setSwapFor(ex) }} className="btn-ghost" style={{ padding: '3px 9px', fontSize: 11, borderColor: ex.swappedFrom ? 'var(--orange)' : undefined }} title="Swap this exercise">⇄ Swap</button>
  }
  function swappedNote(ex) {
    return ex.swappedFrom ? <div style={{ fontSize: 12, color: 'var(--orange-hot)', fontWeight: 700, width: '100%' }}>⇄ Swapped from {ex.swappedFrom} for today</div> : null
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
        setDoneSets(new Set())
        const ids = (data || []).map(ex => ex.id)

        // last session per exercise, set by set: the newest day before today that
        // has anything logged, and every set from that day. Older rows from before
        // logged_date existed fall back to the date part of logged_at.
        if (ids.length) {
          supabase.from('workout_logs').select('exercise_id, set_number, weight, reps, rir, logged_date, logged_at')
            .eq('client_id', profile.id).in('exercise_id', ids)
            .order('logged_at', { ascending: false }).limit(600)
            .then(({ data: logs }) => {
              setLastSession(buildLastSession(logs || [], todayStr()))
              setHistory(buildHistory(logs || [], todayStr(), 3))
            })
        } else { setLastSession({}); setHistory({}) }

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
              // anything already saved today counts as done, so the ticks survive a refresh
              setDoneSets(new Set(todayLogs.filter(r => r.weight || r.reps).map(r => `${r.exercise_id}-${r.set_number}`)))
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
    const track = sessionTrack
    clearTimeout(saveTimers.current[key])
    saveTimers.current[key] = setTimeout(async () => {
      if (!s.weight && !s.reps) return // nothing worth saving yet
      setSavingSets(prev => new Set(prev).add(key))
      await supabase.from('workout_logs').upsert({
        client_id: profile.id, exercise_id: exId, exercise_name: exerciseName,
        set_number: setNumber, weight: s.weight || null, reps: s.reps || null, rir: s.rir || null,
        logged_date: todayStr(), session_track: track,
      }, { onConflict: 'client_id,exercise_id,set_number,logged_date' })
      setSavingSets(prev => { const n = new Set(prev); n.delete(key); return n })
      if (track !== 'conditioning') checkPr(key, exerciseName, s).catch(() => {})
    }, 900)
  }

  // the interval timer fills a round's time in for them, unless they typed one
  function fillIfEmpty(exId, i, field, value) {
    setLog(l => {
      const cur = l[exId]?.[i]
      if (!cur || (cur[field] !== undefined && cur[field] !== '' && cur[field] !== null)) return l
      const updated = l[exId].map((s, j) => j === i ? { ...s, [field]: value } : s)
      const ex = exercises.find(e => e.id === exId)
      autoSaveSet(exId, i + 1, updated[i], ex?.name)
      return { ...l, [exId]: updated }
    })
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
    const track = sessionTrack
    clearTimeout(saveTimers.current[key])
    saveTimers.current[key] = setTimeout(async () => {
      if (!value?.toString().trim()) return
      setSavingSets(prev => new Set(prev).add(key))
      await supabase.from('workout_logs').upsert({
        client_id: profile.id, exercise_id: exId, exercise_name: exerciseName,
        set_number: 1, result_text: value.toString().trim(),
        logged_date: todayStr(), session_track: track,
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
          logged_date: todayStr(), session_track: sessionTrack,
        })
      })
    }
    for (const ex of exercises) {
      if (ex.kind === 'conditioning' && (results[ex.id] || '').toString().trim()) {
        rows.push({
          client_id: profile.id, exercise_id: ex.id, exercise_name: ex.name, set_number: 1,
          result_text: results[ex.id].toString().trim(), logged_date: todayStr(), session_track: sessionTrack,
        })
      }
    }
    if (!rows.length) return
    const { error } = await supabase.from('workout_logs')
      .upsert(rows, { onConflict: 'client_id,exercise_id,set_number,logged_date' })
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2500) }
  }

  // ---- pieces shared by the list view and focus mode ----
  function renderExtras(ex) {
    return (
      <>
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
      </>
    )
  }

  function renderConditioning(ex) {
    return (
      <>
          {ex.kind === 'conditioning' && ex.description && (
            <p style={{ fontSize: 13.5, margin: '4px 0 8px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{ex.description}</p>
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
      </>
    )
  }

  // Conditioning pieces: one number per round in the piece's own unit (secs,
  // mins, metres, yards). Ticking an empty round logs what was prescribed, so
  // a client who did exactly the session can tick through it.
  function renderCardioGrid(ex, big = false) {
    const unit = unitFor(ex)
    const rows = log[ex.id] || []
    const targets = exSetTargets(ex)
    const last = lastSession[ex.id]
    const cols = big ? GRID_COLS_CARDIO_BIG : GRID_COLS_CARDIO
    const cStyle = big ? cellStyleBig : cellStyle
    const short = { min: 'min', sec: 's', m: 'm', yd: 'yd' }[unit]
    const anyLast = last && Object.keys(last.sets).length > 0
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
        {ex.metric === 'time' && (
          <IntervalTimer rounds={rows.length || targets.length || 1} work={targets[0]?.reps || ex.reps} rest={ex.rest}
            onRoundDone={(i, secs) => fillIfEmpty(ex.id, i, 'reps', secondsToUnit(secs, unit))} />
        )}
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 6, padding: '0 2px 2px', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>
          <div>{rows.length > 1 ? 'Rnd' : ''}</div>
          <div>Last</div>
          <div style={{ textAlign: 'center' }}>{UNIT_LABEL[unit]}</div>
          <div />
        </div>
        {rows.map((s, i) => {
          const key = `${ex.id}-${i + 1}`
          const isDone = doneSets.has(key)
          const prev = last?.sets?.[i + 1]
          const t = targets[i] || {}
          const label = `${ex.name} round ${i + 1}`
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: cols, gap: 6, alignItems: 'center', padding: '5px 2px', borderRadius: 10, background: isDone ? 'rgba(74,155,209,0.14)' : 'transparent', transition: 'background 0.2s' }}>
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                <span style={{ fontSize: big ? 17 : 15, fontWeight: 800 }}>{i + 1}</span>
                {t.reps != null && t.reps !== '' && <span className="muted" style={{ fontSize: 10.5, whiteSpace: 'nowrap' }}>{dash(t.reps)}</span>}
              </div>
              <div className="muted" style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {prev?.reps ? `${prev.reps} ${short}` : '—'}
                {savingSets.has(key) && <div style={{ fontSize: 10 }}>Saving…</div>}
              </div>
              <input inputMode="numeric" aria-label={`${label} ${UNIT_LABEL[unit].toLowerCase()}`} value={s.reps}
                placeholder={suggestion(ex, i, 'reps')} enterKeyHint="next"
                ref={el => { cellRefs.current[`${ex.id}|${i}|reps`] = el }}
                onChange={e => updateSet(ex.id, i, 'reps', e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); focusNext(ex.id, i, 'reps') } }}
                style={cStyle} />
              <button type="button" onClick={() => toggleDone(ex, i)}
                aria-label={`${isDone ? 'Unmark' : 'Mark'} ${label} done`} aria-pressed={isDone}
                style={{ width: big ? 46 : 42, height: big ? 46 : 42, padding: 0, borderRadius: 23, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900, cursor: 'pointer',
                  background: isDone ? CONDITIONING_COLOR : 'transparent', color: isDone ? '#06121B' : 'var(--muted)',
                  border: isDone ? `1px solid ${CONDITIONING_COLOR}` : '1.5px solid #3A3A40' }}>
                ✓
              </button>
            </div>
          )
        })}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', marginTop: 4, flexWrap: 'wrap' }}>
          {anyLast
            ? <button type="button" className="btn-ghost" onClick={() => copyLastWeek(ex)} style={{ padding: '8px 12px', fontSize: 12.5 }}>⧉ Copy last session</button>
            : <span className="muted" style={{ fontSize: 11.5 }}>Tap ✓ if you did it as written — it logs the target for you</span>}
          {!big && ex.metric !== 'time' && <RestTimer restText={ex.rest} />}
        </div>
      </div>
    )
  }

  // The set-by-set logging grid. `big` is the focus-mode size.
  function renderSetGrid(ex, big = false) {
            if (unitFor(ex)) return renderCardioGrid(ex, big)
            const rows = log[ex.id] || []
            const targets = exSetTargets(ex)
            const last = lastSession[ex.id]
            const repsHead = ex.metric === 'time' ? 'Secs' : ex.metric === 'distance' ? 'Dist' : 'Reps'
            const effortHead = ex.progression_type === 'rpe' ? 'RPE' : 'RIR'
            const plateWeight = [...rows].reverse().find(r => r.weight)?.weight || ''
            const anyLast = last && Object.keys(last.sets).length > 0
            const cols = big ? GRID_COLS_BIG : GRID_COLS
            const cStyle = big ? cellStyleBig : cellStyle
            return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
              {ex.metric === 'time' && (
                <IntervalTimer rounds={rows.length || targets.length || 1} work={targets[0]?.reps || ex.reps} rest={ex.rest}
                  onRoundDone={(i, secs) => fillIfEmpty(ex.id, i, 'reps', String(secs))} />
              )}
              <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 6, padding: '0 2px 2px', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                <div>Set</div>
                <div>Last</div>
                <div style={{ textAlign: 'center' }}>Lbs</div>
                <div style={{ textAlign: 'center' }}>{repsHead}</div>
                <div style={{ textAlign: 'center' }} title={effortHead === 'RIR' ? 'Reps you had left in the tank' : 'How hard it felt, out of 10'}>{effortHead === 'RIR' ? 'RIR left' : effortHead}</div>
                <div />
              </div>
              {rows.map((s, i) => {
                const key = `${ex.id}-${i + 1}`
                const isSaving = savingSets.has(key)
                const isDone = doneSets.has(key)
                const prev = last?.sets?.[i + 1]
                const up = beatLast(s, prev)
                const t = targets[i] || {}
                const label = `${ex.name} set ${i + 1}`
                const cell = field => ({
                  ref: el => { cellRefs.current[`${ex.id}|${i}|${field}`] = el },
                  value: s[field],
                  placeholder: suggestion(ex, i, field),
                  enterKeyHint: 'next',
                  onChange: e => updateSet(ex.id, i, field, e.target.value),
                  onKeyDown: e => { if (e.key === 'Enter') { e.preventDefault(); focusNext(ex.id, i, field) } },
                  style: cStyle,
                })
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: cols, gap: 6, alignItems: 'center', padding: '5px 2px', borderRadius: 10, background: isDone ? 'rgba(255,106,0,0.10)' : 'transparent', transition: 'background 0.2s' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                      <span style={{ fontSize: big ? 17 : 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 2 }}>
                        {i + 1}
                        {up && <span title="Beat last time" aria-label="Beat last time" style={{ color: 'var(--orange-hot)', fontSize: 12 }}>▲</span>}
                      </span>
                      {t.reps != null && t.reps !== '' && <span className="muted" style={{ fontSize: 10.5 }}>{dash(t.reps)}</span>}
                      {t.target != null && t.target !== '' && ex.progression_type !== 'percent' && <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--orange-hot)', whiteSpace: 'nowrap' }}>{effortHead} {dash(t.target)}</span>}
                    </div>
                    <div className="muted" style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {prev ? `${prev.weight || '–'} × ${prev.reps || '–'}` : '—'}
                      {isSaving && <div style={{ fontSize: 10 }}>Saving…</div>}
                      {!isSaving && prSets[key] && <div title={prSets[key]} style={{ fontSize: 10.5, fontWeight: 900, color: 'var(--orange-hot)' }}>🏆 PR</div>}
                    </div>
                    <input inputMode="decimal" aria-label={`${label} weight`} {...cell('weight')} />
                    <input inputMode="numeric" aria-label={`${label} ${repsHead.toLowerCase()}`} {...cell('reps')} />
                    <input inputMode="decimal" aria-label={`${label} ${effortHead}`} {...cell('rir')} />
                    <button type="button" onClick={() => toggleDone(ex, i)}
                      aria-label={`${isDone ? 'Unmark' : 'Mark'} ${label} done`} aria-pressed={isDone}
                      style={{ width: big ? 46 : 42, height: big ? 46 : 42, padding: 0, borderRadius: 23, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900, cursor: 'pointer',
                        background: isDone ? 'var(--orange)' : 'transparent', color: isDone ? '#140A02' : 'var(--muted)',
                        border: isDone ? '1px solid var(--orange)' : '1.5px solid #3A3A40' }}>
                      ✓
                    </button>
                  </div>
                )
              })}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', marginTop: 4, flexWrap: 'wrap' }}>
                {anyLast
                  ? <button type="button" className="btn-ghost" onClick={() => copyLastWeek(ex)} style={{ padding: '8px 12px', fontSize: 12.5 }}>⧉ Copy last session</button>
                  : <span className="muted" style={{ fontSize: 11.5 }}>First time logging this one</span>}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <PlateCalc weight={plateWeight} />
                  {!big && <RestTimer restText={ex.rest} />}
                </div>
              </div>
            </div>
            )
  }

  function renderCard(ex, grouped) {
    return (
        <div className="card" key={ex.id} style={grouped ? { border: 'none', borderRadius: 8 } : undefined}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {ex.icon_url && <img className="thumb" src={ex.icon_url} alt="" style={{ width: 42, height: 42, borderRadius: 8, objectFit: 'cover', marginRight: -2 }} />}
            <strong style={{ fontSize: 15 }}>{ex.letter && <span style={{ color: 'var(--orange-hot)' }}>{ex.letter}) </span>}{ex.name}</strong>
            {swappedNote(ex)}
            <span style={{ marginLeft: 'auto' }}>{swapButton(ex)}</span>
            <button onClick={() => setFlagging(flagging === ex.id ? null : ex.id)} className="btn-ghost"
              style={{ padding: '3px 9px', fontSize: 11, color: flaggedIds.has(ex.id) ? 'var(--red)' : undefined, borderColor: flaggedIds.has(ex.id) ? 'var(--red)' : undefined }}
              title="Flag pain or discomfort">⚠️</button>
            <button onClick={() => openExerciseComments(ex.id)} className="btn-ghost" style={{ padding: '3px 9px', fontSize: 11 }}>
              💬 {commentCounts[ex.id] > 0 ? commentCounts[ex.id] : ''}
            </button>
            {ex.kind !== 'conditioning' && <span style={{ color: 'var(--orange-hot)', fontSize: 13, fontWeight: 700 }}>{targetText(ex)}</span>}
          </div>
          {effortBox(ex)}
          {progressNote(ex)}
          {renderExtras(ex)}
          {ex.kind !== 'conditioning' && ex.progression_type === 'percent' && !maxes[(ex.based_on_lift || ex.name).toLowerCase()] && (
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>No max on file for {ex.based_on_lift || ex.name} — ask your coach to set it.</p>
          )}
          {ex.notes && <p style={{ fontSize: 12.5, marginBottom: 8, whiteSpace: 'pre-wrap', borderLeft: '2px solid var(--orange)', paddingLeft: 8 }}>{ex.notes}</p>}
          {ex.video_url && (
            <a href={ex.video_url} target="_blank" rel="noreferrer"
              style={{ display: 'inline-block', fontSize: 12.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              ▶ Watch demo
            </a>
          )}
          {ex.kind === 'conditioning' && renderConditioning(ex)}
          {ex.kind !== 'conditioning' && renderSetGrid(ex)}
        </div>
    )
  }

  // ---------------- moving a conditioning session ----------------
  // Only for this program week (by date), and only when there's a start date to
  // turn Day N into a real day. The client can open and log any session any day
  // regardless; moving is about where it sits on their schedule.
  const thisWeekDates = startDate ? programWeekDates(startDate) : null
  function sessionDateThisWeek(d) {
    if (!thisWeekDates || (d.track !== 'conditioning' && !moves.some(m => m.day_id === d.id))) return null
    const from = scheduledDate(startDate, d.day_number)
    return from ? effectiveDate(d.id, from, moves) : null
  }
  const weekdayShort = ymd => new Date(ymd + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' })

  function renderMovePanel() {
    if (!thisWeekDates || calMode || awayMode) return null
    // conditioning can always move; a lifting day can when a show or travel
    // lands in this week (or it's already been moved)
    const weekHasEvent = thisWeekDates.some(dt => eventIcons(events, dt))
    if (!cardioDay && !weekHasEvent && !moves.some(m => m.day_id === activeDay?.id)) return null
    if (!activeDay || (activeDay.track || 'exercise') === 'lifestyle') return null
    const from = scheduledDate(startDate, activeDay.day_number)
    if (!from) return null
    const on = effectiveDate(activeDay.id, from, moves)
    const today = localDateStr()
    return (
      <div className="card" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, borderLeft: `3px solid ${cardioDay ? CONDITIONING_COLOR : 'var(--orange)'}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13 }}>
            <span className="muted">This week: </span>
            <strong>{new Date(on + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</strong>
          </span>
          {on !== from && (
            <button type="button" className="btn-ghost" style={{ padding: '3px 9px', fontSize: 11.5 }} onClick={() => moveSession(activeDay, from, from)}>
              Move back to {weekdayShort(from)}
            </button>
          )}
        </div>
        <div role="group" aria-label="Move this session to another day" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
          {thisWeekDates.map(dt => {
            const sel = dt === on
            return (
              <button key={dt} type="button" aria-pressed={sel} onClick={() => !sel && moveSession(activeDay, from, dt)}
                title={new Date(dt + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                style={{ padding: '7px 0', borderRadius: 8, fontSize: 11.5, fontWeight: 800, cursor: sel ? 'default' : 'pointer', lineHeight: 1.2,
                  background: sel ? (cardioDay ? CONDITIONING_COLOR : 'var(--orange)') : 'var(--steel)', color: sel ? '#06121B' : dt < today ? 'var(--muted)' : 'inherit',
                  border: dt === today && !sel ? `1px solid ${CONDITIONING_COLOR}` : '1px solid transparent' }}>
                {weekdayShort(dt).slice(0, 3)}<br /><span style={{ fontWeight: 600, fontSize: 10.5 }}>{Number(dt.slice(8))}</span>
                {eventIcons(events, dt) && <><br /><span style={{ fontSize: 10 }}>{eventIcons(events, dt)}</span></>}
              </button>
            )
          })}
        </div>
        <span className="muted" style={{ fontSize: 11 }}>Tap a day to move this session. You can still log it on any day.</span>
      </div>
    )
  }

  // ---------------- focus mode screens ----------------
  function renderFocus() {
    if (!exercises.length) return null
    const lifts = exercises.filter(e => e.kind !== 'conditioning')
    const totalSets = lifts.reduce((n, e) => n + (log[e.id] || []).length, 0)
    const doneCount = lifts.reduce((n, e) => n + exDoneCount(e).done, 0)
    const anyDone = doneCount > 0 || exercises.some(e => e.kind === 'conditioning' && exDoneCount(e).done)

    if (screen === 'overview') {
      const firstOpen = steps.findIndex(st => st.items.some(e => { const c = exDoneCount(e); return c.done < c.total }))
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div className="eyebrow" style={cardioDay ? { color: CONDITIONING_COLOR } : undefined}>
              {cardioDay ? 'Conditioning · ' : ''}Week {week}{totalSets ? ` · ${exercises.length} ${cardioDay ? 'piece' : 'exercise'}${exercises.length === 1 ? '' : 's'} · ${totalSets} ${cardioDay ? 'rounds' : 'sets'}` : ''}
            </div>
            <h2 style={{ fontSize: 34, lineHeight: 1, marginTop: 4, textTransform: 'uppercase' }}>{activeDay.day_label}</h2>
          </div>
          {renderMovePanel()}
          {steps.map((st, si) => (
            <button key={si} type="button" onClick={() => goStep(si)} className="card"
              style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 9, width: '100%', color: 'inherit', font: 'inherit' }}>
              {st.grouped && (
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--orange-hot)' }}>
                  {st.items.length === 2 ? 'Superset' : 'Circuit'} {st.prefix} · alternate each round
                </span>
              )}
              {st.items.map(ex => {
                const c = exDoneCount(ex)
                const full = c.total > 0 && c.done >= c.total
                return (
                  <span key={ex.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {ex.icon_url
                      ? <img className="thumb" src={ex.icon_url} alt="" style={{ width: 36, height: 36, borderRadius: 9, objectFit: 'cover', flexShrink: 0 }} />
                      : <span style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 9, background: 'rgba(255,106,0,0.12)', color: 'var(--orange-hot)', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{ex.letter || '•'}</span>}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ display: 'block', fontSize: 15 }}>{ex.name}</strong>
                      <span className="muted" style={{ fontSize: 12 }}>{ex.kind === 'conditioning' ? 'Conditioning' : targetText(ex)}</span>
                    </span>
                    <span style={{ flexShrink: 0, minWidth: 44, height: 28, padding: '0 9px', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800,
                      background: full ? 'var(--orange)' : c.done ? 'rgba(255,106,0,0.14)' : 'var(--steel)', color: full ? '#140A02' : c.done ? 'var(--orange-hot)' : 'var(--muted)' }}>
                      {full ? 'Done' : ex.kind === 'conditioning' ? '—' : `${c.done}/${c.total}`}
                    </span>
                  </span>
                )
              })}
            </button>
          ))}
          <button className="btn" style={{ height: 56, fontSize: 17, marginTop: 4 }}
            onClick={() => goStep(anyDone && firstOpen >= 0 ? firstOpen : 0)}>
            {anyDone ? (cardioDay ? 'Continue session' : 'Continue workout') : (cardioDay ? 'Start session' : 'Start workout')}
          </button>
          <button type="button" className="btn-ghost" style={{ padding: '8px 12px', fontSize: 12.5, alignSelf: 'center' }} onClick={() => setViewMode('list')}>
            Show everything on one page instead
          </button>
        </div>
      )
    }

    if (screen === 'done') {
      let beat = 0
      for (const ex of lifts) (log[ex.id] || []).forEach((s, i) => {
        if (doneSets.has(`${ex.id}-${i + 1}`) && beatLast(s, lastSession[ex.id]?.sets?.[i + 1])) beat++
      })
      // conditioning: total time worked, from the rounds they ticked
      let workSecs = 0
      for (const ex of lifts) {
        const unit = unitFor(ex)
        if (unit !== 'sec' && unit !== 'min') continue
        ;(log[ex.id] || []).forEach((s, i) => {
          if (doneSets.has(`${ex.id}-${i + 1}`)) workSecs += (Number(s.reps) || 0) * (unit === 'min' ? 60 : 1)
        })
      }
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', textAlign: 'center', paddingTop: 24 }}>
          <div style={{ width: 84, height: 84, borderRadius: 42, background: 'var(--orange)', color: '#140A02', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 42, fontWeight: 900 }}>✓</div>
          <h2 style={{ fontSize: 38, lineHeight: 1, textTransform: 'uppercase' }}>{cardioDay ? 'Session done' : 'Workout done'}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, width: '100%' }}>
            <div className="card" style={{ padding: '16px 10px' }}>
              <div style={{ fontSize: 34, fontWeight: 800, color: 'var(--orange-hot)', lineHeight: 1 }}>{doneCount}/{totalSets}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{cardioDay ? 'Rounds logged' : 'Sets logged'}</div>
            </div>
            <div className="card" style={{ padding: '16px 10px' }}>
              <div style={{ fontSize: 34, fontWeight: 800, color: 'var(--orange-hot)', lineHeight: 1 }}>{cardioDay ? fmtClock(Math.round(workSecs)) : beat}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{cardioDay ? 'Time worked' : 'Sets beat last time'}</div>
            </div>
          </div>
          {activeDay.cooldown && (
            <div className="card" style={{ borderLeft: '3px solid var(--orange)', textAlign: 'left', width: '100%', boxSizing: 'border-box' }}>
              <span className="eyebrow" style={{ fontSize: 10 }}>Cooldown</span>
              <p style={{ fontSize: 13.5, marginTop: 3, lineHeight: 1.5 }}>
                {activeDay.cooldown}
                {activeDay.cooldown_video && <a href={activeDay.cooldown_video} target="_blank" rel="noreferrer" style={{ marginLeft: 6 }}>▶ demo</a>}
              </p>
            </div>
          )}
          <p className="muted" style={{ fontSize: 13.5 }}>{savingSets.size ? 'Saving…' : "Everything's saved. Your coach can see it now."}</p>
          <button className="btn-ghost" style={{ width: '100%', padding: '14px 0', fontSize: 14 }} onClick={() => setScreen('overview')}>Back to overview</button>
        </div>
      )
    }

    // ---- one step: a single exercise, or a whole superset/circuit ----
    const st = steps[Math.min(step, steps.length - 1)]
    const lastLift = [...st.items].reverse().find(e => e.kind !== 'conditioning')
    const defaultRest = parseRest(lastLift?.rest)
    const left = rest ? Math.max(0, Math.ceil((rest.ends - now) / 1000)) : 0
    const resting = !!rest && left > 0
    const nextSt = steps[step + 1]
    const nextLabel = !nextSt ? 'Finish workout'
      : nextSt.grouped ? `Next: ${nextSt.items.length === 2 ? 'Superset' : 'Circuit'} ${nextSt.prefix}`
      : `Next: ${nextSt.items[0].name}`

    return (
      <div
        onTouchStart={e => { const t = e.touches?.[0]; touchStart.current = t ? { x: t.clientX, y: t.clientY, tag: e.target?.tagName } : null }}
        onTouchEnd={e => {
          const s = touchStart.current; touchStart.current = null
          const t = e.changedTouches?.[0]
          if (!s || !t || s.tag === 'INPUT') return
          const dx = t.clientX - s.x, dy = t.clientY - s.y
          if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx)) return
          if (dx < 0) goStep(step + 1)
          else if (step > 0) goStep(step - 1)
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'rgba(11,11,12,0.94)', backdropFilter: 'blur(6px)', padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <button type="button" className="btn-ghost" aria-label="Back to workout overview" onClick={() => setScreen('overview')}
              style={{ width: 44, height: 44, padding: 0, fontSize: 18 }}>☰</button>
            <button type="button" onClick={() => {
                if (resting) setRest(null)
                else { const secs = defaultRest || 90; setRest({ ends: Date.now() + secs * 1000, total: secs }); setNow(Date.now()) }
              }}
              aria-label={resting ? 'Resting — tap to skip' : 'Start rest timer'}
              style={{ height: 44, padding: '0 18px', borderRadius: 22, fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                background: resting ? 'var(--orange)' : rest ? 'rgba(255,106,0,0.14)' : 'var(--steel)',
                color: resting ? '#140A02' : rest ? 'var(--orange-hot)' : 'inherit',
                border: resting || rest ? '1px solid var(--orange)' : '1px solid var(--line)' }}>
              ⏱ {resting ? fmtClock(left) : rest ? 'Rest over · go' : defaultRest ? `Rest ${fmtClock(defaultRest)}` : 'Rest timer'}
            </button>
            <span className="muted" style={{ width: 44, textAlign: 'right', fontSize: 13, fontWeight: 800 }}>{step + 1} / {steps.length}</span>
          </div>
          <div aria-hidden="true" style={{ display: 'flex', gap: 5 }}>
            {steps.map((_, i) => (
              <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < step ? 'var(--orange)' : i === step ? 'var(--orange-hot)' : 'var(--steel)' }} />
            ))}
          </div>
        </div>

        {st.grouped && (
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--orange-hot)' }}>
            {st.items.length === 2 ? 'Superset' : 'Circuit'} {st.prefix} · one set of each, then rest
          </span>
        )}

        {st.items.map(ex => ex.kind === 'conditioning' ? renderCard(ex, false) : (
          <div key={ex.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {ex.icon_url
                ? <img className="thumb" src={ex.icon_url} alt="" style={{ width: 52, height: 52, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
                : <span style={{ width: 52, height: 52, flexShrink: 0, borderRadius: 12, background: 'rgba(255,106,0,0.12)', color: 'var(--orange-hot)', fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{ex.letter || '•'}</span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontSize: 28, lineHeight: 1, textTransform: 'uppercase' }}>
                  {ex.letter && <span style={{ color: 'var(--orange-hot)' }}>{ex.letter} · </span>}{ex.name}
                </h2>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>{swappedNote(ex)}{swapButton(ex)}</div>
                <div style={{ color: 'var(--orange-hot)', fontSize: 13, fontWeight: 700, marginTop: 4 }}>{targetText(ex)}</div>
                {effortBox(ex)}
                {progressNote(ex)}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ex.video_url && (
                <a href={ex.video_url} target="_blank" rel="noreferrer" className="btn-ghost"
                  style={{ padding: '8px 12px', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>▶ Demo</a>
              )}
              {history[ex.id]?.length > 0 && (
                <button type="button" className={histOpen[ex.id] ? 'btn' : 'btn-ghost'} aria-expanded={!!histOpen[ex.id]}
                  onClick={() => setHistOpen(h => ({ ...h, [ex.id]: !h[ex.id] }))} style={{ padding: '8px 12px', fontSize: 12.5 }}>↺ History</button>
              )}
              <button type="button" className="btn-ghost" onClick={() => openExerciseComments(ex.id)} style={{ padding: '8px 12px', fontSize: 12.5 }}>
                💬 {commentCounts[ex.id] > 0 ? commentCounts[ex.id] : 'Notes'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setFlagging(flagging === ex.id ? null : ex.id)} title="Flag pain or discomfort"
                style={{ padding: '8px 12px', fontSize: 12.5, color: flaggedIds.has(ex.id) ? 'var(--red)' : undefined, borderColor: flaggedIds.has(ex.id) ? 'var(--red)' : undefined }}>⚠️</button>
            </div>

            {renderExtras(ex)}
            {ex.progression_type === 'percent' && !maxes[(ex.based_on_lift || ex.name).toLowerCase()] && (
              <p className="muted" style={{ fontSize: 12.5 }}>No max on file for {ex.based_on_lift || ex.name} — ask your coach to set it.</p>
            )}
            {ex.notes && <p className="muted" style={{ fontSize: 12.5 }}>{ex.notes}</p>}

            {histOpen[ex.id] && (
              <div className="card" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(history[ex.id] || []).map(h => (
                  <div key={h.date} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
                    <span className="muted">{new Date(h.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                      {Object.keys(h.sets).sort((a, b) => a - b).map(n => `${h.sets[n].weight || '–'}×${h.sets[n].reps || '–'}`).join(' · ')}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {renderSetGrid(ex, true)}
          </div>
        ))}

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button type="button" className="btn-ghost" aria-label="Previous exercise" disabled={step === 0} onClick={() => goStep(step - 1)}
            style={{ width: 56, height: 56, padding: 0, fontSize: 20, opacity: step === 0 ? 0.35 : 1 }}>‹</button>
          <button type="button" className="btn" onClick={() => goStep(step + 1)} style={{ flex: 1, height: 56, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {nextLabel}
          </button>
        </div>
      </div>
    )
  }

  if (!program) return (
    <div className="card">
      <h2 style={{ fontSize: 18 }}>No program yet</h2>
      <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>Your coach hasn't assigned a program. Message them from the Coach tab.</p>
    </div>
  )

  // in focus mode, once a workout is underway the page is just the workout
  const immersive = viewMode === 'focus' && !!activeDay && !calMode && !awayMode && screen !== 'overview' && exercises.length > 0
  const showList = viewMode === 'list' || exercises.length === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {swapFor && (() => {
        const orig = swapFor.swappedFrom || swapFor.name
        const options = alternativesFor(orig, swapLib.library, swapLib.alts)
        return (
          <div onClick={() => setSwapFor(null)} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 520, borderRadius: '18px 18px 0 0', padding: 16, paddingBottom: 28, maxHeight: '80dvh', overflowY: 'auto' }}>
              <div className="eyebrow">Swap for today</div>
              <h2 style={{ fontSize: 22, margin: '4px 0 10px' }}>{orig}</h2>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {REASONS.map(([k, label]) => <button key={k} className={swapReason === k ? 'btn' : 'btn-ghost'} style={{ padding: '6px 11px', fontSize: 12.5 }} onClick={() => setSwapReason(k)}>{label}</button>)}
              </div>
              {swapReason === 'hurts' && <p style={{ fontSize: 13, color: 'var(--orange-hot)', margin: '0 0 10px' }}>Pick a swap below, then tap ⚠️ on the exercise to tell your coach what hurts.</p>}
              {options.length === 0 ? (
                <div className="muted" style={{ fontSize: 14 }}>Your coach hasn’t set swaps for this one yet. <Link to="/app/messages" style={{ color: 'var(--orange)' }}>Message your coach</Link> and they’ll tell you what to do instead.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {options.map(o => (
                    <button key={o.id} onClick={() => doSwap(swapFor, o)} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '10px 12px', fontSize: 15, fontWeight: 700, borderColor: swaps[swapFor.id]?.alt_library_id === o.id ? 'var(--orange)' : undefined }}>
                      {o.icon_url ? <img src={o.icon_url} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} /> : <span style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,106,0,.14)', display: 'grid', placeItems: 'center' }}>⇄</span>}
                      <span style={{ flex: 1 }}>{o.name}</span>{o.video_url && <span className="muted" style={{ fontSize: 11 }}>▶ demo</span>}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                {swapFor.swappedFrom && <button className="btn-ghost" onClick={() => undoSwap(swapFor)}>Back to {orig}</button>}
                <button className="btn-ghost" onClick={() => setSwapFor(null)} style={{ marginLeft: 'auto' }}>Cancel</button>
              </div>
              <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>Sets you log now are saved under the new exercise. Your coach sees the swap.</p>
            </div>
          </div>
        )
      })()}
      {prToast && (
        <div role="status" onClick={() => setPrToast(null)}
          style={{ position: 'fixed', left: 12, right: 12, bottom: 84, zIndex: 60, maxWidth: 460, margin: '0 auto', background: 'var(--orange)', color: '#000', fontWeight: 800, fontSize: 14, padding: '12px 14px', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,.5)' }}>{prToast}</div>
      )}
      {!immersive && <>
      <header>
        <div className="eyebrow">
          Training · {block?.name || 'Block 1'} · Week {week} of {blockWeeks}
          {rotations.length > 0 && ` · ${rotationForWeek(rotations, week)?.name || ''}`}
        </div>
        <h1 style={{ fontSize: 24, marginTop: 4 }}>{program.name}</h1>
        {program.notes && (
          <details style={{ marginTop: 8, border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px', background: 'var(--coal)' }} open={program.notes.length < 220}>
            <summary style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.08em', color: 'var(--orange-hot)', cursor: 'pointer' }}>PROGRAM INSTRUCTIONS</summary>
            <p style={{ fontSize: 13.5, marginTop: 6, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{program.notes}</p>
          </details>
        )}
      </header>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className={calMode ? 'btn' : 'btn-ghost'} style={{ padding: '10px 14px', fontSize: 13 }}
          onClick={() => setCalMode(!calMode)}>📅</button>
        <button className={awayMode ? 'btn' : 'btn-ghost'} style={{ padding: '10px 14px', fontSize: 13 }}
          onClick={() => setAwayMode(!awayMode)} title="Traveling / no equipment">✈️</button>
        {activeDay && !calMode && !awayMode && (
          <button className="btn-ghost" style={{ padding: '10px 14px', fontSize: 12.5 }}
            onClick={() => setViewMode(viewMode === 'focus' ? 'list' : 'focus')}
            title={viewMode === 'focus' ? 'Show the whole workout on one page' : 'One exercise at a time'}>
            {viewMode === 'focus' ? '☰ List' : '▣ Focus'}
          </button>
        )}
        {!calMode && days.filter(d => (d.track || 'exercise') === 'exercise' && dayShowsInWeek(d, rotations, week)).map(d => (
          <button key={d.id} className={activeDay?.id === d.id ? 'btn' : 'btn-ghost'}
            style={{ padding: '10px 16px', fontSize: 13 }}
            onClick={() => setActiveDay(d)}>{d.day_label}{sessionDateThisWeek(d) && <span style={{ opacity: 0.75, fontWeight: 600 }}> · {weekdayShort(sessionDateThisWeek(d))}</span>}</button>
        ))}
        {!calMode && days.filter(d => d.track === 'conditioning' && dayShowsInWeek(d, rotations, week)).map(d => {
          const on = sessionDateThisWeek(d)
          return (
            <button key={d.id} className={activeDay?.id === d.id ? 'btn' : 'btn-ghost'}
              style={{ padding: '10px 16px', fontSize: 13, borderColor: activeDay?.id === d.id ? undefined : CONDITIONING_COLOR, color: activeDay?.id === d.id ? undefined : CONDITIONING_COLOR }}
              onClick={() => setActiveDay(d)}>
              {d.day_label}{on && <span style={{ opacity: 0.75, fontWeight: 600 }}> · {weekdayShort(on)}</span>}
            </button>
          )
        })}
        {!calMode && days.filter(d => (d.track || 'exercise') === 'lifestyle' && dayShowsInWeek(d, rotations, week)).map(d => (
          <button key={d.id} className={activeDay?.id === d.id ? 'btn' : 'btn-ghost'}
            style={{ padding: '10px 16px', fontSize: 13, borderColor: activeDay?.id === d.id ? undefined : LIFESTYLE_COLOR, color: activeDay?.id === d.id ? undefined : LIFESTYLE_COLOR }}
            onClick={() => setActiveDay(d)}>{d.day_label}</button>
        ))}
      </div>
      {(() => {
        const adv = eventAdvice(events, localDateStr(), addDaysStr)
        if (!adv) return null
        return (
          <div className="card" style={{ padding: '10px 12px', borderLeft: `3px solid ${adv.tone === 'show' ? 'var(--orange)' : adv.tone === 'travel' ? CONDITIONING_COLOR : 'var(--line)'}` }}>
            <strong style={{ fontSize: 14 }}>{adv.title}</strong>
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{adv.body}</div>
          </div>
        )
      })()}
      </>}

      {!calMode && !awayMode && activeDay && showList && (() => {
        const total = exercises.filter(e => e.kind !== 'conditioning').reduce((n, e) => n + (log[e.id] || []).length, 0)
        if (!total) return null
        const done = Math.min(doneSets.size, total)
        return (
          <div className="card" style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13.5 }}>
              <strong>{done} of {total} sets done</strong>
              <span className="muted" style={{ fontSize: 11.5 }}>{savingSets.size ? 'Saving…' : 'Auto-saved'}</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--steel)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round(done / total * 100)}%`, background: 'var(--orange)', borderRadius: 3, transition: 'width 0.25s' }} />
            </div>
          </div>
        )
      })()}

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

        // a moved conditioning session leaves its program day and shows on the
        // day the client picked (same rule as the Calendar page)
        function workoutsOn(dayNum) {
          const ymd = localDateStr(new Date(y, m, dayNum))
          return withMoves(ymd, scheduledOn(ymd), scheduledOn, moves)
        }
        function scheduledOn(ymd) {
          if (!sd || allBlocks.length === 0) return []
          // whole calendar days, not a millisecond division — an hour of DST
          // drift used to be enough to round a date onto the wrong day
          const diff = daysBetween(startDate, new Date(ymd + 'T00:00:00'))
          if (diff === null || diff < 0) return []
          const resolved = resolveBlockWeek(allBlocks, Math.floor(diff / 7) + 1)
          if (!resolved) return []
          const dn = (diff % 7) + 1
          if (resolved.block.id === block?.id) {
            return days
              .filter(d => d.day_number === dn && dayShowsInWeek(d, rotations, resolved.weekInBlock))
              .map(d => ({ ...d, wk: resolved.weekInBlock, blockId: resolved.block.id }))
          }
          return [{ id: `ghost-${resolved.block.id}-${dn}`, day_label: resolved.block.name, track: 'exercise', wk: resolved.weekInBlock, blockId: resolved.block.id, ghost: true }]
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
                              const [{ data: nd }, { data: nr }] = await Promise.all([
                                supabase.from('program_days').select('*').eq('block_id', d.blockId).order('day_number').order('position'),
                                supabase.from('program_rotations').select('*').eq('block_id', d.blockId).order('position'),
                              ])
                              setDays(nd || [])
                              setRotations(nr || [])
                              if (d.ghost) { setWeek(d.wk); setCalMode(false); return }
                            }
                            setWeek(d.wk); setActiveDay(d); setCalMode(false)
                          }}
                          title={d.day_label}
                          style={{ display: 'block', width: '100%', maxWidth: '100%', textAlign: 'left', background: 'none', padding: '1px 0', fontSize: 8.5, fontWeight: 800, lineHeight: 1.25, textTransform: 'uppercase', letterSpacing: '0.02em', color: trackColor(d.track), overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                          {d.movedFrom ? '↪ ' : ''}{label}
                        </button>
                      )
                    })}
                    {extra > 0 && <div className="muted" style={{ fontSize: 8, marginTop: 1 }}>+{extra} more</div>}
                  </div>
                )
              })}
            </div>
            <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
              <span style={{ color: 'var(--orange-hot)', fontWeight: 800 }}>■</span> Training · <span style={{ color: CONDITIONING_COLOR, fontWeight: 800 }}>■</span> Conditioning · <span style={{ color: LIFESTYLE_COLOR, fontWeight: 800 }}>■</span> Lifestyle — tap a session to open it. ↪ = moved
            </p>
          </div>
        )
      })()}

      {!calMode && !awayMode && activeDay && showList && renderMovePanel()}

      {!calMode && !awayMode && activeDay && (showList || screen === 'overview') && (activeDay.notes || activeDay.video_note || activeDay.warmup) && (
        <div className="card">
          {activeDay.notes && <p style={{ fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{activeDay.notes}</p>}
          {activeDay.video_note && (loomEmbed(activeDay.video_note)
            ? <iframe src={loomEmbed(activeDay.video_note)} style={{ width: '100%', height: 210, border: 'none', borderRadius: 8, marginTop: activeDay.notes ? 8 : 0 }} allowFullScreen title="Coach video note" />
            : <a href={activeDay.video_note} target="_blank" rel="noreferrer" style={{ display: 'inline-block', fontSize: 13, fontWeight: 800, marginTop: activeDay.notes ? 6 : 0 }}>🎥 Watch coach's video note</a>)}
          {activeDay.warmup && (
            <div style={{ marginTop: (activeDay.notes || activeDay.video_note) ? 10 : 0, borderLeft: '3px solid var(--orange)', paddingLeft: 10 }}>
              <span className="eyebrow" style={{ fontSize: 10 }}>Warmup</span>
              <p style={{ fontSize: 13.5, marginTop: 3, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                {activeDay.warmup}
                {activeDay.warmup_video && <a href={activeDay.warmup_video} target="_blank" rel="noreferrer" style={{ marginLeft: 6 }}>▶ demo</a>}
              </p>
            </div>
          )}
        </div>
      )}

      {!calMode && !awayMode && activeDay && !showList && renderFocus()}

      {!calMode && !awayMode && activeDay && showList && chunkGroups(exercises).map((g, gi) => {
        const color = GROUP_COLORS[((g.prefix.charCodeAt(0) || 65) - 65) % GROUP_COLORS.length]
        const inner = g.items.map(ex => renderCard(ex, g.grouped))
        return g.grouped ? (
          <div key={gi} style={{ border: `1px solid ${color}`, borderLeft: `4px solid ${color}`, borderRadius: 10, padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color, padding: '2px 2px 0' }}>
              {g.items.length === 2 ? 'Superset' : 'Circuit'} {g.prefix} — alternate exercises each round
            </span>
            {inner}
          </div>
        ) : inner
      })}

      {!calMode && !awayMode && activeDay && showList && activeDay.cooldown && (
        <div className="card" style={{ borderLeft: '3px solid var(--orange)' }}>
          <span className="eyebrow" style={{ fontSize: 10 }}>Cooldown</span>
          <p style={{ fontSize: 13.5, marginTop: 3, lineHeight: 1.5 }}>
            {activeDay.cooldown}
            {activeDay.cooldown_video && <a href={activeDay.cooldown_video} target="_blank" rel="noreferrer" style={{ marginLeft: 6 }}>▶ demo</a>}
          </p>
        </div>
      )}

      {!calMode && !awayMode && activeDay && showList && exercises.length > 0 && (
        <button className="btn" onClick={saveWorkout}>{saved ? 'Workout saved ✓' : 'Save workout'}</button>
      )}
      {!calMode && !awayMode && activeDay && showList && exercises.length > 0 && (
        <p className="muted" style={{ fontSize: 11, textAlign: 'center', marginTop: -8 }}>Every set saves automatically a moment after you enter it — this button is just a final confirmation.</p>
      )}
    </div>
  )
}
