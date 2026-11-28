// @vitest-environment jsdom
// Update 189 on screen: Home week strip + Daily Rx, START WORKOUT straight into
// the step-through (Missed / Completed / Comments), the Profile hub, Trends, and
// the 5-tab bottom bar.
import { test, expect, vi, beforeEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { makeSb } from './helpers/fakeSupabase.js'
import { localDateStr, mondayOf, weekdayNumber } from '../src/lib/weeks'
import { addDays } from '../src/lib/dashboard'

let sb
const loose = o => new Proxy(o, { get: (t, k) => (k in t ? t[k] : () => loose(t)) })
vi.mock('../src/lib/supabase', () => ({ supabase: {
  from: t => { const q = sb.from(t); return new Proxy(q, { get: (o, k) => (k in o ? o[k] : () => q) }) },
  rpc: async () => ({ data: [], error: null }),
  auth: { getSession: async () => ({ data: { session: null } }), updateUser: async () => ({}) },
  storage: { from: () => loose({}) },
  channel: () => loose({ subscribe: () => ({}) }), removeChannel: () => {},
} }))
const auth = { profile: null, session: { user: { email: 'izzy@example.com' } }, signOut: () => {}, refreshProfile: async () => {} }
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../src/lib/push', () => ({ callApi: async () => ({}) }))

import DailyRx, { rxLine } from '../src/pages/client/DailyRx'
import ClientTraining from '../src/pages/client/ClientTraining'
import ProfileHub from '../src/pages/client/ProfileHub'
import ClientTrends from '../src/pages/client/ClientTrends'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const tick = (ms = 25) => act(async () => { await new Promise(r => setTimeout(r, ms)) })
const btn = (el, text) => [...el.querySelectorAll('button')].find(b => b.textContent.trim() === text || b.textContent.includes(text))
const today = localDateStr()
const wd = weekdayNumber(today)   // 1 = Monday

function world(extra = {}) {
  return makeSb({
    profiles: [{ id: 'coach1', role: 'coach', full_name: 'Anthony Henry' }, { id: 'me', role: 'client', full_name: 'Izzy Quinn' }],
    program_assignments: [{ id: 'as1', client_id: 'me', program_id: 'p1', week_mode: 'auto', start_date: mondayOf(today), current_week: 1, programs: { id: 'p1', name: 'Full Body', notes: '', weeks: 4 } }],
    programs: [{ id: 'p1', name: 'Full Body', notes: '' }],
    program_blocks: [{ id: 'b1', program_id: 'p1', name: 'Block 1', weeks: 4, position: 0 }],
    program_days: [
      { id: 'd1', block_id: 'b1', day_number: wd, day_label: 'First Workout', position: 0, track: 'exercise',
        warmup: '5 min airbike', cooldown: '5 minutes belly breathing' },
      ...(wd > 1 ? [{ id: 'd0', block_id: 'b1', day_number: wd - 1, day_label: 'Yesterday Lift', position: 0, track: 'exercise' }] : []),
    ],
    program_exercises: [
      { id: 'x1', day_id: 'd1', name: 'Weighted Pull-Up', letter: 'A1', sets: 4, reps: '4-6', rir: '2', rest: '1 min', progression_type: 'rir', position: 0, week_targets: [] },
      { id: 'x2', day_id: 'd1', name: 'Front Squat', letter: 'A2', sets: 4, reps: '6-8', rir: '2', rest: '2 min', progression_type: 'rir', position: 1, week_targets: [] },
      { id: 'x3', day_id: 'd1', name: '10 Min AMRAP', letter: 'B', kind: 'conditioning', sets: 1, reps: '1', description: '10 burpees\n15 kettlebell swings', position: 2, week_targets: [] },
    ],
    session_moves: [], workout_logs: [], exercise_comments: [], exercise_flags: [], client_maxes: [],
    exercise_library: [], exercise_alternatives: [], exercise_swaps: [], exercise_block_swaps: [], client_events: [],
    client_cardio_plan: [], daily_logs: [], meal_logs: [], client_hub: [{ id: 1, booking_url: 'https://cal.example/izzy' }],
    ...extra,
  })
}
async function mount(node, path = '/app') {
  const el = document.createElement('div'); document.body.appendChild(el)
  await act(async () => { createRoot(el).render(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>) })
  await tick(); await tick(); await tick()
  return el
}
beforeEach(() => { sb = world(); auth.profile = { id: 'me', role: 'client', full_name: 'Izzy Quinn', steps_target: 10000, protein_g: 150, carbs_g: 200, fat_g: 60 }; document.body.innerHTML = '' })

test('rx line reads like the program', () => {
  expect(rxLine({ sets: 4, reps: '4-6', rir: '2', rest: '1 min', progression_type: 'rir' }, 1)).toBe('4 × 4-6 @ RIR 2 · rest 1 min')
  expect(rxLine({ sets: 3, reps: '5', rir: '80', progression_type: 'percent', week_targets: [{}, { sets: 5, reps: '3', target: '85' }] }, 2)).toBe('5 × 3 @ 85%')
})

test('Home: greeting, week strip, and the whole session laid out', async () => {
  const el = await mount(<DailyRx profile={auth.profile} />)
  expect(el.textContent).toContain('Hi Izzy,')
  expect(el.textContent).toContain('Your Daily Rx')
  const tabs = el.querySelectorAll('[role="tab"]')
  expect(tabs).toHaveLength(7)
  expect(tabs[wd - 1].getAttribute('aria-selected')).toBe('true')
  expect(tabs[wd - 1].dataset.status).toBe('planned')
  if (wd > 1) expect(tabs[wd - 2].dataset.status).toBe('missed')
  for (const t of ['First Workout', 'START WORKOUT', 'WARMUP', '5 min airbike', 'Weighted Pull-Up', '4 × 4-6 @ RIR 2 · rest 1 min', 'Front Squat', '10 burpees', 'COOLDOWN', 'belly breathing']) expect(el.textContent).toContain(t)
  // the A1→A2 connector line is drawn, B stands alone
  expect(el.querySelectorAll('span[aria-hidden="true"]').length).toBeGreaterThanOrEqual(1)
})

test('Home: a logged day shows ✓, and tapping another day shows its Rx', async () => {
  sb = world({ workout_logs: [{ client_id: 'me', exercise_id: 'x1', set_number: 1, weight: 25, reps: 5, logged_date: today, logged_at: today + 'T12:00:00' }] })
  const el = await mount(<DailyRx profile={auth.profile} />)
  const tabs = el.querySelectorAll('[role="tab"]')
  expect(tabs[wd - 1].dataset.status).toBe('done')
  expect(el.textContent).toContain('OPEN WORKOUT')
  const restIdx = wd === 7 ? 0 : 6   // a day with nothing on it
  if (restIdx !== wd - 1 && restIdx !== wd - 2) {
    await act(async () => tabs[restIdx].click()); await tick()
    expect(el.textContent).toContain('Nothing Rx’d today')
  }
})

test('START WORKOUT opens step 1 with Missed / Completed / Comments', async () => {
  // last session's numbers so Completed has something to fill in
  const yest = addDays(today, -7)
  sb = world({ workout_logs: [1, 2, 3, 4].map(n => ({ client_id: 'me', exercise_id: 'x1', exercise_name: 'Weighted Pull-Up', set_number: n, weight: 25, reps: 5, logged_date: yest, logged_at: yest + 'T12:00:00' })) })
  try { localStorage.removeItem('ws_train_view') } catch { /* */ }
  const el = await mount(
    <Routes>
      <Route path="/app" element={<DailyRx profile={auth.profile} />} />
      <Route path="/app/training" element={<ClientTraining />} />
    </Routes>)
  await act(async () => btn(el, 'START WORKOUT').click())
  for (let i = 0; i < 6; i++) await tick()
  expect(el.textContent).toContain('EXIT')
  // Update 190: the warmup is step 1 of 4 (warmup, A, B, cooldown)
  expect(el.textContent).toContain('1 / 4')
  expect(el.textContent).toContain('5 min airbike')
  await act(async () => btn(el, 'Next: Superset A').click()); await tick()
  expect(el.textContent).toContain('2 / 4')
  expect(el.textContent).toContain('Superset A')
  expect(el.textContent).toContain('COMPLETED')
  expect(el.textContent).toContain('MISSED')
  expect(el.textContent).toContain('Comments (0)')

  const completed = [...el.querySelectorAll('button')].filter(b => b.textContent.includes('COMPLETED'))
  const missed = [...el.querySelectorAll('button')].filter(b => b.textContent.includes('MISSED'))
  // A1 has history: Completed ticks all 4 sets
  await act(async () => completed[0].click()); await tick()
  expect(completed[0].getAttribute('aria-pressed')).toBe('true')
  // A2 has nothing to fill: says so rather than silently doing nothing
  await act(async () => completed[1].click()); await tick()
  expect(completed[1].getAttribute('aria-pressed')).toBe('false')
  expect(el.textContent).toContain('Add your weight and reps for each set')
  await act(async () => missed[1].click()); await tick()
  expect(missed[1].getAttribute('aria-pressed')).toBe('true')

  // comments open right under the button
  await act(async () => btn(el, 'Comments (0) · A1').click()); await tick()
  expect(el.textContent).toContain('No notes on this exercise yet.')

  // EXIT -> overview shows A1 done, A2 missed, warmup + cooldown blocks
  await act(async () => btn(el, 'EXIT').click()); await tick()
  expect(el.textContent).toContain('WARMUP')
  expect(el.textContent).toContain('COOLDOWN')
  expect(el.textContent).toContain('Done')
  expect(el.textContent).toContain('Missed')
})

test('Profile hub: coach, compliance tiles and the moved screens', async () => {
  const days = [addDays(today, -2), addDays(today, -1)]
  sb = world({ workout_logs: days.map(d => ({ client_id: 'me', exercise_id: 'x1', set_number: 1, weight: 1, reps: 1, logged_date: d, logged_at: d + 'T10:00:00' })) })
  const el = await mount(<ProfileHub badges={{ checkin: true }} />)
  expect(el.textContent).toContain('Izzy Quinn')
  expect(el.textContent).toContain('izzy@example.com')
  expect(el.textContent).toContain('Your Coach')
  expect(el.textContent).toContain('Anthony Henry')
  expect(el.querySelector('[data-stat="Workouts Completed"]').textContent).toBe('2')
  for (const t of ['Weekly check-in', 'Form checks', 'Leaderboard', 'Progress Pictures', 'Documents', 'Book a Call', 'Log Out']) expect(el.textContent).toContain(t)
  expect(el.querySelector('[aria-label="needs attention"]')).not.toBe(null)
  expect(el.querySelector('a[href="https://cal.example/izzy"]')).not.toBe(null)
})

test('Profile hub: group members don’t see 1:1 screens', async () => {
  auth.profile = { ...auth.profile, plan: 'group' }
  const el = await mount(<ProfileHub />)
  for (const t of ['Weekly check-in', 'Form checks', 'Contracts', 'Bloodwork', 'Book a Call']) expect(el.textContent).not.toContain(t)
  expect(el.textContent).toContain('Leaderboard')
})

test('Trends: Day / Week / Month over what was logged', async () => {
  sb = world({
    daily_logs: [
      { client_id: 'me', log_date: today, steps: 12000, sleep_hours: 8, readiness: 4, weight: 200 },
      { client_id: 'me', log_date: addDays(today, -1), steps: 8000, sleep_hours: 6, readiness: 2, weight: 201 },
      { client_id: 'me', log_date: addDays(today, -20), steps: 4000 },
    ],
    meal_logs: [{ client_id: 'me', logged_on: today, protein_g: 100, carbs_g: 100, fat_g: 50, meal: 'Lunch' }],
  })
  const el = await mount(<ClientTrends />)
  const radio = l => [...el.querySelectorAll('[role="radio"]')].find(b => b.textContent === l)
  expect(radio('Week').getAttribute('aria-checked')).toBe('true')
  expect(el.textContent).toContain('10,000')          // (12000 + 8000) / 2
  expect(el.textContent).toContain('goal 10,000')
  expect(el.textContent).toContain('1,250')           // 100*4 + 100*4 + 50*9
  expect(el.textContent).toContain('target 1,940')       // 150*4 + 200*4 + 60*9
  await act(async () => radio('Day').click()); await tick()
  expect(el.textContent).toContain('12,000')
  await act(async () => radio('Month').click()); await tick()
  expect(el.textContent).toContain('8,000')           // (12000 + 8000 + 4000) / 3
  expect(el.textContent).toContain('Log today')
})
