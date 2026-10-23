// Food log maths, matching the coaching sheet's Food Log tab.

export const MEAL_SLOTS = ['Breakfast', 'Lunch', 'Snack', 'Dinner', 'Pre-Workout', 'Post-Workout', 'Optional', 'Other']
// (Daily totals is deliberately not a slot: it's logged from its own card, not the slot picker.)

// "Daily totals": a client logs the day's protein / carbs / fat in one go
// instead of meal by meal. It's an ordinary meal_logs row with this as its
// meal slot, and it counts as the WHOLE day: any meals also logged that day
// stay visible but aren't added on top.
export const DAILY_TOTALS = 'Daily totals'
export const isDailyTotals = l => l?.meal === DAILY_TOTALS
// The rows that count toward a day's numbers (works on one day or many).
export function countedLogs(logs) {
  const totalsDays = new Set((logs || []).filter(isDailyTotals).map(l => l.logged_on))
  return (logs || []).filter(l => !totalsDays.has(l.logged_on) || isDailyTotals(l))
}

export const kcalOf = l => (Number(l.protein_g) || 0) * 4 + (Number(l.carbs_g) || 0) * 4 + (Number(l.fat_g) || 0) * 9

export function totalsOf(logs) {
  return countedLogs(logs).reduce((t, l) => ({
    items: t.items + 1,
    kcal: t.kcal + kcalOf(l),
    p: t.p + (Number(l.protein_g) || 0),
    c: t.c + (Number(l.carbs_g) || 0),
    f: t.f + (Number(l.fat_g) || 0),
    fi: t.fi + (Number(l.fiber_g) || 0),
  }), { items: 0, kcal: 0, p: 0, c: 0, f: 0, fi: 0 })
}

// Sheet rule: ON TARGET = calories within 5% and protein at 95%+.
export function dayStatus(t, targets) {
  if (!t.items) return null
  if (!targets.kcal) return null
  const calOk = Math.abs(t.kcal - targets.kcal) / targets.kcal <= 0.05
  const proOk = !targets.p || t.p >= targets.p * 0.95
  return calOk && proOk ? 'ON TARGET' : 'OFF'
}

// DAILY TOTALS: one row per day, a week average over logged days, and the count on target.
// Today is still in progress: it only gets a badge (and counts toward the average)
// once it's on target, so a half-logged morning doesn't show OFF or drag the average down.
export function weekTable(logs, days, targets, today = null) {
  const rows = days.map(d => {
    const t = totalsOf(logs.filter(l => l.logged_on === d))
    const st = dayStatus(t, targets)
    return { date: d, ...t, status: d === today && st === 'OFF' ? null : st, inProgress: d === today && st !== 'ON TARGET' }
  })
  const logged = rows.filter(r => r.items && !r.inProgress)
  const avg = k => (logged.length ? logged.reduce((a, r) => a + r[k], 0) / logged.length : null)
  return {
    rows,
    average: logged.length ? { kcal: avg('kcal'), p: avg('p'), c: avg('c'), f: avg('f'), fi: avg('fi') } : null,
    onTarget: rows.filter(r => r.status === 'ON TARGET').length,
    loggedDays: logged.length,
  }
}

// Group a day's lines by meal slot in sheet order (unlabelled lines last).
export function byMeal(logs) {
  const order = m => { if (m === 'Daily totals') return -1; const i = MEAL_SLOTS.indexOf(m); return i < 0 ? 98 : i }
  const groups = new Map()
  for (const l of logs) {
    const k = l.meal || ''
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(l)
  }
  return [...groups.entries()].sort((a, b) => (a[0] ? order(a[0]) : 99) - (b[0] ? order(b[0]) : 99)).map(([meal, items]) => ({ meal, items }))
}

// Turn a meal from the plan into food log lines (one per food).
export function planMealToLogs(meal, items, { clientId, date, itemMacros }) {
  return items.filter(it => it.meal_id === meal.id).map(it => {
    const m = itemMacros(it)
    return {
      client_id: clientId, logged_on: date, meal: meal.label,
      meal_name: `${it.food_name} — ${Number(it.grams)}g`, grams: Number(it.grams),
      protein_g: Math.round(m.p), carbs_g: Math.round(m.c), fat_g: Math.round(m.f), fiber_g: Math.round(m.fi * 10) / 10,
    }
  })
}
