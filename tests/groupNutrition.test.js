// Group nutrition (Update 181): the starter meal plan template and the guide.
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { marked } from 'marked'
import { STARTER_GROUP_PLAN, DEFAULT_GUIDE } from '../src/lib/nutritionGuide.js'
import { scaleToTargets, sumMacros } from '../src/lib/mealplan.js'
import { starterTargets } from '../api/_group.js'
import { applySnapshot } from '../src/lib/plans.js'
import { makeSb } from './helpers/fakeSupabase.js'

const lines = () => STARTER_GROUP_PLAN.meals.flatMap(m => m.items)
const within = (got, want, pct) => Math.abs(got - want) <= Math.max(5, want * pct)

test('written at 200 P / 280 C / 70 F (within 5 g), 35 g+ fiber', () => {
  const t = sumMacros(lines())
  assert.ok(Math.abs(t.p - 200) <= 5, `protein ${t.p}`)
  assert.ok(Math.abs(t.c - 280) <= 5, `carbs ${t.c}`)
  assert.ok(Math.abs(t.f - 70) <= 5, `fat ${t.f}`)
  assert.ok(t.fi >= 35, `fiber ${t.fi}`)
})

test('every food has real per-100 g macros, a category and a sensible portion', () => {
  for (const it of lines()) {
    assert.ok(it.food_name && it.category, it.food_name)
    assert.ok(it.grams > 0 && it.grams <= 400, it.food_name)
    const kcalPer100 = it.protein100 * 4 + it.carbs100 * 4 + it.fat100 * 9
    assert.ok(kcalPer100 > 10 && kcalPer100 <= 900, it.food_name)
  }
})

test('swap lines carry no gram amounts, so they stay right after scaling', () => {
  for (const m of STARTER_GROUP_PLAN.meals) {
    assert.ok(m.swap.startsWith('Swap:'), m.label)
    assert.ok(!/\d+\s?g\b/.test(m.swap), `${m.label}: ${m.swap}`)
  }
})

// members across the range the sign-up form produces, through the same
// macro method and the same scaling the app uses at join
const members = [
  ['140 lb woman, cutting', { weight: 140, height_ft: 5, height_in: 5, age: 26, sex: 'female', activity: 'light-schedule', goal: 'cut' }],
  ['175 lb man, recomp', { weight: 175, height_ft: 5, height_in: 10, age: 31, sex: 'male', activity: 'working-talent', goal: 'maintain' }],
  ['215 lb man, cutting', { weight: 215, height_ft: 6, height_in: 1, age: 28, sex: 'male', activity: 'heavy-schedule', goal: 'cut' }],
  ['265 lb heavyweight, building', { weight: 265, height_ft: 6, height_in: 4, age: 34, sex: 'male', activity: 'working-talent', goal: 'build' }],
]
for (const [who, n] of members) {
  test(`scales to a ${who}`, () => {
    const t = starterTargets(n)
    const scaled = scaleToTargets(lines(), { p: t.protein_g, c: t.carbs_g, f: t.fat_g })
    const got = sumMacros(scaled)
    assert.ok(within(got.p, t.protein_g, 0.05), `protein ${got.p} vs ${t.protein_g}`)
    assert.ok(within(got.c, t.carbs_g, 0.05), `carbs ${got.c} vs ${t.carbs_g}`)
    assert.ok(within(got.f, t.fat_g, 0.05), `fat ${got.f} vs ${t.fat_g}`)
    for (const it of scaled) assert.ok(it.grams >= 5, `${it.food_name} ${it.grams}`)
  })
}

test('given to a member at join: their own plan, sized to their macros', async () => {
  const sb = makeSb({ profiles: [{ id: 'u1', protein_g: 150, carbs_g: 180, fat_g: 52, calories: 1800 }], meal_plans: [], meal_plan_meals: [], meal_plan_items: [] })
  await applySnapshot(sb, 'u1', 'meal_plan', STARTER_GROUP_PLAN, { scale: true })
  assert.deepEqual(sb.db.meal_plan_meals.map(m => m.label), ['Breakfast', 'Lunch', 'Snack', 'Dinner'])
  const got = sumMacros(sb.db.meal_plan_items)
  assert.ok(within(got.p, 150, 0.05) && within(got.c, 180, 0.05) && within(got.f, 52, 0.05), JSON.stringify(got))
})

test('the guide renders with its sections', () => {
  const html = marked.parse(DEFAULT_GUIDE)
  for (const h of ['Your numbers', 'The daily standard', 'How to use your meal plan', 'When to adjust', 'On the road']) assert.ok(html.includes(`<h2>${h}</h2>`), h)
  assert.ok(!/<script/i.test(html))
})
