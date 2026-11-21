// Update 186: when each client's program runs out, and the coach's reminders.
import { test, expect } from 'vitest'
import { programEnd, alertBucket, whenText, endingSoon, programEndPush, addDaysStr } from '../src/lib/programEnd'

const B = [{ id: 'b1', weeks: 4, position: 0 }, { id: 'b2', weeks: 4, position: 1 }]
const client = (id, name) => ({ id, full_name: name, role: 'client', status: 'active' })

test('auto weeks: ends the Sunday of the last week', () => {
  // started Thu Oct 29 -> week 1 = Mon Oct 26; 8 weeks -> last day Sun Dec 20
  const e = programEnd({ week_mode: 'auto', start_date: '2026-10-29' }, B, '2026-11-20')
  expect(e.endDate).toBe('2026-12-20'); expect(e.daysLeft).toBe(30); expect(e.estimate).toBe(false); expect(e.totalWeeks).toBe(8)
  expect(programEnd({ week_mode: 'auto', start_date: '2026-10-29' }, B, '2026-12-21').daysLeft).toBe(-1)
  expect(programEnd({ week_mode: 'auto', start_date: null }, B, '2026-11-20')).toBe(null)
})
test('manual weeks: counts from the current block/week, ends this Sunday on the last week', () => {
  // Fri Nov 20, block 2 week 3 of 4 -> one more week after this -> Sun Nov 29
  const e = programEnd({ week_mode: 'manual', current_block_id: 'b2', current_week: 3 }, B, '2026-11-20')
  expect(e.endDate).toBe('2026-11-29'); expect(e.daysLeft).toBe(9); expect(e.estimate).toBe(true)
  expect(programEnd({ current_block_id: 'b2', current_week: 4 }, B, '2026-11-20').endDate).toBe('2026-11-22')
  // block 1 week 1 -> 8 weeks including this one
  expect(programEnd({ current_block_id: 'b1', current_week: 1 }, B, '2026-11-20').endDate).toBe('2027-01-10')
  // unknown block falls back to the first; blocks are ordered by position not array order
  expect(programEnd({ current_block_id: 'zz', current_week: 1 }, [B[1], B[0]], '2026-11-20').endDate).toBe('2027-01-10')
  // future start: count from that week
  expect(programEnd({ current_block_id: 'b2', current_week: 4, start_date: '2026-12-02' }, B, '2026-11-20').endDate).toBe('2026-12-06')
  expect(programEnd({}, [], '2026-11-20')).toBe(null)
})
test('DST changeover does not shift the end date', () => {
  expect(addDaysStr('2026-10-26', 13)).toBe('2026-11-08')
  expect(programEnd({ week_mode: 'auto', start_date: '2027-03-01' }, [{ id: 'x', weeks: 2 }], '2027-03-13').daysLeft).toBe(1)
})
test('reminder points: 14, 7, and over', () => {
  expect([20, 15, 14, 10, 8, 7, 3, 0, -1, -9].map(alertBucket)).toEqual([null, null, 14, 14, 14, 7, 7, 7, 0, 0])
  expect([14, 9, 7, 2, 1, 0, -1, -3].map(whenText)).toEqual(['ends in 2 weeks', 'ends in 9 days', 'ends in 1 week', 'ends in 2 days', 'ends tomorrow', 'ends today', 'ended 1 day ago', 'ended 3 days ago'])
})
test('endingSoon keeps the next 2 weeks and ended ones, soonest first', () => {
  const rows = [
    { client: client('a', 'Izzy Q'), assignment: { id: 'A', current_block_id: 'b2', current_week: 3 }, blocks: B },           // 9 days
    { client: client('b', 'Nero D'), assignment: { id: 'B', current_block_id: 'b1', current_week: 1 }, blocks: B },           // 51 days
    { client: client('c', 'Paul'), assignment: { id: 'C', week_mode: 'auto', start_date: '2026-09-01' }, blocks: B },        // ended
  ]
  expect(endingSoon(rows, '2026-11-20').map(r => r.client.full_name)).toEqual(['Paul', 'Izzy Q'])
})
test('push: one message, each point sent once, never goes backwards', () => {
  const ending = endingSoon([
    { client: client('a', 'Izzy Q'), program: { name: 'Full Body x3' }, assignment: { id: 'A', current_block_id: 'b2', current_week: 3 }, blocks: B },
  ], '2026-11-20')
  const p = programEndPush('coach', ending, new Set())
  expect(p.msg.title).toBe("🏗️ Izzy's program ends in 9 days")
  expect(p.msg.body).toContain('Full Body x3')
  const key = 'b2:w3:of8'
  expect(p.claims).toEqual([{ assignment_id: 'A', end_key: key, bucket: 14 }])
  expect(programEndPush('coach', ending, new Set([`A|${key}|14`]))).toBe(null)
  // the 7-day point already went: don't send the 14 again
  expect(programEndPush('coach', ending, new Set([`A|${key}|7`]))).toBe(null)
  // a new end (next block added -> of12) starts fresh
  expect(programEndPush('coach', ending, new Set(['A|b2:w3:of8x|14']))).not.toBe(null)
})
test('push: several clients roll into one notification', () => {
  const ending = endingSoon([
    { client: client('a', 'Izzy Q'), assignment: { id: 'A', current_block_id: 'b2', current_week: 4 }, blocks: B },
    { client: client('c', 'Paul'), assignment: { id: 'C', week_mode: 'auto', start_date: '2026-09-01' }, blocks: B },
  ], '2026-11-20')
  const p = programEndPush('coach', ending, new Set())
  expect(p.msg.title).toBe('🏗️ 2 programs ending soon')
  expect(p.msg.body).toMatch(/^Paul \(ended \d+ days ago\), Izzy \(in 2 days\)\./)
  expect(p.claims.map(c => c.bucket)).toEqual([0, 7])
})

