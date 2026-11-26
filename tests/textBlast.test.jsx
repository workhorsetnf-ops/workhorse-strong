// @vitest-environment jsdom
// Update 188: text blasts — one message texted to many clients, one tap each.
import { test, expect, vi, beforeEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { makeSb } from './helpers/fakeSupabase.js'
import { blastText, splitRecipients, recipientRows, queueRows, nextUp, blastProgress, textParts } from '../src/lib/textBlast.js'

let sb
vi.mock('../src/lib/supabase', () => ({ get supabase() { return sb } }))
import TextBlast from '../src/pages/coach/TextBlast'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const tick = () => act(async () => { await new Promise(r => setTimeout(r, 20)) })
async function mount() {
  const el = document.createElement('div'); document.body.appendChild(el)
  await act(async () => { createRoot(el).render(<MemoryRouter><TextBlast /></MemoryRouter>) }); await tick()
  return el
}
const click = async el => { await act(async () => { el.click() }); await tick() }
const byText = (root, sel, t) => [...root.querySelectorAll(sel)].find(e => e.textContent.includes(t))
function type(el, value) {
  const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true }))
}

const clients = [
  { id: 'c1', role: 'client', full_name: 'Brett Johnson', phone: '(555) 123-4567', status: 'active', plan: 'coaching' },
  { id: 'c2', role: 'client', full_name: 'Cody Britt', phone: '555.987.6543', status: 'active', plan: 'coaching' },
  { id: 'c3', role: 'client', full_name: 'Izzy', phone: '', status: 'active', plan: 'coaching' },
  { id: 'c4', role: 'client', full_name: 'Paul Group', phone: '+15550001111', status: 'active', plan: 'group' },
]
beforeEach(() => { document.body.innerHTML = ''; sb = makeSb({ profiles: clients.map(c => ({ ...c })), text_blasts: [], text_blast_recipients: [] }) })

// ---------- helpers ----------

test('{name} becomes the first name, blank names fall back to Hey', () => {
  expect(blastText('Hey {name}, new program drops Monday', 'Brett Johnson')).toBe('Hey Brett, new program drops Monday')
  expect(blastText('{name}, quick one', '')).toBe('Hey, quick one')
})

test('selected clients split into textable and no-phone, sorted by name', () => {
  const { ready, noPhone } = splitRecipients(clients, new Set(['c2', 'c1', 'c3']))
  expect(ready.map(r => r.client.id)).toEqual(['c1', 'c2'])
  expect(ready[0].number).toBe('+15551234567')
  expect(noPhone.map(c => c.id)).toEqual(['c3'])
  expect(recipientRows('b1', ready)).toEqual([{ blast_id: 'b1', client_id: 'c1', position: 0 }, { blast_id: 'b1', client_id: 'c2', position: 1 }])
})

test('queue keeps its order, next up is the first one still waiting, progress counts', () => {
  const byId = Object.fromEntries(clients.map(c => [c.id, c]))
  const rows = queueRows([
    { blast_id: 'b', client_id: 'c2', position: 1 },
    { blast_id: 'b', client_id: 'c1', position: 0, sent_at: '2026-11-26T12:00:00Z' },
    { blast_id: 'b', client_id: 'c3', position: 2 },          // number removed after the blast started
    { blast_id: 'b', client_id: 'c4', position: 3, skipped_at: '2026-11-26T12:01:00Z' },
  ], byId)
  expect(rows.map(r => r.state)).toEqual(['sent', 'waiting', 'nophone', 'skipped'])
  expect(nextUp(rows).client_id).toBe('c2')
  expect(blastProgress(rows)).toEqual({ total: 4, sent: 1, skipped: 1, waiting: 1, noPhone: 1, done: false })
  expect(blastProgress(rows.filter(r => r.client_id !== 'c2')).done).toBe(true)
})

test('text length: 160 plain characters is one text, emoji drops it to 70', () => {
  expect(textParts('a'.repeat(160))).toMatchObject({ parts: 1, plain: true })
  expect(textParts('a'.repeat(161)).parts).toBe(2)
  expect(textParts('a'.repeat(70) + '💪')).toMatchObject({ parts: 2, plain: false })
  expect(textParts('').parts).toBe(0)
})

// ---------- screen ----------

test('compose → start → tap Text on each → finishes itself, and resumes after leaving', async () => {
  let el = await mount()
  type(el.querySelector('textarea'), 'Hey {name}, calls are open this week')
  await tick()
  await click(byText(el, 'button', 'Select all active'))
  // Izzy has no number: called out and left out
  expect(el.textContent).toContain('No phone number for Izzy')
  const startBtn = byText(el, 'button', 'Start: text 3 clients')
  expect(startBtn).toBeTruthy()
  await click(startBtn)

  expect(sb.db.text_blasts).toHaveLength(1)
  expect(sb.db.text_blast_recipients.map(r => r.client_id)).toEqual(['c1', 'c2', 'c4'])
  expect(el.textContent).toContain('0 of 3 sent')

  // next up is Brett, link carries his number and his own text
  const first = byText(el, 'a', 'Text Brett')
  expect(decodeURIComponent(first.getAttribute('href'))).toBe('sms:+15551234567?body=Hey Brett, calls are open this week')
  first.addEventListener('click', e => e.preventDefault())
  await click(first)
  expect(sb.db.text_blast_recipients.find(r => r.client_id === 'c1').sent_at).toBeTruthy()
  expect(el.textContent).toContain('1 of 3 sent')

  // leave and come back: picks up at Cody
  document.body.innerHTML = ''
  el = await mount()
  await click(byText(el, 'button', 'Continue'))
  expect(byText(el, 'a', 'Text Cody')).toBeTruthy()

  await click(byText(el, 'button', 'Skip'))
  const last = byText(el, 'a', 'Text Paul')
  last.addEventListener('click', e => e.preventDefault())
  await click(last)
  expect(el.textContent).toContain('All done ✓')
  expect(sb.db.text_blasts[0].finished_at).toBeTruthy()

  // undo reopens it
  await click(byText(el, 'button', 'Undo'))
  expect(sb.db.text_blasts[0].finished_at).toBeNull()
})

test('says what to run when the migration is missing', async () => {
  const real = sb.from
  sb.from = t => (t === 'text_blasts' ? { select: () => ({ order: () => ({ limit: async () => ({ data: null, error: { message: 'relation does not exist' } }) }) }) } : real(t))
  const el = await mount()
  expect(el.textContent).toContain('migration_update188_text_blasts.sql')
})
