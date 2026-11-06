// Build the next block from the previous one (Update 175).
import { test, expect } from 'vitest'
import { stepTarget, shiftReps, nextExercise, nextBlockName, rolloverStart, weeksPreview } from '../src/lib/nextBlock'

const squat = { id: 's', name: 'Pause Squat', progression_type: 'rpe', sets: 3, reps: '8', rir: '7',
  week_targets: [{ sets: 3, reps: '8', target: '7' }, { sets: 3, reps: '6', target: '8' }, { sets: 3, reps: '4', target: '9' }] }
const acc = { id: 'a', name: 'Leg Extension', progression_type: 'rir', sets: 3, reps: '10-15', rir: '1',
  week_targets: [0, 1, 2].map(() => ({ sets: 3, reps: '10-15', target: '1', setRows: [{ reps: '10-15', target: '1' }, { reps: '10-15', target: '0' }, { reps: '10-15', target: '0' }] })) }

test('step up: RIR down to 0, RPE up to 10, % up, reps shift', () => {
  expect(stepTarget('2', 'rir')).toBe('1'); expect(stepTarget('0', 'rir')).toBe('0'); expect(stepTarget('1-2', 'rir')).toBe('0-1')
  expect(stepTarget('7', 'rpe')).toBe('7.5'); expect(stepTarget('9.5-10', 'rpe')).toBe('10')
  expect(stepTarget('75', 'percent')).toBe('77.5'); expect(stepTarget('', 'rir')).toBe('')
  expect(shiftReps('8-12', -2)).toBe('6-10'); expect(shiftReps('AMRAP', -2)).toBe('AMRAP'); expect(shiftReps('1', -2)).toBe('1')
})

test('same method keeps the weekly pattern, a notch harder', () => {
  const { row } = nextExercise(squat, {}, 3, 3)
  expect(row.week_targets.map(w => [w.reps, w.target])).toEqual([['8', '7.5'], ['6', '8.5'], ['4', '9.5']])
  const a = nextExercise(acc, {}, 3, 3).row
  expect(a.week_targets[0].setRows.map(r => r.target)).toEqual(['0', '0', '0'])
  // gentler step chosen in review
  expect(nextExercise(acc, {}, 3, 3, { rir: 0, rpe: 0, pct: 0, reps: 0 }).row.week_targets[0].setRows.map(r => r.target)).toEqual(['1', '0', '0'])
  // longer block repeats the pattern
  expect(nextExercise(squat, {}, 6, 3).row.week_targets.map(w => w.reps)).toEqual(['8', '6', '4', '8', '6', '4'])
})

test('change the method', () => {
  const tb = nextExercise(squat, { method: 'topback' }, 3, 3).row
  expect(tb.week_targets[1].setRows).toEqual([{ reps: '6', target: '8.5' }, { reps: '6', target: '7.5' }, { reps: '6', target: '7.5' }])
  const st = nextExercise(acc, { method: 'straight' }, 3, 3).row
  expect(st.week_targets[0]).toEqual({ sets: 3, reps: '10-15', target: '0' })
  // custom: new scheme, keeps last block's effort wave (RPE 7 -> 8 -> 9 = RIR 3 -> 2 -> 1 shape)
  const c = nextExercise(squat, { method: 'custom', custom: '4x6-8 @3', customType: 'rir' }, 3, 3).row
  expect(c.week_targets.map(w => w.target)).toEqual(['3', '2', '1'])
  expect(c.progression_type).toBe('rir')
  expect(nextExercise(squat, { method: 'custom', custom: 'heavy' }, 3, 3).error).toBeTruthy()
  expect(weeksPreview(nextExercise(squat, {}, 2, 3).row)).toBe('W1 3×8 @ RPE 7.5 · W2 3×6 @ RPE 8.5')
})

test('names and client rollover', () => {
  expect(nextBlockName('Wave 1 · Derivatives', 2)).toBe('Wave 2 · Derivatives')
  expect(nextBlockName('Strength', 2)).toBe('Block 3')
  const blocks = [{ id: 'b1', weeks: 3 }, { id: 'b2', weeks: 3 }]
  // on week 2 of block 2 = 4 weeks done -> start 4 Mondays ago
  expect(rolloverStart({ current_block_id: 'b2', current_week: 2 }, blocks, '2026-11-09')).toBe('2026-10-12')
  expect(rolloverStart({ current_block_id: 'b1', current_week: 1 }, blocks, '2026-11-09')).toBe('2026-11-09')
})
