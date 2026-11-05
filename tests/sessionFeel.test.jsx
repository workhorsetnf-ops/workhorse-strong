// @vitest-environment jsdom
// "How did that feel?" after a workout (Update 169).
import { test, expect, vi, beforeEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

const store = { rows: [], upserts: [] }
vi.mock('../src/lib/supabase', () => {
  const q = () => {
    const f = []
    const api = {
      select: () => api, eq: (c, v) => { f.push(r => r[c] === v); return api },
      maybeSingle: async () => ({ data: store.rows.find(r => f.every(x => x(r))) || null, error: null }),
      upsert: async r => { store.upserts.push(r); store.rows = store.rows.filter(x => !(x.day_id === r.day_id && x.session_date === r.session_date)).concat(r); return { error: null } },
    }
    return api
  }
  return { supabase: { from: q } }
})
import SessionFeel, { feelLabel } from '../src/pages/client/SessionFeel'
import { checkinFacts } from '../src/lib/aiCheckin'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const tick = () => act(async () => { await new Promise(r => setTimeout(r, 10)) })
async function mount(props) {
  const el = document.createElement('div'); document.body.appendChild(el); const root = createRoot(el)
  await act(async () => { root.render(<SessionFeel profile={{ id: 'me' }} day={{ id: 'd1', day_label: 'Upper A' }} {...props} />) }); await tick()
  return { el, root }
}
beforeEach(() => { store.rows = []; store.upserts = [] })

test('labels', () => { expect(feelLabel(1)).toBe('Barely tried'); expect(feelLabel(6)).toBe('Solid'); expect(feelLabel(10)).toBe('Everything I had') })
test('hidden until something is logged', async () => { const { el } = await mount({ logged: false }); expect(el.textContent).toBe('') })
test('pick effort, add a note, save once; then shows the answer with Change', async () => {
  const { el } = await mount({ logged: true })
  expect(el.textContent).toContain('How did that feel?')
  const save = () => [...el.querySelectorAll('button')].find(b => b.textContent === 'Save')
  expect(save().disabled).toBe(true)
  await act(async () => [...el.querySelectorAll('[aria-label="Session effort"] button')][7].click())
  expect(el.textContent).toContain('Very hard')
  await act(async () => save().click()); await tick()
  expect(store.upserts).toHaveLength(1); expect(store.upserts[0]).toMatchObject({ client_id: 'me', day_id: 'd1', day_label: 'Upper A', rpe: 8 })
  expect(el.textContent).toContain('Felt: 8/10 · Very hard'); expect(el.textContent).toContain('Change')
})
test('already answered today shows the answer, not the form', async () => {
  const today = new Date(); const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  store.rows = [{ client_id: 'me', day_id: 'd1', session_date: ymd, rpe: 6, note: 'tired' }]
  const { el } = await mount({ logged: true }); expect(el.textContent).toContain('6/10'); expect(el.textContent).toContain('tired')
})
test('the AI check-in sees how sessions felt', () => {
  const f = checkinFacts({ profile: { full_name: 'Elliot P' }, review: { training: { done: 3, planned: 4 }, nutrition: { targets: {} }, body: {}, wins: [], flags: [], feel: [{ session_date: '2026-11-04', day_label: 'Upper A', rpe: 9, note: 'shoulder tweak' }] }, checkin: null, weekStart: '2026-11-02' })
  expect(f.sessions_felt).toEqual([{ date: '2026-11-04', session: 'Upper A', effort: 9, note: 'shoulder tweak' }])
})
