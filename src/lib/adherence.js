// Accountability Operating System: adherence tiers, the quick check-in, and the
// automatic 100-point weekly scorecard. Pure functions (no Supabase) so the
// rules can be tested and so the coach page, client Home and the push job all
// use exactly the same logic. All dates are local 'YYYY-MM-DD' strings.
import { addDays, daysBetween, mondayIndex, splitForWeek, checkinDueDate } from './dashboard.js'
import { resolveBlockWeek, dayShowsInWeek } from './weeks.js'

// ---------------------------------------------------------------- tiers
export const TIERS = {
  3: { name: 'Watch', cadence: 'Daily', perWeek: 7 },
  2: { name: 'Standard', cadence: 'Every other day', perWeek: 3 },
  1: { name: 'Autonomous', cadence: 'Twice a week', perWeek: 2 },
}
export const tierLabel = t => (TIERS[t] ? `Tier ${t} · ${TIERS[t].name}` : 'Off')
const hasTier = t => t === 1 || t === 2 || t === 3

// ---------------------------------------------------------------- quick check-in
// Weight, sleep, recovery (1-5), steps and a note. A day counts as checked in if
// they pressed Done, or if their Daily Log already holds at least two of
// weight / sleep / recovery for that day: so logging on the Daily Log page
// counts too and nobody is asked for the same numbers twice.
export const QUICK_FIELDS = ['weight', 'sleep_hours', 'readiness']
const filled = v => v !== null && v !== undefined && v !== ''
export function quickDone(row) {
  if (!row) return false
  if (row.quick_checkin_at) return true
  return QUICK_FIELDS.filter(k => filled(row[k])).length >= 2
}

// Is a quick check-in due today for this tier? doneDates: Set of dates done.
//  Tier 3: every day.
//  Tier 2: every other day: due unless they checked in today or yesterday.
//  Tier 1: twice a week, Monday and Thursday: due unless done since the most
//          recent Monday/Thursday.
export function quickDue(tier, doneDates, today) {
  if (!hasTier(tier) || doneDates.has(today)) return false
  if (tier === 3) return true
  if (tier === 2) return !doneDates.has(addDays(today, -1))
  const dow = mondayIndex(today)
  const anchor = addDays(today, -(dow >= 3 ? dow - 3 : dow))
  for (let d = anchor; d <= today; d = addDays(d, 1)) if (doneDates.has(d)) return false
  return true
}

// ---------------------------------------------------------------- weeks
export const weekStartOf = d => addDays(d, -mondayIndex(d))
export const weekDays = start => Array.from({ length: 7 }, (_, i) => addDays(start, i))
// The last n COMPLETED Mon-Sun weeks before the week containing today, oldest first.
export function lastWeeks(today, n) {
  const thisWeek = weekStartOf(today)
  return Array.from({ length: n }, (_, i) => addDays(thisWeek, -7 * (n - i)))
}

// Scheduled training sessions in a given week from the client's program.
// prog: { assignment, blocks, daysByBlock: {blockId: [...]}, rotationsByBlock }
// Returns null when there's no program to measure against.
export function expectedSessions(prog, weekStart) {
  const a = prog?.assignment
  if (!a || !prog.blocks?.length) return null
  let block, weekInBlock
  if (a.week_mode === 'auto' && a.start_date) {
    const wk = Math.floor(daysBetween(a.start_date, weekStart) / 7) + 1
    if (wk < 1) return null                       // program hadn't started that week
    const r = resolveBlockWeek(prog.blocks, wk)
    if (!r) return null                           // program had run out
    block = r.block; weekInBlock = r.weekInBlock
  } else {
    block = prog.blocks.find(b => b.id === a.current_block_id) || prog.blocks[0]
    weekInBlock = a.current_week || 1
  }
  const rows = splitForWeek(weekDays(weekStart), {
    startDate: a.start_date, blockDays: prog.daysByBlock?.[block.id] || [], rotations: prog.rotationsByBlock?.[block.id] || [],
    weekInBlock, showsInWeek: dayShowsInWeek,
  })
  const n = rows.filter(r => r.sessions.length > 0 && (!a.start_date || r.date >= a.start_date)).length
  return n || null
}

// For clients not on a tier: was their regular check-in due in this week (at
// their weekly / 2-week / monthly frequency), and did they send one?
// checkinDates: their check-in dates, any order.
export function weeklyCheckinFor({ checkinDay, frequency, startDate }, checkinDates, weekStart) {
  const end = addDays(weekStart, 6)
  const done = checkinDates.some(x => x >= weekStart && x <= end) ? 1 : 0
  if (done) return { required: 1, done }
  if (startDate && startDate > end) return { required: 0, done }
  const before = checkinDates.filter(x => x < weekStart).sort()
  const last = before[before.length - 1] || null
  const due = checkinDueDate({ checkinDay, frequency, lastCheckin: last, today: weekStart, startDate })
  // never checked in and no fixed day: expect one a week once they've started
  if (!due) return { required: startDate && startDate <= end ? 1 : 0, done }
  return { required: due <= end ? 1 : 0, done }
}

