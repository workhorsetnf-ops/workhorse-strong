import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckSquare, Square, Plus, Repeat, Trash2, MessageCircle, ClipboardList, MoreVertical } from 'lucide-react'
import { supabase } from '../../lib/supabase'

function startOfWeek(d = new Date()) {
  const day = (d.getDay() + 6) % 7 // Monday = 0
  const monday = new Date(d); monday.setDate(d.getDate() - day); monday.setHours(0,0,0,0)
  return monday
}
function daysAgo(dateStr) { return Math.floor((Date.now() - new Date(dateStr).getTime()) / 864e5) }

function Ring({ pct, color, label }) {
  const r = 30, c = 2 * Math.PI * r
  return (
    <div style={{ textAlign: 'center' }}>
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
        <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (Math.min(100, pct) / 100) * c}
          transform="rotate(-90 36 36)" />
        <text x="36" y="41" textAnchor="middle" fontSize="16" fontWeight="800" fill="var(--white)">{pct}%</text>
      </svg>
      <div className="muted" style={{ fontSize: 10.5, marginTop: 2 }}>{label}</div>
    </div>
  )
}

export default function CoachHome() {
  const [clients, setClients] = useState([])
  const [statuses, setStatuses] = useState({})     // clientId -> { exercise, lifestyle, checkin }
  const [contacted, setContacted] = useState(new Set())
  const [filter, setFilter] = useState('all')
  const [feedTab, setFeedTab] = useState('exercises')
  const [feed, setFeed] = useState([])
  const [openItem, setOpenItem] = useState(null)
  const [comment, setComment] = useState('')
  const [moreMenu, setMoreMenu] = useState(null)
  const [clientStats, setClientStats] = useState({})
  const [expandedClient, setExpandedClient] = useState(null)
  const [tasks, setTasks] = useState([])
  const [taskCompletions, setTaskCompletions] = useState(new Set()) // task ids done today
  const [showAddTask, setShowAddTask] = useState(false)
  const [newTask, setNewTask] = useState({ title: '', recurring: false, due_date: '' })
  const todayStr = new Date().toISOString().slice(0,10)

  async function loadTasks() {
    const [{ data: t }, { data: comp }] = await Promise.all([
      supabase.from('coach_tasks').select('*').order('created_at'),
      supabase.from('coach_task_completions').select('task_id').eq('completed_date', todayStr),
    ])
    setTasks(t || [])
    setTaskCompletions(new Set((comp || []).map(c => c.task_id)))
  }

  async function addTask() {
    if (!newTask.title.trim()) return
    await supabase.from('coach_tasks').insert({
      title: newTask.title.trim(), recurring: newTask.recurring,
      due_date: newTask.recurring ? null : (newTask.due_date || null),
    })
    setNewTask({ title: '', recurring: false, due_date: '' }); setShowAddTask(false)
    loadTasks()
  }

  async function toggleTask(task) {
    const done = taskCompletions.has(task.id)
    if (done) {
      await supabase.from('coach_task_completions').delete().eq('task_id', task.id).eq('completed_date', todayStr)
    } else {
      await supabase.from('coach_task_completions').insert({ task_id: task.id, completed_date: todayStr })
    }
    loadTasks()
  }

  async function deleteTask(id) {
    await supabase.from('coach_tasks').delete().eq('id', id)
    loadTasks()
  }
  const [loading, setLoading] = useState(true)
  const [onboarding, setOnboarding] = useState({})
  const [view, setView] = useState('attention') // 'attention' | 'insights'
  const [insights, setInsights] = useState({})
  const [lastContactMap, setLastContactMap] = useState({})
  const [sessions, setSessions] = useState({})
  const [openTouchpoint, setOpenTouchpoint] = useState(null)
  const [ratings, setRatings] = useState({})
  const [healthPoints, setHealthPoints] = useState({})
  const [flags, setFlags] = useState([])

  async function load() {
    setLoading(true)
    const [{ data: cl }, { data: assigns }, { data: workoutLogs }, { data: dailyLogs }, { data: checkins }, { data: msgs }, { data: mealLogs }, { data: ratingsData }, { data: flagsData }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, protein_g, calories, created_at').eq('role', 'client').order('full_name'),
      supabase.from('program_assignments').select('*'),
      supabase.from('workout_logs').select('client_id, exercise_name, logged_at, weight, reps, rir, result_text').order('logged_at', { ascending: false }).limit(600),
      supabase.from('daily_logs').select('client_id, log_date, weight, steps').order('log_date', { ascending: false }).limit(400),
      supabase.from('checkins').select('client_id, submitted_at, notes, weight').order('submitted_at', { ascending: false }).limit(100),
      supabase.from('messages').select('sender_id, recipient_id, created_at'),
      supabase.from('meal_logs').select('client_id, protein_g, logged_on').order('logged_on', { ascending: false }).limit(600),
      supabase.from('client_ratings').select('*'),
      supabase.from('exercise_flags').select('*, program_exercises(name)').eq('resolved', false).order('created_at', { ascending: false }),
    ])
    setClients(cl || [])
    const ratingsMap = Object.fromEntries((ratingsData || []).map(r => [r.client_id, r]))
    setRatings(ratingsMap)
    setFlags(flagsData || [])

    const weekStart = startOfWeek()
    const contactedSet = new Set()
    const lastContact = {}
    for (const m of msgs || []) {
      if (!cl?.some(c => c.id === m.recipient_id)) continue
      if (new Date(m.created_at) >= weekStart) contactedSet.add(m.recipient_id)
      if (!lastContact[m.recipient_id] || new Date(m.created_at) > new Date(lastContact[m.recipient_id])) lastContact[m.recipient_id] = m.created_at
    }
    setContacted(contactedSet)
    setLastContactMap(lastContact)

    const sessionCounts = {}
    for (const w of workoutLogs || []) {
      const key = w.client_id
      ;(sessionCounts[key] ||= new Set()).add(w.logged_at.slice(0,10))
    }
    setSessions(Object.fromEntries(Object.entries(sessionCounts).map(([k,v]) => [k, v.size])))

    const st = {}
    for (const c of cl || []) {
      const hasAssignment = assigns?.some(a => a.client_id === c.id)
      const lastWorkout = workoutLogs?.find(w => w.client_id === c.id)
      const exerciseDue = hasAssignment && (!lastWorkout || daysAgo(lastWorkout.logged_at) >= 3)
      const lastDaily = dailyLogs?.find(d => d.client_id === c.id)
      const lifestyleDue = !lastDaily || daysAgo(lastDaily.log_date) >= 2
      const lastCheckin = checkins?.find(ci => ci.client_id === c.id)
      const checkinDue = !lastCheckin || daysAgo(lastCheckin.submitted_at) >= 6
      const consultDue = !lastContact[c.id] || daysAgo(lastContact[c.id]) >= 5

      const last14Days = new Set(
        (workoutLogs || []).filter(w => w.client_id === c.id && daysAgo(w.logged_at) <= 14).map(w => w.logged_at.slice(0, 10))
      ).size
      const compliancePct = hasAssignment ? Math.round((last14Days / 8) * 100) : null // ~4x/wk expected over 2 weeks

      st[c.id] = { exercise: exerciseDue, lifestyle: lifestyleDue, checkin: checkinDue, consult: consultDue, compliancePct }
    }
    setStatuses(st)

    // per-client expanded-view stats: last-28-day compliance grid, totals, streak, 30d percentages
    const cs = {}
    for (const c of cl || []) {
      const workoutDates = new Set((workoutLogs || []).filter(w => w.client_id === c.id).map(w => w.logged_at.slice(0, 10)))
      const lifestyleDates = new Set((dailyLogs || []).filter(d => d.client_id === c.id).map(d => d.log_date))

      const today = new Date(); today.setHours(0, 0, 0, 0)
      // build a 4-week grid, Monday-first, ending on the current week
      const gridStart = new Date(today)
      const todayDow = (today.getDay() + 6) % 7
      gridStart.setDate(today.getDate() - todayDow - 21) // back to the Monday, 3 weeks before this week
      const grid = []
      for (let week = 0; week < 4; week++) {
        const row = []
        for (let day = 0; day < 7; day++) {
          const d = new Date(gridStart); d.setDate(gridStart.getDate() + week * 7 + day)
          const iso = d.toISOString().slice(0, 10)
          row.push({ date: iso, isToday: iso === today.toISOString().slice(0,10), isFuture: d > today, hit: workoutDates.has(iso) })
        }
        grid.push(row)
      }

      // streak: consecutive days (walking backward from today) with a logged workout
      let streak = 0
      for (let i = 0; i < 90; i++) {
        const d = new Date(today); d.setDate(today.getDate() - i)
        if (workoutDates.has(d.toISOString().slice(0, 10))) streak++
        else break
      }

      const last7Hit = [...Array(7)].filter((_, i) => {
        const d = new Date(today); d.setDate(today.getDate() - i)
        return workoutDates.has(d.toISOString().slice(0, 10))
      }).length

      const last30Workouts = [...workoutDates].filter(iso => daysAgo(iso) <= 30).length
      const last30Lifestyle = [...lifestyleDates].filter(iso => daysAgo(iso) <= 30).length

      cs[c.id] = {
        grid, totalWorkouts: workoutDates.size, bestStreak: streak, last7Hit,
        exercisePct30: Math.round((last30Workouts / 30) * 100),
        lifestylePct30: Math.round((last30Lifestyle / 30) * 100),
        compliancePct30: Math.round((((last30Workouts / 30) + (last30Lifestyle / 30)) / 2) * 100),
      }
    }
    setClientStats(cs)

    const hp = {}
    for (const c of cl || []) {
      const lastCheckin = checkins?.find(ci => ci.client_id === c.id)
      const daysSinceCheckin = lastCheckin ? daysAgo(lastCheckin.submitted_at) : 999
      const checkinLight = daysSinceCheckin <= 6 ? 'green' : daysSinceCheckin <= 9 ? 'yellow' : 'red'

      const s = st[c.id]
      const programLight = s.exercise ? 'red' : s.lifestyle ? 'yellow' : 'green'

      const r = ratingsMap[c.id] || {}
      const lights = [checkinLight, programLight, r.retention, r.mindset].filter(Boolean)
      const overall = lights.includes('red') ? 'red' : lights.includes('yellow') ? 'yellow' : 'green'
      hp[c.id] = { overall, checkinLight, programLight, retention: r.retention, mindset: r.mindset }
    }
    setHealthPoints(hp)

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

    const ins = {}
    const today = new Date()
    for (const c of cl || []) {
      const chips = []
      const daily = (dailyLogs || []).filter(d => d.client_id === c.id)
      const workouts = (workoutLogs || []).filter(w => w.client_id === c.id)
      const meals = (mealLogs || []).filter(m => m.client_id === c.id)
      const checkinsC = (checkins || []).filter(ci => ci.client_id === c.id)

      // steps consistency (last 7 days)
      const last7 = daily.filter(d => (today - new Date(d.log_date)) / 864e5 <= 7)
      const stepsLogged = last7.filter(d => d.steps).length
      if (stepsLogged >= 5) chips.push({ tone: 'good', text: 'Daily step counts have been very consistent' })
      else if (last7.length > 0 && stepsLogged <= 1) chips.push({ tone: 'warn', text: "Steps haven't been logged much this week" })

      // weight trend (7d vs prior)
      const weighed = daily.filter(d => d.weight).sort((a,b) => new Date(a.log_date) - new Date(b.log_date))
      if (weighed.length >= 2) {
        const recent = weighed.filter(d => (today - new Date(d.log_date)) / 864e5 <= 7)
        if (recent.length >= 2) {
          const delta = recent[recent.length-1].weight - recent[0].weight
          if (delta <= -1) chips.push({ tone: 'good', text: `Weight trending down ${Math.abs(delta).toFixed(1)} lbs this week` })
          else if (delta >= 1) chips.push({ tone: 'neutral', text: `Weight trending up ${delta.toFixed(1)} lbs this week` })
        }
      }

      // training consistency: this week vs last week (distinct days logged)
      const daysInRange = (arr, from, to) => new Set(arr.filter(w => { const d = (today - new Date(w.logged_at)) / 864e5; return d >= from && d < to }).map(w => w.logged_at.slice(0,10))).size
      const thisWk = daysInRange(workouts, 0, 7), lastWk = daysInRange(workouts, 7, 14)
      if (thisWk >= 4) chips.push({ tone: 'good', text: 'Moving with great consistency this week!' })
      else if (lastWk > 0 && thisWk < lastWk) chips.push({ tone: 'warn', text: `Training days dropped from ${lastWk} to ${thisWk} this week` })

      // protein adherence (last 5 logged days vs target)
      const target = c.protein_g
      if (target > 0 && meals.length > 0) {
        const byDay = {}
        for (const m of meals) byDay[m.logged_on] = (byDay[m.logged_on] || 0) + (m.protein_g || 0)
        const recentDays = Object.entries(byDay).sort((a,b) => new Date(b[0]) - new Date(a[0])).slice(0, 5)
        const hitCount = recentDays.filter(([,p]) => p >= target * 0.9).length
        if (recentDays.length >= 3 && hitCount === recentDays.length) chips.push({ tone: 'good', text: 'Protein target hit consistently lately' })
        else if (recentDays.length >= 3 && hitCount === 0) chips.push({ tone: 'warn', text: 'Protein has been under target across recent logged days' })
      }

      // check-in streak
      if (checkinsC.length >= 4) chips.push({ tone: 'good', text: `${checkinsC.length} check-ins submitted in a row` })

      if (chips.length > 0) ins[c.id] = chips
    }
    setInsights(ins)

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

  useEffect(() => { load(); loadTasks() }, [])

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
    consult: clients.filter(c => statuses[c.id]?.consult).length,
  }
  const filtered = clients.filter(c => {
    const s = statuses[c.id]
    if (!s) return false
    if (filter === 'all') return s.exercise || s.lifestyle || s.checkin || s.consult
    return s[filter]
  })

  const initials = name => (name || '?').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase()

  if (loading) return <div className="muted">Loading your dashboard…</div>

  const pendingTasks = tasks.filter(t => !taskCompletions.has(t.id) && (t.recurring || !t.due_date || t.due_date <= todayStr))
  const doneTasks = tasks.filter(t => taskCompletions.has(t.id))

  return (
    <div>
      <div className="card" style={{ marginBottom: 20, borderLeft: '3px solid var(--orange)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <strong style={{ fontSize: 15 }}>Today's Tasks</strong>
          <button className="btn-ghost" style={{ padding: '5px 11px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setShowAddTask(s => !s)}>
            <Plus size={13} /> Add
          </button>
        </div>

        {showAddTask && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, background: 'var(--steel)', borderRadius: 8, padding: 10 }}>
            <input placeholder="e.g. Review Jake's check-in" value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })} onKeyDown={e => e.key === 'Enter' && addTask()} />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={newTask.recurring} onChange={e => setNewTask({ ...newTask, recurring: e.target.checked })} style={{ width: 'auto' }} />
                Repeats every day
              </label>
              {!newTask.recurring && (
                <input type="date" value={newTask.due_date} onChange={e => setNewTask({ ...newTask, due_date: e.target.value })} style={{ width: 'auto' }} />
              )}
            </div>
            <button className="btn" style={{ padding: '8px 16px', fontSize: 12, alignSelf: 'flex-start' }} onClick={addTask}>Add task</button>
          </div>
        )}

        {pendingTasks.length === 0 && doneTasks.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Nothing on your list — add something you need to get done today.</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {pendingTasks.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => toggleTask(t)} style={{ background: 'none', display: 'flex', color: 'var(--muted)' }}><Square size={17} /></button>
              <span style={{ fontSize: 14, flex: 1 }}>{t.title}</span>
              {t.recurring && <Repeat size={13} className="muted" title="Repeats daily" />}
              <button onClick={() => deleteTask(t.id)} style={{ background: 'none', color: 'var(--muted)' }}><Trash2 size={14} /></button>
            </div>
          ))}
          {doneTasks.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.5 }}>
              <button onClick={() => toggleTask(t)} style={{ background: 'none', display: 'flex', color: 'var(--green)' }}><CheckSquare size={17} /></button>
              <span style={{ fontSize: 14, flex: 1, textDecoration: 'line-through' }}>{t.title}</span>
              {t.recurring && <Repeat size={13} className="muted" title="Repeats daily" />}
              <button onClick={() => deleteTask(t.id)} style={{ background: 'none', color: 'var(--muted)' }}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </div>

      <div className="eyebrow">Home</div>
      <div style={{ display: 'flex', gap: 20, alignItems: 'baseline', margin: '6px 0 16px' }}>
        <h1 style={{ fontSize: 22, cursor: 'pointer', color: view === 'attention' ? 'var(--white)' : 'var(--muted)' }} onClick={() => setView('attention')}>Needs Attention</h1>
        <h1 style={{ fontSize: 22, cursor: 'pointer', color: view === 'insights' ? 'var(--orange-hot)' : 'var(--muted)' }} onClick={() => setView('insights')}>Client Insights</h1>
      </div>

      {view === 'insights' && (
        <div className="card" style={{ marginBottom: 24 }}>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
            Patterns spotted in what each client's actually logging — steps, weight, training days, protein, check-ins.
            Note: this doesn't include heart-rate or recovery data (RHR/HRV) — that needs a wearable integration, which isn't part of the app.
          </p>
          {clients.filter(c => insights[c.id]?.length).length === 0 && <p className="muted" style={{ fontSize: 13.5 }}>Not enough logged data yet to spot patterns.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {clients.filter(c => insights[c.id]?.length).map(c => (
              <div key={c.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 130 }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--steel)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{initials(c.full_name)}</div>
                  <strong style={{ fontSize: 13.5 }}>{c.full_name}</strong>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                  {insights[c.id].map((chip, i) => {
                    const colors = { good: { bg: 'rgba(76,175,109,0.15)', c: 'var(--green)' }, warn: { bg: 'rgba(191,87,0,0.18)', c: 'var(--orange-hot)' }, neutral: { bg: 'var(--steel)', c: 'var(--muted)' } }[chip.tone]
                    return <span key={i} style={{ fontSize: 12, fontWeight: 600, padding: '4px 11px', borderRadius: 20, background: colors.bg, color: colors.c }}>{chip.text}</span>
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'attention' && <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button className={filter === 'all' ? 'btn' : 'btn-ghost'} style={{ padding: '7px 14px', fontSize: 13 }} onClick={() => setFilter('all')}>All</button>
        <button className={filter === 'exercise' ? 'btn' : 'btn-ghost'} style={{ padding: '7px 14px', fontSize: 13 }} onClick={() => setFilter('exercise')}>Exercise due ({counts.exercise})</button>
        <button className={filter === 'lifestyle' ? 'btn' : 'btn-ghost'} style={{ padding: '7px 14px', fontSize: 13 }} onClick={() => setFilter('lifestyle')}>Lifestyle due ({counts.lifestyle})</button>
        <button className={filter === 'checkin' ? 'btn' : 'btn-ghost'} style={{ padding: '7px 14px', fontSize: 13 }} onClick={() => setFilter('checkin')}>Check-in due ({counts.checkin})</button>
        <button className={filter === 'consult' ? 'btn' : 'btn-ghost'} style={{ padding: '7px 14px', fontSize: 13 }} onClick={() => setFilter('consult')}>Consult due ({counts.consult})</button>
      </div>

      {view === 'attention' && flags.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--red)' }}>
          <strong style={{ fontSize: 14.5, color: 'var(--red)' }}>⚠️ Watch List ({flags.length})</strong>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {flags.map(f => (
              <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
                <div>
                  <strong>{clients.find(c => c.id === f.client_id)?.full_name || 'Client'}</strong>
                  <span className="muted"> — {f.program_exercises?.name || 'exercise'}: </span>
                  {f.note}
                </div>
                <button className="btn-ghost" style={{ padding: '3px 9px', fontSize: 11, flexShrink: 0 }}
                  onClick={async () => { await supabase.from('exercise_flags').update({ resolved: true }).eq('id', f.id); load() }}>Resolve</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
        {filtered.length === 0 && <div style={{ padding: 16 }} className="muted">Nobody flagged right now — roster's on track.</div>}
        {filtered.map((c, i) => {
          const s = statuses[c.id]
          const lowCompliance = s.compliancePct !== null && s.compliancePct < 50
          return (
            <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 16px', borderBottom: i < filtered.length - 1 ? '1px solid var(--line)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--steel)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800 }}>{initials(c.full_name)}</div>
                  {healthPoints[c.id] && (
                    <span title={`Health Points: ${healthPoints[c.id].overall}`} style={{ position: 'absolute', bottom: -1, right: -1, width: 12, height: 12, borderRadius: '50%', background: { red: '#D64545', yellow: '#E0B23E', green: '#4CAF6D' }[healthPoints[c.id].overall], border: '2px solid var(--coal)' }} />
                  )}
                </div>
                <strong onClick={() => setExpandedClient(ec => ec === c.id ? null : c.id)} style={{ fontSize: 14, minWidth: 110, cursor: 'pointer' }}>{c.full_name || 'Client'}</strong>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {s.exercise && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: 'rgba(191,87,0,0.18)', color: 'var(--orange-hot)' }}>Exercise due</span>}
                  {s.lifestyle && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: 'rgba(62,142,126,0.18)', color: '#3E8E7E' }}>Lifestyle due</span>}
                  {s.checkin && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: 'rgba(124,92,191,0.18)', color: '#9B7FE0' }}>Check-in due</span>}
                  {s.consult && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: 'rgba(124,92,191,0.28)', color: '#B49EE8' }}>Consult due</span>}
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
                  <Link to="/coach/messages" className="btn-ghost" style={{ padding: '6px 8px', display: 'flex' }} title="Message"><MessageCircle size={16} /></Link>
                  <Link to={`/coach/logs/${c.id}`} className="btn-ghost" style={{ padding: '6px 8px', display: 'flex' }} title="View logs"><ClipboardList size={16} /></Link>
                  <button className="btn-ghost" style={{ padding: '6px 8px', display: 'flex' }} title="More" onClick={() => setMoreMenu(m => m === c.id ? null : c.id)}><MoreVertical size={16} /></button>
                </div>
              </div>
              {lowCompliance && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: 'rgba(214,69,69,0.16)', color: 'var(--red)', alignSelf: 'flex-start', marginLeft: 44 }}>
                  {s.compliancePct}% exercise compliance
                </span>
              )}
              {expandedClient === c.id && clientStats[c.id] && (() => {
                const cst = clientStats[c.id]
                return (
                  <div style={{ background: 'var(--steel)', borderRadius: 10, padding: 16, marginTop: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{cst.last7Hit} of last 7 workouts hit</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, marginBottom: 6, fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textAlign: 'center' }}>
                      {['M','T','W','T','F','S','S'].map((d, i) => <div key={i}>{d}</div>)}
                    </div>
                    {cst.grid.map((row, ri) => (
                      <div key={ri} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, marginBottom: 5 }}>
                        {row.map((day, di) => (
                          <div key={di} title={day.date} style={{
                            width: '100%', aspectRatio: '1', borderRadius: '50%', margin: '0 auto', maxWidth: 26,
                            border: day.isToday ? '2px solid var(--orange)' : '1.5px solid var(--line)',
                            background: day.hit ? 'var(--green)' : 'transparent',
                          }} />
                        ))}
                      </div>
                    ))}
                    <p className="muted" style={{ fontSize: 10.5, marginTop: 4, marginBottom: 14 }}>Compliance (last 4 weeks) — filled means a workout was logged that day.</p>

                    <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', gap: 24 }}>
                        <div style={{ textAlign: 'center' }}>
                          <div className="stat-num" style={{ fontSize: 28 }}>{cst.totalWorkouts}</div>
                          <div className="muted" style={{ fontSize: 10.5 }}>Total Workouts</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div className="stat-num" style={{ fontSize: 28 }}>{cst.bestStreak}</div>
                          <div className="muted" style={{ fontSize: 10.5 }}>Current Streak</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 14 }}>
                        <Ring pct={cst.compliancePct30} color="#B49EE8" label="Compliance % (30d)" />
                        <Ring pct={cst.exercisePct30} color="var(--orange-hot)" label="Exercise % (30d)" />
                        <Ring pct={cst.lifestylePct30} color="#3E8E7E" label="Lifestyle % (30d)" />
                      </div>
                    </div>
                  </div>
                )
              })()}
              {moreMenu === c.id && (
                <div style={{ marginLeft: 44, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <a href={`/coach/print/${c.id}`} target="_blank" rel="noreferrer" className="btn-ghost" style={{ padding: '5px 11px', fontSize: 12, textDecoration: 'none' }}>Print summary</a>
                  <Link to="/coach/clients" className="btn-ghost" style={{ padding: '5px 11px', fontSize: 12, textDecoration: 'none' }}>Edit / manage</Link>
                </div>
              )}
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
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', position: 'relative' }}>
          {clients.map(c => {
            const s_ = statuses[c.id]
            const lc = lastContactMap[c.id]
            const daysSince = lc ? Math.floor((Date.now() - new Date(lc).getTime()) / 864e5) : null
            const memberDays = c.created_at ? Math.floor((Date.now() - new Date(c.created_at).getTime()) / 864e5) : null
            return (
              <div key={c.id} style={{ textAlign: 'center', position: 'relative' }}>
                <button onClick={() => setOpenTouchpoint(openTouchpoint === c.id ? null : c.id)}
                  style={{ background: 'none', padding: 0, cursor: 'pointer' }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--steel)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800, border: contacted.has(c.id) ? '2px solid var(--green)' : '2px solid var(--line)' }}>{initials(c.full_name)}</div>
                </button>
                <div className="muted" style={{ fontSize: 10.5, marginTop: 4, maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                {daysSince !== null && daysSince >= 10 && (
                  <div style={{ fontSize: 9.5, color: 'var(--red)', fontWeight: 700, marginTop: 1 }}>{daysSince}d silent</div>
                )}

                {openTouchpoint === c.id && (
                  <div style={{
                    position: 'absolute', top: 52, left: '50%', transform: 'translateX(-50%)', zIndex: 20,
                    background: 'var(--coal)', border: '1px solid var(--orange)', borderRadius: 10, padding: 14,
                    width: 220, textAlign: 'left', boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--steel)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800 }}>{initials(c.full_name)}</div>
                      <button onClick={() => setOpenTouchpoint(null)} style={{ background: 'none', color: 'var(--muted)', fontSize: 13 }}>✕</button>
                    </div>
                    <strong style={{ display: 'block', fontSize: 14.5, marginTop: 8 }}>{c.full_name}</strong>
                    <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>{sessions[c.id] || 0} session{sessions[c.id] === 1 ? '' : 's'} logged</p>
                    {memberDays !== null && <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>Client for {memberDays} day{memberDays === 1 ? '' : 's'}</p>}
                    {healthPoints[c.id] && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                        <span style={{ width: 12, height: 12, borderRadius: '50%', background: { red: '#D64545', yellow: '#E0B23E', green: '#4CAF6D' }[healthPoints[c.id].overall], flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'capitalize' }}>{healthPoints[c.id].overall} overall</span>
                      </div>
                    )}
                    <p style={{ fontSize: 12, marginTop: 4, fontWeight: 700, color: daysSince === null ? 'var(--muted)' : daysSince >= 10 ? 'var(--red)' : daysSince >= 5 ? 'var(--orange-hot)' : 'var(--green)' }}>
                      {daysSince === null ? 'Never messaged' : daysSince === 0 ? 'Messaged today' : `Last contact ${daysSince}d ago`}
                    </p>
                    {s_ && (s_.exercise || s_.lifestyle || s_.checkin) && (
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
                        {s_.exercise && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(191,87,0,0.18)', color: 'var(--orange-hot)' }}>Exercise due</span>}
                        {s_.lifestyle && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(62,142,126,0.18)', color: '#3E8E7E' }}>Lifestyle due</span>}
                        {s_.checkin && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(124,92,191,0.18)', color: '#9B7FE0' }}>Check-in due</span>}
                      </div>
                    )}
                    <Link to="/coach/messages" onClick={() => setOpenTouchpoint(null)} className="btn" style={{ display: 'block', textAlign: 'center', marginTop: 10, padding: '8px 0', fontSize: 12, textDecoration: 'none' }}>Message</Link>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      </>}

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
