// Weekly review: one client, one Mon-Sun week, every area graded so the coach
// can see in seconds what went well and what needs a word.
import { weekTable } from './foodlog'
import { monthStats } from './habits'
import { planTotals } from './cardio'
import { sessionsOn } from './dashboard'

const avg = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const num = v => (v === null || v === undefined || v === '' ? null : Number(v))

// good >= 0.85, ok >= 0.6, else bad. null when there's nothing to judge.
export const grade = (ratio, good = 0.85, ok = 0.6) => (ratio === null || ratio === undefined ? null : ratio >= good ? 'good' : ratio >= ok ? 'ok' : 'bad')

export function buildReview(d) {
  const { days, today } = d
  const past = days.filter(x => x <= today)
  const out = {}

  // Training: sessions logged vs sessions the program had on those days
  // d.split: this week from splitForWeek (same block/week as the Train page); d.program: older date-only form
  const planned = d.split ? d.split.filter(x => x.sessions.length).length
    : d.program ? days.filter(x => sessionsOn(x, d.program.start, d.program.blocks, d.program.daysByBlock).some(s => (s.track || 'exercise') === 'exercise')).length : null
  const done = days.filter(x => d.workoutDates.has(x) || d.daily.find(r => r.log_date === x)?.trained === true).length
  out.training = { done, planned, ratio: planned ? Math.min(1, done / planned) : null }
  out.training.grade = grade(out.training.ratio)

  // Nutrition: food log against targets
  const wt = weekTable(d.mealLogs, days, d.targets, today)
  const logged = wt.rows.filter(r => r.items).length
  out.nutrition = { loggedDays: logged, onTarget: wt.onTarget, judged: wt.loggedDays, avgKcal: wt.average?.kcal ?? null, avgP: wt.average?.p ?? null, targets: d.targets }
  out.nutrition.ratio = past.length ? logged / past.length : null
  out.nutrition.grade = wt.loggedDays ? grade(wt.onTarget / wt.loggedDays, 0.7, 0.4) : grade(out.nutrition.ratio)

  // Habits
  if (d.habits.length) {
    const st = monthStats(d.habits, d.habitLogs, days, today)
    const per = d.habits.map(h => ({ name: h.name, pct: st.perHabit[h.id]?.pct })).filter(x => x.pct !== null && x.pct !== undefined)
    const worst = per.length ? per.reduce((a, b) => (b.pct < a.pct ? b : a)) : null
    out.habits = { pct: st.overall, worst }
    out.habits.grade = grade(st.overall, 0.8, 0.5)
  }

  // Supplements: doses taken / doses due
  if (d.supps.length) {
    const due = past.length * d.supps.length
    const ids = new Set(d.supps.map(s => s.id))
    const taken = d.suppLogs.filter(l => ids.has(l.supplement_id) && past.includes(l.log_date)).length
    out.supplements = { pct: due ? Math.min(1, taken / due) : null }
    out.supplements.grade = grade(out.supplements.pct, 0.8, 0.5)
  }

  // Cardio: minutes logged vs planned
  const planMin = d.cardioPlan.length ? planTotals(d.cardioPlan).total : 0
  const cardioMin = d.daily.filter(r => days.includes(r.log_date)).reduce((a, r) => a + (num(r.cardio_min) || 0), 0)
  if (planMin || cardioMin) {
    out.cardio = { minutes: cardioMin, planned: planMin, ratio: planMin ? Math.min(1, cardioMin / planMin) : null }
    out.cardio.grade = grade(out.cardio.ratio)
  }

  // Body: weekly average weight vs the week before, steps, sleep
  const inWeek = d.daily.filter(r => days.includes(r.log_date))
  const prevWeek = d.daily.filter(r => d.prevDays.includes(r.log_date))
  const w = avg(inWeek.map(r => num(r.weight)).filter(v => v !== null))
  const wPrev = avg(prevWeek.map(r => num(r.weight)).filter(v => v !== null))
  out.body = {
    weight: w, weightPrev: wPrev, change: w !== null && wPrev !== null ? Math.round((w - wPrev) * 10) / 10 : null,
    weighIns: inWeek.filter(r => num(r.weight) !== null).length,
    steps: avg(inWeek.map(r => num(r.steps)).filter(v => v !== null)),
    sleep: avg(inWeek.map(r => num(r.sleep_hours)).filter(v => v !== null)),
  }
  // direction check against the phase: a cut should be going down, a build up
  const phase = d.phase || 'cut'
  const c = out.body.change
  out.body.grade = c === null ? null
    : phase === 'cut' ? (c <= -0.3 ? 'good' : c <= 0.2 ? 'ok' : 'bad')
    : phase === 'build' ? (c >= 0.1 && c <= 1 ? 'good' : c >= -0.2 ? 'ok' : 'bad')
    : Math.abs(c) <= 1 ? 'good' : 'ok'
  out.body.phase = phase

  // Measurements: newest entry vs the one before it
  const ms = d.measurements.filter(m => num(m.waist) !== null)
  if (ms.length >= 2) {
    const a = ms[ms.length - 2], b = ms[ms.length - 1]
    out.measurements = { waistChange: Math.round((b.waist - a.waist) * 100) / 100, from: a.log_date, to: b.log_date }
  }

  // Things worth a word, worst first
  const label = { training: 'Training', nutrition: 'Nutrition', habits: 'Habits', supplements: 'Supplements', cardio: 'Cardio', body: 'Scale weight' }
  out.flags = Object.entries(label).filter(([k]) => out[k]?.grade === 'bad').map(([, l]) => l)
  out.wins = Object.entries(label).filter(([k]) => out[k]?.grade === 'good').map(([, l]) => l)
  return out
}
