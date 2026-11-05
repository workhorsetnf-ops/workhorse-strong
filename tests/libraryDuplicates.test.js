// Library duplicate clean-up (Update 171).
import { test, expect } from 'vitest'
import { baseName, findLibraryDuplicates } from '../src/lib/exmatch'
import { alternativesFor } from '../src/lib/swaps'

test('strips set/rep/side notes', () => {
  expect(baseName('Leg Extension (2 sets)')).toBe('Leg Extension')
  expect(baseName('Bulgarian Split Squat (each side)')).toBe('Bulgarian Split Squat')
  expect(baseName('Bulgarian Split Squat - each leg')).toBe('Bulgarian Split Squat')
  expect(baseName('Cable Lateral Raise 3x12-15')).toBe('Cable Lateral Raise')
  expect(baseName('Hammer Curl x2')).toBe('Hammer Curl')
  expect(baseName('Copenhagen Plank (each side, 20 sec)')).toBe('Copenhagen Plank')
  expect(baseName('Walking Lunge (10 reps)')).toBe('Walking Lunge')
  expect(baseName('Single-Arm Row (e/s)')).toBe('Single-Arm Row')
})
test('keeps real variations', () => {
  expect(baseName('Leg Press (High Feet)')).toBe('Leg Press (High Feet)')
  expect(baseName('Dumbbell Floor Press (Paused)')).toBe('Dumbbell Floor Press (Paused)')
  expect(baseName('Chin-Up (Bodyweight)')).toBe('Chin-Up (Bodyweight)')
  expect(baseName('Single-Arm Lat Pulldown')).toBe('Single-Arm Lat Pulldown')
})
const L = (id, name, extra = {}) => ({ id, name, created_at: id, ...extra })
test('groups duplicates and picks the best one to keep', () => {
  const lib = [
    L('1', 'Leg Extension (2 sets)'), L('2', 'leg extension'), L('3', 'Leg Extension - each leg', { video_url: 'v' }),
    L('4', 'DB Bench Press'), L('5', 'Dumbbell Bench Press'),
    L('6', 'Leg Press'), L('7', 'Leg Press (High Feet)'),
    L('8', 'Lat Pulldown'), L('9', 'Single-Arm Lat Pulldown'),
    L('10', 'Cable Fly'), L('11', 'Low-to-High Cable Fly'),
  ]
  const g = findLibraryDuplicates(lib)
  expect(g.map(x => x.items.map(i => i.id).sort())).toEqual([['1', '2', '3'], ['4', '5']])
  expect(g[0].keepId).toBe('3'); expect(g[0].cleanName).toBe('Leg Extension')   // has the video
  expect(g[1].keepId).toBe('4')                                                  // tie -> shorter name
})
test('a program exercise with notes in its name still finds its hotel swap', () => {
  const lib = [{ id: 'a', name: 'Bulgarian Split Squat' }, { id: 'b', name: 'Dumbbell Reverse Lunge' }]
  const alts = [{ library_id: 'a', alt_id: 'b', position: 0 }]
  expect(alternativesFor('Bulgarian Split Squat (each side)', lib, alts).map(x => x.name)).toEqual(['Dumbbell Reverse Lunge'])
  expect(alternativesFor('Bulgarian Split Squat', lib, alts)).toHaveLength(1)
})
