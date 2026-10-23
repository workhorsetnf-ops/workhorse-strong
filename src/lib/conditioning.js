// Conditioning & cardio sessions (Update 125).
//
// A conditioning session is a program day with track 'conditioning'. It sits
// on a Day N like a workout, but the client can move it to another day of the
// same program week. Moves live in session_moves as (day_id, from_date,
// to_date), and every screen that lays sessions out on dates runs them through
// withMoves() so the Train calendar and the Calendar page always agree.
import { daysBetween, localDateStr } from './weeks'

export const CONDITIONING_COLOR = '#4A9BD1'
export const LIFESTYLE_COLOR = '#3E8E7E'
export const trackColor = track =>
  track === 'conditioning' ? CONDITIONING_COLOR : track === 'lifestyle' ? LIFESTYLE_COLOR : 'var(--orange-hot)'

function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number)
  return localDateStr(new Date(y, m - 1, d + n))
}

// The 7 dates of the program week that `date` falls in. Program weeks start on
// the weekday of the start date (Day 1), the same rule as the calendar.
// Null before the program starts or with no start date.
export function programWeekDates(startDate, date = localDateStr()) {
  const diff = daysBetween(startDate, new Date(date + 'T00:00:00'))
  if (diff === null || diff < 0) return null
  const first = addDays(startDate, diff - (diff % 7))
  return Array.from({ length: 7 }, (_, i) => addDays(first, i))
}

// Where the program puts a Day N session in the program week containing `date`.
export function scheduledDate(startDate, dayNumber, date = localDateStr()) {
  const week = programWeekDates(startDate, date)
  return week ? week[(dayNumber || 1) - 1] : null
}

// Sessions on a date once moves are applied.
//   scheduled: the sessions the program puts on `date` (program_days rows)
//   sessionsOn: (ymd) => the sessions the program puts on any other date
//   moves: session_moves rows for this client
// A session moved away disappears from its original date; a session moved in
// appears with movedFrom set. A move only counts while the session really is
// scheduled on from_date, so editing the program can't leave ghosts behind.
export function withMoves(date, scheduled, sessionsOn, moves = []) {
  const out = (scheduled || []).filter(s => !moves.some(m => m.day_id === s.id && m.from_date === date && m.to_date !== date))
  for (const m of moves) {
    if (m.to_date !== date || m.from_date === date) continue
    const src = (sessionsOn(m.from_date) || []).find(s => s.id === m.day_id)
    if (src && !out.some(s => s.id === src.id)) out.push({ ...src, movedFrom: m.from_date })
  }
  return out
}

// The date a session will actually happen this week, after any move.
export function effectiveDate(dayId, fromDate, moves = []) {
  const m = moves.find(x => x.day_id === dayId && x.from_date === fromDate)
  return m ? m.to_date : fromDate
}

// What unit the client logs a timed or distance piece in. "20 min" logs
// minutes, "30s" / "1:30" log seconds, "400m" logs metres, "40 yd" yards.
// Reps work returns null (the normal grid).
export function workUnit(work, metric) {
  const t = String(work || '').toLowerCase()
  if (metric === 'time') return /min/.test(t) ? 'min' : 'sec'
  if (metric === 'distance') return /yd|yard/.test(t) ? 'yd' : 'm'
  return null
}
export const UNIT_LABEL = { min: 'Mins', sec: 'Secs', m: 'Metres', yd: 'Yards' }

// The interval timer reports seconds; turn that into the unit being logged.
export function secondsToUnit(secs, unit) {
  if (unit === 'min') return String(Math.max(1, Math.round(secs / 60)))
  return String(secs)
}
