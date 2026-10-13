// Heart-rate zones and weekly cardio maths, shared by the coach and client screens.
import { localDateStr, mondayOf, weekDaysFrom } from './weeks'

export const ZONES = [
  { zone: 'Z1', name: 'Recovery', lo: 0.5, hi: 0.6, feel: 'Easy, full conversation', use: 'Warm-ups, walks, rest days' },
  { zone: 'Z2', name: 'Aerobic base', lo: 0.6, hi: 0.7, feel: 'Can talk in sentences', use: 'Fat-loss cardio, ring stamina base' },
  { zone: 'Z3', name: 'Tempo', lo: 0.7, hi: 0.8, feel: 'Short phrases only', use: 'Steady conditioning' },
  { zone: 'Z4', name: 'Threshold', lo: 0.8, hi: 0.9, feel: 'A few words at a time', use: 'Match-pace intervals' },
  { zone: 'Z5', name: 'Max', lo: 0.9, hi: 1.0, feel: "Can't talk", use: 'Sprints, short HIIT bursts' },
]
export const CARDIO_TYPES = ['Zone 2', 'LISS', 'HIIT', 'Intervals', 'Ring Work', 'Walk', 'Sport', 'Rest']
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// Known max HR wins; otherwise the Tanaka estimate (208 − 0.7 × age), which
// holds up better than 220 − age for trained adults.
export function maxHR(settings) {
  if (settings?.max_hr) return { bpm: Number(settings.max_hr), source: 'known' }
  if (settings?.age) return { bpm: Math.round(208 - 0.7 * Number(settings.age)), source: 'estimate' }
  return { bpm: null, source: null }
}
export function zoneRanges(bpm) {
  return ZONES.map(z => ({ ...z, low: bpm ? Math.round(bpm * z.lo) : null, high: bpm ? Math.round(bpm * z.hi) : null }))
}
export function zoneText(zone, bpm) {
  const z = zoneRanges(bpm).find(r => r.zone === zone)
  return z && z.low ? `${z.low}–${z.high} bpm` : ''
}

// Plan totals for the week.
export function planTotals(plan) {
  const mins = r => Number(r.minutes) || 0
  return {
    total: plan.reduce((a, r) => a + mins(r), 0),
    zone2: plan.filter(r => r.zone === 'Z2').reduce((a, r) => a + mins(r), 0),
    hiit: plan.filter(r => r.cardio_type === 'HIIT').length,
  }
}

// Logged cardio minutes per Monday-start week, newest last, from daily_logs.
export function weeklyLogged(dailyLogs, nWeeks = 8, today = localDateStr()) {
  const thisMon = mondayOf(today)
  const [y, m, d] = thisMon.split('-').map(Number)
  const mondays = Array.from({ length: nWeeks }, (_, i) => localDateStr(new Date(y, m - 1, d - 7 * (nWeeks - 1 - i))))
  return mondays.map(mon => {
    const days = weekDaysFrom(mon)
    const rows = dailyLogs.filter(l => days.includes(l.log_date) && l.cardio_min !== null && l.cardio_min !== undefined)
    return { monday: mon, minutes: rows.reduce((a, r) => a + Number(r.cardio_min), 0), daysLogged: rows.length }
  })
}
