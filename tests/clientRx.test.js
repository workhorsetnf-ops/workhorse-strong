// Update 189: CoachRx-style client layout — the pure rules.
import { test, expect } from 'vitest'
import { dayStatus, sessionStreak, dailyLine, DAILY_LINES, firstName, rxGroups, dateRange, seriesFrom, caloriesByDate, avgOf, tickLabel, tabFor } from '../src/lib/clientRx'

const today = '2026-11-27'   // a Friday
const sessions = { '2026-11-23': 1, '2026-11-24': 1, '2026-11-26': 1, '2026-11-27': 1, '2026-11-28': 1 }

test('week strip marks: done / missed / planned / rest', () => {
  const logged = new Set(['2026-11-23', '2026-11-25'])
  expect(dayStatus('2026-11-23', today, sessions, logged)).toBe('done')
  expect(dayStatus('2026-11-24', today, sessions, logged)).toBe('missed')
  expect(dayStatus('2026-11-25', today, sessions, logged)).toBe('done')     // trained on a rest day still counts
  expect(dayStatus('2026-11-27', today, sessions, logged)).toBe('planned')  // today, not logged yet: not missed
  expect(dayStatus('2026-11-28', today, sessions, logged)).toBe('planned')
  expect(dayStatus('2026-11-29', today, sessions, logged)).toBe('rest')
})

test('streak counts scheduled sessions hit and stops at a miss', () => {
  const dates = dateRange(today, 7)
  expect(dates).toEqual(['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'])
  // Thu logged, Tue missed -> 1 (today unlogged doesn't break it, rest days skipped)
  expect(sessionStreak(dates, today, sessions, new Set(['2026-11-26', '2026-11-23']))).toBe(1)
  // Mon, Tue, Thu, Fri all hit -> 4
  expect(sessionStreak(dates, today, sessions, new Set(['2026-11-23', '2026-11-24', '2026-11-26', '2026-11-27']))).toBe(4)
  // bonus Wed session adds one, never breaks
  expect(sessionStreak(dates, today, sessions, new Set(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26']))).toBe(4)
  // nothing scheduled at all -> 0 without logs
  expect(sessionStreak(dates, today, {}, new Set())).toBe(0)
  // future dates are ignored
  expect(sessionStreak([...dates, '2026-11-28'], today, sessions, new Set(['2026-11-28']))).toBe(0)
})

test('daily line holds for a day and comes from the list', () => {
  expect(dailyLine(today)).toBe(dailyLine(today))
  expect(DAILY_LINES).toContain(dailyLine(today))
  const week = dateRange(today, 14).map(dailyLine)
  expect(new Set(week).size).toBeGreaterThan(3)
})

test('first name', () => {
  expect(firstName('Anthony Henry')).toBe('Anthony')
  expect(firstName('  ')).toBe('Athlete')
  expect(firstName(null)).toBe('Athlete')
})

test('supersets group A1/A2, singles stay single', () => {
  const g = rxGroups([{ letter: 'A1' }, { letter: 'A2' }, { letter: 'B' }, { letter: 'C1' }, { letter: 'D1' }, { letter: 'D2' }, { letter: 'D3' }])
  expect(g.map(x => [x.prefix, x.grouped, x.items.length])).toEqual([['A', true, 2], ['B', false, 1], ['C', false, 1], ['D', true, 3]])
  expect(rxGroups([])).toEqual([])
})

test('trend series, calories and averages', () => {
  const dates = ['2026-11-25', '2026-11-26', '2026-11-27']
  const s = seriesFrom([{ log_date: '2026-11-25', steps: 8000 }, { log_date: '2026-11-27', steps: '10000' }, { log_date: '2026-11-26', steps: null }], dates, 'steps')
  expect(s.map(p => p.value)).toEqual([8000, null, 10000])
  expect(avgOf(s)).toBe(9000)
  expect(avgOf([{ value: null }])).toBe(null)
  const cal = caloriesByDate([{ logged_on: '2026-11-27', protein_g: 50, carbs_g: 100, fat_g: 20 }, { logged_on: '2026-11-27', protein_g: 10, carbs_g: 0, fat_g: 0 }])
  expect(cal).toEqual({ '2026-11-27': 50 * 4 + 100 * 4 + 20 * 9 + 40 })
  expect(tickLabel('2026-11-27', 7)).toBe('F')
  expect(tickLabel('2026-11-23', 7)).toBe('M')
  expect(tickLabel('2026-11-27', 30)).toBe('27')
})

test('the right bottom tab lights up', () => {
  expect(tabFor('/app')).toBe('home')
  expect(tabFor('/app/')).toBe('home')
  expect(tabFor('/app/training')).toBe('home')
  expect(tabFor('/app/calendar')).toBe('home')
  expect(tabFor('/app/nutrition/plan')).toBe('eat')
  expect(tabFor('/app/trends')).toBe('progress')
  expect(tabFor('/app/progress')).toBe('progress')
  expect(tabFor('/app/messages')).toBe('chat')
  expect(tabFor('/app/community')).toBe('chat')
  expect(tabFor('/app/profile')).toBe('profile')
  expect(tabFor('/app/profile/edit')).toBe('profile')
  expect(tabFor('/app/checkin')).toBe('profile')
  expect(tabFor('/app/form-checks')).toBe('profile')
  expect(tabFor('/app/challenges')).toBe('profile')
})
