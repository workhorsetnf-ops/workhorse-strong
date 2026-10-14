// Meal plan + shopping list maths, matching the coaching sheet.

export const FOOD_CATEGORIES = ['Protein', 'Carb', 'Fruit', 'Veg', 'Fat', 'Dairy', 'Snack', 'Other']

const r1 = n => Math.round(n * 10) / 10

// Macros for one line: grams × (macros per 100 g) / 100. Calories from macros.
export function itemMacros(it) {
  const g = Number(it.grams) || 0
  const p = (g * (Number(it.protein100) || 0)) / 100
  const c = (g * (Number(it.carbs100) || 0)) / 100
  const f = (g * (Number(it.fat100) || 0)) / 100
  const fi = (g * (Number(it.fiber100) || 0)) / 100
  return { p, c, f, fi, kcal: p * 4 + c * 4 + f * 9 }
}

export function sumMacros(items) {
  return items.reduce((t, it) => {
    const m = itemMacros(it)
    return { p: t.p + m.p, c: t.c + m.c, f: t.f + m.f, fi: t.fi + m.fi, kcal: t.kcal + m.kcal }
  }, { p: 0, c: 0, f: 0, fi: 0, kcal: 0 })
}

// Targets: the profile's macros (calories from macros when not set), fiber from the plan.
export function targetsFrom(profile, plan) {
  const p = Number(profile?.protein_g) || 0
  const c = Number(profile?.carbs_g) || 0
  const f = Number(profile?.fat_g) || 0
  const kcal = Number(profile?.calories) || p * 4 + c * 4 + f * 9
  return { kcal, p, c, f, fi: plan?.fiber_target ?? 35 }
}

// Sheet rule: within 5% of target = ON TARGET; fiber just needs 90%+.
export function statusFor(planned, target, rule = 'range') {
  if (!target) return null
  if (rule === 'min') return planned >= target * 0.9 ? 'ON TARGET' : 'ADJUST'
  return Math.abs(planned - target) / target <= 0.05 ? 'ON TARGET' : 'ADJUST'
}

export function planStatus(totals, targets) {
  return {
    kcal: statusFor(totals.kcal, targets.kcal),
    p: statusFor(totals.p, targets.p),
    c: statusFor(totals.c, targets.c),
    f: statusFor(totals.f, targets.f),
    fi: statusFor(totals.fi, targets.fi, 'min'),
  }
}

// Shopping list: every food in the plan, grams per day added up across meals,
// times the days you're shopping for. Grouped by aisle, like the sheet.
export function shoppingList(items, days = 7) {
  const byKey = new Map()
  for (const it of items) {
    const name = (it.food_name || '').trim()
    if (!name || !(Number(it.grams) > 0)) continue
    const key = name.toLowerCase()
    const row = byKey.get(key) || { key, name, category: it.category || 'Other', perDay: 0 }
    row.perDay += Number(it.grams)
    byKey.set(key, row)
  }
  const order = c => { const i = FOOD_CATEGORIES.indexOf(c); return i < 0 ? 99 : i }
  return [...byKey.values()]
    .map(r => ({ ...r, perDay: r1(r.perDay), total: Math.round(r.perDay * days), lb: r1((r.perDay * days) / 453.592) }))
    .sort((a, b) => order(a.category) - order(b.category) || a.name.localeCompare(b.name))
}

// The sheet's sample day: one tap to start a new client's plan, then edit grams.
export const STARTER_PLAN = [
  { label: 'Breakfast', swap: 'Swap: whole wheat bread 100 g + egg whites 200 g + whole eggs 100 g + banana 100 g',
    items: [['Oats (dry)', 80, ''], ['Whey Protein', 35, 'Mix into oats after cooking'], ['Whole Eggs', 100, 'About 2 large eggs'], ['Blueberries', 80, '']] },
  { label: 'Lunch', swap: 'Swap: 93/7 ground beef 230 g + pasta 180 g + mixed vegetables 150 g',
    items: [['Chicken Breast (cooked)', 210, 'Weigh after cooking'], ['White Rice (cooked)', 200, ''], ['Broccoli', 150, ''], ['Olive Oil', 10, 'For cooking']] },
  { label: 'Snack', swap: 'Swap: cottage cheese 250 g + rice cakes 30 g + peanut butter 10 g',
    items: [['Greek Yogurt (nonfat)', 250, ''], ['Banana', 100, ''], ['Almonds', 20, 'About 15 almonds']] },
  { label: 'Dinner', swap: 'Swap: chicken breast 180 g + sweet potato 270 g + broccoli 150 g + olive oil 15 g',
    items: [['93/7 Ground Beef (cooked)', 180, ''], ['Potato (baked)', 250, ''], ['Mixed Vegetables', 150, ''], ['Avocado', 50, '']] },
]

// Copy a library food's per-100 g macros onto a plan line.
export const fromFood = food => ({
  food_id: food.id, food_name: food.name, category: food.category,
  protein100: Number(food.protein) || 0, carbs100: Number(food.carbs) || 0, fat100: Number(food.fat) || 0, fiber100: Number(food.fiber) || 0,
})

export const fmt0 = n => Math.round(n).toLocaleString()
export const fmt1 = n => (Math.round(n * 10) / 10).toString()

// Scale the sample day to a client's targets. Foods are grouped by what they
// mostly bring (protein foods, carb foods, fat foods; veg stays as is) and the
// three groups are scaled together so protein, carbs and fat land on target.
// Grams are rounded to 5 g (oils/whey to 1 g steps of 5 too) and kept sensible.
const GROUP = { Protein: 'p', Dairy: 'p', Carb: 'c', Fruit: 'c', Snack: 'c', Fat: 'f' }
export function scaleToTargets(lines, targets) {
  // lines: [{ grams, category, protein100, carbs100, fat100 }]
  const per = l => [l.protein100 / 100, l.carbs100 / 100, l.fat100 / 100]
  const sums = { p: [0, 0, 0], c: [0, 0, 0], f: [0, 0, 0], fixed: [0, 0, 0] }
  for (const l of lines) {
    const g = GROUP[l.category] || 'fixed'
    per(l).forEach((v, i) => { sums[g][i] += v * l.grams })
  }
  const want = [targets.p, targets.c, targets.f].map((v, i) => (Number(v) || 0) - sums.fixed[i])
  // solve A * s = want, A columns = group macro totals
  const A = [0, 1, 2].map(r => [sums.p[r], sums.c[r], sums.f[r]])
  const s = solve3(A, want) || [1, 1, 1]
  const scale = { p: clamp(s[0]), c: clamp(s[1]), f: clamp(s[2]), fixed: 1 }
  return lines.map(l => {
    const k = scale[GROUP[l.category] || 'fixed']
    return { ...l, grams: Math.max(5, Math.round((l.grams * k) / 5) * 5) }
  })
}
const clamp = v => (Number.isFinite(v) ? Math.min(3, Math.max(0.25, v)) : 1)
function solve3(A, b) {
  const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  const D = det(A)
  if (Math.abs(D) < 1e-9) return null
  return [0, 1, 2].map(c => det(A.map((row, r) => row.map((v, j) => (j === c ? b[r] : v)))) / D)
}