// ---------------------------------------------------------------- scorecard
export const BANDS = [['green', 85, 'On track'], ['yellow', 65, 'Slipping'], ['red', 0, 'Off track']]
export const bandOf = score => (score === null ? null : score >= 85 ? 'green' : score >= 65 ? 'yellow' : 'red')

// One week's score. Categories that don't apply to a client (no program, no
// habits, no check-in due that week) are left out and the rest scaled to 100,
// so nobody loses points for something they were never asked to do.
// d: {
//   days: 7 dates, tier,
//   daily: { date: daily_logs row }, mealDates: Set, workoutDates: Set,
//   habitIds: [active habit ids], habitTicks: { date: Set(habit ids) },
//   expected: scheduled sessions or null,
//   weeklyCheckin: { required: 0|1, done: 0|1 }   // used when tier is off
// }
export function scoreWeek(d) {
  const { days } = d
  const daily = d.daily || {}
  const count = fn => days.filter(fn).length
  const parts = []
  const add = (key, label, max, ratio, detail, na = false) =>
    parts.push({ key, label, max, na, detail, pts: na ? 0 : Math.round(Math.max(0, Math.min(1, ratio)) * max * 10) / 10 })

  // Check-ins (20)
  if (hasTier(d.tier)) {
    const need = TIERS[d.tier].perWeek
    const done = count(x => quickDone(daily[x]))
    add('checkins', 'Check-ins', 20, done / need, `${done} of ${need} quick check-ins (Tier ${d.tier})`)
  } else if (d.weeklyCheckin?.required) {
    add('checkins', 'Check-ins', 20, d.weeklyCheckin.done ? 1 : 0, d.weeklyCheckin.done ? 'Weekly check-in submitted' : 'Weekly check-in missed')
  } else add('checkins', 'Check-ins', 20, 0, 'No check-in due this week', true)

  // Training (25)
  const trained = count(x => d.workoutDates?.has(x) || daily[x]?.trained === true)
  if (d.expected) add('training', 'Training', 25, trained / d.expected, `${trained} of ${d.expected} sessions logged`)
  else add('training', 'Training', 25, 0, 'No program assigned', true)

  // Nutrition logged (20): a bad day logged counts the same as a good one
  const ate = count(x => d.mealDates?.has(x) || filled(daily[x]?.nutrition_hit))
  add('nutrition', 'Nutrition logged', 20, ate / 7, `${ate} of 7 days logged`)

  // Habits (15): days every active habit was ticked, 6 of 7 = full marks
  if (d.habitIds?.length) {
    const hit = count(x => d.habitIds.every(id => d.habitTicks?.[x]?.has(id)))
    add('habits', 'Habits', 15, hit / 6, `${hit} of 7 days all habits done (6 = full)`)
  } else add('habits', 'Habits', 15, 0, 'No habits set', true)

  // Sleep / recovery (10): sleep hours + recovery rating both logged, 5 of 7 = full
  const slept = count(x => filled(daily[x]?.sleep_hours) && filled(daily[x]?.readiness))
  add('sleep', 'Sleep & recovery', 10, slept / 5, `${slept} of 7 days (5 = full)`)

  // Weigh-ins (10): 2 a week = full
  const weighed = count(x => filled(daily[x]?.weight))
  add('weighins', 'Weigh-ins', 10, weighed / 2, `${weighed} weigh-in${weighed === 1 ? '' : 's'} (2 = full)`)

  const live = parts.filter(p => !p.na)
  const max = live.reduce((t, p) => t + p.max, 0)
  const total = max ? Math.round((live.reduce((t, p) => t + p.pts, 0) / max) * 100) : null
  return { total, band: bandOf(total), parts }
}

// ---------------------------------------------------------------- tier moves
// weeks: [{ total, band }] completed weeks, oldest first.
//  - any Red week on Tier 1 or 2 -> straight back to Tier 3
//  - Tier 3 -> 2: 2 Green weeks in a row, and at least 4 weeks in (the Week 4 gate)
//  - Tier 2 -> 1: 4 Green weeks in a row, and at least 4 weeks on Tier 2
export function suggestTier({ tier, tierSince, startDate, weeks, today }) {
  if (!hasTier(tier) || !weeks?.length) return null
  const last = weeks[weeks.length - 1]
  if (last.band === 'red' && tier !== 3) return { to: 3, reason: 'Red week: back to daily check-ins until it settles' }
  let streak = 0
  for (let i = weeks.length - 1; i >= 0 && weeks[i].band === 'green'; i--) streak++
  const since = tierSince || startDate
  const weeksOn = since ? Math.floor(daysBetween(since, today) / 7) : 99
  if (tier === 3 && streak >= 2 && weeksOn >= 4) return { to: 2, reason: `${streak} Green weeks in a row, past the Week 4 gate` }
  if (tier === 2 && streak >= 4 && weeksOn >= 4) return { to: 1, reason: `${streak} Green weeks in a row` }
  return null
}
