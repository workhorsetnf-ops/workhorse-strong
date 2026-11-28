// @vitest-environment jsdom
// Update 190 on screen: warmup → lifts → cooldown → Finish → Rate Your Effort →
// Great session!; Missed saved; coach day view with marks, effort, calendar,
// AM/PM schedule and a one-off workout that the client then sees on Home.
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
  auth: { getSession: async () => ({ data: { session: null } }) },
  storage: { from: () => loose({}) }, channel: () => loose({ subscribe: () => ({}) }), removeChannel: () => {},
} }))
const auth = { profile: null, session: { user: { email: 'izzy@example.com' } }, signOut: () => {} }
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../src/lib/push', () => ({ callApi: async () => ({}) }))
window.scrollTo = () => {}
globalThis.confirm = () => true

import DailyRx from '../src/pages/client/DailyRx'
import ClientTraining from '../src/pages/client/ClientTraining'
import CoachClientDay from '../src/pages/coach/CoachClientDay'
import { WorkoutStats } from '../src/pages/coach/CoachHome'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const tick = (ms = 25) => act(async () => { await new Promise(r => setTimeout(r, ms)) })
const btns = el => [...el.querySelectorAll('button')]
const btn = (el, text) => btns(el).find(b => b.textContent.trim() === text) || btns(el).find(b => b.textContent.includes(text))
const today = localDateStr()
const wd = weekdayNumber(today)
const typeInto = async (input, v) => act(async () => {
  const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, v)
  input.dispatchEvent(new Event('input', { bubbles: true }))
})

function world(extra = {}) {
  return makeSb({
    profiles: [{ id: 'coach1', role: 'coach', full_name: 'Anthony Henry' }, { id: 'me', role: 'client', full_name: 'Izzy Quinn' }],
    program_assignments: [{ id: 'as1', client_id: 'me', program_id: 'p1', week_mode: 'auto', start_date: addDays(mondayOf(today), -7), current_week: 1, programs: { id: 'p1', name: 'Full Body', notes: '', weeks: 4 } }],
    programs: [{ id: 'p1', name: 'Full Body' }],
    program_blocks: [{ id: 'b1', program_id: 'p1', name: 'Block 1', weeks: 4, position: 0 }],
    program_days: [{ id: 'd1', block_id: 'b1', program_id: 'p1', day_number: wd, day_label: 'First Workout', position: 0, track: 'exercise',
      warmup: '5 min airbike', warmup_video: 'Air Bike | https://v.example/bike\nRing Row | https://v.example/row', cooldown: '5 minutes belly breathing' }],
    program_exercises: [
      { id: 'x1', day_id: 'd1', name: 'Weighted Pull-Up', letter: 'A1', sets: 2, reps: '4-6', rir: '2', rest: '1 min', progression_type: 'rir', position: 0, week_targets: [] },
      { id: 'x2', day_id: 'd1', name: 'Front Squat', letter: 'A2', sets: 2, reps: '6-8', rir: '2', rest: '2 min', progression_type: 'rir', position: 1, week_targets: [] },
    ],
    session_moves: [], workout_logs: [], exercise_comments: [], exercise_flags: [], client_maxes: [], exercise_missed: [], session_feedback: [],
    exercise_library: [{ name: 'Goblet Squat', video_url: 'https://v.example/goblet', icon_url: null }], exercise_alternatives: [], exercise_swaps: [], exercise_block_swaps: [], client_events: [],
    client_cardio_plan: [], daily_logs: [], meal_logs: [], client_hub: [], program_rotations: [],
    ...extra,
  })
}
async function mount(node, path = '/') {
  const el = document.createElement('div'); document.body.appendChild(el)
  await act(async () => { createRoot(el).render(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>) })
  for (let i = 0; i < 4; i++) await tick()
  return el
}
beforeEach(() => { sb = world(); auth.profile = { id: 'me', role: 'client', full_name: 'Izzy Quinn' }; document.body.innerHTML = ''; try { localStorage.clear() } catch { /* */ } })

