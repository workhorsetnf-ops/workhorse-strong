// @vitest-environment jsdom
// Food history (Update 185): recent foods, copying past days, saved meals.
import { test, vi, beforeEach } from 'vitest'
import assert from 'node:assert/strict'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { makeSb } from './helpers/fakeSupabase.js'
import { shiftDate, dayLabel, recentFoods, toLogRows, savedItems, macroSum, matchFoods } from '../src/lib/foodHistory'

let sb
vi.mock('../src/lib/supabase', () => ({ supabase: { from: (...a) => sb.from(...a) } }))
import FoodHistoryCard from '../src/pages/client/FoodHistoryCard'

const TODAY = '2026-11-20'
const L = (o) => ({ client_id: 'u1', meal: 'Breakfast', protein_g: 0, carbs_g: 0, fat_g: 0, logged_at: `${o.logged_on}T08:00:00Z`, ...o })

// ---------- pure helpers
test('shiftDate crosses months, years and the DST change without drifting', () => {
  assert.equal(shiftDate('2026-11-01', -1), '2026-10-31')
  assert.equal(shiftDate('2026-01-01', -1), '2025-12-31')
  assert.equal(shiftDate('2026-11-02', -1), '2026-11-01')   // US DST ends Nov 1 2026
  assert.equal(shiftDate('2026-03-08', 1), '2026-03-09')
})

test('dayLabel says Today / Yesterday, then a date', () => {
  assert.equal(dayLabel(TODAY, TODAY), 'Today')
  assert.equal(dayLabel('2026-11-19', TODAY), 'Yesterday')
  assert.match(dayLabel('2026-11-12', TODAY), /Nov/)
})

test('recentFoods ranks by how often you eat it, with a boost for this week, and skips daily totals', () => {
  const logs = [
    ...[1, 2, 3, 4].map(d => L({ meal_name: 'Oats — 80g', protein_g: 10, carbs_g: 54, fat_g: 6, logged_on: shiftDate(TODAY, -30 - d) })),
    L({ meal_name: 'Eggs x3', protein_g: 18, fat_g: 15, logged_on: '2026-11-19' }),
    L({ meal_name: 'Eggs x3', protein_g: 18, fat_g: 15, logged_on: '2026-11-18' }),
    L({ meal_name: 'Steak', protein_g: 50, fat_g: 20, logged_on: '2026-09-01' }),
    L({ meal: 'Daily totals', meal_name: 'From Apple Health', protein_g: 200, logged_on: '2026-11-19' }),
  ]
  const r = recentFoods(logs, { today: TODAY })
  assert.deepEqual(r.map(f => f.meal_name), ['Eggs x3', 'Oats — 80g', 'Steak'])
  assert.equal(r[0].count, 2); assert.equal(r[0].last, '2026-11-19')
})

test('same name with different portions stays separate; same food is merged case-insensitively', () => {
  const r = recentFoods([
    L({ meal_name: 'Chicken — 200g', protein_g: 62, logged_on: '2026-11-19' }),
    L({ meal_name: 'chicken — 200g ', protein_g: 62, logged_on: '2026-11-18' }),
    L({ meal_name: 'Chicken — 150g', protein_g: 46, logged_on: '2026-11-17' }),
  ], { today: TODAY })
  assert.equal(r.length, 2)
  assert.equal(r.find(f => f.protein_g === 62).count, 2)
})

test('toLogRows makes fresh rows for today: no ids, keeps slot unless overridden, drops daily totals', () => {
  const src = [
    { id: 'a', logged_on: '2026-11-19', logged_at: 'x', meal: 'Lunch', meal_name: 'Rice — 200g', protein_g: 5, carbs_g: 56, fat_g: 1, grams: 200, source: 'photo', estimated: true },
    { id: 'b', logged_on: '2026-11-19', meal: 'Daily totals', meal_name: 'Daily totals', protein_g: 180 },
  ]
  const kept = toLogRows(src, { clientId: 'u1', date: TODAY })
  assert.equal(kept.length, 1)
  assert.deepEqual(kept[0], { meal_name: 'Rice — 200g', meal: 'Lunch', protein_g: 5, carbs_g: 56, fat_g: 1, fiber_g: 0, grams: 200, estimated: true, client_id: 'u1', logged_on: TODAY })
  assert.equal(toLogRows(src, { clientId: 'u1', date: TODAY, slot: 'Dinner' })[0].meal, 'Dinner')
})

test('savedItems strips slot/ids; macroSum and matchFoods', () => {
  const items = savedItems([{ id: 'a', meal: 'Breakfast', meal_name: 'Oats', protein_g: 10, carbs_g: 54, fat_g: 6 }])
  assert.equal(items[0].meal, undefined); assert.equal(items[0].id, undefined)
  assert.deepEqual(macroSum(items), { p: 10, c: 54, f: 6, kcal: 310 })
  const foods = [{ meal_name: 'Greek yogurt (Fage) — 200g' }, { meal_name: 'Chicken breast — 200g' }]
  assert.deepEqual(matchFoods(foods, 'fage yog').map(f => f.meal_name), ['Greek yogurt (Fage) — 200g'])
  assert.equal(matchFoods(foods, '').length, 2)
})

