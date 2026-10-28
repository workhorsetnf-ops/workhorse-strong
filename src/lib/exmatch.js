// Matching library exercises to program exercises by name, forgivingly.
// "Machine Seated Row", "machine seated  row", "Machine-Seated Row" are the same
// exercise; "Machine seated neutral grip row" is a close cousin worth offering.

export function normName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

const STOP = new Set(['the', 'a', 'an', 'with', 'and', 'on', 'of', 'to', 'x'])
const tokens = s => normName(s).split(' ').filter(w => w && !STOP.has(w))

// 0..1: share of words in common (Jaccard), nudged up when every word of the
// shorter name appears in the longer one.
export function nameScore(a, b) {
  const A = new Set(tokens(a)), B = new Set(tokens(b))
  if (!A.size || !B.size) return 0
  let common = 0
  for (const w of A) if (B.has(w)) common++
  const jac = common / (A.size + B.size - common)
  const covered = common === Math.min(A.size, B.size)
  return covered ? Math.max(jac, 0.6) : jac
}

// rows: [{ id, name }] -> [{ name, ids, count }] one entry per distinct spelling
export function groupByName(rows) {
  const m = new Map()
  for (const r of rows) {
    const k = String(r.name || '').trim()
    if (!k) continue
    if (!m.has(k)) m.set(k, { name: k, ids: [] })
    m.get(k).ids.push(r.id)
  }
  return [...m.values()].map(g => ({ ...g, count: g.ids.length }))
}

// Exact matches (ignoring capitals, spacing, punctuation) and close ones.
export function matchProgramExercises(libName, rows, { minScore = 0.34, max = 20 } = {}) {
  const target = normName(libName)
  const groups = groupByName(rows)
  const exact = groups.filter(g => normName(g.name) === target)
  const similar = groups
    .filter(g => normName(g.name) !== target)
    .map(g => ({ ...g, score: nameScore(libName, g.name) }))
    .filter(g => g.score >= minScore)
    .sort((a, b) => b.score - a.score || b.count - a.count)
    .slice(0, max)
  return { exact, similar }
}
