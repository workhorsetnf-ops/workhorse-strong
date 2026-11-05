// Logged sets survive bad gym signal (Update 165).
import { test, expect, beforeEach } from 'vitest'
import { saveSet, flushPending, readPending, withPending, rowKey } from '../src/lib/saveQueue'

const mem = new Map()
globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) }
let server, mode
const sb = { from: () => ({ upsert: async rows => {
  if (mode === 'throw') throw new TypeError('Failed to fetch')
  if (mode === 'error') return { error: { message: 'network' } }
  for (const r of rows) { expect(r).not.toHaveProperty('queued_at'); server.set(rowKey(r), r) }
  return { error: null }
} }) }
const row = (set, reps) => ({ client_id: 'me', exercise_id: 'e1', set_number: set, weight: 225, reps, logged_date: '2026-11-04' })
beforeEach(() => { mem.clear(); server = new Map(); mode = 'online' })

test('online saves straight through', async () => { expect((await saveSet(sb, row(1, 8))).ok).toBe(true); expect(readPending('me')).toHaveLength(0) })
test('no signal: kept on the phone (thrown or returned errors), newest edit wins', async () => {
  mode = 'throw'; await saveSet(sb, row(2, 8)); mode = 'error'; await saveSet(sb, row(3, 7)); await saveSet(sb, row(2, 10))
  const p = readPending('me'); expect(p).toHaveLength(2); expect(p.find(x => x.set_number === 2).reps).toBe(10)
})
test('reopening offline shows the phone copy over the server copy', async () => {
  mode = 'throw'; await saveSet(sb, row(2, 10))
  expect(withPending([{ exercise_id: 'e1', set_number: 2, reps: 5 }], readPending('me'))[0].reps).toBe(10)
})
test('signal back: everything sends, queue empties', async () => {
  mode = 'throw'; await saveSet(sb, row(2, 10)); await saveSet(sb, row(3, 7))
  expect(await flushPending(sb, 'me')).toBe(2); mode = 'online'; expect(await flushPending(sb, 'me')).toBe(0)
  expect(server.get('me|e1|2|2026-11-04').reps).toBe(10)
})
test('two retries at once send once', async () => {
  mode = 'throw'; await saveSet(sb, row(4, 6)); mode = 'online'
  let calls = 0; const slow = { from: () => ({ upsert: async rows => { calls++; await new Promise(r => setTimeout(r, 10)); return { error: null } } }) }
  await Promise.all([flushPending(slow, 'me'), flushPending(slow, 'me')]); expect(calls).toBe(1)
})
test('blocked phone storage never crashes saving', async () => {
  const saved = globalThis.localStorage; globalThis.localStorage = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') }, removeItem() {} }
  mode = 'throw'; expect((await saveSet(sb, row(6, 6))).ok).toBe(false); globalThis.localStorage = saved
})
