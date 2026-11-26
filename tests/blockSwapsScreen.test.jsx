// @vitest-environment jsdom
// Update 187 on screen: the client swap sheet (today vs whole block), the coach
// "Swapped for the whole block" panel, and the Library fill-in button.
import { test, expect, vi, beforeEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { makeSb } from './helpers/fakeSupabase.js'
import { localDateStr, mondayOf } from '../src/lib/weeks'

let sb
// tolerate query methods the in-memory fake doesn't model (ilike, rpc…)
const loose = o => new Proxy(o, { get: (t, k) => (k in t ? t[k] : () => loose(t)) })
vi.mock('../src/lib/supabase', () => ({ supabase: {
  from: t => { const q = sb.from(t); return new Proxy(q, { get: (o, k) => (k in o ? o[k] : () => q) }) },
  rpc: async () => ({ data: null, error: null }),
  auth: { getSession: async () => ({ data: { session: null } }) },
  storage: { from: () => loose({}) },
  channel: () => loose({ subscribe: () => ({}) }), removeChannel: () => {},
} }))
vi.mock('../src/context/AuthContext', () => { const auth = { profile: { id: 'me', role: 'client', full_name: 'Izzy Q' }, programsLocked: false }; return { useAuth: () => auth } })
const api = { calls: [] }
vi.mock('../src/lib/push', () => ({ callApi: async (path, body) => { api.calls.push(body); return api.next.shift() } }))

import ClientTraining from '../src/pages/client/ClientTraining'
import BlockSwaps from '../src/pages/coach/BlockSwaps'
import AutoSwaps from '../src/pages/coach/AutoSwaps'
import NextBlockBuilder from '../src/pages/coach/NextBlockBuilder'
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const tick = (ms = 20) => act(async () => { await new Promise(r => setTimeout(r, ms)) })
const btn = (el, text) => [...el.querySelectorAll('button')].find(b => b.textContent.trim() === text || b.textContent.includes(text))

function world() {
  return makeSb({
    program_assignments: [{ id: 'as1', client_id: 'me', program_id: 'p1', week_mode: 'auto', start_date: mondayOf(localDateStr()), current_week: 1, programs: { id: 'p1', name: 'Full Body x3', notes: '', weeks: 4 } }],
    programs: [{ id: 'p1', name: 'Full Body x3', notes: '' }],
    program_blocks: [{ id: 'b1', program_id: 'p1', name: 'Block 1', weeks: 4, position: 0 }],
    program_days: [{ id: 'd1', block_id: 'b1', day_number: 1, day_label: 'Lower', position: 0, track: 'exercise' }],
    program_exercises: [{ id: 'x1', day_id: 'd1', name: 'Hack Squat', letter: 'A', sets: 3, reps: '8-10', rir: '2', position: 0, week_targets: [] }],
    exercise_library: [{ id: 'hs', name: 'Hack Squat' }, { id: 'lp', name: 'Leg Press' }, { id: 'gs', name: 'Goblet Squat' }],
    exercise_alternatives: [{ library_id: 'hs', alt_id: 'lp', position: 0, source: 'auto' }, { library_id: 'hs', alt_id: 'gs', position: 1, source: 'auto' }],
    exercise_swaps: [], exercise_block_swaps: [], workout_logs: [],
  })
}
async function mountTrain() {
  const el = document.createElement('div'); document.body.appendChild(el)
  await act(async () => { createRoot(el).render(<MemoryRouter initialEntries={[{ pathname: '/app/train', state: { targetDayId: 'd1' } }]}><ClientTraining /></MemoryRouter>) })
  await tick(); await tick()
  const all = btn(el, 'Show everything on one page')
  if (all) { await act(async () => all.click()); await tick() }
  return el
}
beforeEach(() => { sb = world(); api.calls = []; api.next = []; document.body.innerHTML = '' })

test('client: "No equipment" swaps for the rest of the block and it sticks', async () => {
  const el = await mountTrain()
  expect(el.textContent).toContain('Hack Squat')
  await act(async () => btn(el, '⇄ Swap').click())
  expect(el.textContent).toContain('Just today')
  await act(async () => btn(el, 'No equipment').click())
  expect(el.querySelector('[role="radio"][aria-checked="true"]').textContent).toBe('Rest of this block')
  await act(async () => btn(el, 'Leg Press').click()); await tick()
  expect(sb.db.exercise_block_swaps).toMatchObject([{ client_id: 'me', exercise_id: 'x1', from_name: 'Hack Squat', alt_name: 'Leg Press', reason: 'equipment' }])
  expect(sb.db.exercise_swaps).toEqual([])
  expect(el.textContent).toContain('Swapped from Hack Squat for this block')

  // next session (fresh load): still Leg Press
  document.body.innerHTML = ''
  const again = await mountTrain()
  expect(again.textContent).toContain('Swapped from Hack Squat for this block')
  // "Back to Hack Squat" clears it
  await act(async () => btn(again, '⇄ Swap').click())
  await act(async () => btn(again, 'Back to Hack Squat').click()); await tick()
  expect(sb.db.exercise_block_swaps).toEqual([])
  expect(again.textContent).not.toContain('Swapped from')
})

test('client: "Machine taken" is just today', async () => {
  const el = await mountTrain()
  await act(async () => btn(el, '⇄ Swap').click())
  expect(el.querySelector('[role="radio"][aria-checked="true"]').textContent).toBe('Just today')
  await act(async () => btn(el, 'Goblet Squat').click()); await tick()
  expect(sb.db.exercise_swaps).toMatchObject([{ exercise_id: 'x1', alt_name: 'Goblet Squat', swap_date: localDateStr() }])
  expect(sb.db.exercise_block_swaps).toEqual([])
  expect(el.textContent).toContain('Swapped from Hack Squat for today')
})

test('coach: sees block swaps for the current block only, and can put one back', async () => {
  sb.db.program_exercises.push({ id: 'old', day_id: 'dOld' })
  sb.db.exercise_block_swaps.push(
    { id: 's1', client_id: 'me', exercise_id: 'x1', from_name: 'Hack Squat', alt_name: 'Leg Press', reason: 'equipment' },
    { id: 's2', client_id: 'me', exercise_id: 'old', from_name: 'Old Lift', alt_name: 'Something', reason: 'equipment' })
  const el = document.createElement('div'); document.body.appendChild(el)
  await act(async () => { createRoot(el).render(<BlockSwaps clientId="me" />) }); await tick()
  expect(el.textContent).toContain('Hack Squat → Leg Press (no equipment)')
  expect(el.textContent).not.toContain('Old Lift')
  vi.stubGlobal('confirm', () => true)
  await act(async () => btn(el, 'Put back').click()); await tick()
  expect(sb.db.exercise_block_swaps.map(r => r.id)).toEqual(['s2'])
  expect(el.textContent).toBe('')
})

test('library: fills every exercise batch by batch with progress', async () => {
  const lib = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C', swaps_filled_at: 'x' }]
  api.next = [{ filled: 1, added: 3, left: 1 }, { filled: 1, added: 2, left: 0 }]
  const changed = vi.fn()
  const el = document.createElement('div'); document.body.appendChild(el)
  await act(async () => { createRoot(el).render(<AutoSwaps library={lib} alts={[]} onChange={changed} />) })
  expect(el.textContent).toContain('2 exercises without')
  await act(async () => btn(el, 'Fill in swaps with Claude').click()); await tick()
  expect(api.calls).toEqual([{}, {}])
  expect(el.textContent).toContain('2 of 2 exercises · 5 swaps added')
  expect(changed).toHaveBeenCalled()
})

test('build next block starts with the exercise the client kept swapped all block', async () => {
  sb.db.exercise_block_swaps.push({ id: 's1', client_id: 'me', exercise_id: 'x1', from_name: 'Hack Squat', alt_name: 'Leg Press', reason: 'equipment' })
  const el = document.createElement('div'); document.body.appendChild(el)
  const block = sb.db.program_blocks[0]
  await act(async () => { createRoot(el).render(<NextBlockBuilder program={{ id: 'p1', name: 'Full Body x3' }} block={block} blocks={[block]}
    assignments={sb.db.program_assignments} library={sb.db.exercise_library} onDone={() => {}} onClose={() => {}} />) })
  await tick(); await tick()
  expect(el.querySelector('input[aria-label="Exercise for Hack Squat"]').value).toBe('Leg Press')
  expect(el.textContent).toContain('Swapped from Hack Squat all last block (no equipment)')
  await act(async () => btn(el, 'Use Hack Squat').click())
  expect(el.querySelector('input[aria-label="Exercise for Hack Squat"]').value).toBe('Hack Squat')
})
