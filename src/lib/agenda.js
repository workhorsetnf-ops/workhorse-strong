// Today's calls and tasks, and which reminders are due right now.
// Pure functions shared by the coach Home screen and the /api/push-agenda job,
// so the same rules decide what the coach sees and what gets pushed.
//
// Times: calls are stored as real instants (timestamptz). Tasks store a local
// time-of-day (e.g. 13:00) that means "1pm in the coach's timezone", turned
// into an instant per day so DST never shifts a 1pm task to noon or 2pm.

export const CALL_LEAD_OPTIONS = [0, 5, 10, 15, 30, 60]
export const TASK_REMIND_OPTIONS = [0, 5, 10, 15, 30, 60]
export const DEFAULT_CALL_LEAD = 15
export const JOIN_EARLY_MIN = 15          // "Join now" lights up this early
// A reminder still goes out if the job runs a little late, but never for
// something that started more than this long ago.
export const GRACE_MIN = 10
export const DIGEST_HOUR = 7              // morning rundown from 7am local

const pad = n => String(n).padStart(2, '0')

// Milliseconds the timezone is ahead of UTC at a given instant.
export function tzOffsetMs(tz, at) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at).map(x => [x.type, x.value]))
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second)
  return asUtc - Math.floor(at.getTime() / 1000) * 1000
}

// 'YYYY-MM-DD' + 'HH:MM[:SS]' as wall-clock time in tz -> Date.
export function zonedInstant(dateStr, timeStr, tz) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = String(timeStr).split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm || 0)
  let t = guess - tzOffsetMs(tz, new Date(guess))
  t = guess - tzOffsetMs(tz, new Date(t))     // re-check: the offset can differ across a DST change
  return new Date(t)
}

export function localDateIn(tz, at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}
export function localHourIn(tz, at = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(at)) % 24
}

