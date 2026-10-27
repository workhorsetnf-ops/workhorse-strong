// Week numbers for a check-in card on the coach's Check-ins page, computed from
// what the client actually logged (food log, workout log, daily log), not from
// what they typed into the check-in. Works for every check-in, including ones
// the coach logged on a client's behalf and ones from before Update 85.
import { weekTable } from './foodlog'
import { addDays } from './dashboard'
import { localDateStr } from './weeks'

// The 7 days a check-in covers: its stored period, or the 7 days up to the day
// it was submitted (the client's day, in local time).
export function checkinDays(c) {
  const end = c.period_end || localDateStr(new Date(c.submitted_at))
  const start = c.period_start || addDays(end, -6)
  const days = []
  for (let d = start; d <= end && days.length < 31; d = addDays(d, 1)) days.push(d)
  return days
}

const avg = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const num = v => (v === null || v === undefined || v === '' ? null : Number(v))

// d: { days, today, mealLogs, targets, workoutDates:Set, daily:[{log_date, steps, trained}], planned:number|null, stepsTarget }
export function checkinWeekStats(d) {
  const wt = weekTable(d.mealLogs || [], d.days, d.targets, d.today)
  const a = wt.average
  const pct = (v, t) => (v === null || v === undefined || !t ? null : v / t)
  const nutrition = {
    loggedDays: wt.loggedDays,
    onTarget: wt.onTarget,
    avg: a ? { kcal: a.kcal, p: a.p, c: a.c, f: a.f } : null,
    targets: d.targets,
    // how close the average landed to each target (1 = exactly on it)
    hit: a ? { kcal: pct(a.kcal, d.targets.kcal), p: pct(a.p, d.targets.p), c: pct(a.c, d.targets.c), f: pct(a.f, d.targets.f) } : null,
  }

  const inWeek = (d.daily || []).filter(r => d.days.includes(r.log_date))
  const stepVals = inWeek.map(r => num(r.steps)).filter(v => v !== null)
  const steps = { avg: avg(stepVals), daysLogged: stepVals.length, target: num(d.stepsTarget) || null }

  const trained = d.days.filter(x => d.workoutDates.has(x) || inWeek.find(r => r.log_date === x)?.trained === true)
  const workouts = { done: trained.length, planned: d.planned ?? null, dates: trained }

  return { nutrition, steps, workouts }
}

// Colour for "average vs target": within 5% green, within 10% orange, else red.
export function closeness(ratio) {
  if (ratio === null || ratio === undefined) return null
  const off = Math.abs(ratio - 1)
  return off <= 0.05 ? 'good' : off <= 0.1 ? 'ok' : 'bad'
}
