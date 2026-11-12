// @vitest-environment jsdom
// Assistant accounts (Update 179): what each kind of login sees.
import { test, expect, vi, beforeEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'

// any query resolves to "nothing yet"; enough for screens to mount
vi.mock('../src/lib/supabase', () => {
  const empty = { data: [], error: null, count: 0 }
  const chain = () => new Proxy(function () {}, {
    get(_, k) { if (k === 'then') return (ok, bad) => Promise.resolve(empty).then(ok, bad); return () => chain() },
    apply() { return chain() },
  })
  const supabase = {
    from: () => chain(), rpc: () => chain(),
    channel: () => { const c = { on: () => c, subscribe: () => c }; return c }, removeChannel: () => {},
    storage: { from: () => chain() },
    auth: { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }) },
  }
  return { supabase, authLink: {}, setProgramsLocked: () => {} }
})
const team = [{ id: 'va', full_name: 'Vee Assist', email: 'vee@x.com', status: 'active', created_at: '2026-11-01' },
              { id: 'old', full_name: 'Old VA', email: 'old@x.com', status: 'exited', created_at: '2026-06-01' }]
const apiCalls = []
vi.mock('../src/lib/push', () => ({
  callApi: async (path, body) => { apiCalls.push([path, body]); return body.action === 'list' ? { team } : { ok: true } },
  notifyEvent: () => {}, clearShownNotifications: () => {},
  pushStatus: () => 'unsupported', isSubscribed: async () => false,
}))
let auth = {}
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => auth }))

import App from '../src/App'
import CoachPrograms from '../src/pages/coach/CoachPrograms'
import CoachTeam from '../src/pages/coach/CoachTeam'
import { teamInfo } from '../src/lib/team'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const tick = () => act(async () => { await new Promise(r => setTimeout(r, 20)) })
async function mount(node, path = '/coach') {
  const el = document.createElement('div'); document.body.appendChild(el)
  const root = createRoot(el)
  await act(async () => { root.render(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>) }); await tick()
  return el
}
const as = (profile, coachId = 'coach') => {
  auth = { session: { user: { id: profile.id } }, profile, loading: false, needsPassword: false, signOut: () => {}, ...teamInfo(profile, coachId) }
}
const COACH = { id: 'coach', role: 'coach', full_name: 'Anthony', status: 'active' }
const VA = { id: 'va', role: 'assistant', full_name: 'Vee Assist', status: 'active' }
beforeEach(() => { document.body.innerHTML = ''; apiCalls.length = 0 })

test('deactivated assistant lands on the access-off screen', async () => {
  as({ ...VA, status: 'exited' })
  const el = await mount(<App />)
  expect(el.textContent).toContain('team access has been turned off')
  expect(el.querySelector('.coach-side')).toBeNull()
})

test('active assistant gets the coach dashboard: Programs/Library marked view, no Team page', async () => {
  as(VA)
  const el = await mount(<App />)
  const nav = el.querySelector('.coach-side')
  expect(nav).not.toBeNull()
  const link = name => [...nav.querySelectorAll('a')].find(a => a.textContent.startsWith(name))
  expect(link('Programs').textContent).toContain('view')
  expect(link('Library').textContent).toContain('view')
  expect(link('Messages')).toBeTruthy()
  expect(link('Team')).toBeUndefined()
})

test('coach sees the Team page and no view-only marks', async () => {
  as(COACH)
  const el = await mount(<App />)
  const links = [...el.querySelectorAll('.coach-side a')].map(a => a.textContent)
  expect(links).toContain('Team')
  expect(links.find(t => t.startsWith('Programs'))).toBe('Programs')
})

test('Programs as an assistant: view-only banner, no Create', async () => {
  as(VA)
  const el = await mount(<CoachPrograms />, '/coach/programs')
  expect(el.textContent).toContain('View only.')
  expect([...el.querySelectorAll('button')].some(b => b.textContent === 'Create')).toBe(false)
})

test('Programs as the coach: builder controls as before', async () => {
  as(COACH)
  const el = await mount(<CoachPrograms />, '/coach/programs')
  expect(el.textContent).not.toContain('View only.')
  expect([...el.querySelectorAll('button')].some(b => b.textContent === 'Create')).toBe(true)
})

test('Team page lists assistants with their status and turns access off', async () => {
  as(COACH)
  const el = await mount(<CoachTeam />, '/coach/team')
  expect(el.textContent).toContain('Vee Assist')
  expect(el.textContent).toContain('ACTIVE')
  expect(el.textContent).toContain('ACCESS OFF')
  window.confirm = () => true
  const off = [...el.querySelectorAll('button')].find(b => b.textContent.includes('Turn off access'))
  await act(async () => off.click()); await tick()
  expect(apiCalls).toContainEqual(['/api/team', { action: 'deactivate', id: 'va' }])
})
