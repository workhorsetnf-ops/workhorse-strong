// @vitest-environment jsdom
// Update 191 on screen: CoachRx-style top bar + section menus + drop-downs,
// the Clients table (stats, due pills, compliance, tags, search, archive),
// Business overview, and Weekly Check-In cards on the Dashboard feed.
import { test, expect, vi, beforeEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { makeSb } from './helpers/fakeSupabase.js'
import { localDateStr, mondayOf, weekdayNumber } from '../src/lib/weeks'
import { addDays } from '../src/lib/dashboard'

let sb
const rpcCalls = []
const loose = o => new Proxy(o, { get: (t, k) => (k in t ? t[k] : () => loose(t)) })
vi.mock('../src/lib/supabase', () => ({ supabase: {
  from: t => { const q = sb.from(t); const wrap = () => new Proxy(q, { get: (o, k) => (k === 'then' ? o.then.bind(o) : k in o ? (...a) => { const r = o[k](...a); return r === o ? wrap() : r } : () => wrap()) }); return wrap() },
  rpc: async (name, args) => { rpcCalls.push([name, args]); if (name === 'mark_messages_read') sb.db.messages.forEach(m => { if (m.sender_id === args.other_id) m.read_at = 'now' }); return { data: 1, error: null } },
  auth: { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: { id: 'coach1' } } }) },
  storage: { from: () => loose({}) }, channel: () => loose({ subscribe: () => ({}) }), removeChannel: () => {},
}, setProgramsLocked: () => {} }))
let badges = {}
vi.mock('../src/lib/coachBadges', () => ({ loadCoachBadges: async () => badges, markSectionSeen: async () => {} }))
vi.mock('../src/lib/push', () => ({ callApi: async () => ({}), notifyEvent: () => {}, clearShownNotifications: () => {}, pushStatus: () => 'unsupported', isSubscribed: async () => false }))
const auth = { profile: { id: 'coach1', role: 'coach', full_name: 'Anthony Henry' }, inboxId: 'coach1', isHeadCoach: true, programsLocked: false, signOut: vi.fn() }
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => auth }))
window.scrollTo = () => {}
globalThis.confirm = () => true

import CoachDashboard from '../src/pages/coach/CoachDashboard'
import ClientsTable from '../src/pages/coach/ClientsTable'
import CoachBusiness from '../src/pages/coach/CoachBusiness'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const tick = (ms = 25) => act(async () => { await new Promise(r => setTimeout(r, ms)) })
const btn = (el, text) => [...el.querySelectorAll('button')].find(b => b.textContent.trim() === text) || [...el.querySelectorAll('button')].find(b => b.textContent.includes(text))
const today = localDateStr()
const wd = weekdayNumber(today)

function world(extra = {}) {
  return makeSb({
    profiles: [
      { id: 'coach1', role: 'coach', full_name: 'Anthony Henry' },
      { id: 'c1', role: 'client', full_name: 'Charles Quinn', email: 'cq@x.com', status: 'active', tags: ['AEW'], created_at: addDays(today, -90) + 'T00:00:00Z', checkin_day: null },
      { id: 'c2', role: 'client', full_name: 'Kenneth Cooper', email: 'kc@x.com', status: 'active', tags: [], created_at: addDays(today, -90) + 'T00:00:00Z' },
      { id: 'c3', role: 'client', full_name: 'Old Client', email: 'old@x.com', status: 'exited', tags: [], created_at: '2026-01-01T00:00:00Z' },
    ],
    program_assignments: [{ id: 'a1', client_id: 'c1', program_id: 'p1', week_mode: 'auto', start_date: addDays(mondayOf(today), -28), current_week: 1 }],
    programs: [{ id: 'p1', name: 'Full Body' }],
    program_blocks: [{ id: 'b1', program_id: 'p1', name: 'Block 1', weeks: 12, position: 0 }],
    program_days: [1, 2, 3, 4, 5, 6, 7].map(n => ({ id: 'd' + n, block_id: 'b1', program_id: 'p1', day_number: n, day_label: 'Day ' + n, position: 0, track: 'exercise' })),
    program_rotations: [], session_moves: [],
    workout_logs: [1, 2, 3].map(i => ({ client_id: 'c1', exercise_id: 'x', set_number: 1, weight: 100, reps: 5, logged_date: addDays(today, -i), logged_at: addDays(today, -i) + 'T12:00:00', session_track: 'exercise' })),
    meal_logs: [{ client_id: 'c2', logged_on: addDays(today, -1), protein_g: 30, carbs_g: 10, fat_g: 5, meal: 'Lunch' }],
    checkins: [{ id: 'k1', client_id: 'c2', submitted_at: addDays(today, -1) + 'T15:00:00Z', energy: 9, sleep_avg: 7, notes: 'Not at this time.', weight: 190,
      form_responses: [{ label: 'Training quality this week', value: '5' }, { label: 'What were some wins this week?', value: 'Completed all the workouts for the week' }] }],
    bookings: [{ client_id: 'c2', starts_at: addDays(today, -3) + 'T15:00:00Z', status: 'completed' }],
    messages: [
      { id: 'm1', sender_id: 'coach1', recipient_id: 'c1', body: 'Good stuff man, keep up the great work', created_at: new Date(Date.now() - 6 * 864e5).toISOString(), read_at: null },
      { id: 'm2', sender_id: 'c2', recipient_id: 'coach1', body: 'Likewise, sir!', created_at: new Date(Date.now() - 864e5).toISOString(), read_at: null },
    ],
    lead_stages: [{ id: 'won', is_won: true, position: 9 }, { id: 'new', position: 0 }],
    leads: [{ id: 'l1', stage_id: 'new', deal_size: 1200, next_action_date: addDays(today, -1) }, { id: 'l2', stage_id: 'won', stage_changed_at: new Date().toISOString() }],
    contracts: [{ status: 'sent' }],
    exercise_flags: [], daily_logs: [], session_feedback: [], coach_tasks: [], coach_task_completions: [], client_events: [],
    ...extra,
  })
}
async function mount(node, path = '/coach') {
  const el = document.createElement('div'); document.body.appendChild(el)
  await act(async () => { createRoot(el).render(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>) })
  for (let i = 0; i < 6; i++) await tick()
  return el
}
beforeEach(() => { sb = world(); badges = { checkins: 2, messages: 1 }; rpcCalls.length = 0; document.body.innerHTML = '' })

