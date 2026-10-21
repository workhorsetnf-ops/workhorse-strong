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

// Scale a plan's grams to a client's targets.
//
// Every food is adjusted on its own (not in fixed protein/carb/fat groups),
// so it works for any plan or template: ones with no "Fat" food, custom foods
// filed under Other, fatty proteins, a single meal. Steps:
//   1. scale everything by calories so the day starts near the right size;
//   2. solve for the smallest overall change to every portion that lands
//      protein, carbs and fat on target (spreads the change across the whole
//      plan instead of piling it onto one food), keeping each food between
//      0.4x and 2.5x of that starting amount (veg 0.6x-1.6x), never under 5 g;
//   3. round to 5 g (1 g for small items like oil or whey), then nudge single
//      portions by one step if that cleans up the rounding error.
// Protein counts double, so when a plan can't hit all three, protein wins.
export function scaleToTargets(lines, targets) {
  const T = [Number(targets.p) || 0, Number(targets.c) || 0, Number(targets.f) || 0]
  if (!(T[0] + T[1] + T[2])) return lines
  const per = l => [(Number(l.protein100) || 0) / 100, (Number(l.carbs100) || 0) / 100, (Number(l.fat100) || 0) / 100]
  const P = lines.map(per)
  const g0 = lines.map(l => Math.max(0, Number(l.grams) || 0))
  const idx = g0.map((g, i) => i).filter(i => g0[i] > 0 && (P[i][0] + P[i][1] + P[i][2]) > 0)
  if (!idx.length) return lines

  // 1. calorie scale
  const k0 = idx.reduce((t, i) => t + g0[i] * (P[i][0] * 4 + P[i][1] * 4 + P[i][2] * 9), 0)
  const want = T[0] * 4 + T[1] * 4 + T[2] * 9
  const s = k0 > 0 ? Math.min(4, Math.max(0.25, want / k0)) : 1
  const base = g0.map(g => g * s)

  const veg = i => lines[i].category === 'Veg'
  const fine = g0.map((g, i) => (base[i] < 30 ? 1 : 5))
  const lo = g0.map((g, i) => Math.ceil(Math.max(5, base[i] * (veg(i) ? 0.6 : 0.4)) / fine[i]) * fine[i])
  const hi = g0.map((g, i) => Math.max(lo[i], Math.floor(base[i] * (veg(i) ? 1.6 : 2.5) / fine[i]) * fine[i]))

  // 2. ridge solve on x_i = grams / base, with bounds by fixing clamped foods and re-solving
  const W = [2, 1, 1]
  const S = T.map(t => Math.max(t, 20))
  const LAMBDA = 0.002
  const x = g0.map(() => 1)
  const free = new Set(idx)
  for (let round = 0; round < idx.length + 1; round++) {
    const F = [...free]
    if (!F.length) break
    // residual after the fixed foods and the current free guess of 1
    const r = [0, 1, 2].map(m => T[m] - idx.reduce((t, i) => t + base[i] * P[i][m] * (free.has(i) ? 1 : x[i]), 0))
    // A (3 x |F|), weighted: a_mj = sqrt(W_m) * base_j * P_jm / S_m
    const a = [0, 1, 2].map(m => F.map(j => Math.sqrt(W[m]) * base[j] * P[j][m] / S[m]))
    const b = [0, 1, 2].map(m => Math.sqrt(W[m]) * r[m] / S[m])
    // dx = A' (A A' + λI)^-1 b   (3x3 solve, the minimal change)
    const M = [0, 1, 2].map(p => [0, 1, 2].map(q => a[p].reduce((t, v, k) => t + v * a[q][k], 0) + (p === q ? LAMBDA : 0)))
    const y = solve3(M, b) || [0, 0, 0]
    let clamped = false
    F.forEach((j, k) => {
      const dx = a[0][k] * y[0] + a[1][k] * y[1] + a[2][k] * y[2]
      const v = 1 + dx
      const l = lo[j] / base[j], h = hi[j] / base[j]
      if (v < l || v > h) { x[j] = Math.min(h, Math.max(l, v)); free.delete(j); clamped = true }
      else x[j] = v
    })
    if (!clamped) break
  }

  // 3. round, then clean up rounding with single-step nudges
  const snap = (i, v) => Math.min(hi[i], Math.max(lo[i], Math.round(v / fine[i]) * fine[i]))
  const g = g0.map((v, i) => (idx.includes(i) ? snap(i, base[i] * x[i]) : v))
  const cost = gs => {
    let c = 0
    for (let m = 0; m < 3; m++) c += W[m] * ((idx.reduce((t, i) => t + gs[i] * P[i][m], 0) - T[m]) / S[m]) ** 2
    return c
  }
  let best = cost(g)
  for (let iter = 0; iter < 200; iter++) {
    let pick = null
    for (const i of idx) for (const d of [-1, 1]) {
      const nv = snap(i, g[i] + d * fine[i])
      if (nv === g[i]) continue
      const old = g[i]; g[i] = nv; const c = cost(g); g[i] = old
      if (c < best - 1e-9 && (!pick || c < pick.c)) pick = { i, nv, c }
    }
    if (!pick) break
    g[pick.i] = pick.nv; best = pick.c
  }
  return lines.map((l, i) => (idx.includes(i) ? { ...l, grams: g[i] } : l))
}
function solve3(A, b) {
  const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  const D = det(A)
  if (Math.abs(D) < 1e-12) return null
  return [0, 1, 2].map(c => det(A.map((row, r) => row.map((v, j) => (j === c ? b[r] : v)))) / D)
}
