// Update 190: coach day view, one-offs, effort, demos, AM/PM — the pure rules.
import { test, expect } from 'vitest'
import { EFFORT, effortOf, effortToRpe, cleanMinutes, videoLinks, toggleTrainTime, sessionTime, cleanTrainTimes, lettersFor, exerciseMark, loadByDate } from '../src/lib/clientRx'
import { scheduledSessions } from '../src/lib/conditioning'

test('effort 1-5 keeps rpe filled, and old 1-10 answers map back', () => {
  expect([1, 2, 3, 4, 5].map(effortToRpe)).toEqual([3, 5, 7, 8, 10])
  expect(EFFORT[4].label).toBe('HARD')
  expect(effortOf({ effort: 2, rpe: 9 })).toBe(2)          // effort wins when present
  expect([1, 3, 5, 6, 7, 8, 9, 10].map(rpe => effortOf({ rpe }))).toEqual([1, 1, 2, 3, 3, 4, 5, 5])
  expect(effortOf(null)).toBe(null)
  expect(cleanMinutes('30')).toBe(30); expect(cleanMinutes('45 min')).toBe(45)
  expect(cleanMinutes('')).toBe(null); expect(cleanMinutes('0')).toBe(null); expect(cleanMinutes('900')).toBe(null)
})

test('warmup demo videos: one per line, labelled or bare', () => {
  expect(videoLinks('Air Bike | https://y.be/a\nAir Squat: https://y.be/b\n\nhttps://y.be/c\nno link here')).toEqual([
    { label: 'Air Bike', url: 'https://y.be/a' }, { label: 'Air Squat', url: 'https://y.be/b' }, { label: 'Demo 3', url: 'https://y.be/c' },
  ])
  expect(videoLinks('https://old-single-link.com/v')).toEqual([{ label: 'Demo 1', url: 'https://old-single-link.com/v' }])
  expect(videoLinks('')).toEqual([]); expect(videoLinks(null)).toEqual([])
})

test('AM/PM toggles per weekday', () => {
  let m = toggleTrainTime(null, '1', 'am')
  expect(m).toEqual({ 1: 'am' })
  m = toggleTrainTime(m, '1', 'pm'); expect(m).toEqual({ 1: 'both' })
  m = toggleTrainTime(m, '1', 'am'); expect(m).toEqual({ 1: 'pm' })
  m = toggleTrainTime(m, '1', 'pm'); expect(m).toBe(null)
  expect(cleanTrainTimes({ 1: 'am', 8: 'pm', 2: 'noon', x: 'am' })).toEqual({ 1: 'am' })
  expect(sessionTime({ 3: 'pm' }, '3')).toBe('PM')
  expect(sessionTime({ 3: 'both' }, '3', 0, 2)).toBe('AM'); expect(sessionTime({ 3: 'both' }, '3', 1, 2)).toBe('PM')
  expect(sessionTime({ 3: 'both' }, '3', 0, 1)).toBe('AM + PM')
  expect(sessionTime(null, '3')).toBe('')
})

test('builder letters: linked rows become supersets', () => {
  expect(lettersFor([{}, { linked: true }, {}, {}, { linked: true }, { linked: true }])).toEqual(['A1', 'A2', 'B', 'C1', 'C2', 'C3'])
  expect(lettersFor([{ linked: true }, {}])).toEqual(['A', 'B'])   // first row can't link up
  expect(lettersFor([])).toEqual([])
})

test('exercise marks on the coach day view', () => {
  expect(exerciseMark('2026-11-24', '2026-11-27', true, false)).toBe('done')
  expect(exerciseMark('2026-11-24', '2026-11-27', false, false)).toBe('missed')
  expect(exerciseMark('2026-11-27', '2026-11-27', false, true)).toBe('missed')   // tapped Missed today
  expect(exerciseMark('2026-11-27', '2026-11-27', false, false)).toBe(null)
  expect(exerciseMark('2026-11-28', '2026-11-27', true, true)).toBe('done')
})

test('7-day load trend', () => {
  const t = loadByDate([
    { logged_date: '2026-11-26', weight: 100, reps: 5 }, { logged_date: '2026-11-26', weight: 100, reps: 5 },
    { logged_date: '2026-11-27', weight: null, reps: 10 }, { logged_date: '2026-11-01', weight: 500, reps: 5 },
  ], ['2026-11-25', '2026-11-26', '2026-11-27'])
  expect(t.map(p => p.value)).toEqual([0, 1000, 0])
})

test('one-off workouts land on their date, with or without a program', () => {
  const oneOff = { id: 'o1', client_id: 'c', on_date: '2026-11-27', day_label: 'Extra', day_number: 5 }
  expect(scheduledSessions('2026-11-27', { assignment: null, blocks: [], oneOffs: [oneOff] }).map(s => [s.id, s.oneOff])).toEqual([['o1', true]])
  expect(scheduledSessions('2026-11-28', { assignment: null, blocks: [], oneOffs: [oneOff] })).toEqual([])
  const sched = {
    assignment: { start_date: '2026-11-23', week_mode: 'auto', current_week: 1 }, blocks: [{ id: 'b', weeks: 4, position: 0 }],
    daysByBlock: { b: [{ id: 'p5', block_id: 'b', day_number: 5, day_label: 'Prog Fri', position: 0 }] }, rotationsByBlock: { b: [] }, oneOffs: [oneOff],
  }
  expect(scheduledSessions('2026-11-27', sched).map(s => s.id)).toEqual(['p5', 'o1'])
  // before the program starts the one-off still shows
  expect(scheduledSessions('2026-11-20', { ...sched, oneOffs: [{ ...oneOff, on_date: '2026-11-20' }] }).map(s => s.id)).toEqual(['o1'])
})
