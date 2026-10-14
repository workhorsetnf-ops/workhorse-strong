// Progression calls from RIR: compares a finished session with its targets
// (rep range + RIR range) and says what to do next time. Double progression:
// fill the rep range first, then add load.

// "8-12" -> {lo: 8, hi: 12}, "10" -> {lo: 10, hi: 10}; null for AMRAP, 30s, etc.
export function parseRange(v) {
  const m = String(v ?? '').trim().match(/^(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?$/)
  if (!m) return null
  const a = Number(m[1]), b = m[2] !== undefined ? Number(m[2]) : a
  return { lo: Math.min(a, b), hi: Math.max(a, b) }
}

// Load jump: 5 lb on heavier lifts, 2.5 lb on light ones (DBs, cables).
export const loadStep = w => (w >= 100 ? 5 : 2.5)
const roundTo = (v, step) => Math.round(v / step) * step

// sets: [{ weight, reps, rir }] as logged; targets: [{ reps, target }] per set.
// Returns { call, title, detail, nextWeight } or null when there's nothing to judge.
export function progressionCall(sets, targets, type = 'rir') {
  if (type === 'percent') return null                 // load is prescribed
  const rows = sets
    .map((s, i) => ({ w: Number(s.weight) || 0, reps: Number(s.reps), rir: s.rir === '' || s.rir == null ? null : Number(s.rir), t: targets[i] || targets[targets.length - 1] || {} }))
    .filter(r => Number.isFinite(r.reps) && r.reps > 0)
  if (!rows.length) return null
  const judged = rows.map(r => {
    const reps = parseRange(r.t.reps)
    const eff = parseRange(r.t.target)
    if (!reps) return null
    // RIR: higher = easier. RPE: higher = harder, so flip it to "reps left".
    const left = r.rir === null || !Number.isFinite(r.rir) ? null : type === 'rpe' ? 10 - r.rir : r.rir
    const want = eff ? (type === 'rpe' ? { lo: 10 - eff.hi, hi: 10 - eff.lo } : eff) : null
    return {
      w: r.w,
      top: r.reps >= reps.hi,
      inRange: r.reps >= reps.lo,
      short: r.reps < reps.lo,
      easy: want && left !== null ? left >= want.lo : null,        // at or above the RIR target
      tooHard: want && left !== null ? left < want.lo : null,      // went past the target
      wayTooHard: want && left !== null ? left < want.lo - 1 || left <= 0 : null,
    }
  }).filter(Boolean)
  if (!judged.length) return null
  const heaviest = Math.max(...judged.map(j => j.w))
  const step = loadStep(heaviest)
  const next = heaviest ? roundTo(heaviest + step, step === 5 ? 5 : 2.5) : null

  if (judged.some(j => j.short && (j.wayTooHard || j.wayTooHard === null))) {
    const drop = heaviest ? roundTo(heaviest * 0.92, step) : null
    return { call: 'drop', title: 'Drop the weight', detail: `Missed the bottom of the rep range${judged.some(j => j.wayTooHard) ? ' with nothing left' : ''}. Take ~5–10% off${drop ? ` (about ${drop} lb)` : ''} and own the range.`, nextWeight: drop }
  }
  if (judged.every(j => j.top) && judged.every(j => j.easy !== false)) {
    return { call: 'up', title: 'Add weight', detail: `Hit the top of the range on every set${judged.some(j => j.easy) ? ' at your RIR target' : ''}. Go up ${step} lb${next ? ` (try ${next} lb)` : ''}.`, nextWeight: next }
  }
  if (judged.some(j => j.tooHard)) {
    return { call: 'hold', title: 'Hold the weight', detail: 'Reps were there but it was harder than the RIR target. Same weight, same reps, cleaner sets.', nextWeight: heaviest || null }
  }
  return { call: 'reps', title: 'Add reps', detail: `In range at the right effort. Same weight${heaviest ? ` (${heaviest} lb)` : ''}, beat last time by a rep.`, nextWeight: heaviest || null }
}

export const CALL_STYLE = {
  up: { color: '#000', bg: 'var(--orange)', icon: '▲' },
  reps: { color: 'var(--orange-hot)', bg: 'rgba(255,106,0,0.12)', icon: '+1' },
  hold: { color: '#c9a227', bg: 'rgba(201,162,39,0.14)', icon: '=' },
  drop: { color: '#fff', bg: '#b3261e', icon: '▼' },
}

// For the coach: the latest session of every exercise with logs, and its call.
// logs: workout_logs rows; exById: program_exercises by id; week: current week in block;
// dayOf: (log) -> 'YYYY-MM-DD'; setTargetsFn: (weekEntry, exercise) -> [{reps, target}]
export function latestCalls(logs, exById, week, dayOf, setTargetsFn) {
  const byEx = new Map()
  for (const l of logs) {
    if (!l.exercise_id || !exById[l.exercise_id]) continue
    const d = dayOf(l)
    const cur = byEx.get(l.exercise_id)
    if (!cur || d > cur.date) byEx.set(l.exercise_id, { date: d, sets: [l] })
    else if (d === cur.date) cur.sets.push(l)
  }
  const out = []
  for (const [id, { date, sets }] of byEx) {
    const ex = exById[id]
    const wt = Array.isArray(ex.week_targets) ? ex.week_targets[week - 1] : null
    const targets = setTargetsFn(wt, ex)
    const ordered = [...sets].sort((a, b) => (a.set_number || 0) - (b.set_number || 0))
    const call = progressionCall(ordered, targets, ex.progression_type || 'rir')
    if (call) out.push({ id, name: ex.name, date, sets: ordered, call })
  }
  const rank = { drop: 0, hold: 1, up: 2, reps: 3 }
  return out.sort((a, b) => rank[a.call.call] - rank[b.call.call] || a.name.localeCompare(b.name))
}
