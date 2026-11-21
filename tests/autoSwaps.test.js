// Update 187: Claude fills in swaps for every exercise; block-long client swaps.
import { test, expect, beforeEach } from 'vitest'
import { makeSb } from './helpers/fakeSupabase.js'
import { swapPrompt, parseSwapAi, withPositions, needingSwaps, swappable, BATCH } from '../src/lib/autoSwaps'
import { activeSwap, scopeForReason, applySwap, blockSwapCarry, alternativesFor } from '../src/lib/swaps'
import { fillSwaps } from '../api/swaps-ai.js'

const LIB = [
  { id: 'sq', name: 'Barbell Back Squat', category: 'Legs' },
  { id: 'gs', name: 'Goblet Squat', category: 'Legs' },
  { id: 'lp', name: 'Leg Press', category: 'Legs' },
  { id: 'hs', name: 'Hack Squat', category: 'Legs' },
  { id: 'bp', name: 'Barbell Bench Press', category: 'Chest' },
  { id: 'db', name: 'Dumbbell Bench Press', category: 'Chest' },
  { id: 'pu', name: 'Push-Up', category: 'Chest' },
  { id: 'bp2', name: 'barbell bench-press', category: 'Chest' },        // same exercise, different spelling
  { id: 'run', name: 'Treadmill Intervals', kind: 'conditioning' },
]
const n = id => swappable(LIB).findIndex(l => l.id === id) + 1

test('prompt numbers only lifts and lists only the targets asked for', () => {
  const { system, user } = swapPrompt([LIB[0], LIB[4]], LIB)
  expect(user).toContain('1. Barbell Back Squat [Legs]')
  expect(user).not.toContain('Treadmill')
  expect(user.trim().endsWith(`${n('sq')}, ${n('bp')}`)).toBe(true)
  expect(system).toMatch(/DIFFERENT equipment/)
})

test('parse keeps valid picks, drops self, unknown numbers, same-name copies, repeats, non-targets; max 5', () => {
  const data = { swaps: [
    { n: n('sq'), alts: [n('sq'), n('gs'), 999, n('lp'), n('gs'), n('hs')] },
    { n: n('bp'), alts: [n('bp2'), n('db'), n('pu')] },             // bp2 is the bench under another spelling
    { n: n('gs'), alts: [n('sq')] },                                // not a target this batch
    { n: n('sq'), alts: [n('pu')] },                                // target answered twice: first wins
  ] }
  const rows = parseSwapAi(data, [LIB[0], LIB[4]], LIB)
  expect(rows.map(r => `${r.library_id}>${r.alt_id}`)).toEqual(['sq>gs', 'sq>lp', 'sq>hs', 'bp>db', 'bp>pu'])
  expect(rows.every(r => r.source === 'auto')).toBe(true)
  const many = parseSwapAi({ swaps: [{ n: 1, alts: [2, 3, 4, 5, 6, 7, 8] }] }, [LIB[0]], LIB)
  expect(many.length).toBe(5)
  expect(parseSwapAi('not json', [LIB[0]], LIB)).toEqual([])
})

test("Claude's picks go after the coach's own and never duplicate them", () => {
  const existing = [{ library_id: 'sq', alt_id: 'lp', position: 0 }, { library_id: 'sq', alt_id: 'hs', position: 1 }]
  const rows = withPositions([{ library_id: 'sq', alt_id: 'lp' }, { library_id: 'sq', alt_id: 'gs' }, { library_id: 'bp', alt_id: 'db' }], existing)
  expect(rows).toEqual([{ library_id: 'sq', alt_id: 'gs', position: 2 }, { library_id: 'bp', alt_id: 'db', position: 0 }])
})

test('needing swaps: lifts with no alternatives that Claude has not been asked about', () => {
  const lib = LIB.map(l => (l.id === 'pu' ? { ...l, swaps_filled_at: '2026-11-21' } : l))
  expect(needingSwaps(lib, [{ library_id: 'sq', alt_id: 'gs' }]).map(l => l.id)).toEqual(['gs', 'lp', 'hs', 'bp', 'db', 'bp2'])
})

// ---- server
let calls
const fakeClaude = (pick) => async (url, opts) => {
  const body = JSON.parse(opts.body)
  calls.push(body)
  const nums = body.messages[0].content[0].text.split('TARGETS')[1].match(/\d+/g).map(Number)
  return { ok: true, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ swaps: nums.map(x => ({ n: x, alts: pick(x) })) }) }] }) }
}
beforeEach(() => { calls = []; process.env.ANTHROPIC_API_KEY = 'test' })

