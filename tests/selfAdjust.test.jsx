// @vitest-environment jsdom
// Group self-adjust (Update 182): the Eat tab macro check. The rules live in
// the database (tested against Postgres); here: the wording and the card.
import { test, expect, vi, beforeEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { marked } from 'marked'

let checkResult = null
let applyResult = null
const rpcCalls = []
vi.mock('../src/lib/supabase', () => ({
  supabase: {
    rpc: async (name, args) => {
      rpcCalls.push([name, args])
      if (name === 'self_adjust_check') return { data: checkResult, error: null }
      if (name === 'apply_self_adjustment') return applyResult
      return { data: null, error: null }
    },
  },
}))
let auth = {}
let refreshed = 0
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => auth }))

import SelfAdjustCard from '../src/pages/client/SelfAdjustCard'
import { selfAdjustCopy, macroLine } from '../src/lib/selfAdjust'
import { DEFAULT_GUIDE } from '../src/lib/nutritionGuide'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
async function mount(node) {
  const el = document.createElement('div'); document.body.appendChild(el)
  await act(async () => { createRoot(el).render(<MemoryRouter>{node}</MemoryRouter>) })
  await act(async () => { await new Promise(r => setTimeout(r, 10)) })
  return el
}
beforeEach(() => {
  document.body.innerHTML = ''; rpcCalls.length = 0; refreshed = 0
  auth = { profile: { id: 'u1', plan: 'group', group_tier: 'group' }, refreshProfile: async () => { refreshed++ } }
})

const base = { goal: 'cut', step: 30, floor: 100, today: '2026-11-13', from: { p: 200, c: 225, f: 70, kcal: 2330 },
  logged_recent: 6, logged_prior: 7, weighins_recent: 7, weighins_base: 7, avg_base: 200, avg_recent: 199.6, change_lb: -0.4, change_pct: -0.2 }
const due = { ...base, kind: 'down', to: { p: 200, c: 195, f: 70, kcal: 2210 } }

test('nothing shows for maintain or an unknown answer', () => {
  expect(selfAdjustCopy({ kind: 'none' })).toBe(null)
  expect(selfAdjustCopy(null)).toBe(null)
  expect(selfAdjustCopy({ kind: 'mystery' })).toBe(null)
})

test('wording for each answer', () => {
  expect(selfAdjustCopy({ kind: 'wait', next_check: '2026-11-20' }).title).toMatch(/Next macro check: Fri, Nov 20/)
  expect(selfAdjustCopy({ kind: 'wait', next_check: '2026-11-20' }).body).toMatch(/three weeks after you join/)
  expect(selfAdjustCopy({ kind: 'wait', next_check: '2026-11-20', changed_on: '2026-11-06' }).body).toMatch(/two full weeks/)
  expect(selfAdjustCopy({ ...base, kind: 'logging', logged_recent: 5 }).body).toMatch(/logged 5 of 7 days last week and 7 of 7/)
  expect(selfAdjustCopy({ ...base, kind: 'weighins', weighins_recent: 3 }).body).toMatch(/weighed in 3 times/)
  expect(selfAdjustCopy({ ...base, kind: 'moving', avg_recent: 197, change_lb: -3 }).body).toMatch(/200\.0 to 197\.0 lb \(-3\.0 lb\).*nothing changes/)
  const d = selfAdjustCopy(due)
  expect(d.cta).toBe('apply')
  expect(d.body).toMatch(/take 30 g of carbs off\. Protein and fat stay the same/)
  expect(selfAdjustCopy({ ...due, kind: 'up', goal: 'build' }).body).toMatch(/add 30 g of carbs on/)
})

test('carb floor sends them to Coach; Workhorse 90 also hears about the call', () => {
  const f = { ...base, kind: 'floor', from: { p: 200, c: 120, f: 70, kcal: 1910 } }
  expect(selfAdjustCopy(f).cta).toBe('message')
  expect(selfAdjustCopy(f).body).not.toMatch(/monthly call/)
  expect(selfAdjustCopy(f, { tier: 'w90' }).body).toMatch(/Message Coach or bring it to your monthly call/)
})

test('the card asks with the phone date and hides when nothing applies', async () => {
  checkResult = { kind: 'none' }
  const el = await mount(<SelfAdjustCard />)
  expect(el.textContent).toBe('')
  expect(rpcCalls[0][0]).toBe('self_adjust_check')
  expect(rpcCalls[0][1].p_today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
})

test('due: shows now and new, applies after confirming, then refreshes', async () => {
  checkResult = due
  applyResult = { data: { ...due, applied: true, plan_items_resized: 3 }, error: null }
  let applied = 0
  const el = await mount(<SelfAdjustCard onApplied={() => applied++} />)
  expect(el.textContent).toContain('Now: ' + macroLine(due.from))
  expect(el.textContent).toContain('New: ' + macroLine(due.to))
  const btn = [...el.querySelectorAll('button')].find(b => b.textContent.includes('Apply'))
  expect(btn.textContent).toBe('Apply: −30 g carbs')

  window.confirm = () => false
  await act(async () => { btn.click() })
  expect(rpcCalls.some(c => c[0] === 'apply_self_adjustment')).toBe(false)

  window.confirm = () => true
  await act(async () => { btn.click(); await new Promise(r => setTimeout(r, 10)) })
  expect(rpcCalls.filter(c => c[0] === 'apply_self_adjustment')).toHaveLength(1)
  expect(el.textContent).toContain('New targets set: 200 P · 195 C · 70 F · 2210 kcal')
  expect(el.textContent).toContain('meal plan has been resized')
  expect(refreshed).toBe(1); expect(applied).toBe(1)
})

test('if the database says no, the error shows and the card re-checks', async () => {
  checkResult = due
  applyResult = { data: null, error: { message: 'No change is due right now.' } }
  window.confirm = () => true
  const el = await mount(<SelfAdjustCard />)
  checkResult = { ...base, kind: 'wait', next_check: '2026-11-27', changed_on: '2026-11-13' }
  const btn = [...el.querySelectorAll('button')].find(b => b.textContent.includes('Apply'))
  await act(async () => { btn.click(); await new Promise(r => setTimeout(r, 10)) })
  expect(el.textContent).toContain('No change is due right now.')
  expect(el.textContent).toContain('Next macro check')
  expect(refreshed).toBe(0)
})

test('the guide describes the in-app check with the same numbers', () => {
  const html = marked.parse(DEFAULT_GUIDE)
  expect(html).toContain('<h2>When to adjust</h2>')
  for (const s of ['macro check', 'three weeks after you join', '6 of 7 days', '4 weigh-ins', '0.5%', '0.25%', '30 g of carbs', '100 g']) expect(DEFAULT_GUIDE).toContain(s)
  expect(DEFAULT_GUIDE).not.toContain('25 to 35 g')
})
