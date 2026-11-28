// Update 191: CoachRx-style coach navigation + roster numbers.
import { test, expect } from 'vitest'
import { sectionFor, menuFor, topTabs, ago, latestThreads } from '../src/lib/coachNav'
import { businessStats, compliancePct, foodPct, exerciseDue, dueLabel, cleanTags, matchesSearch, toCsv, checkinCard } from '../src/lib/coachRoster'

test('every coach page lights the right top tab', () => {
  expect(sectionFor('/coach')).toBe('dashboard')
  expect(sectionFor('/coach/')).toBe('dashboard')
  expect(sectionFor('/coach/clients')).toBe('clients')
  expect(sectionFor('/coach/checkins')).toBe('clients')
  expect(sectionFor('/coach/day/abc')).toBe('clients')
  expect(sectionFor('/coach/logs/abc')).toBe('clients')
  expect(sectionFor('/coach/library')).toBe('index')
  expect(sectionFor('/coach/forms')).toBe('index')
  expect(sectionFor('/coach/programs')).toBe('programs')
  expect(sectionFor('/coach/business')).toBe('business')
  expect(sectionFor('/coach/pipeline')).toBe('business')
  expect(sectionFor('/coach/contracts/print/x')).toBe('business')
  expect(sectionFor('/coach/team')).toBe('coaches')
  expect(sectionFor('/coach/notifications')).toBe('dashboard')   // under the avatar menu
})

test('section menus; Programs uses the Index menu; Coaches is head-coach only', () => {
  expect(menuFor('/coach')).toEqual([])
  expect(menuFor('/coach/programs').map(i => i.label)).toEqual(menuFor('/coach/library').map(i => i.label))
  expect(menuFor('/coach/programs').map(i => i.label)).toContain('Programs')
  expect(menuFor('/coach/team', false)).toEqual([])
  expect(menuFor('/coach/team', true).map(i => i.label)).toEqual(['Team'])
  // all 26 old sidebar pages are still reachable from a menu or the avatar menu
  const reachable = new Set(['/coach', '/coach/notifications', '/coach/problems', ...['/coach/clients', '/coach/library', '/coach/business', '/coach/team'].flatMap(p => menuFor(p, true).map(i => i.to))])
  for (const p of ['pipeline','clients','group','alerts','form-checks','challenges','resources','hub','roadmap','community','programs','library','templates','forms','intake-forms','contracts','checkins','scorecard','calls','messages','texts','testimonials','notifications','problems','team'])
    expect(reachable.has('/coach/' + p), p).toBe(true)
})

test('top tabs add up what’s waiting', () => {
  const t = topTabs(false, { checkins: 2, messages: 3, formChecks: 0 })
  expect(t.map(x => x.label)).toEqual(['Dashboard', 'Clients', 'Index', 'Business', 'Programs'])
  expect(t.find(x => x.key === 'clients').waiting).toBe(5)
  expect(topTabs(true).map(x => x.label)).toContain('Coaches')
})

test('“a day ago” and latest thread per client', () => {
  const now = Date.parse('2026-11-28T12:00:00Z')
  expect(ago('2026-11-28T11:59:30Z', now)).toBe('just now')
  expect(ago('2026-11-28T09:00:00Z', now)).toBe('3 hours ago')
  expect(ago('2026-11-27T12:00:00Z', now)).toBe('a day ago')
  expect(ago('2026-11-22T12:00:00Z', now)).toBe('6 days ago')
  const msgs = [
    { sender_id: 'me', recipient_id: 'a', body: 'Good stuff', created_at: '2026-11-22T10:00:00Z', read_at: null },
    { sender_id: 'a', recipient_id: 'me', body: 'thanks', created_at: '2026-11-21T10:00:00Z', read_at: '2026-11-21' },
    { sender_id: 'b', recipient_id: 'me', body: 'see you at 6', created_at: '2026-11-27T10:00:00Z', read_at: null },
  ]
  const t = latestThreads(msgs, 'me')
  expect(t.map(x => [x.other, x.last.body, x.unread])).toEqual([['b', 'see you at 6', true], ['a', 'Good stuff', false]])
})

