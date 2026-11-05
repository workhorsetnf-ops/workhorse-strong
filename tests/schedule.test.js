// Which session lands on which date: Day 1 = Monday (Update 162), A/B
// rotations, Manual vs Auto weeks, client moves, custom training days (164).
import { test, expect } from 'vitest'
import { weekdayNumber, weekNumberOf, overallWeek, cleanDayMap, dayWeekday, dayMapOrNull } from '../src/lib/weeks'
import { programWeekDates, scheduledDate, scheduledSessions, sessionsOnDate } from '../src/lib/conditioning'
import { splitForWeek, sessionsOn, dayNumberOn } from '../src/lib/dashboard'
import { expectedSessions } from '../src/lib/adherence'

const B1 = { id: 'b1', name: 'Block 1', weeks: 4 }, B2 = { id: 'b2', name: 'Block 2', weeks: 4 }
const day = (id, dn, label, track = 'exercise', block = 'b1', rot = null) => ({ id, block_id: block, day_number: dn, day_label: label, track, rotation_id: rot, position: 0 })
const days1 = [day('u1', 1, 'Upper A'), day('l1', 2, 'Lower A'), day('u2', 4, 'Upper B'), day('l2', 5, 'Lower B'), day('c1', 6, 'Conditioning', 'conditioning')]
const days2 = [day('x1', 1, 'B2 Push', 'exercise', 'b2'), day('x2', 3, 'B2 Pull', 'exercise', 'b2')]
const sched = (a, dmap = {}) => ({ assignment: { ...a, ...dmap }, blocks: [B1, B2], daysByBlock: { b1: days1, b2: days2 }, rotationsByBlock: { b1: [], b2: [] } })
const labels = (ymd, s, mv) => sessionsOnDate(ymd, s, mv).map(x => x.day_label)
const WEEK = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']
const manual = sched({ start_date: '2026-08-13', week_mode: 'manual', current_block_id: 'b1', current_week: 3 })

test('weekdays and Monday weeks', () => {
  expect(weekdayNumber('2026-11-02')).toBe(1); expect(weekdayNumber('2026-11-08')).toBe(7)
  expect(programWeekDates(null, '2026-11-05')).toEqual(WEEK)
  expect(weekNumberOf('2026-10-29', '2026-11-01')).toBe(1); expect(weekNumberOf('2026-10-29', '2026-11-02')).toBe(2)
  expect(overallWeek('2026-10-29', '2026-10-28')).toBe(null)
})
test('weeks are right across both DST changes', () => {
  expect(weekNumberOf('2026-10-26', '2026-11-02')).toBe(2)
  expect(weekNumberOf('2027-03-01', '2027-03-14')).toBe(2); expect(weekNumberOf('2027-03-01', '2027-03-15')).toBe(3)
})
test('4-day split lands Mon/Tue/Thu/Fri + Sat conditioning', () => {
  expect(WEEK.map(d => labels(d, manual).join(','))).toEqual(['Upper A', 'Lower A', '', 'Upper B', 'Lower B', 'Conditioning', ''])
})
test('regression: an old start date on Manual still shows the program', () => expect(labels('2027-02-01', manual)).toEqual(['Upper A']))
test('nothing before the start date', () => {
  const s = sched({ start_date: '2026-11-04', week_mode: 'manual', current_block_id: 'b1', current_week: 1 })
  expect(labels('2026-11-03', s)).toEqual([]); expect(labels('2026-11-05', s)).toEqual(['Upper B'])
})
test('Auto rolls into the next block, then falls back when the program runs out', () => {
  const auto = sched({ start_date: '2026-10-05', week_mode: 'auto', current_block_id: 'b1', current_week: 1 })
  expect(scheduledSessions('2026-10-26', auto)[0].wk).toBe(4); expect(labels('2026-11-02', auto)).toEqual(['B2 Push'])
  expect(labels('2027-06-07', auto)).toEqual(['Upper A'])
})
test('A/B rotations alternate; every-week days stay', () => {
  const rotDays = [day('a', 1, 'Push A', 'exercise', 'b1', 'ra'), day('b', 1, 'Push B', 'exercise', 'b1', 'rb'), day('cc', 6, 'Cond', 'conditioning')]
  const rot = w => ({ assignment: { week_mode: 'manual', current_block_id: 'b1', current_week: w }, blocks: [B1], daysByBlock: { b1: rotDays }, rotationsByBlock: { b1: [{ id: 'ra' }, { id: 'rb' }] } })
  expect(labels('2026-11-02', rot(1))).toEqual(['Push A']); expect(labels('2026-11-02', rot(2))).toEqual(['Push B']); expect(labels('2026-11-07', rot(2))).toEqual(['Cond'])
})
test('moves: leave the old day, show on the new one, reset next week, stale moves ignored', () => {
  const mv = [{ day_id: 'u1', from_date: '2026-11-02', to_date: '2026-11-04' }]
  expect(labels('2026-11-02', manual, mv)).toEqual([]); expect(labels('2026-11-04', manual, mv)).toEqual(['Upper A'])
  expect(labels('2026-11-09', manual, mv)).toEqual(['Upper A'])
  expect(labels('2026-11-06', manual, [{ day_id: 'u1', from_date: '2026-11-05', to_date: '2026-11-06' }])).toEqual(['Lower B'])
})
test('custom training days', () => {
  expect(cleanDayMap({ 1: 2, 2: 2, 8: 1, 3: 9, 4: '6', x: 1 })).toEqual({ 1: 2, 4: 6 }); expect(dayMapOrNull({})).toBe(null); expect(dayWeekday(4, null)).toBe(4)
  const s = sched({ start_date: '2026-10-01', week_mode: 'manual', current_block_id: 'b1', current_week: 1 }, { day_map: { 1: 2, 2: 3, 4: 5, 5: 6, 6: 7 } })
  expect(WEEK.map(d => labels(d, s).join('+'))).toEqual(['', 'Upper A', 'Lower A', '', 'Upper B', 'Lower B', 'Conditioning'])
  expect(scheduledDate(null, 1, '2026-11-05', { 1: 3 })).toBe('2026-11-04')
})
test('coach-side split, review and adherence follow the same rules', () => {
  expect(dayNumberOn('2026-11-05', '2026-10-29')).toBe(4)
  expect(splitForWeek(WEEK, { blockDays: days1, dayMap: { 1: 3 } }).map(r => r.sessions.map(s => s.day_label).join())).toEqual(['', 'Lower A', 'Upper A', 'Upper B', 'Lower B', '', ''])
  expect(sessionsOn('2026-11-04', '2026-11-02', [B1], { b1: days1 }, { 1: 3 }).map(d => d.day_label)).toEqual(['Upper A'])
  const prog = a => ({ assignment: a, blocks: [B1], daysByBlock: { b1: days1 }, rotationsByBlock: { b1: [] } })
  expect(expectedSessions(prog({ week_mode: 'auto', start_date: '2026-10-19' }), '2026-11-02')).toBe(4)
  expect(expectedSessions(prog({ week_mode: 'auto', start_date: '2026-10-29' }), '2026-10-26')).toBe(2)
})
