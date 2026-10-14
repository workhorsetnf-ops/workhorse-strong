// Phase planner maths shared by the coach and client Roadmap screens.
import { localDateStr } from './weeks'

export const PHASE_TYPES = {
  cut: { label: 'Cut', color: '#FF6A00' },
  diet_break: { label: 'Diet break', color: '#C9A227' },
  reverse: { label: 'Reverse', color: '#3E8E7E' },
  maintain: { label: 'Maintain', color: '#8E8E8E' },
  recomp: { label: 'Recomp', color: '#7C5CBF' },
  build: { label: 'Build', color: '#4A6FA5' },
  peak: { label: 'Peak / Show prep', color: '#FF7A1A' },
}
export const typeOf = t => PHASE_TYPES[t] || { label: t, color: '#888' }

const toDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const dayIdx = s => Math.floor(Date.UTC(...s.split('-').map((n, i) => (i === 1 ? +n - 1 : +n))) / 864e5)
export const daysBetween = (a, b) => dayIdx(b) - dayIdx(a)      // whole calendar days, DST-proof
export const addDays = (s, n) => { const d = toDate(s); d.setDate(d.getDate() + n); return localDateStr(d) }

// Length in weeks (rounded up), inclusive of both ends.
export const phaseWeeks = p => Math.max(1, Math.ceil((daysBetween(p.start_date, p.end_date) + 1) / 7))
// End date for a phase that starts on `start` and runs `weeks` weeks.
export const endFor = (start, weeks) => addDays(start, Math.max(1, +weeks || 1) * 7 - 1)

export function statusOf(p, today = localDateStr()) {
  if (today > p.end_date) return 'COMPLETE'
  if (today >= p.start_date) return 'CURRENT'
  return 'UPCOMING'
}
// Calories from macros when the coach left calories blank.
export const caloriesOf = p => p.calories || ((p.protein_g || p.carbs_g || p.fat_g) ? (p.protein_g || 0) * 4 + (p.carbs_g || 0) * 4 + (p.fat_g || 0) * 9 : null)

// The tiles at the top: current phase, week of phase, days left, next phase.
export function summary(phases, today = localDateStr()) {
  const sorted = [...phases].sort((a, b) => a.start_date.localeCompare(b.start_date))
  const current = sorted.find(p => statusOf(p, today) === 'CURRENT') || null
  const next = sorted.find(p => p.start_date > today) || null
  return {
    current,
    next,
    week: current ? Math.floor(daysBetween(current.start_date, today) / 7) + 1 : null,
    weeks: current ? phaseWeeks(current) : null,
    daysLeft: current ? daysBetween(today, current.end_date) : null,
    daysToNext: next ? daysBetween(today, next.start_date) : null,
    planEnd: sorted.length ? sorted.reduce((m, p) => (p.end_date > m ? p.end_date : m), sorted[0].end_date) : null,
    totalWeeks: sorted.length ? Math.ceil((daysBetween(sorted[0].start_date, sorted.reduce((m, p) => (p.end_date > m ? p.end_date : m), sorted[0].end_date)) + 1) / 7) : 0,
  }
}

// Week-by-week timeline: each phase as an offset + length in weeks from the plan start.
export function timeline(phases, today = localDateStr()) {
  const sorted = [...phases].sort((a, b) => a.start_date.localeCompare(b.start_date))
  if (!sorted.length) return { rows: [], totalWeeks: 0, todayWeek: null }
  const start = sorted[0].start_date
  const s = summary(sorted, today)
  const rows = sorted.map(p => ({ phase: p, offset: Math.floor(daysBetween(start, p.start_date) / 7), length: phaseWeeks(p) }))
  const total = Math.max(s.totalWeeks, ...rows.map(r => r.offset + r.length))
  const tw = daysBetween(start, today)
  return { rows, totalWeeks: total, todayWeek: tw >= 0 && tw < total * 7 ? Math.floor(tw / 7) : null }
}

// ---- Event countdown + planning back from an event ----

// Days and weeks to go; null once the event has passed.
export function countdown(eventDate, today = localDateStr()) {
  if (!eventDate) return null
  const days = daysBetween(today, eventDate)
  if (days < 0) return null
  return { days, weeks: Math.floor(days / 7), rem: days % 7 }
}

// Build phases backwards from the event: [cut (optionally split by a diet
// break)] -> peak week ending on the event day -> reverse after it.
// opts: { cutWeeks, peakWeeks = 1, dietBreak = false, reverseWeeks = 0, earliest }
// Returns phases in order with start/end dates; the cut is shortened if it
// would start before `earliest` (e.g. today), and `warning` says so.
export function planBackFromEvent(eventDate, opts) {
  const peakWeeks = Math.max(1, +opts.peakWeeks || 1)
  let cutWeeks = Math.max(0, +opts.cutWeeks || 0)
  const reverseWeeks = Math.max(0, +opts.reverseWeeks || 0)
  const breakWeeks = opts.dietBreak && cutWeeks >= 8 ? 1 : 0
  const peakStart = addDays(eventDate, -(peakWeeks * 7 - 1))
  let warning = ''
  if (opts.earliest) {
    const room = Math.floor(daysBetween(opts.earliest, peakStart) / 7)   // whole weeks available before peak
    if (cutWeeks + breakWeeks > room) {
      const fit = Math.max(0, room - breakWeeks)
      warning = room <= 0 ? 'The event is too close for a cut: only the peak week fits.' : `Only ${room} week${room === 1 ? '' : 's'} before peak week, so the cut was shortened to ${fit}.`
      cutWeeks = fit
    }
  }
  const out = []
  let cursor = addDays(peakStart, -((cutWeeks + breakWeeks) * 7))
  const push = (type, weeks, name) => { if (weeks <= 0) return; out.push({ phase_type: type, name, start_date: cursor, end_date: endFor(cursor, weeks) }); cursor = addDays(cursor, weeks * 7) }
  if (breakWeeks) {
    const first = Math.ceil(cutWeeks / 2)
    push('cut', first, 'Cut')
    push('diet_break', breakWeeks, 'Diet break')
    push('cut', cutWeeks - first, 'Cut')
  } else push('cut', cutWeeks, 'Cut')
  push('peak', peakWeeks, 'Peak week')
  push('reverse', reverseWeeks, 'Reverse')
  return { phases: out, warning, cutWeeks }
}

// Which timeline week the event falls in (relative to the first phase).
export function eventWeek(phases, eventDate) {
  if (!eventDate || !phases.length) return null
  const start = [...phases].sort((a, b) => a.start_date.localeCompare(b.start_date))[0].start_date
  const d = daysBetween(start, eventDate)
  return d >= 0 ? d / 7 : null
}