test('client: warmup step with demos → lifts → cooldown → Rate Your Effort → Great session!', async () => {
  const yest = addDays(today, -7)
  sb.db.workout_logs = [1, 2].map(n => ({ client_id: 'me', exercise_id: 'x1', exercise_name: 'Weighted Pull-Up', set_number: n, weight: 25, reps: 5, logged_date: yest, logged_at: yest + 'T12:00:00' }))
  const el = await mount(<Routes>
    <Route path="/app" element={<DailyRx profile={auth.profile} />} />
    <Route path="/app/training" element={<ClientTraining />} />
  </Routes>, '/app')
  await act(async () => btn(el, 'START WORKOUT').click()); for (let i = 0; i < 6; i++) await tick()

  // step 1: warmup, with its demos behind a toggle
  expect(el.textContent).toContain('1 / 3')
  expect(el.querySelector('h2').textContent).toBe('Warmup')
  await act(async () => btn(el, 'Demo Videos (2)').click())
  expect([...el.querySelectorAll('a')].map(a => a.textContent.trim())).toEqual(expect.arrayContaining(['Air Bike', 'Ring Row']))
  await act(async () => btn(el, 'Next: Superset A').click()); await tick()

  // step 2: superset — Completed on A1, Missed on A2 (saved for the coach)
  await act(async () => btns(el).filter(b => b.textContent.includes('COMPLETED'))[0].click()); await tick()
  await act(async () => btns(el).filter(b => b.textContent.includes('MISSED'))[1].click()); await tick()
  expect(sb.db.exercise_missed).toEqual([expect.objectContaining({ client_id: 'me', exercise_id: 'x2', missed_date: today })])
  await act(async () => btn(el, 'Next: Cooldown').click()); await tick()

  // step 3: cooldown, then Finish Workout
  expect(el.querySelector('h2').textContent).toBe('Cooldown')
  expect(el.textContent).toContain('belly breathing')
  await act(async () => btn(el, 'Finish Workout').click()); await tick()

  expect(el.textContent).toContain('Rate your effort')
  const done = btn(el, 'Done'); expect(done.disabled).toBe(true)
  await act(async () => btns(el).find(b => b.textContent.includes('HARD')).click())
  await typeInto(el.querySelector('input[inputmode="numeric"]'), '20')
  await act(async () => btn(el, 'Done').click()); for (let i = 0; i < 3; i++) await tick()
  expect(sb.db.session_feedback).toEqual([expect.objectContaining({ client_id: 'me', day_id: 'd1', session_date: today, effort: 4, minutes: 20, rpe: 8 })])

  expect(el.textContent).toContain('Great session!')
  expect(el.textContent).toContain('Workout Complete')
  expect(el.textContent).toContain('2 exercises')
  expect(el.querySelector('[data-recap="sessions"]').textContent).toBe('2')   // last week + today
  expect(el.querySelector('[data-recap="streak"]').textContent).toBe('2')
})

test('client: Missed comes back when the workout is reopened', async () => {
  sb.db.exercise_missed = [{ client_id: 'me', exercise_id: 'x2', missed_date: today }]
  const el = await mount(<Routes><Route path="/app/training" element={<ClientTraining />} /></Routes>, '/app/training')
  expect(el.textContent).toContain('Missed')
})

