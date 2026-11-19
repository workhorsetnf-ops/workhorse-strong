// Coach "Setup not finished" card: log tables have one row per set / per day,
// so a bulk select hit Supabase's row cap and most clients showed "Workout"
// missing even when they'd trained. clientsWith asks per client instead.
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { makeSb } from './helpers/fakeSupabase.js'
import { clientsWith } from '../src/lib/setup.js'

// 26 clients, each with 400 logged sets — 10,400 rows, far past a 1,000-row cap
const ids = Array.from({ length: 26 }, (_, i) => `c${i}`)
const sets = ids.flatMap(id => Array.from({ length: 400 }, (_, n) => ({ client_id: id, set_number: n })))

// fake that enforces a PostgREST-style max rows per request
function capped(tables, cap = 1000) {
  const sb = makeSb(tables)
  return { ...sb, from: t => { const q = sb.from(t); const then = q.then; q.then = (a, b) => then.call(q, r => a({ ...r, data: Array.isArray(r.data) ? r.data.slice(0, cap) : r.data }), b); return q } }
}

test('old bulk approach under a row cap misses most clients (the bug)', async () => {
  const sb = capped({ workout_logs: sets })
  const { data } = await sb.from('workout_logs').select('client_id').in('client_id', ids).limit(5000)
  assert.ok(new Set(data.map(r => r.client_id)).size < 5)
})

test('clientsWith finds every client who logged, under the same cap', async () => {
  const sb = capped({ workout_logs: sets })
  const got = await clientsWith(sb, 'workout_logs', ids)
  assert.equal(got.size, 26)
})

test('clients with no rows are left out', async () => {
  const sb = makeSb({ meal_logs: [{ client_id: 'c1' }, { client_id: 'c1' }, { client_id: 'c3' }] })
  const got = await clientsWith(sb, 'meal_logs', ids)
  assert.deepEqual([...got].sort(), ['c1', 'c3'])
})

test('refine filters apply (steps synced via Shortcut vs any steps)', async () => {
  const sb = makeSb({ daily_logs: [
    { client_id: 'c1', steps: 9000, steps_source: 'shortcut' },
    { client_id: 'c2', steps: 7000, steps_source: 'manual' },
    { client_id: 'c3', steps: null, steps_source: null },
  ] })
  const synced = await clientsWith(sb, 'daily_logs', ids, q => q.eq('steps_source', 'shortcut'))
  const any = await clientsWith(sb, 'daily_logs', ids, q => q.not('steps', 'is', null))
  assert.deepEqual([...synced], ['c1'])
  assert.deepEqual([...any].sort(), ['c1', 'c2'])
})

test('a query error counts as not done rather than crashing the card', async () => {
  const sb = { from: () => { const q = { select: () => q, eq: () => q, limit: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }; return q } }
  const got = await clientsWith(sb, 'workout_logs', ['c1'])
  assert.equal(got.size, 0)
})