// ---------- the card
globalThis.IS_REACT_ACT_ENVIRONMENT = true
async function mount(node) {
  const el = document.createElement('div'); document.body.appendChild(el)
  await act(async () => { createRoot(el).render(node) })
  await act(async () => { await new Promise(r => setTimeout(r, 10)) })
  return el
}
const click = async (el) => { await act(async () => { el.click(); await new Promise(r => setTimeout(r, 10)) }) }
const byText = (root, t) => [...root.querySelectorAll('button')].find(b => b.textContent.trim() === t)
const todays = () => sb.db.meal_logs.filter(l => l.logged_on === TODAY)

beforeEach(() => {
  document.body.innerHTML = ''
  sb = makeSb({
    meal_logs: [
      L({ id: 'y1', meal: 'Breakfast', meal_name: 'Oats — 80g', protein_g: 10, carbs_g: 54, fat_g: 6, logged_on: '2026-11-19' }),
      L({ id: 'y2', meal: 'Breakfast', meal_name: 'Whey — 1× serving', protein_g: 25, carbs_g: 3, fat_g: 1, logged_on: '2026-11-19' }),
      L({ id: 'y3', meal: 'Dinner', meal_name: 'Salmon — 200g', protein_g: 40, fat_g: 26, logged_on: '2026-11-19' }),
      L({ id: 'o1', meal: 'Lunch', meal_name: 'Turkey wrap', protein_g: 35, carbs_g: 40, fat_g: 12, logged_on: '2026-11-15' }),
      L({ id: 'x1', client_id: 'someone-else', meal_name: 'Not mine', logged_on: '2026-11-19' }),
    ],
    saved_meals: [],
  })
  vi.spyOn(window, 'prompt').mockReturnValue('Usual breakfast')
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

test('Recent lists only your foods and + logs one into the chosen slot', async () => {
  let logged = 0
  const el = await mount(<FoodHistoryCard profile={{ id: 'u1' }} today={TODAY} slot="Snack" onLogged={() => logged++} />)
  assert.ok(el.textContent.includes('Oats — 80g')); assert.ok(!el.textContent.includes('Not mine'))
  await click(el.querySelector('[aria-label="Add Salmon — 200g"]'))
  assert.equal(todays().length, 1)
  assert.equal(todays()[0].meal, 'Snack'); assert.equal(todays()[0].protein_g, 40)
  assert.equal(logged, 1)
})

test('Past days opens on yesterday, copies the whole day with slots kept, and steps back to older days', async () => {
  const el = await mount(<FoodHistoryCard profile={{ id: 'u1' }} today={TODAY} slot="Snack" />)
  await click(byText(el, 'Past days'))
  assert.ok(el.textContent.includes('Yesterday'))
  assert.ok(byText(el, '›').disabled)   // can't step into today or the future
  await click(byText(el, 'Copy the whole day to today'))
  assert.deepEqual(todays().map(l => [l.meal, l.meal_name]).sort(), [['Breakfast', 'Oats — 80g'], ['Breakfast', 'Whey — 1× serving'], ['Dinner', 'Salmon — 200g']])
  for (let i = 0; i < 4; i++) await click(byText(el, '‹'))
  assert.ok(el.textContent.includes('Turkey wrap'))
})

test('Copy on one meal copies just that meal', async () => {
  const el = await mount(<FoodHistoryCard profile={{ id: 'u1' }} today={TODAY} slot="Snack" />)
  await click(byText(el, 'Past days'))
  const copies = [...el.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Copy')
  await click(copies[0])   // Breakfast comes first
  assert.deepEqual(todays().map(l => l.meal_name).sort(), ['Oats — 80g', 'Whey — 1× serving'])
})

test('Save a meal from a past day, then log it in one tap from Saved meals', async () => {
  const el = await mount(<FoodHistoryCard profile={{ id: 'u1' }} today={TODAY} slot="Breakfast" />)
  await click(byText(el, 'Past days'))
  await click([...el.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save'))
  assert.equal(sb.db.saved_meals.length, 1)
  assert.equal(sb.db.saved_meals[0].name, 'Usual breakfast'); assert.equal(sb.db.saved_meals[0].items.length, 2)
  await click(byText(el, 'Saved meals'))
  assert.ok(el.textContent.includes('Usual breakfast')); assert.ok(el.textContent.includes('2 foods'))
  await click(el.querySelector('[aria-label="Log Usual breakfast"]'))
  assert.deepEqual(todays().map(l => l.meal_name).sort(), ['Oats — 80g', 'Whey — 1× serving'])
  await click(el.querySelector('[aria-label="Delete Usual breakfast"]'))
  assert.equal(sb.db.saved_meals.length, 0)
})
