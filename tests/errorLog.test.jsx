// Crash reporting and the Problems page grouping (Update 167).
import { test, expect, vi } from 'vitest'
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc: vi.fn(() => Promise.resolve({})) } }))
import { shouldReport, deviceLabel } from '../src/lib/errorLog'
import { groupErrors } from '../src/pages/coach/CoachProblems'

test('noise skipped, each error once per session, capped at 20', () => {
  expect(shouldReport('ResizeObserver loop limit exceeded')).toBe(false); expect(shouldReport('Script error.')).toBe(false)
  expect(shouldReport('TypeError: a')).toBe(true); expect(shouldReport('TypeError: a')).toBe(false)
  let ok = 0; for (let i = 0; i < 40; i++) if (shouldReport('E' + i)) ok++
  expect(ok).toBe(19)
})
test('device label', () => expect(deviceLabel('Mozilla (iPhone; CPU iPhone OS 17)')).toBe('iPhone · browser'))
test('grouped by message: count, people, crash wins, newest stack', () => {
  const g = groupErrors([
    { id: 1, message: 'A', profile_id: 'p1', path: '/app/training', device: 'iPhone', created_at: '2026-11-04T10:00:00Z', stack: 'old', kind: 'error' },
    { id: 2, message: 'A', profile_id: 'p2', path: '/app', device: 'Android', created_at: '2026-11-04T12:00:00Z', stack: 'new', kind: 'crash' },
    { id: 3, message: 'B', profile_id: null, path: '/', device: '', created_at: '2026-11-04T09:00:00Z', stack: '', kind: 'promise' },
  ], { p1: 'Elliot', p2: 'Izzy' })
  expect(g.map(x => x.message)).toEqual(['A', 'B']); expect(g[0].count).toBe(2); expect([...g[0].people].sort()).toEqual(['Elliot', 'Izzy'])
  expect(g[0].kind).toBe('crash'); expect(g[0].stack).toBe('new')
})
