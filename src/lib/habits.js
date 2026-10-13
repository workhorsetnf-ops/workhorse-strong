import { localDateStr } from './weeks'

// Starter habits from the coaching sheet — one tap each, coach edits the target.
export const HABIT_PRESETS = [
  { name: 'Hit protein target', target: 'Daily protein goal' },
  { name: '10,000 steps', target: '10k+' },
  { name: 'Drink 3 L water', target: '3 L' },
  { name: 'Sleep 7+ hours', target: '7+ hrs' },
  { name: 'Log all food', target: 'Every meal' },
  { name: 'Mobility / stretch', target: '10 min' },
  { name: 'No alcohol', target: '' },
  { name: 'Morning sunlight', target: '10 min outside' },
]

const pad = n => String(n).padStart(2, '0')

// 'YYYY-MM' for a date string (or today).
export const monthOf = (day = localDateStr()) => day.slice(0, 7)

// Every date in a month as 'YYYY-MM-DD'. Built from numbers, not Date maths,
// so DST and the device timezone can't shift a day.
export function monthDays(ym) {
  const [y, m] = ym.split('-').map(Number)
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Array.from({ length: count }, (_, i) => `${ym}-${pad(i + 1)}`)
}

export function shiftMonth(ym, by) {
  const [y, m] = ym.split('-').map(Number)
  const idx = y * 12 + (m - 1) + by
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`
}

export function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

// Day-of-week letter for a date string (Mon-first sheet style).
export function dayLetter(d) {
  const [y, m, dd] = d.split('-').map(Number)
  return 'SMTWTFS'[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]
}

// Days that count toward a habit's score: from the day it was added (or the
// month start) up to yesterday. Today only counts once it's ticked, so the
// score doesn't dip every morning before the client has had a chance.
function dueDays(habit, days, today, done) {
  const from = habit.created_at ? localDateStr(new Date(habit.created_at)) : days[0]
  return days.filter(d => d >= from && (d < today || (d === today && done.has(`${habit.id}|${d}`))))
}
const existsOn = (habit, d) => !habit.created_at || localDateStr(new Date(habit.created_at)) <= d

// Scores for a month, like the sheet: % per habit, % per day, and overall.
export function monthStats(habits, logs, days, today = localDateStr()) {
  const done = new Set(logs.map(l => `${l.habit_id}|${l.log_date}`))
  const perHabit = {}
  let totalDone = 0, totalDue = 0
  for (const h of habits) {
    const due = dueDays(h, days, today, done)
    const n = due.filter(d => done.has(`${h.id}|${d}`)).length
    perHabit[h.id] = { done: n, due: due.length, pct: due.length ? n / due.length : null }
    totalDone += n; totalDue += due.length
  }
  const perDay = {}
  for (const d of days) {
    if (d > today) { perDay[d] = null; continue }
    const active = habits.filter(h => existsOn(h, d))
    const n = active.filter(h => done.has(`${h.id}|${d}`)).length
    perDay[d] = !active.length || (d === today && !n) ? null : n / active.length
  }
  return { perHabit, perDay, overall: totalDue ? totalDone / totalDue : null, done }
}

// Consecutive days, ending today (or yesterday if today isn't ticked yet),
// on which every habit was done. Logs should cover enough history.
export function perfectStreak(habits, logs, today = localDateStr()) {
  if (!habits.length) return 0
  const done = new Set(logs.map(l => `${l.habit_id}|${l.log_date}`))
  const full = d => habits.every(h => done.has(`${h.id}|${d}`) || (h.created_at && localDateStr(new Date(h.created_at)) > d))
  const back = d => { const [y, m, dd] = d.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, dd - 1)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}` }
  let d = full(today) ? today : back(today)
  let n = 0
  const oldest = habits.reduce((m, h) => { const c = h.created_at ? localDateStr(new Date(h.created_at)) : '0000'; return c < m ? c : m }, '9999')
  while (n < 400 && d >= oldest && full(d)) { n++; d = back(d) }
  return n
}

export const pctText = p => (p === null || p === undefined ? '—' : `${Math.round(p * 100)}%`)

// Sheet colours: orange when strong, dim when weak.
export function pctColor(p) {
  if (p === null || p === undefined) return 'var(--muted)'
  if (p >= 0.8) return 'var(--orange-hot)'
  if (p >= 0.5) return 'var(--white)'
  return '#ff4d4d'
}