test('coach day view: marks, effort + minutes, comments, calendar, schedule', async () => {
  const past = wd > 1 ? addDays(today, -1) : null
  if (past) sb.db.program_days.push({ id: 'd0', block_id: 'b1', program_id: 'p1', day_number: wd - 1, day_label: 'Yesterday Lift', position: 0, track: 'exercise' })
  if (past) sb.db.program_exercises.push({ id: 'x0', day_id: 'd0', name: 'Bench', letter: 'A', sets: 3, reps: '5', rir: '2', position: 0, week_targets: [] })
  sb.db.workout_logs = [{ client_id: 'me', exercise_id: 'x1', exercise_name: 'Weighted Pull-Up', set_number: 1, weight: 25, reps: 5, logged_date: today, logged_at: today + 'T12:00:00' }]
  sb.db.exercise_missed = [{ client_id: 'me', exercise_id: 'x2', missed_date: today }]
  sb.db.session_feedback = [{ client_id: 'me', day_id: 'd1', session_date: today, effort: 4, minutes: 20, rpe: 8 }]
  sb.db.exercise_comments = [{ exercise_id: 'x1', body: 'nice' }, { exercise_id: 'x2', body: 'knee?' }]
  auth.profile = { id: 'coach1', role: 'coach' }
  const el = await mount(<Routes><Route path="/coach/day/:clientId" element={<CoachClientDay />} /></Routes>, '/coach/day/me')

  expect(el.textContent).toContain('Izzy Quinn')
  expect(el.textContent).toContain('DAILY RX')
  const tabs = el.querySelectorAll('[role="tab"]')
  expect(tabs[wd - 1].dataset.status).toBe('done')
  if (past) expect(tabs[wd - 2].dataset.status).toBe('missed')
  expect(el.querySelector('[data-ex="Weighted Pull-Up"]').dataset.mark).toBe('done')
  expect(el.querySelector('[data-ex="Front Squat"]').dataset.mark).toBe('missed')
  expect(el.textContent).toContain('25×5')
  expect(el.textContent).toContain('HARD')
  expect(el.textContent).toContain('Really had to dig in')
  expect(el.textContent).toContain('20Minutes')
  expect(el.textContent).toContain('WARMUP'); expect(el.textContent).toContain('Air Bike · Ring Row')
  expect(el.querySelector('[data-session="First Workout"] [title="Comments"]').textContent.trim()).toBe('2')
  expect(el.querySelector('[data-streak]').textContent).toContain('Streak: 1')

  if (past) {
    await act(async () => tabs[wd - 2].click()); for (let i = 0; i < 3; i++) await tick()
    expect(el.querySelector('[data-ex="Bench"]').dataset.mark).toBe('missed')
  }

  // calendar pop-up: today marked, TODAY jumps back
  await act(async () => btn(el, 'CALENDAR').click())
  const dlg = el.querySelector('[role="dialog"]')
  expect(dlg.querySelector(`[data-cal="${today}"]`).dataset.status).toBe('done')
  await act(async () => btn(dlg, 'TODAY').click())
  expect(el.querySelector('[role="dialog"]')).toBe(null)

  // AM/PM schedule
  await act(async () => btn(el, 'SCHEDULE').click())
  await act(async () => el.querySelector('[aria-label="Mon AM"]').click())
  await act(async () => el.querySelector('[aria-label="Wed PM"]').click())
  await act(async () => el.querySelector('[aria-label="Wed AM"]').click())
  await act(async () => btn(el, 'Save schedule').click()); await tick()
  expect(sb.db.program_assignments[0].train_times).toEqual({ 1: 'am', 3: 'both' })
  expect(el.textContent).toContain('Saved')
})

test('coach adds a one-off workout with a superset; client sees it on Home; coach can delete it', async () => {
  auth.profile = { id: 'coach1', role: 'coach' }
  const el = await mount(<Routes><Route path="/coach/day/:clientId" element={<CoachClientDay />} /></Routes>, '/coach/day/me')
  // tomorrow (or Sunday's neighbour) so it's a different day from the program session
  const target = wd < 7 ? addDays(today, 1) : addDays(today, -1)
  const tabs = el.querySelectorAll('[role="tab"]')
  await act(async () => tabs[weekdayNumber(target) - 1].click()); await tick()
  await act(async () => btn(el, 'Add New').click()); await tick()
  const form = el.querySelector('[aria-label="Add new workout"]')
  await typeInto(form.querySelector('input[placeholder="Workout Title (Optional)"]'), 'Supersets')
  await typeInto(form.querySelector('[aria-label="Exercise 1"]'), 'Goblet Squat')
  await act(async () => btns(form).find(b => b.textContent.includes('Add New')).click())
  await typeInto(form.querySelector('[aria-label="Exercise 2"]'), 'Cable Lat Pulldown')
  await act(async () => form.querySelector('[aria-label="Link into a superset"]').click())
  expect(form.textContent).toContain('A1'); expect(form.textContent).toContain('A2')
  await act(async () => btn(form, 'Save Workout').click()); for (let i = 0; i < 6; i++) await tick()

  const day = sb.db.program_days.find(d => d.client_id === 'me')
  expect(day).toMatchObject({ on_date: target, day_label: 'Supersets', day_number: weekdayNumber(target), program_id: null, block_id: null })
  const exs = sb.db.program_exercises.filter(x => x.day_id === day.id)
  expect(exs.map(x => [x.name, x.letter])).toEqual([['Goblet Squat', 'A1'], ['Cable Lat Pulldown', 'A2']])
  expect(exs[0].video_url).toBe('https://v.example/goblet')          // picked up from the library
  expect(el.querySelector('[data-session="Supersets"]')).not.toBe(null)

  // the client's Home shows it on that day, as an extra from the coach
  auth.profile = { id: 'me', role: 'client', full_name: 'Izzy Quinn' }
  const home = await mount(<DailyRx profile={auth.profile} />)
  await act(async () => home.querySelectorAll('[role="tab"]')[weekdayNumber(target) - 1].click()); for (let i = 0; i < 3; i++) await tick()
  expect(home.textContent).toContain('Supersets')
  expect(home.textContent).toContain('Extra workout from your coach')
  expect(home.textContent).toContain('Goblet Squat')

  // delete from the coach view
  auth.profile = { id: 'coach1', role: 'coach' }
  await act(async () => el.querySelector('[aria-label="Delete one-off workout"]').click()); for (let i = 0; i < 4; i++) await tick()
  expect(sb.db.program_days.some(d => d.client_id === 'me')).toBe(false)
})

