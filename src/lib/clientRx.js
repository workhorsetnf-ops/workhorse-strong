// CoachRx-style client layout (Update 189): the pure logic behind the Home week
// strip + Daily Rx, the Profile hub's compliance tiles, and the Trends page.
// No Supabase in here so every rule can be tested on its own.
import { addDays } from './dashboard'

// One line under "Hi Anthony," — picked by date so it holds all day and changes tomorrow.
export const DAILY_LINES = [
  'Show up. Do the work. Repeat.',
  'Nobody is coming to do your reps for you.',
  'Small wins every day add up to a different body.',
  'Be the hardest worker in the building.',
  'Discipline is doing it on the days you don’t feel like it.',
  'The match is won in the gym long before the bell rings.',
  'You don’t rise to the occasion. You fall to your level of preparation.',
  'Earn it today.',
  'Consistency beats intensity you can’t repeat.',
  'Workhorses don’t wait for motivation.',
]
export function dailyLine(ymd) {
  let h = 0
  for (const ch of String(ymd)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return DAILY_LINES[h % DAILY_LINES.length]
}

export const firstName = full => (String(full || '').trim().split(/\s+/)[0] || 'Athlete')

// Supersets/circuits: A1, A2 sharing a letter run together; A, B, C stand alone.
const prefixOf = l => (l || '').replace(/[0-9]/g, '')
const isNumbered = l => /^[A-Z]+\d+$/i.test(l || '')
export function rxGroups(list) {
  const out = []
  for (const ex of list || []) {
    const prev = out[out.length - 1]
    const pfx = prefixOf(ex.letter)
    if (prev && isNumbered(ex.letter) && prev.prefix === pfx && prev.numbered) prev.items.push(ex)
    else out.push({ prefix: pfx, numbered: isNumbered(ex.letter), items: [ex] })
  }
  return out.map(g => ({ prefix: g.prefix, grouped: g.numbered && g.items.length > 1, items: g.items }))
}

// The status mark for each day of the week strip.
//   done    — a workout was logged that day (green tick)
//   missed  — a past day had a session and nothing was logged (red ✕)
//   planned — a session is on that day, today or later (orange dot)
//   rest    — nothing scheduled, nothing logged
// sessionsByDate: ymd -> number of training sessions (lifestyle days excluded by the caller)
// loggedDates: Set of ymd with at least one workout set logged
export function dayStatus(ymd, today, sessionsByDate, loggedDates) {
  if (loggedDates.has(ymd)) return 'done'
  const n = sessionsByDate[ymd] || 0
  if (!n) return 'rest'
  return ymd < today ? 'missed' : 'planned'
}

// Current streak of SCHEDULED sessions hit, CoachRx-style: walk back day by day
// over days that had a session; a logged day adds one, a missed one ends it.
// Today only counts once it's logged (an unlogged today doesn't break it).
// Unscheduled days that were trained anyway add one and never break it.
export function sessionStreak(dates, today, sessionsByDate, loggedDates) {
  let n = 0
  for (const d of [...dates].sort().reverse()) {
    if (d > today) continue
    const had = (sessionsByDate[d] || 0) > 0
    if (loggedDates.has(d)) { n++; continue }
    if (!had || d === today) continue
    break
  }
  return n
}

// The run of ymd dates ending at `end`, oldest first.
export function dateRange(end, count) {
  const out = []
  for (let i = count - 1; i >= 0; i--) out.push(addDays(end, -i))
  return out
}

// Trends: one value per date for a daily_logs field ('weight', 'steps', ...).
export function seriesFrom(rows, dates, field) {
  const by = {}
  for (const r of rows || []) if (r?.log_date && r[field] != null && r[field] !== '') by[r.log_date] = Number(r[field])
  return dates.map(d => ({ date: d, value: Number.isFinite(by[d]) ? by[d] : null }))
}

// Calories per date from meal_logs rows (p/c/f grams), only days with entries.
export function caloriesByDate(meals) {
  const out = {}
  for (const m of meals || []) {
    if (!m?.logged_on) continue
    out[m.logged_on] = (out[m.logged_on] || 0) + (Number(m.protein_g) || 0) * 4 + (Number(m.carbs_g) || 0) * 4 + (Number(m.fat_g) || 0) * 9
  }
  return out
}

// Average of the logged (non-null) values; null when there are none.
export function avgOf(series) {
  const v = series.map(p => p.value).filter(x => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

// Short x-axis label: weekday letter for a week, day of month otherwise.
export function tickLabel(ymd, span) {
  const d = new Date(ymd + 'T00:00:00')
  return span <= 7 ? 'MTWTFSS'[(d.getDay() + 6) % 7] : String(d.getDate())
}

// Which of the 5 bottom tabs a screen belongs to, so the right one lights up
// on screens that moved off the bar (Train lives under Home, Check-in under Profile...).
const TAB_OF = [
  ['home', ['/app/training', '/app/calendar']],
  ['eat', ['/app/nutrition']],
  ['progress', ['/app/trends', '/app/progress', '/app/measurements', '/app/photos', '/app/records', '/app/recap']],
  ['chat', ['/app/messages', '/app/community']],
]
export function tabFor(path) {
  const p = String(path || '').replace(/\/+$/, '') || '/app'
  if (p === '/app') return 'home'
  for (const [tab, roots] of TAB_OF) if (roots.some(r => p === r || p.startsWith(r + '/'))) return tab
  return 'profile'
}
