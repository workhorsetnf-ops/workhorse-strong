// Conditioning & cardio sessions (Update 125).
//
// A conditioning session is a program day with track 'conditioning'. It sits
// on a Day N like a workout, but the client can move it to another day of the
// same program week. Since Update 162 any lifting session can move too. Moves live in session_moves as (day_id, from_date,
// to_date), and every screen that lays sessions out on dates runs them through
// withMoves() so the Train calendar and the Calendar page always agree.
import { localDateStr, mondayOf, weekDaysFrom, weekdayNumber, resolveAssignment, dayShowsInWeek, dayWeekday } from './weeks'

export const CONDITIONING_COLOR = '#4A9BD1'
export const LIFESTYLE_COLOR = '#3E8E7E'
export const trackColor = track =>
  track === 'conditioning' ? CONDITIONING_COLOR : track === 'lifestyle' ? LIFESTYLE_COLOR : 'var(--orange-hot)'

// The 7 dates (Monday → Sunday) of the program week that `date` falls in.
// Day 1 is always Monday (Update 162), so every client on a program gets the
// same weekly layout and the start date only decides which week they're on.
// startDate is kept in the signature for older callers; it no longer shifts days.
// eslint-disable-next-line no-unused-vars
export function programWeekDates(startDate, date = localDateStr()) {
  return weekDaysFrom(mondayOf(date))
}

// Where the program puts a Day N session in the week containing `date`,
// on the client's own training days if they've set them (Update 164).
export function scheduledDate(startDate, dayNumber, date = localDateStr(), dayMap = null) {
  return programWeekDates(startDate, date)[dayWeekday(dayNumber, dayMap) - 1]
}

// Everything a schedule needs, loaded once. Used by the Calendar page and the
// Home "Today" card so they show exactly what the Train tab shows.
export async function loadProgramSchedule(sb, clientId) {
  const { data: assignment } = await sb.from('program_assignments')
    .select('*').eq('client_id', clientId).maybeSingle()
  if (!assignment) return null
  const { data: blocks } = await sb.from('program_blocks').select('*').eq('program_id', assignment.program_id).order('position')
  const ids = (blocks || []).map(b => b.id)
  const [{ data: days }, { data: rots, error: rotErr }] = ids.length
    ? await Promise.all([
        sb.from('program_days').select('*').in('block_id', ids).order('day_number').order('position'),
        sb.from('program_rotations').select('*').in('block_id', ids).order('position'),
      ])
    : [{ data: [] }, { data: [] }]
  const daysByBlock = {}, rotationsByBlock = {}
  for (const b of blocks || []) { daysByBlock[b.id] = []; rotationsByBlock[b.id] = [] }
  for (const d of days || []) (daysByBlock[d.block_id] ||= []).push(d)
  for (const r of rotErr ? [] : rots || []) (rotationsByBlock[r.block_id] ||= []).push(r)
  return { assignment, blocks: blocks || [], daysByBlock, rotationsByBlock }
}

// The program sessions on a date (before moves), using the SAME block and week
// the Train tab uses: on Manual, the block/week the coach picked (it doesn't
// advance on its own); on Auto, counted from the start date, falling back to
// the coach's pick once the program runs out. Rotations decide A/B weeks.
// Nothing before the start date.
export function scheduledSessions(ymd, schedule) {
  if (!schedule?.blocks?.length) return []
  const a = schedule.assignment || {}
  if (a.start_date && ymd < a.start_date) return []
  const pos = resolveAssignment(a, schedule.blocks, new Date(ymd + 'T00:00:00'))
  if (!pos.block) return []
  const wd = weekdayNumber(ymd)
  const rots = schedule.rotationsByBlock?.[pos.block.id] || []
  return (schedule.daysByBlock?.[pos.block.id] || [])
    .filter(d => dayWeekday(d.day_number, a.day_map) === wd && dayShowsInWeek(d, rots, pos.weekInBlock))
    .sort((x, y) => (x.position ?? 0) - (y.position ?? 0))
    .map(d => ({ ...d, wk: pos.weekInBlock, blockName: pos.block.name }))
}

// Same, with the client's moves applied.
export function sessionsOnDate(ymd, schedule, moves = []) {
  const on = d => scheduledSessions(d, schedule)
  return withMoves(ymd, on(ymd), on, moves)
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