test('server job, manual weeks: sent once, paused and group clients skipped', async () => {
  const { makeSb } = await import('./helpers/fakeSupabase')
  const { programEndMessages } = await import('../api/push-reminders.js')
  const sb = makeSb({
    program_assignments: [
      { id: 'A', client_id: 'a', program_id: 'p', current_block_id: 'b2', current_week: 4 },
      { id: 'P', client_id: 'z', program_id: 'p', current_block_id: 'b2', current_week: 4 },
      { id: 'G', client_id: 'g', program_id: 'p', current_block_id: 'b2', current_week: 4 },
    ],
    profiles: [client('a', 'Izzy Q'), { ...client('z', 'Paused P'), status: 'paused' }, { ...client('g', 'Group G'), plan: 'group' }],
    program_blocks: B.map(b => ({ ...b, program_id: 'p' })),
    programs: [{ id: 'p', name: 'Full Body x3' }],
    program_end_alerts: [],
  })
  const first = await programEndMessages(sb, [{ id: 'coach' }], '2026-11-20')
  expect(first.map(m => m.title)).toEqual(["🏗️ Izzy's program ends in 2 days"])
  expect(await programEndMessages(sb, [{ id: 'coach' }], '2026-11-20')).toEqual([])
  expect(await programEndMessages(sb, [{ id: 'coach' }], '2026-11-21')).toEqual([])
  // Manual weeks and the coach never moved them on: no repeat every Monday
  expect(await programEndMessages(sb, [{ id: 'coach' }], '2026-11-30')).toEqual([])
  expect(sb.db.program_end_alerts.map(r => r.bucket)).toEqual([7])
})

test('server job, auto weeks: 2 weeks, 1 week, ended — one each', async () => {
  const { makeSb } = await import('./helpers/fakeSupabase')
  const { programEndMessages } = await import('../api/push-reminders.js')
  const sb = makeSb({
    program_assignments: [{ id: 'A', client_id: 'a', program_id: 'p', week_mode: 'auto', start_date: '2026-10-26' }], // ends Sun Dec 20
    profiles: [client('a', 'Izzy Q')], program_blocks: B.map(b => ({ ...b, program_id: 'p' })), programs: [{ id: 'p', name: 'FB' }], program_end_alerts: [],
  })
  const run = d => programEndMessages(sb, [{ id: 'coach' }], d).then(m => m.map(x => x.title))
  expect(await run('2026-12-05')).toEqual([])
  expect(await run('2026-12-06')).toEqual(["🏗️ Izzy's program ends in 2 weeks"])
  expect(await run('2026-12-07')).toEqual([])
  expect(await run('2026-12-13')).toEqual(["🏗️ Izzy's program ends in 1 week"])
  expect(await run('2026-12-20')).toEqual([])
  expect(await run('2026-12-22')).toEqual(["🏗️ Izzy's program ended 2 days ago"])   // missed the 21st: still goes out
  expect(await run('2026-12-23')).toEqual([])
  // coach adds the next 4-week block -> new end, reminders start again from scratch
  sb.db.program_blocks.push({ id: 'b3', program_id: 'p', weeks: 4, position: 2 })
  expect(await run('2027-01-03')).toEqual(["🏗️ Izzy's program ends in 2 weeks"])
})
