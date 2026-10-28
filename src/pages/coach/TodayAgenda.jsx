// Coach Home "Today" card: today's booked calls and tasks in one time-ordered
// list, with a Join button on calls and an Open button on tasks that carry a
// link. Tasks can have a time and a reminder; /api/push-agenda sends those
// (and the call reminders) to the coach's phone.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckSquare, Square, Plus, Repeat, Trash2, Pencil, Video, ExternalLink, Bell, Webcam } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { localDateStr } from '../../lib/weeks'
import { buildAgenda, callPhase, fmtTime, fmtTaskTime, localDateIn, startsInText, TASK_REMIND_OPTIONS } from '../../lib/agenda'

const BLANK = { title: '', recurring: false, due_date: '', due_time: '', link: '', remind_minutes: 10 }

// Accept "zoom.us/j/123" as well as a full URL.
export function cleanLink(s) {
  const v = String(s || '').trim()
  if (!v) return ''
  return /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`
}

const remindLabel = m => m === 0 ? 'At the start time' : `${m} min before`

export default function TodayAgenda() {
  const [tz, setTz] = useState('America/New_York')
  const [tasks, setTasks] = useState([])
  const [doneIds, setDoneIds] = useState(new Set())
  const [bookings, setBookings] = useState([])
  const [form, setForm] = useState(null)        // null | { ...fields, id? }
  const [now, setNow] = useState(() => new Date())
  const todayStr = localDateStr()

  async function load() {
    const from = new Date(Date.now() - 30 * 3600000).toISOString()
    const to = new Date(Date.now() + 30 * 3600000).toISOString()
    const [{ data: cfg }, { data: t }, { data: comp }, { data: b }] = await Promise.all([
      supabase.from('coach_call_settings').select('timezone').eq('id', 1).maybeSingle(),
      supabase.from('coach_tasks').select('*').order('created_at'),
      supabase.from('coach_task_completions').select('task_id').eq('completed_date', todayStr),
      supabase.from('bookings').select('id, client_id, starts_at, ends_at, status, video_url, profiles(full_name), call_types(name)')
        .neq('status', 'cancelled').gte('starts_at', from).lte('starts_at', to).order('starts_at'),
    ])
    const zone = cfg?.timezone || 'America/New_York'
    setTz(zone)
    setTasks(t || [])
    setDoneIds(new Set((comp || []).map(c => c.task_id)))
    const today = localDateIn(zone)
    setBookings((b || []).filter(x => localDateIn(zone, new Date(x.starts_at)) === today))
  }

  useEffect(() => { load() }, [])
  // Keep "Join now" and "starts in" current without a reload.
  useEffect(() => { const i = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(i) }, [])

  async function save() {
    if (!form.title.trim()) return
    const row = {
      title: form.title.trim(), recurring: form.recurring,
      due_date: form.recurring ? null : (form.due_date || null),
      due_time: form.due_time || null,
      link: cleanLink(form.link),
      remind_minutes: form.due_time && form.remind_minutes !== '' ? Number(form.remind_minutes) : null,
    }
    const { error } = form.id
      ? await supabase.from('coach_tasks').update(row).eq('id', form.id)
      : await supabase.from('coach_tasks').insert(row)
    if (error) { alert('Could not save that task: ' + error.message); return }
    setForm(null)
    load()
  }

  async function toggle(task) {
    if (doneIds.has(task.id)) await supabase.from('coach_task_completions').delete().eq('task_id', task.id).eq('completed_date', todayStr)
    else await supabase.from('coach_task_completions').insert({ task_id: task.id, completed_date: todayStr })
    load()
  }

  async function remove(id) {
    await supabase.from('coach_tasks').delete().eq('id', id)
    if (form?.id === id) setForm(null)
    load()
  }

  function edit(t) {
    setForm({
      id: t.id, title: t.title, recurring: t.recurring, due_date: t.due_date || '',
      due_time: t.due_time ? t.due_time.slice(0, 5) : '', link: t.link || '',
      remind_minutes: t.remind_minutes ?? '',
    })
  }

  const { timed, untimed } = buildAgenda({ bookings, tasks, doneIds, today: todayStr, tz })
  // Show the zone on call times only when this device is somewhere else
  // (e.g. on the road for a show) so 1:00 PM isn't misread.
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const showZone = browserTz && browserTz !== tz
  const nextId = timed.find(i => !i.done && (i.kind === 'call' ? callPhase(i.booking, now) !== 'over' : i.at > now))?.id
  const pendingUntimed = untimed.filter(i => !i.done)
  const doneUntimed = untimed.filter(i => i.done)
  const empty = !timed.length && !untimed.length

  return (
    <div className="card" style={{ marginBottom: 20, borderLeft: '3px solid var(--orange)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
        <strong style={{ fontSize: 15 }}>Today</strong>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Link to="/coach/calls" className="muted" style={{ fontSize: 12, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Webcam size={13} /> Calls
          </Link>
          <button className="btn-ghost" style={{ padding: '5px 11px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
            onClick={() => setForm(f => f ? null : { ...BLANK })}>
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {form && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, background: 'var(--steel)', borderRadius: 8, padding: 10 }}>
          <input autoFocus placeholder="e.g. Sales call with Mike, or Review Jake's check-in" value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })} onKeyDown={e => e.key === 'Enter' && save()} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={form.recurring} onChange={e => setForm({ ...form, recurring: e.target.checked })} style={{ width: 'auto' }} />
              Repeats every day
            </label>
            {!form.recurring && (
              <input type="date" aria-label="Date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} style={{ width: 'auto' }} />
            )}
            <input type="time" aria-label="Time" value={form.due_time} onChange={e => setForm({ ...form, due_time: e.target.value })} style={{ width: 'auto' }} />
          </div>
          <input placeholder="Link (optional): Zoom, Meet, a doc…" value={form.link} onChange={e => setForm({ ...form, link: e.target.value })} inputMode="url" />
          {form.due_time ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <Bell size={14} /> Remind me
              <select value={form.remind_minutes} onChange={e => setForm({ ...form, remind_minutes: e.target.value })} style={{ width: 'auto' }}>
                {TASK_REMIND_OPTIONS.map(m => <option key={m} value={m}>{remindLabel(m)}</option>)}
                <option value="">No reminder</option>
              </select>
            </label>
          ) : (
            <span className="muted" style={{ fontSize: 12 }}>Add a time to get a phone reminder.</span>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" style={{ padding: '8px 16px', fontSize: 12 }} onClick={save}>{form.id ? 'Save' : 'Add task'}</button>
            <button className="btn-ghost" style={{ padding: '8px 16px', fontSize: 12 }} onClick={() => setForm(null)}>Cancel</button>
          </div>
        </div>
      )}

      {empty && <p className="muted" style={{ fontSize: 13 }}>Nothing on today. Add a task, or book a call from Calls and it shows up here.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {timed.map(i => i.kind === 'call'
          ? <CallRow key={'c' + i.id} item={i} now={now} tz={tz} showZone={showZone} next={i.id === nextId} />
          : <TaskRow key={'t' + i.id} item={i} now={now} next={i.id === nextId} onToggle={toggle} onEdit={edit} onDelete={remove} />)}
        {timed.length > 0 && untimed.length > 0 && <div style={{ borderTop: '1px solid var(--line)', margin: '4px 0' }} />}
        {[...pendingUntimed, ...doneUntimed].map(i =>
          <TaskRow key={'t' + i.id} item={i} now={now} onToggle={toggle} onEdit={edit} onDelete={remove} />)}
      </div>
    </div>
  )
}

const timeCol = { width: 66, flexShrink: 0, fontSize: 13, fontWeight: 700 }

function CallRow({ item, now, tz, showZone, next }) {
  const phase = callPhase(item.booking, now)
  const over = phase === 'over' || phase === 'done'
  const hot = phase === 'soon' || phase === 'live'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', margin: '0 -8px', borderRadius: 8,
      opacity: over ? 0.5 : 1, background: hot ? 'rgba(255,106,0,.12)' : next ? 'var(--steel)' : 'transparent' }}>
      <span style={timeCol}>{fmtTime(item.at, tz, showZone)}</span>
      <Video size={16} color="var(--orange)" style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
        <strong>{item.title}</strong> <span className="muted">· {item.who}</span>
        {(hot || next) && !over && (
          <span style={{ display: 'block', fontSize: 12, color: phase === 'live' ? 'var(--green)' : 'var(--orange)' }}>
            {phase === 'live' ? 'Happening now' : startsInText(item.at, now)}
          </span>
        )}
      </span>
      {item.link && !over && (
        <a className={hot ? 'btn' : 'btn-ghost'} href={item.link} target="_blank" rel="noreferrer"
          style={{ padding: '6px 12px', fontSize: 12, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          {phase === 'live' ? 'Join now' : 'Join'}
        </a>
      )}
      {over && <span className="muted" style={{ fontSize: 11 }}>{phase === 'done' ? 'Done' : 'Ended'}</span>}
    </div>
  )
}

function TaskRow({ item, now, next, onToggle, onEdit, onDelete }) {
  const t = item.task
  const soon = item.at && !item.done && item.at > now && item.at - now <= 15 * 60000
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: item.at ? '6px 8px' : 0, margin: item.at ? '0 -8px' : 0, borderRadius: 8,
      opacity: item.done ? 0.5 : 1, background: soon ? 'rgba(255,106,0,.12)' : next ? 'var(--steel)' : 'transparent' }}>
      {item.at && <span style={timeCol}>{fmtTaskTime(t.due_time)}</span>}
      <button onClick={() => onToggle(t)} aria-label={item.done ? 'Mark not done' : 'Mark done'}
        style={{ background: 'none', display: 'flex', color: item.done ? 'var(--green)' : 'var(--muted)', flexShrink: 0 }}>
        {item.done ? <CheckSquare size={17} /> : <Square size={17} />}
      </button>
      <span style={{ fontSize: 14, flex: 1, minWidth: 0, textDecoration: item.done ? 'line-through' : 'none' }}>
        {t.title}
        {item.overdue && !item.done && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: 'var(--red)' }}>OVERDUE</span>}
        {soon && <span style={{ display: 'block', fontSize: 12, color: 'var(--orange)' }}>{startsInText(item.at, now)}</span>}
      </span>
      {item.link && !item.done && (
        <a className={soon ? 'btn' : 'btn-ghost'} href={item.link} target="_blank" rel="noreferrer" title={item.link}
          style={{ padding: '5px 10px', fontSize: 12, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
          <ExternalLink size={12} /> Open
        </a>
      )}
      {t.due_time && t.remind_minutes !== null && t.remind_minutes !== undefined && <Bell size={13} className="muted" title={`Reminder ${remindLabel(t.remind_minutes)}`} />}
      {t.recurring && <Repeat size={13} className="muted" title="Repeats daily" />}
      <button onClick={() => onEdit(t)} aria-label="Edit" style={{ background: 'none', color: 'var(--muted)' }}><Pencil size={13} /></button>
      <button onClick={() => onDelete(t.id)} aria-label="Delete" style={{ background: 'none', color: 'var(--muted)' }}><Trash2 size={14} /></button>
    </div>
  )
}
