// The weekly wins card: which week to show, and the numbers on it.
const num = v => (v === null || v === undefined || v === '' ? null : Number(v))
const avg = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

// Fri–Sun shows this week so far; Monday shows last week; other days nothing.
// weekday: 0 = Sunday (Date#getDay). Returns { monday, label } or null.
export function winsWeek(todayStr, weekday, mondayOf, addDays) {
  if (weekday === 5 || weekday === 6 || weekday === 0) return { monday: mondayOf(todayStr), label: 'This week' }
  if (weekday === 1) return { monday: addDays(mondayOf(todayStr), -7), label: 'Last week' }
  return null
}

// d: { days[7], prevDays[7], workoutDates:Set, daily:[...], meals:[...], prs:[...] }
export function winsStats(d) {
  const inWk = r => d.days.includes(r.log_date), inPrev = r => d.prevDays.includes(r.log_date)
  const w = avg(d.daily.filter(inWk).map(r => num(r.weight)).filter(v => v !== null))
  const wp = avg(d.daily.filter(inPrev).map(r => num(r.weight)).filter(v => v !== null))
  const steps = avg(d.daily.filter(inWk).map(r => num(r.steps)).filter(v => v !== null))
  return {
    sessions: d.days.filter(x => d.workoutDates.has(x)).length,
    prs: d.prs.length,
    weightChange: w !== null && wp !== null ? Math.round((w - wp) * 10) / 10 : null,
    steps: steps === null ? null : Math.round(steps),
    foodDays: new Set(d.meals.filter(m => d.days.includes(m.logged_on)).map(m => m.logged_on)).size,
    topPr: d.prs[0] || null,
  }
}
