// Library exercises not in any program (Update 172).
import { test, expect } from 'vitest'
import { findUnusedLibrary } from '../src/lib/exmatch'

const L = (id, name, extra = {}) => ({ id, name, ...extra })
test('used by name, notes, capitals or shorthand; swaps of used exercises kept', () => {
  const lib = [
    L('1', 'Leg Extension'), L('2', 'Dumbbell Bench Press'), L('3', 'Bulgarian Split Squat'),
    L('4', 'Spanish Squat (Band)'),          // hotel swap of Leg Extension -> kept
    L('5', 'Zercher Squat'),                 // nobody uses it
    L('6', 'Cable Crossover', { video_url: 'v' }),
    L('7', 'Dumbbell Fly'),                  // swap of an UNUSED exercise -> not protected
    L('8', 'Leg Press (High Feet)'),         // program has plain Leg Press only -> unused
  ]
  const programs = ['leg extension', 'DB Bench Press (2 sets)', 'Bulgarian Split Squat - each leg', 'Leg Press']
  const alts = [{ library_id: '1', alt_id: '4' }, { library_id: '6', alt_id: '7' }]
  const r = findUnusedLibrary(lib, programs, alts)
  expect(r.unused.map(l => l.id)).toEqual(['6', '7', '8', '5'].sort((a, b) => lib.find(x => x.id === a).name.localeCompare(lib.find(x => x.id === b).name)))
  expect(r.keptAsSwap.map(l => l.id)).toEqual(['4'])
})
test('empty programs: everything unused except nothing', () => {
  expect(findUnusedLibrary([L('1', 'A')], [], []).unused).toHaveLength(1)
})
