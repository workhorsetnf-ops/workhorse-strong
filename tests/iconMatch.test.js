// Bulk icon upload matching (Update 176).
import { test, expect } from 'vitest'
import { matchFiles, cleanFileName, isGenericName, matchByOrder, missingIcons } from '../src/lib/iconMatch'

const lib = [{ id: 1, name: 'Barbell Back Squat' }, { id: 2, name: 'Dumbbell Bench Press' }, { id: 3, name: 'Leg Extension' },
  { id: 4, name: 'Romanian Deadlift' }, { id: 5, name: 'Cable Lateral Raise' }, { id: 6, name: 'Hip Thrust', icon_url: 'x' }, { id: 7, name: 'Zercher Squat' }]
const files = ['Barbell_Back-Squat (1).png', 'DB bench press.png', 'leg-extension-icon.webp', 'RDL.png',
  'ChatGPT Image Nov 6, 2026, 01_43_32 PM.png', 'Cable Lat Raise v2.png', 'leg extension.png', 'Bicycle.png'].map((name, i) => ({ name, lastModified: 100 - i }))

test('cleans file names', () => {
  expect(cleanFileName('Barbell_Back-Squat (1).png')).toBe('Barbell Back Squat')
  expect(cleanFileName('leg-extension-icon.webp')).toBe('leg extension')
  expect(isGenericName('ChatGPT Image Nov 6, 2026, 01_43_32 PM.png')).toBe(true)
  expect(isGenericName('Leg Extension.png')).toBe(false)
})
test('matches names, shorthand, and one file per exercise', () => {
  const m = matchFiles(files, lib)
  console.log(JSON.stringify(m.map((x, i) => [files[i].name, x.libId, Math.round(x.score * 100) / 100])))
  expect(m[0].libId).toBe(1); expect(m[1].libId).toBe(2); expect(m[3].libId).toBe(4); expect(m[5].libId).toBe(5)
  expect([m[2].libId, m[6].libId].filter(Boolean)).toEqual([3])   // two leg extension files: one wins
  expect(m[4].libId).toBeNull(); expect(m[7].libId).toBeNull()
})
test('generic files by save order onto the missing-icon list', () => {
  const m = matchFiles(files, lib)
  const miss = missingIcons(lib)
  expect(miss.map(l => l.id)).not.toContain(6)
  const o = matchByOrder(files, m, miss)
  // only Zercher Squat is still free; the earliest-saved unmatched file gets it
  const got = o.map((x, i) => [i, x]).filter(([, x]) => x.conf === 'order')
  expect(got.map(([, x]) => x.libId)).toEqual([7])
})