export function fmtTime(at, tz, withZone = false) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', ...(withZone ? { timeZoneName: 'short' } : {}) }).format(at)
}
export function fmtTaskTime(timeStr) {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':').map(Number)
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`
}

const first = name => String(name || '').trim().split(/\s+/)[0] || ''
const mins = ms => Math.round(ms / 60000)

export function startsInText(start, now) {
  const m = mins(start - now)
  if (m <= 0) return 'Starting now'
  if (m < 60) return `Starts in ${m} min`
  const h = Math.floor(m / 60), r = m % 60
  return `Starts in ${h}h${r ? ` ${r}m` : ''}`
}

// Is a task on today's list? Same rule the Home list has always used:
// daily tasks, undated tasks, and dated tasks that are due or overdue.
export function taskOnToday(t, today) {
  return t.recurring || !t.due_date || t.due_date <= today
}
// Does a timed task actually happen today (and so get a reminder)?
// Overdue tasks from earlier days stay on the list but don't ping.
export function taskTimedToday(t, today) {
  return !!t.due_time && (t.recurring || t.due_date === today)
}

// Call state for the Join button.
export function callPhase(b, now) {
  const s = new Date(b.starts_at), e = new Date(b.ends_at)
  if (b.status === 'completed') return 'done'
  if (b.status !== 'booked') return 'cancelled'
  if (now >= e) return 'over'
  if (now >= s) return 'live'
  if (s - now <= JOIN_EARLY_MIN * 60000) return 'soon'
  return 'later'
}

// One merged, time-ordered list for the Home "Today" card.
// bookings: today's rows with { profiles: { full_name }, call_types: { name } }
export function buildAgenda({ bookings = [], tasks = [], doneIds = new Set(), today, tz }) {
  const items = []
  for (const b of bookings) {
    if (b.status === 'cancelled') continue
    items.push({
      kind: 'call', id: b.id, at: new Date(b.starts_at), end: new Date(b.ends_at),
      title: b.call_types?.name || 'Call', who: b.profiles?.full_name || 'Client',
      link: b.video_url || '', booking: b, done: b.status === 'completed',
    })
  }
  for (const t of tasks) {
    if (!taskOnToday(t, today)) continue
    const timed = taskTimedToday(t, today)
    items.push({
      kind: 'task', id: t.id, at: timed ? zonedInstant(today, t.due_time, tz) : null,
      title: t.title, link: t.link || '', task: t, done: doneIds.has(t.id),
      overdue: !t.recurring && t.due_date && t.due_date < today,
    })
  }
  const timed = items.filter(i => i.at).sort((a, b) => a.at - b.at)
  const untimed = items.filter(i => !i.at)
  return { timed, untimed }
}

// The reminders that should go out at `now`. `sent` is a Set of keys already
// sent (kind:item:user:date) so a 5-minute job never repeats one.
// Returns [{ key: {kind,item_id,user_id,for_date}, user_id, title, body, url, tag }]
export function dueReminders({ now, tz, today, bookings = [], tasks = [], doneIds = new Set(), coachIds = [], prefs = {}, sent = new Set() }) {
  const out = []
  const k = (kind, item, user, date) => `${kind}:${item}:${user}:${date}`
  const push = (kind, item, user, date, msg) => {
    if (sent.has(k(kind, item, user, date))) return
    out.push({ key: { kind, item_id: item, user_id: user, for_date: date }, user_id: user, ...msg })
  }
  const grace = GRACE_MIN * 60000

  for (const b of bookings) {
    if (b.status !== 'booked') continue
    const start = new Date(b.starts_at)
    if (start <= now - grace) continue
    const date = localDateIn(tz, start)
    const name = b.profiles?.full_name || 'your client'
    const type = b.call_types?.name || 'Call'
    const recipients = [...coachIds.map(id => ({ id, coach: true })), { id: b.client_id, coach: false }]
    for (const r of recipients) {
      const p = prefs[r.id] || {}
      if (p.calls === false) continue
      const lead = Number.isFinite(p.call_lead_minutes) ? p.call_lead_minutes : DEFAULT_CALL_LEAD
      if (now < start - lead * 60000) continue
      const when = startsInText(start, now)
      push('call', b.id, r.id, date, r.coach
        ? { title: `📞 ${type} with ${name} at ${fmtTime(start, tz)}`, body: `${when}. Tap to join the call.`, url: b.video_url || '/coach/calls', tag: `call-${b.id}` }
        : { title: `📞 Your ${type.toLowerCase()} at ${fmtTime(start, tz, true)}`, body: `${when}. Tap to join your coach.`, url: b.video_url || '/app', tag: `call-${b.id}` })
    }
  }

  for (const t of tasks) {
    if (t.remind_minutes === null || t.remind_minutes === undefined) continue
    if (!taskTimedToday(t, today) || doneIds.has(t.id)) continue
    const at = zonedInstant(today, t.due_time, tz)
    if (at <= now - grace || now < at - t.remind_minutes * 60000) continue
    for (const id of coachIds) {
      if ((prefs[id] || {}).calls === false) continue
      push('task', t.id, id, today, {
        title: `⏰ ${String(t.title).slice(0, 80)} · ${fmtTaskTime(t.due_time)}`,
        body: t.link ? `${startsInText(at, now)}. Tap to open the link.` : `${startsInText(at, now)}.`,
        url: t.link || '/coach', tag: `task-${t.id}`,
      })
    }
  }
  return out
}

// Morning rundown for the coach: today's calls and tasks in one notification.
export function morningDigest({ now, tz, today, coachId, prefs = {}, agenda, sent = new Set() }) {
  if ((prefs[coachId] || {}).calls === false) return null
  if (localHourIn(tz, now) < DIGEST_HOUR) return null
  if (sent.has(`digest:${coachId}:${coachId}:${today}`)) return null
  const calls = agenda.timed.filter(i => i.kind === 'call' && !i.done && i.at > now)
  const tasks = [...agenda.timed, ...agenda.untimed].filter(i => i.kind === 'task' && !i.done)
  if (!calls.length && !tasks.length) return null
  const bits = []
  if (calls.length) bits.push(calls.slice(0, 3).map(c => `${fmtTime(c.at, tz)} ${first(c.who)}`).join(', ') + (calls.length > 3 ? ` +${calls.length - 3}` : ''))
  if (tasks.length) bits.push(`${tasks.length} task${tasks.length === 1 ? '' : 's'}`)
  const head = [calls.length && `${calls.length} call${calls.length === 1 ? '' : 's'}`, tasks.length && `${tasks.length} task${tasks.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')
  return {
    key: { kind: 'digest', item_id: coachId, user_id: coachId, for_date: today },
    user_id: coachId, title: `Today: ${head}`,
    body: calls.length ? `Calls: ${bits[0]}.${tasks.length ? ` Plus ${bits[1]}.` : ''}` : `${bits[0]} on your list.`,
    url: '/coach', tag: 'agenda-digest',
  }
}
