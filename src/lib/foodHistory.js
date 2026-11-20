// Food history: re-log what you've eaten before (Update 185).
// Pure helpers so the screen and the tests use the same rules.
import { isDailyTotals, MEAL_SLOTS } from './foodlog'

// Calendar-day arithmetic on 'YYYY-MM-DD' strings without UTC drift.
export function shiftDate(d, n) {
  const [y, m, day] = d.split('-').map(Number)
  const dt = new Date(y, m - 1, day + n)
  const p = x => String(x).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}

export function dayLabel(d, today) {
  if (d === today) return 'Today'
  if (d === shiftDate(today, -1)) return 'Yesterday'
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

const num = v => Number(v) || 0
// Same food = same name and same macros. "Chicken — 200g" and "Chicken — 150g"
// stay separate on purpose: re-logging should give the exact portion back.
const keyOf = l => [String(l.meal_name || '').trim().toLowerCase(), num(l.protein_g), num(l.carbs_g), num(l.fat_g)].join('|')

// The foods someone logs most, most recent first among equals.
// Each food scores its log count, plus a bonus if it was eaten in the last week.
export function recentFoods(logs, { today, limit = 25 } = {}) {
  const weekAgo = today ? shiftDate(today, -7) : null
  const map = new Map()
  for (const l of logs || []) {
    if (isDailyTotals(l) || !String(l.meal_name || '').trim()) continue
    const k = keyOf(l)
    const cur = map.get(k)
    const when = `${l.logged_on || ''} ${l.logged_at || ''}`
    if (!cur) map.set(k, { ...pick(l), count: 1, last: l.logged_on, when })
    else {
      cur.count++
      if (when > cur.when) Object.assign(cur, pick(l), { last: l.logged_on, when })
    }
  }
  const score = f => f.count + (weekAgo && f.last >= weekAgo ? 3 : 0)
  return [...map.values()]
    .sort((a, b) => score(b) - score(a) || (b.when > a.when ? 1 : b.when < a.when ? -1 : 0))
    .slice(0, limit)
    .map(({ when, ...f }) => f)
}

// The fields of a log line worth carrying over to a new entry.
function pick(l) {
  return {
    meal_name: l.meal_name, meal: l.meal || '',
    protein_g: num(l.protein_g), carbs_g: num(l.carbs_g), fat_g: num(l.fat_g),
    fiber_g: num(l.fiber_g), grams: l.grams == null || l.grams === '' ? null : Number(l.grams),
    estimated: !!l.estimated,
  }
}

// Fresh meal_logs rows for `date`. `slot` overrides each line's meal slot
// (used for one-off foods logged into whatever slot is picked); otherwise each
// line keeps the slot it had. Daily-totals rows are never copied.
export function toLogRows(lines, { clientId, date, slot = null }) {
  return (lines || []).filter(l => !isDailyTotals(l) && String(l.meal_name || '').trim()).map(l => {
    const p = pick(l)
    return { ...p, client_id: clientId, logged_on: date, meal: slot || p.meal || 'Other' }
  })
}

// What a saved meal stores: just the food lines, no ids, dates or slot.
export function savedItems(lines) {
  return (lines || []).filter(l => !isDailyTotals(l) && String(l.meal_name || '').trim()).map(l => {
    const { meal, ...rest } = pick(l)
    return rest
  })
}

export const macroSum = lines => (lines || []).reduce((t, l) => ({
  p: t.p + num(l.protein_g), c: t.c + num(l.carbs_g), f: t.f + num(l.fat_g),
  kcal: t.kcal + num(l.protein_g) * 4 + num(l.carbs_g) * 4 + num(l.fat_g) * 9,
}), { p: 0, c: 0, f: 0, kcal: 0 })

// Case-insensitive "every word appears" filter for the history search.
export function matchFoods(foods, q) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return foods
  return foods.filter(f => { const n = String(f.meal_name || '').toLowerCase(); return words.every(w => n.includes(w)) })
}

export const slotOrder = s => { const i = MEAL_SLOTS.indexOf(s); return i < 0 ? 99 : i }