test('top bar, section menu with counts, drop-downs', async () => {
  const el = await mount(<Routes><Route path="/coach/*" element={<CoachDashboard />} /></Routes>, '/coach/checkins')
  await tick(700)
  const tabs = [...el.querySelectorAll('.coach-tabs a')]
  expect(tabs.map(a => a.textContent.replace(/\s+/g, ''))).toEqual(['Dashboard', 'Clients', 'Index', 'Business', 'Programs', 'Coaches'])
  expect(tabs.find(a => a.textContent === 'Clients').className).toContain('active')
  expect(tabs.find(a => a.textContent === 'Clients').className).toContain('has-new')
  const menu = el.querySelector('.coach-menu')
  expect(menu.textContent).toContain('All clients')
  expect([...menu.querySelectorAll('a')].find(a => a.textContent.startsWith('Check-ins')).textContent).toContain('2')

  // 🔔
  await act(async () => el.querySelector('[aria-label="Notifications"]').click())
  expect(el.querySelector('[role="menu"][aria-label="Notifications"]').textContent).toContain('Check-ins to review')
  // 💬 latest message per client, unread marked, mark all as read
  await act(async () => el.querySelector('[aria-label="Messages"]').click()); for (let i = 0; i < 3; i++) await tick()
  const chat = el.querySelector('[role="menu"][aria-label="Messages"]')
  expect(chat.textContent).toContain('Kenneth Cooper'); expect(chat.textContent).toContain('Likewise, sir!'); expect(chat.textContent).toContain('a day ago')
  expect(chat.textContent).toContain('You: Good stuff man')
  expect(chat.querySelectorAll('[aria-label="unread"]')).toHaveLength(1)
  await act(async () => btn(chat, 'Mark all as read').click()); await tick()
  expect(rpcCalls).toContainEqual(['mark_messages_read', { other_id: 'c2' }])
  // avatar menu
  await act(async () => el.querySelector('[aria-label="Account"]').click())
  expect(el.textContent).toContain('Notification settings'); expect(el.textContent).toContain('Sign out')
})

test('Programs tab opens the Index menu with Programs picked; Dashboard has no side menu', async () => {
  let el = await mount(<Routes><Route path="/coach/*" element={<CoachDashboard />} /></Routes>, '/coach/programs')
  expect([...el.querySelectorAll('.coach-tabs a')].find(a => a.className.includes('active')).textContent).toBe('Programs')
  expect(el.querySelector('.coach-menu-title').textContent).toBe('Index')
  expect(el.querySelector('.coach-menu a.active').textContent).toBe('Programs')
  document.body.innerHTML = ''
  el = await mount(<Routes><Route path="/coach/*" element={<CoachDashboard />} /></Routes>, '/coach')
  expect(el.querySelector('.coach-menu')).toBe(null)
  expect(el.textContent).toContain('Needs Attention')
})

