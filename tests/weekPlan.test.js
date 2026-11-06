// Week-to-week progression shown to the client (Update 173).
import { test, expect } from 'vitest'
import { weekChange, plannedLoads, weekGuide, blockWeeks, rowsForWeek } from '../src/lib/weekPlan'

// Main Event Build style: Wave 1 main lift, weekly undulating on RPE
const squat = {
  name: 'Pause Squat', kind: 'exercise', progression_type: 'rpe', sets: 3, reps: '8', rir: '7',
  week_targets: [{ sets: 3, reps: '8', target: '7' }, { sets: 3, reps: '6', target: '8' }, { sets: 3, reps: '4', target: '9' }],
}
// accessory, meso RIR rule: weeks 1-3 first set 1 / rest 0
const acc = {
  name: 'Leg Extension', kind: 'exercise', progression_type: 'rir', sets: 3, reps: '10-15', rir: '1',
  week_targets: [0, 1, 2].map(() => ({ sets: 3, reps: '10-15', target: '1', setRows: [{ reps: '10-15', target: '1' }, { reps: '10-15', target: '0' }, { reps: '10-15', target: '0' }] })),
}
// Wave 2: top set + down sets
const top = {
  name: 'Back Squat', kind: 'exercise', progression_type: 'rpe', sets: 3, reps: '3-5', rir: '8',
  week_targets: ['8', '8.5', '9'].map(t => ({ sets: 3, reps: '3-5', target: t, setRows: [{ reps: '3-5', target: t }, { reps: '5-8', target: '7' }, { reps: '5-8', target: '7' }] })),
}

test('says what changed and what it means', () => {
  const c = weekChange(rowsForWeek(squat, 1), rowsForWeek(squat, 2), 'rpe')
  expect(c.changed).toBe(true)
  expect(c.headline).toBe('Fewer reps, heavier weight')
  expect(c.lines).toEqual(['Reps 8 → 6', 'RPE 7 → 8 (push closer to failure)'])
  const t = weekChange(rowsForWeek(top, 1), rowsForWeek(top, 2), 'rpe')
  expect(t.lines).toEqual(['Set 1: 3–5 @ RPE 8 → 3–5 @ RPE 8.5 (push closer to failure)'])
  expect(t.headline).toBe('Same reps, push harder')
  expect(weekChange(rowsForWeek(acc, 1), rowsForWeek(acc, 2), 'rir').changed).toBe(false)
})

test('RIR going down reads as harder, up as easier', () => {
  const r = (t) => [{ reps: '10', target: t }]
  expect(weekChange(r('2'), r('1'), 'rir').headline).toBe('Same reps, push harder')
  expect(weekChange(r('0'), r('1'), 'rir').headline).toBe('Same reps, back off a touch')
})

test('loads for the new week come from what they did last week', () => {
  // 185 x 8 with 3 left (RPE 7) -> week 2 is 6 reps @ RPE 8 -> heavier
  const p = plannedLoads([{ weight: 185, reps: 8, rir: '' }], rowsForWeek(squat, 1), rowsForWeek(squat, 2), 'rpe')
  expect(p.weights).toEqual([200, 200, 200])
  // logged RPE overrides the target: they said RPE 9 (1 left), so less room to add
  const q = plannedLoads([{ weight: 185, reps: 8, rir: '9' }], rowsForWeek(squat, 1), rowsForWeek(squat, 2), 'rpe')
  expect(q.weights[0]).toBeLessThan(200)
  // top set heavier than the down sets
  const t = plannedLoads([{ weight: 275, reps: 4, rir: '' }], rowsForWeek(top, 1), rowsForWeek(top, 2), 'rpe')
  expect(t.weights[0]).toBeGreaterThan(t.weights[1])
})

test('guide: changed week -> plan with loads; same week -> normal call against the right targets', () => {
  const last = { date: '2026-11-02', sets: { 1: { weight: 185, reps: 8, rir: '' }, 2: { weight: 185, reps: 8, rir: '' }, 3: { weight: 185, reps: 8, rir: '' } } }
  const g = weekGuide(squat, 2, last, '2026-11-09')
  expect(g.call.call).toBe('plan')
  expect(g.call.weights).toEqual([200, 200, 200])
  // old behaviour judged 8 reps against week 2's "6" range; now it's a plan, not a wrong "drop"/"up"
  const a = weekGuide(acc, 2, { date: '2026-11-02', sets: { 1: { weight: 100, reps: 15, rir: '1' }, 2: { weight: 100, reps: 15, rir: '0' }, 3: { weight: 100, reps: 15, rir: '0' } } }, '2026-11-09')
  expect(a.change.changed).toBe(false)
  expect(a.call.call).toBe('up')
  // week 1: no change box, still a call
  expect(weekGuide(squat, 1, last, '2026-11-09').change).toBeNull()
  // done earlier this same week -> judged against this week's targets
  expect(weekGuide(squat, 2, { ...last, date: '2026-11-10' }, '2026-11-09').call.call).not.toBe('plan')
  expect(weekGuide({ ...squat, kind: 'conditioning' }, 1, last, '2026-11-09')).toBeNull()
})

test('block view lists every week', () => {
  expect(blockWeeks(squat, 3).map(w => w.text)).toEqual(['3 × 8 @ RPE 7', '3 × 6 @ RPE 8', '3 × 4 @ RPE 9'])
  expect(blockWeeks(acc, 3)[0].text).toBe('10–15 @ RIR 1, 10–15 @ RIR 0, 10–15 @ RIR 0')
})
