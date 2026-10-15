// What to send, and to whom. Pure functions so the rules can be tested; the
// server job gathers the facts and does the sending.
// One notification per person per slot at most: the evening one rolls
// everything still open into a single message instead of three pings.
import { addDays, mondayIndex, daysBetween } from './dashboard.js'

export const DEFAULT_PREFS = { workout: true, food: true, habits: true, checkin: true, messages: true, slipping: true }

// Check-in state for a fixed weekly day (0 = Mon). lastCheckin: 'YYYY-MM-DD' or null.
export function checkinState(checkinDay, lastCheckin, today) {
  if (checkinDay === null || checkinDay === undefined || checkinDay === '') return { due: false, overdueDays: 0 }
  const back = (mondayIndex(today) - Number(checkinDay) + 7) % 7
  const dueDate = addDays(today, -back)
  const done = lastCheckin && lastCheckin >= addDays(dueDate, -1)   // a day early counts
  if (done) return { due: false, overdueDays: 0, dueDate }
  return { due: back === 0, overdueDays: back, dueDate }
}

const first = name => String(name || '').trim().split(/\s+/)[0] || ''

// facts: { id, name, prefs, sessionsToday: [labels], trainedToday, foodLoggedToday,
//          habitsLeft, checkin: {due, overdueDays} }
export function morningFor(f) {
  const p = { ...DEFAULT_PREFS, ...(f.prefs || {}) }
  if (p.checkin && f.checkin?.due) {
    return { user_id: f.id, title: 'Check-in day ✅', body: `${first(f.name) ? first(f.name) + ', s' : 'S'}ubmit your weekly check-in today${f.sessionsToday?.length && p.workout ? `, and ${f.sessionsToday.join(' + ')} is on` : ''}.`, url: '/app/checkin', tag: 'morning' }
  }
  if (p.workout && f.sessionsToday?.length && !f.trainedToday) {
    return { user_id: f.id, title: `Today: ${f.sessionsToday.join(' + ')} 💪`, body: 'Your session is loaded. Tap to start, and log as you go.', url: '/app/training', tag: 'morning' }
  }
  return null
}

export function eveningFor(f) {
  const p = { ...DEFAULT_PREFS, ...(f.prefs || {}) }
  const items = []
  let url = '/app'
  if (p.workout && f.sessionsToday?.length && !f.trainedToday) { items.push(`${f.sessionsToday.join(' + ')} not logged`); url = '/app/training' }
  if (p.food && !f.foodLoggedToday) { items.push("log today's food"); if (url === '/app') url = '/app/nutrition' }
  if (p.habits && f.habitsLeft > 0) { items.push(`${f.habitsLeft} habit${f.habitsLeft === 1 ? '' : 's'} left`); if (url === '/app') url = '/app/habits' }
  if (p.checkin && f.checkin && !f.checkin.due && f.checkin.overdueDays >= 1 && f.checkin.overdueDays <= 3) { items.unshift(`check-in is ${f.checkin.overdueDays} day${f.checkin.overdueDays === 1 ? '' : 's'} late`); url = '/app/checkin' }
  else if (p.checkin && f.checkin?.due) { items.unshift('check-in still due today'); url = '/app/checkin' }
  if (!items.length) return null
  const text = items.join(' · ')
  return { user_id: f.id, title: 'Before the day ends', body: text.charAt(0).toUpperCase() + text.slice(1), url, tag: 'evening' }
}

// Coach's evening summary: clients going quiet + check-ins waiting.
export function coachDigest(coachId, prefs, clients, today, pendingCheckins = 0) {
  const p = { ...DEFAULT_PREFS, ...(prefs || {}) }
  const quiet = clients
    .filter(c => c.status !== 'paused' && c.status !== 'exited')
    .map(c => ({ name: first(c.full_name) || 'Client', days: c.last_seen_at ? daysBetween(c.last_seen_at.slice(0, 10), today) : null, created: c.created_at }))
    .filter(c => c.days !== null ? c.days >= 3 : (c.created && daysBetween(String(c.created).slice(0, 10), today) >= 3))
    .sort((a, b) => (b.days ?? 99) - (a.days ?? 99))
  const parts = []
  if (p.slipping && quiet.length) parts.push(`${quiet.length} going quiet: ${quiet.slice(0, 4).map(c => `${c.name} (${c.days === null ? 'never opened' : c.days + 'd'})`).join(', ')}${quiet.length > 4 ? '…' : ''}`)
  if (p.checkin && pendingCheckins > 0) parts.push(`${pendingCheckins} check-in${pendingCheckins === 1 ? '' : 's'} to review`)
  if (!parts.length) return null
  return { user_id: coachId, title: 'Client radar', body: parts.join(' · '), url: quiet.length ? '/coach' : '/coach/checkins', tag: 'coach-evening' }
}
