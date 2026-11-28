// @vitest-environment jsdom
// Update 192: client Profile laid out like CoachRx, plus Equipment, Goals and
// Training schedule pages, and the coach seeing goal + equipment.
import { test, expect, vi, beforeEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { makeSb } from './helpers/fakeSupabase.js'
import { toggleEquipment, EQUIPMENT } from '../src/lib/clientRx'

let sb
vi.mock('../src/lib/supabase', () => ({ supabase: {
  from: t => { const q = sb.from(t); const wrap = () => new Proxy(q, { get: (o, k) => (k === 'then' ? o.then.bind(o) : k in o ? (...a) => { const r = o[k](...a); return r === o ? wrap() : r } : () => wrap()) }); return wrap() },
  rpc: async () => ({ data: [], error: null }),
} }))
const auth = { profile: null, session: { user: { email: 'anthony@workhorse-training.com' } }, signOut: vi.fn(), refreshProfile: vi.fn() }
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => auth }))

import ProfileHub from '../src/pages/client/ProfileHub'
import { ClientEquipment, ClientGoals, ClientSchedule } from '../src/pages/client/ProfilePages'
import CoachClientDay from '../src/pages/coach/CoachClientDay'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const tick = (ms = 25) => act(async () => { await new Promise(r => setTimeout(r, ms)) })
async function mount(node, path = '/') {
  const el = document.createElement('div'); document.body.appendChild(el)
  await act(async () => { createRoot(el).render(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>) })
  for (let i = 0; i < 4; i++) await tick()
  return el
}
const me = { id: 'me', role: 'client', full_name: 'Anthony Henry', phase: 'cut', protein_g: 180, carbs_g: 200, fat_g: 60, steps_target: 10000, goal: 'Look TV ready', equipment: ['Dumbbells'] }
beforeEach(() => {
  sb = makeSb({
    profiles: [{ id: 'coach1', role: 'coach', full_name: 'Anthony Henry' }, { ...me }],
    client_hub: [{ id: 1, booking_url: 'https://cal.example' }], workout_logs: [], session_moves: [], program_assignments: [],
    standalone_form_assignments: [], contracts: [],
  })
  auth.profile = { ...me }
  document.body.innerHTML = ''
})

test('Profile reads like CoachRx: card, coach, compliance, Training rows in order, Account', async () => {
  const el = await mount(<ProfileHub badges={{}} />)
  expect(el.querySelector('h1').textContent).toBe('Profile')
  expect(el.querySelector('[aria-label="Settings"]')).not.toBe(null)
  expect(el.textContent).toContain('anthony@workhorse-training.com')
  expect(el.textContent).toContain('Your Coach')
  expect(el.textContent).toContain('SEE ALL')
  expect(el.textContent).toContain('Workouts Completed'); expect(el.textContent).toContain('Current Streak')
  const sections = [...el.querySelectorAll('section')]
  expect(sections.map(s => s.querySelector('h2').textContent)).toEqual(['Training', 'Coaching', 'Resources', 'Account'])
  const training = [...sections[0].querySelectorAll('a')].map(a => a.textContent.trim())
  expect(training).toEqual(['Health Data', 'Metrics', 'Progress Pictures', 'Intake Forms', 'Equipment', 'Training schedule', 'Goals', 'Documents', 'Book a Call'])
  expect(sections[0].querySelector('a[href="https://cal.example"]')).not.toBe(null)
  const logOut = [...sections[3].querySelectorAll('button')].find(b => b.textContent.includes('Log Out'))
  await act(async () => logOut.click())
  expect(auth.signOut).toHaveBeenCalled()
})

test('Equipment: tick and untick, saved in menu order', async () => {
  const el = await mount(<ClientEquipment />)
  const box = name => [...el.querySelectorAll('[role="checkbox"]')].find(b => b.textContent === name)
  expect(box('Dumbbells').getAttribute('aria-checked')).toBe('true')
  await act(async () => box('Air bike').click()); await tick()
  await act(async () => box('Barbell + plates').click()); await tick()
  expect(sb.db.profiles.find(p => p.id === 'me').equipment).toEqual(['Barbell + plates', 'Dumbbells', 'Air bike'])
  await act(async () => box('Dumbbells').click()); await tick()
  expect(sb.db.profiles.find(p => p.id === 'me').equipment).toEqual(['Barbell + plates', 'Air bike'])
  expect(el.textContent).toContain('Saved')
})

test('Goals: edit your goal; phase, calories and macros shown read-only', async () => {
  const el = await mount(<ClientGoals />)
  expect(el.textContent).toContain('Cut: losing fat')
  expect(el.textContent).toContain('2,060')                 // 180*4 + 200*4 + 60*9
  expect(el.textContent).toContain('180g · 200g · 60g')
  const ta = el.querySelector('#goal')
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, 'Drop to 205 for March'); ta.dispatchEvent(new Event('input', { bubbles: true })) })
  await act(async () => [...el.querySelectorAll('button')].find(b => b.textContent === 'Save goal').click()); await tick()
  expect(sb.db.profiles.find(p => p.id === 'me').goal).toBe('Drop to 205 for March')
})

test('Training schedule: no program yet / AM-PM from the coach', async () => {
  let el = await mount(<ClientSchedule />)
  expect(el.textContent).toContain('hasn’t assigned a program')
  document.body.innerHTML = ''
  sb.db.program_assignments = [{ id: 'a', client_id: 'me', program_id: 'p1', day_map: null, train_times: { 1: 'am', 3: 'both' } }]
  sb.db.program_days = [{ id: 'd1', program_id: 'p1', day_number: 1, day_label: 'Upper', position: 0, track: 'exercise' }]
  el = await mount(<ClientSchedule />)
  expect(el.textContent).toContain('Time of day')
  expect(el.textContent).toMatch(/MondayAM/); expect(el.textContent).toMatch(/WednesdayAM \+ PM/)
})

test('coach Day view shows the client’s goal and equipment', async () => {
  sb.db.profiles[1].equipment = ['Dumbbells', 'Air bike']
  auth.profile = { id: 'coach1', role: 'coach' }
  const el = await mount(<Routes><Route path="/coach/day/:clientId" element={<CoachClientDay />} /></Routes>, '/coach/day/me')
  const facts = el.querySelector('[data-client-facts]')
  expect(facts.textContent).toContain('Goal: Look TV ready')
  expect(facts.textContent).toContain('Equipment: Dumbbells, Air bike')
})

test('equipment toggle keeps menu order and ignores unknowns at the end', () => {
  expect(toggleEquipment(['Air bike'], 'Barbell + plates')).toEqual(['Barbell + plates', 'Air bike'])
  expect(toggleEquipment(['Air bike', 'Barbell + plates'], 'Air bike')).toEqual(['Barbell + plates'])
  expect(toggleEquipment(['Old custom thing'], 'Dumbbells')).toEqual(['Dumbbells', 'Old custom thing'])
  expect(EQUIPMENT.flatMap(([, i]) => i).length).toBeLessThanOrEqual(40)   // fits the database cap
})
