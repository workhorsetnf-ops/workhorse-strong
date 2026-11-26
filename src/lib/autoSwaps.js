// Swaps for every exercise without hand-picking them (Update 187).
// Claude reads the whole exercise library and, for each exercise, picks 3-5
// others from that same library that train the same movement and muscles with
// different equipment. They're saved as source='auto' alternatives; anything
// the coach added himself is left alone.
import { normName } from './exmatch.js'

export const BATCH = 25          // exercises per Claude request
export const MAX_ALTS = 5

// library: [{ id, name, category, kind }]. Only lifts get swaps.
export const swappable = library => (library || []).filter(l => (l.kind || 'exercise') === 'exercise' && String(l.name || '').trim())

// Which exercises still need swaps: never asked about, and no alternatives yet.
export function needingSwaps(library, alts) {
  const has = new Set((alts || []).map(a => a.library_id))
  return swappable(library).filter(l => !l.swaps_filled_at && !has.has(l.id))
}

export const SWAP_TOOL = {
  name: 'exercise_swaps',
  description: 'For each target exercise, the numbers of the best substitute exercises from the library list.',
  schema: {
    type: 'object',
    properties: {
      swaps: { type: 'array', items: { type: 'object', properties: {
        n: { type: 'integer', description: 'number of the target exercise' },
        alts: { type: 'array', items: { type: 'integer' }, description: 'numbers of substitutes, best first' },
      }, required: ['n', 'alts'], additionalProperties: false } },
    },
    required: ['swaps'],
    additionalProperties: false,
  },
}

// Number the library once; Claude answers with numbers so names can't drift.
export function swapPrompt(targets, library) {
  const list = swappable(library)
  const num = new Map(list.map((l, i) => [l.id, i + 1]))
  const line = l => `${num.get(l.id)}. ${l.name}${l.category ? ` [${l.category}]` : ''}`
  const system = [
    'You are a strength coach choosing exercise substitutes for clients who are training at gyms with different equipment, or who find a machine taken.',
    'For each target exercise, choose up to 5 substitutes FROM THE LIBRARY LIST ONLY, best first. A good substitute trains the same movement pattern and the same main muscles (e.g. horizontal press for chest, hip hinge for hamstrings/glutes, knee-dominant squat pattern for quads, vertical pull for lats).',
    'Prefer substitutes that use DIFFERENT equipment from the target (barbell, dumbbell, cable, machine, smith machine, band, bodyweight), so a client missing one piece of kit still has options. Include at least one dumbbell or bodyweight option when the library has a sensible one.',
    'Keep the difficulty and loading similar: do not swap a heavy compound lift for a small isolation exercise unless nothing closer exists. Unilateral versions of the same pattern are fine.',
    'Never list the target itself, or the same exercise under a slightly different name. If the library has no sensible substitute, return an empty list for that target rather than a poor one.',
  ].join('\n')
  const user = `LIBRARY (number. name [category]):\n${list.map(line).join('\n')}\n\nTARGETS - give substitutes for each of these numbers:\n${targets.map(t => num.get(t.id)).filter(Boolean).join(', ')}`
  return { system, user, num, list }
}

// Claude's numbers -> exercise_alternatives rows. Drops anything invalid:
// unknown numbers, the target itself, same-name duplicates, repeats.
export function parseSwapAi(data, targets, library) {
  const list = swappable(library)
  const byNum = new Map(list.map((l, i) => [i + 1, l]))
  const wanted = new Set(targets.map(t => t.id))
  const rows = []
  const seenTarget = new Set()
  for (const s of (data && Array.isArray(data.swaps) ? data.swaps : [])) {
    const t = byNum.get(Number(s?.n))
    if (!t || !wanted.has(t.id) || seenTarget.has(t.id)) continue
    seenTarget.add(t.id)
    const used = new Set([t.id]), names = new Set([normName(t.name)])
    for (const a of Array.isArray(s.alts) ? s.alts : []) {
      const alt = byNum.get(Number(a))
      if (!alt || used.has(alt.id) || names.has(normName(alt.name))) continue
      used.add(alt.id); names.add(normName(alt.name))
      rows.push({ library_id: t.id, alt_id: alt.id, source: 'auto' })
      if (used.size > MAX_ALTS) break
    }
  }
  return rows
}

// Position after any the coach already set, so his picks stay first.
export function withPositions(rows, existing) {
  const next = {}
  for (const e of existing || []) next[e.library_id] = Math.max(next[e.library_id] ?? 0, (e.position ?? 0) + 1)
  const taken = new Set((existing || []).map(e => `${e.library_id}:${e.alt_id}`))
  return rows.filter(r => !taken.has(`${r.library_id}:${r.alt_id}`)).map(r => {
    const position = next[r.library_id] ?? 0
    next[r.library_id] = position + 1
    return { ...r, position }
  })
}
