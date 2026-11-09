import { describe, it, expect } from 'vitest'
import { checkinOutlook, shortDate, checkinDueDate } from '../src/lib/dashboard.js'

// 0 = Monday. 2026-11-09 is a Monday.
const today = '2026-11-09'
describe('checkinOutlook', () => {
  it('weekly Monday, checked in last Monday -> due today, then weekly', () => {
    const o = checkinOutlook({ checkinDay: 0, frequency: 'weekly', lastCheckin: '2026-11-02', today })
    expect(o.due).toBe('2026-11-09'); expect(o.status).toBe('today')
    expect(o.upcoming).toEqual(['2026-11-16', '2026-11-23', '2026-11-30'])
  })
  it('every 2 weeks Thursday, checked in Nov 5 -> Nov 19 then every 2 weeks', () => {
    const o = checkinOutlook({ checkinDay: 3, frequency: 'biweekly', lastCheckin: '2026-11-05', today })
    expect(o.due).toBe('2026-11-19'); expect(o.status).toBe('upcoming'); expect(o.inDays).toBe(10)
    expect(o.upcoming).toEqual(['2026-12-03', '2026-12-17', '2026-12-31'])
  })
  it('monthly lands on the check-in weekday every 4 weeks', () => {
    const o = checkinOutlook({ checkinDay: 4, frequency: 'monthly', lastCheckin: '2026-10-30', today })
    expect(o.due).toBe('2026-11-27'); expect(o.upcoming[0]).toBe('2026-12-25')
  })
  it('late check-in reports days late and next dates continue from the due date', () => {
    const o = checkinOutlook({ checkinDay: 4, frequency: 'weekly', lastCheckin: '2026-10-30', today })
    expect(o.due).toBe('2026-11-06'); expect(o.status).toBe('late'); expect(o.late).toBe(3)
    expect(o.upcoming[0]).toBe('2026-11-13')
  })
  it('tomorrow', () => {
    expect(checkinOutlook({ checkinDay: 1, frequency: 'weekly', lastCheckin: '2026-11-03', today }).status).toBe('tomorrow')
  })
  it('new client: first check-in day a week after start', () => {
    const o = checkinOutlook({ checkinDay: 0, frequency: 'weekly', lastCheckin: null, today, startDate: '2026-11-06' })
    expect(o.due).toBe('2026-11-16')
  })
  it('null when nothing to go on', () => {
    expect(checkinOutlook({ checkinDay: null, frequency: 'weekly', lastCheckin: null, today })).toBeNull()
  })
  it('agrees with checkinDueDate (what clients and reminders use)', () => {
    const args = { checkinDay: 2, frequency: 'biweekly', lastCheckin: '2026-10-28', today }
    expect(checkinOutlook(args).due).toBe(checkinDueDate(args))
  })
  it('shortDate has no timezone drift', () => {
    expect(shortDate('2026-11-16')).toMatch(/16/)
  })
})