test('Dashboard feed: Weekly Check-Ins cards with bars, Q&A and a comment box; client filter', async () => {
  const el = await mount(<Routes><Route path="/coach/*" element={<CoachDashboard />} /></Routes>, '/coach')
  await act(async () => [...el.querySelectorAll('[role="tab"]')].find(b => b.textContent === 'Weekly Check-Ins').click()); for (let i = 0; i < 4; i++) await tick()
  const card = el.querySelector('[data-feed="Weekly check-in"]')
  expect(card.textContent).toContain('Kenneth Cooper')
  expect(card.querySelector('[data-bar="Energy this week"]').textContent).toContain('9/10')
  expect(card.querySelector('[data-bar="Training quality this week"]').textContent).toContain('5/10')
  expect(card.textContent).toContain('What were some wins this week?')
  expect(card.textContent).toContain('Completed all the workouts for the week')
  expect(card.textContent).toContain('Comments')
  const box = card.querySelector('textarea')
  await act(async () => { box.focus(); box.dispatchEvent(new FocusEvent('focusin', { bubbles: true })) })
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(box, 'Huge week'); box.dispatchEvent(new Event('input', { bubbles: true })) })
  await act(async () => btn(card, 'Send').click()); await tick()
  expect(sb.db.messages.some(m => m.recipient_id === 'c2' && m.body.includes('Huge week'))).toBe(true)
  // filter to a client with no check-ins
  const sel = el.querySelector('[aria-label="Filter feed by client"]')
  await act(async () => { sel.value = 'c1'; sel.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(el.querySelector('[data-feed="Weekly check-in"]')).toBe(null)
})

test('Clients table: stats strip, due pills, compliance, tags, search, archive', async () => {
  const clients = sb.db.profiles.filter(p => p.role === 'client')
  const onEdit = vi.fn()
  const el = await mount(<ClientsTable clients={clients} onEdit={onEdit} addPanel={<div>INVITE PANEL</div>} />, '/coach/clients')
  for (let i = 0; i < 4; i++) await tick()
  expect(el.querySelector('[data-stat="total"]').textContent).toBe('2')
  expect(el.querySelector('[data-stat="consult"]').textContent).toBe('50%')      // Kenneth had a call
  expect(el.querySelector('[data-stat="touch"]').textContent).toBe(new Date(Date.now() - 6 * 864e5) >= new Date(mondayOf(today) + 'T00:00:00') ? '50%' : '0%')
  const charles = el.querySelector('[data-client="Charles Quinn"]')
  // trains every day; logged the last 3 days, not today → next due is today (green)
  expect(charles.querySelector('[data-col="exdue"]').textContent).toMatch(/Last|Yesterday|Today/)
  expect(charles.querySelector('[data-streak]').textContent.trim()).toBe('3')
  expect(charles.querySelector('[data-col="ex"]').textContent).toMatch(/%/)
  expect(el.querySelector('[data-client="Kenneth Cooper"] [data-col="exdue"]').textContent).toContain('No program')
  expect(el.querySelector('[data-client="Kenneth Cooper"]').textContent).toContain(new Date(addDays(today, -3) + 'T15:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }))
  expect(el.querySelector('[data-client="Old Client"]')).toBe(null)

  // add a tag to Kenneth, then find him by it
  await act(async () => btn(el.querySelector('[data-client="Kenneth Cooper"]'), 'Add to tag').click())
  const inp = el.querySelector('[aria-label="New tag"]')
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, 'Indie'); inp.dispatchEvent(new Event('input', { bubbles: true })) })
  await act(async () => inp.form.requestSubmit ? inp.form.requestSubmit() : inp.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); await tick()
  expect(sb.db.profiles.find(p => p.id === 'c2').tags).toEqual(['Indie'])
  const search = el.querySelector('[aria-label="Search clients and tags"]')
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(search, 'indie'); search.dispatchEvent(new Event('input', { bubbles: true })) })
  expect([...el.querySelectorAll('[data-client]')].map(r => r.dataset.client)).toEqual(['Kenneth Cooper'])
  // remove a tag
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(search, ''); search.dispatchEvent(new Event('input', { bubbles: true })) })
  await act(async () => el.querySelector('[aria-label="Remove tag AEW"]').click()); await tick()
  expect(sb.db.profiles.find(p => p.id === 'c1').tags).toEqual([])

  // archived tab, Add client panel, ⋮ → edit
  await act(async () => [...el.querySelectorAll('[role="tab"]')].find(b => b.textContent.startsWith('Archived')).click())
  expect([...el.querySelectorAll('[data-client]')].map(r => r.dataset.client)).toEqual(['Old Client'])
  await act(async () => btn(el, 'Add client').click())
  expect(el.textContent).toContain('INVITE PANEL')
  await act(async () => el.querySelector('[aria-label="Client options"]').click())
  await act(async () => btn(el, 'Edit details').click())
  expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'c3' }))
})

test('Business overview numbers', async () => {
  const el = await mount(<CoachBusiness />, '/coach/business')
  expect(el.querySelector('[data-stat="active"]').textContent).toBe('2')
  expect(el.textContent).toContain('$1,200')
  expect(el.textContent).toContain('1 follow-up due')
  expect(el.textContent).toContain('1 waiting to be signed')
  expect(el.textContent).toContain('Newie')
})