test('client opens a one-off workout from Home (no program block needed)', async () => {
  sb.db.program_days.push({ id: 'o1', client_id: 'me', on_date: today, day_label: 'Extra Arms', day_number: wd, position: 0, track: 'exercise', program_id: null, block_id: null })
  sb.db.program_exercises.push({ id: 'ox', day_id: 'o1', name: 'Curl', letter: 'A', sets: 2, reps: '10', rir: '', position: 0, week_targets: [] })
  const el = await mount(<Routes>
    <Route path="/app" element={<DailyRx profile={auth.profile} />} />
    <Route path="/app/training" element={<ClientTraining />} />
  </Routes>, '/app')
  const start = btns(el).filter(b => b.textContent === 'START WORKOUT')
  expect(start).toHaveLength(2)                          // program session + the one-off
  await act(async () => start[1].click()); for (let i = 0; i < 8; i++) await tick()
  expect(el.textContent).toContain('Curl')
  expect(el.textContent).toContain('1 / 1')
  expect(el.textContent).not.toContain('WEEK 2 OF 4')     // no program-week guide on a one-off
})

test('client with no program still gets a one-off', async () => {
  sb.db.program_assignments = []
  sb.db.program_days.push({ id: 'o1', client_id: 'me', on_date: today, day_label: 'Extra Arms', day_number: wd, position: 0, track: 'exercise', program_id: null, block_id: null })
  sb.db.program_exercises.push({ id: 'ox', day_id: 'o1', name: 'Curl', letter: 'A', sets: 2, reps: '10', rir: '', position: 0, week_targets: [] })
  const el = await mount(<DailyRx profile={auth.profile} />)
  expect(el.textContent).toContain('Extra Arms')
  expect(el.textContent).not.toContain('No program yet')
})

test('AM/PM shows on the client’s Daily Rx', async () => {
  sb.db.program_assignments[0].train_times = { [wd]: 'pm' }
  const el = await mount(<DailyRx profile={auth.profile} />)
  expect(el.textContent).toContain('PM · Workout')
})

test('activity feed card: effort, minutes and a 7-day load trend', async () => {
  const el = await mount(<WorkoutStats clientId="me" w={{ effort: 1, minutes: 60, trend: [{ date: 'a', value: 0 }, { date: 'b', value: 500 }, { date: 'c', value: 1000 }] }} />)
  expect(el.textContent).toContain('EASY'); expect(el.textContent).toContain('Could do this all day')
  expect(el.textContent).toContain('60'); expect(el.textContent).toContain('LOAD TREND')
  const bars = el.querySelectorAll('[aria-label="Load trend"] span')
  expect([...bars].map(b => b.style.height)).toEqual(['2px', '50%', '100%'])
  expect(el.querySelector('a[href="/coach/day/me"]')).not.toBe(null)
})
