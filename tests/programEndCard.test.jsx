// @vitest-environment jsdom
// Coach Home "Programs ending soon" card (Update 186).
import { test, vi } from 'vitest'
import assert from 'node:assert/strict'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { makeSb } from './helpers/fakeSupabase.js'
import { localDateStr } from '../src/lib/weeks'
import { addDaysStr } from '../src/lib/programEnd'

let sb
vi.mock('../src/lib/supabase', () => ({ supabase: { from: (...a) => sb.from(...a) } }))
import ProgramsEndingCard from '../src/pages/coach/ProgramsEndingCard'
globalThis.IS_REACT_ACT_ENVIRONMENT = true

async function mount() {
  const el = document.createElement('div'); document.body.appendChild(el)
  await act(async () => { createRoot(el).render(<MemoryRouter><ProgramsEndingCard /></MemoryRouter>) })
  await act(async () => { await new Promise(r => setTimeout(r, 0)) })
  return el
}
const blocks = [{ id: 'b1', program_id: 'p', weeks: 4, position: 0 }]
const prof = (id, full_name, extra = {}) => ({ id, full_name, role: 'client', status: 'active', ...extra })

test('lists clients ending within 2 weeks, soonest first; hides the rest', async () => {
  const today = localDateStr()
  sb = makeSb({
    program_assignments: [
      { id: 'A', client_id: 'a', program_id: 'p', current_block_id: 'b1', current_week: 4 },                       // this Sunday
      { id: 'B', client_id: 'b', program_id: 'p', current_block_id: 'b1', current_week: 1 },                       // weeks away
      { id: 'C', client_id: 'c', program_id: 'p', week_mode: 'auto', start_date: addDaysStr(today, -60) },         // ended
      { id: 'D', client_id: 'd', program_id: 'p', current_block_id: 'b1', current_week: 4 },                       // paused
    ],
    profiles: [prof('a', 'Izzy Q'), prof('b', 'Nero D'), prof('c', 'Paul R'), prof('d', 'Dee P', { status: 'paused' })],
    program_blocks: blocks, programs: [{ id: 'p', name: 'Full Body x3' }],
  })
  const el = await mount()
  const t = el.textContent
  assert.match(t, /Programs ending soon/)
  assert.ok(t.indexOf('Paul R') < t.indexOf('Izzy Q'))
  assert.match(t, /Ended \d+ days ago/)
  assert.ok(!t.includes('Nero D') && !t.includes('Dee P'))
  assert.match(t, /Manual weeks/)
})

test('nothing close -> card hidden', async () => {
  sb = makeSb({ program_assignments: [{ id: 'B', client_id: 'b', program_id: 'p', current_block_id: 'b1', current_week: 1 }], profiles: [prof('b', 'Nero D')], program_blocks: blocks, programs: [] })
  const el = await mount()
  assert.equal(el.textContent, '')
})