test('business numbers', () => {
  const s = businessStats({
    today: '2026-11-28',
    stages: [{ id: 'won', is_won: true }, { id: 'lost', is_lost: true }, { id: 'new' }],
    leads: [{ stage_id: 'new', deal_size: 1500, next_action_date: '2026-11-27' }, { stage_id: 'new', deal_size: 500, archived: true }, { stage_id: 'won', stage_changed_at: '2026-11-03T00:00:00Z' }, { stage_id: 'won', stage_changed_at: '2026-10-03' }, { stage_id: 'lost' }],
    clients: [{ status: 'active', created_at: '2026-11-02' }, { status: 'active', created_at: '2026-01-01' }, { status: 'paused' }, { status: 'exited', status_changed_at: '2026-11-10' }],
    contracts: [{ status: 'sent' }, { status: 'signed', signed_at: '2026-11-04' }, { status: 'signed', signed_at: '2026-09-04' }],
  })
  expect(s).toMatchObject({ activeClients: 2, pausedClients: 1, newThisMonth: 1, exitedThisMonth: 1, openLeads: 1, pipelineValue: 1500, wonThisMonth: 1, followUpsDue: 1, contractsOut: 1, contractsSigned: 1 })
})

test('compliance, food log and exercise-due rules', () => {
  const today = '2026-11-27'  // Friday
  const counts = { '2026-11-23': 1, '2026-11-24': 1, '2026-11-26': 1, '2026-11-27': 1, '2026-11-30': 1 }
  const logged = new Set(['2026-11-23', '2026-11-26'])
  expect(compliancePct(counts, logged, today, 7)).toBe(67)      // 2 of Mon/Tue/Thu; Fri not over yet
  expect(compliancePct(counts, new Set([...logged, today]), today, 7)).toBe(75)
  expect(compliancePct({}, logged, today, 7)).toBe(null)
  expect(foodPct(new Set(['2026-11-25', '2026-11-26']), today, 7)).toBe(33)   // 2 of 6 finished days
  expect(foodPct(new Set(), today, 7, '2026-11-27')).toBe(null)                // joined today
  expect(exerciseDue(counts, logged, today)).toEqual({ date: '2026-11-24', late: true })
  expect(exerciseDue(counts, new Set([...logged, '2026-11-24']), today)).toEqual({ date: '2026-11-27', late: false })
  expect(exerciseDue({}, logged, today)).toBe(null)
  expect(dueLabel({ date: '2026-11-24', late: true }, today)).toBe('Last Tuesday')
  expect(dueLabel({ date: '2026-11-26', late: true }, today)).toBe('Yesterday')
  expect(dueLabel({ date: '2026-11-27', late: false }, today)).toBe('Today')
  expect(dueLabel({ date: '2026-12-13', late: false }, today)).toBe('Sun Dec 13th')
  expect(dueLabel({ date: '2026-12-01', late: false }, today)).toBe('Tue Dec 1st')
  expect(dueLabel({ date: '2026-12-22', late: false }, today)).toBe('Tue Dec 22nd')
  expect(dueLabel({ date: '2026-12-11', late: false }, today)).toBe('Fri Dec 11th')
})

test('tags, search, CSV', () => {
  expect(cleanTags([' Cut ', 'cut', 'AEW', '', null, 'Road  warrior'])).toEqual(['AEW', 'Cut', 'Road warrior'])
  const c = { full_name: 'Izzy Quinn', email: 'iz@x.com', tags: ['Indie'] }
  expect(matchesSearch(c, 'quinn')).toBe(true); expect(matchesSearch(c, 'indie')).toBe(true)
  expect(matchesSearch(c, 'aew')).toBe(false); expect(matchesSearch(c, '')).toBe(true)
  expect(toCsv([['Name', 'Tags'], ['A, B', 'x "y"']])).toBe('Name,Tags\n"A, B","x ""y"""')
})

test('weekly check-in card: ratings become bars, the rest Q&A', () => {
  const card = checkinCard({ energy: 8, hunger: null, sleep_avg: 7.25, adherence: 0.86, weight: 201, notes: 'Good week',
    form_responses: [{ label: 'Training quality this week', value: '5' }, { label: 'Any wins?', value: 'Completed all the workouts' }, { label: 'Empty', value: '' }] })
  expect(card.bars.map(b => [b.label, b.value, b.max])).toEqual([['Energy this week', 8, 10], ['On-plan days', 86, 100], ['Sleep (avg hours)', 7.3, 9], ['Training quality this week', 5, 10]])
  expect(card.qa).toEqual([{ label: 'Any wins?', value: 'Completed all the workouts' }, { label: 'Notes', value: 'Good week' }])
  expect(card.facts).toEqual(['201 lb'])
})
