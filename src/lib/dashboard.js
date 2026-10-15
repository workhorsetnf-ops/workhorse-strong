// Client dashboard maths, matching the coaching sheet's Dashboard tab.
// All dates are local 'YYYY-MM-DD' strings.

const pad = n => String(n).padStart(2, '0')
const toUTC = d => { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, m - 1, dd) }
const fromUTC = t => { const x = new Date(t); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}` }
export const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 864e5)
export const addDays = (d, n) => fromUTC(toUTC(d) + n * 864e5)
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const mondayIndex = d => (new Date(toUTC(d)).getUTCDay() + 6) % 7   // 0 = Mon

// Sheet: MAX(1, INT((TODAY() - start) / 7) + 1)
export function weekOfCoaching(start, today) {
  if (!start) return null
  return Math.max(1, Math.floor(daysBetween(start, today) / 7) + 1)
}

// Next check-in date. With a fixed day: the next time that weekday comes round
// (today counts if they haven't checked in today). Without one: 7 days after
// the last check-in, or a week after starting.
export function nextCheckin({ checkinDay, lastCheckin, start, today }) {
  if (checkinDay !== null && checkinDay !== undefined && checkinDay !== '') {
    const diff = (Number(checkinDay) - mondayIndex(today) + 7) % 7
    const done = lastCheckin === today
    return addDays(today, diff === 0 && done ? 7 : diff)
  }
  const base = lastCheckin || start
  if (!base) return null
  let next = addDays(base, 7)
  while (next < today) next = addDays(next, 7)
  return next
}

// DAILY MACROS panel: grams, kcal, % of calories, grams per lb bodyweight.
export function macroRows(profile, weight) {
  const rows = [['Protein', Number(profile?.protein_g) || 0, 4], ['Carbs', Number(profile?.carbs_g) || 0, 4], ['Fat', Number(profile?.fat_g) || 0, 9]]
    .map(([label, g, k]) => ({ label, g, kcal: g * k }))
  const total = rows.reduce((a, r) => a + r.kcal, 0)
  return {
    rows: rows.map(r => ({ ...r, pct: total ? r.kcal / total : 0, perLb: weight ? r.g / weight : null })),
    total: { g: rows.reduce((a, r) => a + r.g, 0), kcal: total },
  }
}

// PROGRESS panel. Works for cutting (goal below start) and gaining (goal above).
export function progress(start, current, goal) {
  if (start == null || current == null) return { change: null, left: null, pct: null }
  const change = Math.round((current - start) * 10) / 10
  if (goal == null || goal === start) return { change, left: null, pct: null }
  const left = Math.round(Math.abs(current - goal) * 10) / 10
  const pct = Math.max(0, Math.min(1, (start - current) / (start - goal)))
  return { change, left, pct }
}

// The program session(s) on a date, same rule as the Calendar page:
// day_number 1 = the program's start date, blocks run back to back.
export function sessionsOn(date, startDate, blocks, daysByBlock) {
  if (!startDate || !blocks?.length) return []
  const diff = daysBetween(startDate, date)
  if (diff < 0) return []
  const wk = Math.floor(diff / 7) + 1
  let cursor = 0, blk = null
  for (const b of blocks) { if (wk <= cursor + (b.weeks || 4)) { blk = b; break } cursor += (b.weeks || 4) }
  if (!blk) return []
  const dn = (diff % 7) + 1
  return (daysByBlock[blk.id] || []).filter(d => d.day_number === dn)
}

export const DEFAULT_TODOS = [
  "Complete today's training session",
  'Hit macro targets',
  'Log food in the app',
  'Mobility / stretching (10 min)',
  'Meal prep for the next 2–3 days',
  'Submit weekly check-in',
]

// Week completion: ticks this week ÷ (tasks × 7), as on the sheet.
export function weekCompletion(todos, ticks, days) {
  if (!todos.length) return 0
  const ids = new Set(todos.map(t => t.id))
  const n = ticks.filter(t => ids.has(t.todo_id) && days.includes(t.log_date)).length
  return n / (todos.length * 7)
}

export const heightText = inches => (inches ? `${Math.floor(inches / 12)}' ${inches % 12}"` : '—')

// This week's training split, using the SAME block + week the Train page uses
// (resolveAssignment), not a date-only guess, so Home and Train always agree.
// Day N maps to a weekday the way the Calendar does: Day 1 = the weekday the
// program started on (Monday when there's no start date).
export function dayNumberOn(date, startDate) {
  if (!startDate) return mondayIndex(date) + 1
  return ((daysBetween(startDate, date) % 7) + 7) % 7 + 1
}
export function splitForWeek(weekDays, { startDate, blockDays, rotations = [], weekInBlock = 1, showsInWeek }) {
  return weekDays.map(date => {
    const dn = dayNumberOn(date, startDate)
    const sessions = (blockDays || [])
      .filter(d => (d.track || 'exercise') === 'exercise' && d.day_number === dn && (!showsInWeek || showsInWeek(d, rotations, weekInBlock)))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    return { date, dayNumber: dn, sessions }
  })
}
