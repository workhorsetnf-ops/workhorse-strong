// Progression check (Update 174).
import { test, expect } from 'vitest'
import { checkExercise, fillGaps, checkPrograms } from '../src/lib/progressionCheck'

const wk = (reps, target, sets = 3) => ({ sets, reps, target })
test('flags blank weeks, missing targets, no weekly targets, and flat', () => {
  expect(checkExercise({ week_targets: [wk('8', '7'), null, wk('4', '9')] }, [1, 2, 3]).missing).toEqual([2])
  expect(checkExercise({ week_targets: [wk('8', '7'), wk('6', ''), wk('4', '9')] }, [1, 2, 3]).noTarget).toEqual([2])
  expect(checkExercise({ sets: 3, reps: '10', week_targets: [] }, [1, 2, 3]).noWeeks).toBe(true)
  expect(checkExercise({ week_targets: [wk('10', '1'), wk('10', '1'), wk('10', '1')] }, [1, 2, 3]).flat).toBe(true)
  // power work with no target in any week is fine
  expect(checkExercise({ week_targets: [wk('3', ''), wk('3', ''), wk('3', '')] }, [1, 2, 3]).noTarget).toEqual([])
  // per-set targets count as a target
  expect(checkExercise({ week_targets: [wk('10', '1'), { sets: 3, reps: '10', target: '', setRows: [{ reps: '10', target: '0' }] }] }, [1, 2]).noTarget).toEqual([])
  // single-week block: nothing to progress
  expect(checkExercise({ week_targets: [] }, [1]).noWeeks).toBe(false)
})
test('fill copies the week before (or after, for week 1)', () => {
  expect(fillGaps({ week_targets: [wk('8', '7'), null, wk('4', '9')] }, [1, 2, 3])).toEqual([wk('8', '7'), wk('8', '7'), wk('4', '9')])
  expect(fillGaps({ week_targets: [null, wk('6', '8')] }, [1, 2])).toEqual([wk('6', '8'), wk('6', '8')])
  expect(fillGaps({ week_targets: [wk('8', '7'), wk('6', ''), wk('4', '9')] }, [1, 2, 3])[1]).toEqual(wk('6', '7'))
  expect(fillGaps({ week_targets: [wk('8', '7'), wk('6', '8')] }, [1, 2])).toBeNull()
})
test('whole app: flat block, rotations, conditioning ignored', () => {
  const r = checkPrograms({
    programs: [{ id: 'p', name: 'P' }, { id: 'q', name: 'Q' }],
    blocks: [{ id: 'b', program_id: 'p', name: 'B', weeks: 4 }, { id: 'c', program_id: 'q', name: 'C', weeks: 2 }],
    days: [{ id: 'd', block_id: 'b', track: 'exercise', rotation_id: 'rA' }, { id: 'k', block_id: 'b', track: 'conditioning' }, { id: 'e', block_id: 'c', track: 'exercise' }],
    rotations: [{ id: 'rA', block_id: 'b', position: 0 }, { id: 'rB', block_id: 'b', position: 1 }],
    exercises: [
      // rotation A runs weeks 1 and 3 only; weeks 2/4 blank is fine
      { id: 'x', day_id: 'd', name: 'Squat', week_targets: [wk('8', '7'), null, wk('6', '8'), null] },
      { id: 'y', day_id: 'k', name: 'Bike', week_targets: [] },
      { id: 'z', day_id: 'e', name: 'Row', week_targets: [wk('10', '1'), wk('10', '1')] },
    ],
  })
  expect(r[0].problems).toBe(0)
  expect(r[1].blocks[0].flatBlock).toBe(true)
  expect(r[1].problems).toBe(1)
})
