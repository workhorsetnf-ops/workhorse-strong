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

// ---------------------------------------------------------------------------
// Bulk matching: program exercises whose name isn't in the library, each
// paired with its most likely library exercise. Smarter than nameScore —
// understands gym shorthand (DB, BB, RDL, OHP…), plurals, "pull down" vs
// "pulldown", word order and small typos.

const ABBR = {
  db: 'dumbbell', dbs: 'dumbbell', dumbell: 'dumbbell', dumbells: 'dumbbell',
  bb: 'barbell', kb: 'kettlebell', kbs: 'kettlebell', sm: 'smith', ez: 'ez',
  rdl: 'romanian deadlift', rdls: 'romanian deadlift', sldl: 'stiff leg deadlift',
  ohp: 'overhead press', bss: 'bulgarian split squat', sl: 'single leg', sa: 'single arm',
  ghr: 'glute ham raise', ghd: 'glute ham', hspu: 'handstand push up', mb: 'medicine ball',
  med: 'medicine', ext: 'extension', exts: 'extension', incl: 'incline', decl: 'decline',
  alt: 'alternating', bw: 'bodyweight', hs: 'hammer strength', mach: 'machine',
  oh: 'overhead', lat: 'lat', lats: 'lat', tri: 'tricep', tris: 'tricep', bi: 'bicep', bis: 'bicep',
  triceps: 'tricep', biceps: 'bicep', calves: 'calf', ham: 'hamstring', hams: 'hamstring',
  hamstrings: 'hamstring', glutes: 'glute', delts: 'delt', delt: 'delt', rear: 'rear',
  pec: 'pec', pecs: 'pec', abs: 'ab', 'pull-up': 'pullup', 'push-up': 'pushup',
}
const JOIN = [['pull', 'down', 'pulldown'], ['pull', 'up', 'pullup'], ['push', 'up', 'pushup'],
  ['chin', 'up', 'chinup'], ['sit', 'up', 'situp'], ['step', 'up', 'stepup'], ['dead', 'lift', 'deadlift'],
  ['push', 'down', 'pushdown'], ['kick', 'back', 'kickback'], ['pull', 'over', 'pullover'],
  ['pull', 'through', 'pullthrough'], ['face', 'pull', 'facepull'], ['skull', 'crusher', 'skullcrusher']]
const DROP = new Set([...STOP, 'exercise', 'ex', 'variation', 'w', 'grip'])

function singular(w) {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (w.length > 3 && w.endsWith('es') && /(sh|ch|ss|x)es$/.test(w)) return w.slice(0, -2)
  if (w.length >= 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) return w.slice(0, -1)
  return w
}

export function canonTokens(s) {
  let words = normName(s).split(' ').filter(Boolean)
  words = words.flatMap(w => (ABBR[w] || singular(w)).split(' ')).map(w => ABBR[w] || w)
  const out = []
  for (let i = 0; i < words.length; i++) {
    const j = JOIN.find(([a, b]) => words[i] === a && words[i + 1] === b)
    if (j) { out.push(j[2]); i++ } else out.push(words[i])
  }
  return out.filter(w => !DROP.has(w))
}
export const canonKey = s => [...new Set(canonTokens(s))].sort().join(' ')

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}
const close = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && lev(a, b) <= (Math.min(a.length, b.length) >= 8 ? 2 : 1))

// 0..1 similarity on canonical words. 1 = same exercise written differently.
export function smartScore(a, b) {
  const A = [...new Set(canonTokens(a))], B = [...new Set(canonTokens(b))]
  if (!A.length || !B.length) return 0
  if (A.slice().sort().join(' ') === B.slice().sort().join(' ')) return 1
  // also catch "pulldown" vs "pull down" left unjoined, and spacing typos
  if (A.join('') === B.join('')) return 0.97
  const usedB = new Set(); let common = 0
  for (const w of A) {
    const k = B.findIndex((v, i) => !usedB.has(i) && close(w, v))
    if (k >= 0) { usedB.add(k); common++ }
  }
  if (common === A.length && common === B.length) return 0.95   // typos only
  const jac = common / (A.length + B.length - common)
  const covered = common === Math.min(A.length, B.length)
  // shorter name fully inside the longer one ("Leg Press" in "Machine Leg Press")
  return covered ? Math.max(jac, 0.55 + 0.35 * jac) : jac
}

// programRows: [{id, name}], library: [{id, name, ...}]
// -> [{ name, ids, count, best: libItem|null, score, options:[{item, score}] }]
// one entry per distinct program spelling that has no exact library match,
// most-used first.
export function findUnmatched(programRows, library, { minScore = 0.4, maxOptions = 5 } = {}) {
  const libNorm = new Set(library.map(l => normName(l.name)))
  const groups = groupByName(programRows).filter(g => !libNorm.has(normName(g.name)))
  return groups.map(g => {
    const options = library
      .map(item => ({ item, score: smartScore(g.name, item.name) }))
      .filter(o => o.score >= minScore)
      .sort((x, y) => y.score - x.score || x.item.name.length - y.item.name.length)
      .slice(0, maxOptions)
    const top = options[0]
    // two different library exercises tying at the top is a coin flip — don't pre-pick
    const tie = top && options[1] && options[1].score === top.score && top.score < 1
    return { ...g, options, best: top && !tie ? top.item : null, score: top ? top.score : 0 }
  }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export const confidence = s => s >= 0.95 ? 'high' : s >= 0.6 ? 'medium' : s > 0 ? 'low' : 'none'