test('fills in batches, marks every exercise asked about, leaves coach swaps alone', async () => {
  const big = Array.from({ length: 60 }, (_, i) => ({ id: `e${i}`, name: `Exercise ${i}`, category: 'X' }))
  const sb = makeSb({ exercise_library: big.map(x => ({ ...x })), exercise_alternatives: [{ library_id: 'e0', alt_id: 'e5', position: 0, source: 'coach' }] })
  const pick = x => [((x) % 60) + 1, ((x + 1) % 60) + 1] // the next two exercises
  const r1 = await fillSwaps(sb, {}, fakeClaude(pick))
  expect(r1).toEqual({ filled: BATCH, added: BATCH * 2, left: 59 - BATCH })     // e0 already has a coach swap
  expect(sb.db.exercise_library.filter(l => l.swaps_filled_at).length).toBe(BATCH)
  let r = r1
  while (r.left) r = await fillSwaps(sb, {}, fakeClaude(pick))
  expect(calls.length).toBe(Math.ceil(59 / BATCH))
  expect(await fillSwaps(sb, {}, fakeClaude(pick))).toEqual({ filled: 0, added: 0, left: 0 })
  expect(calls.length).toBe(Math.ceil(59 / BATCH))                            // nothing left: Claude not asked again
  expect(sb.db.exercise_alternatives.filter(a => a.library_id === 'e0')).toEqual([{ library_id: 'e0', alt_id: 'e5', position: 0, source: 'coach' }])

  // redo: Claude's are cleared and picked again; the coach's swap survives
  await fillSwaps(sb, { reset: true }, fakeClaude(() => []))
  expect(sb.db.exercise_alternatives.some(a => a.source === 'auto')).toBe(false)
  expect(sb.db.exercise_alternatives.length).toBe(1)
})

test('a new exercise: just that one is filled, even if others are waiting', async () => {
  const sb = makeSb({ exercise_library: LIB.map(x => ({ ...x })), exercise_alternatives: [] })
  const r = await fillSwaps(sb, { ids: ['bp'] }, fakeClaude(() => [n('db'), n('pu')]))
  expect(r).toEqual({ filled: 1, added: 2, left: 0 })
  expect(calls[0].messages[0].content[0].text.split('TARGETS')[1]).toMatch(new RegExp(`:\\n${n('bp')}$`))
  expect(sb.db.exercise_alternatives.map(a => a.alt_id)).toEqual(['db', 'pu'])
  // and the client's swap sheet now finds them, matched by name
  expect(alternativesFor('barbell bench press', sb.db.exercise_library, sb.db.exercise_alternatives).map(l => l.name)).toEqual(['Dumbbell Bench Press', 'Push-Up'])
})

test('no API key: clear message, nothing written', async () => {
  delete process.env.ANTHROPIC_API_KEY
  const sb = makeSb({ exercise_library: LIB.map(x => ({ ...x })), exercise_alternatives: [] })
  await expect(fillSwaps(sb, {}, fakeClaude(() => []))).rejects.toThrow(/ANTHROPIC_API_KEY/)
  expect(sb.db.exercise_alternatives).toEqual([])
})

// ---- block-long swaps
test('"No equipment" defaults to the rest of the block; the rest to today', () => {
  expect(['equipment', 'taken', 'hurts', 'other'].map(scopeForReason)).toEqual(['block', 'day', 'day', 'day'])
})
test("today's swap wins over a block swap; the block swap shows otherwise", () => {
  const day = { alt_name: 'Goblet Squat', alt_library_id: 'gs', reason: 'taken' }
  const blk = { alt_name: 'Leg Press', alt_library_id: 'lp', reason: 'equipment' }
  expect(activeSwap(day, blk)).toMatchObject({ alt_name: 'Goblet Squat', scope: 'day' })
  expect(activeSwap(null, blk)).toMatchObject({ alt_name: 'Leg Press', scope: 'block' })
  expect(activeSwap(null, null)).toBe(null)
  const ex = applySwap({ id: 'x', name: 'Hack Squat' }, activeSwap(null, blk), { lp: { video_url: 'v', icon_url: 'i' } })
  expect(ex).toMatchObject({ name: 'Leg Press', swappedFrom: 'Hack Squat', swapScope: 'block', based_on_lift: 'Hack Squat', video_url: 'v' })
})
test('next block uses a block swap only when everyone on the program kept the same one', () => {
  const rows = [
    { client_id: 'a', exercise_id: 'x1', alt_name: 'Leg Press', reason: 'equipment' },
    { client_id: 'a', exercise_id: 'x2', alt_name: 'Push-Up', reason: 'equipment' },
    { client_id: 'b', exercise_id: 'x2', alt_name: 'Push-Up', reason: 'equipment' },
    { client_id: 'b', exercise_id: 'x3', alt_name: 'A' }, { client_id: 'a', exercise_id: 'x3', alt_name: 'B' },
    { client_id: 'zz', exercise_id: 'x1', alt_name: 'Leg Press' },
  ]
  expect(blockSwapCarry(rows, ['a'])).toEqual({ x1: { alt_name: 'Leg Press', reason: 'equipment' }, x2: { alt_name: 'Push-Up', reason: 'equipment' }, x3: { alt_name: 'B', reason: '' } })
  expect(blockSwapCarry(rows, ['a', 'b'])).toEqual({ x2: { alt_name: 'Push-Up', reason: 'equipment' } })
  expect(blockSwapCarry(rows, [])).toEqual({})
})
