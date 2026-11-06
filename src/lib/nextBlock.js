// Build the next block from the previous one (Update 175).
// Same days, same week-to-week pattern, a notch harder. Any exercise can be
// swapped or put into a different method in review before it's saved.
import { setTargets } from './weeks'
import { parseExerciseLine } from './parse'

const num = v => (Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10))
// shift every number in a "1-2" style range; null when it isn't one
function shiftRange(v, by, lo = -Infinity, hi = Infinity) {
  const m = String(v ?? '').trim().match(/^(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?$/)
  if (!m) return null
  const f = x => num(Math.min(hi, Math.max(lo, Number(x) + by)))
  if (m[2] === undefined) return f(m[1])
  const a = f(m[1]), b = f(m[2])
  return a === b ? a : `${a}-${b}`
}

export const DEFAULT_STEP = { rir: 1, rpe: 0.5, pct: 2.5, reps: 0 }

// One notch harder: RIR down (not below 0), RPE up (not above 10), % up.
export function stepTarget(target, type, step = DEFAULT_STEP) {
  if (String(target ?? '').trim() === '') return target ?? ''
  const by = type === 'rpe' ? step.rpe : type === 'percent' ? step.pct : -step.rir
  const out = shiftRange(target, by, type === 'percent' ? 1 : 0, type === 'rpe' ? 10 : type === 'percent' ? 100 : Infinity)
  return out ?? target
}
export function shiftReps(reps, by) {
  if (!by) return reps
  return shiftRange(reps, by, 1) ?? reps
}

// One week entry -> the same week next block, stepped up.
export function stepWeek(wt, ex, step = DEFAULT_STEP) {
  const type = ex.progression_type || 'rir'
  const rows = setTargets(wt, ex)
  const base = { sets: rows.length || Number(ex.sets) || 0, reps: shiftReps(wt?.reps ?? ex.reps, step.reps), target: stepTarget(wt?.target ?? ex.rir, type, step) }
  const out = { ...(wt || {}), ...base }
  if (Array.isArray(wt?.setRows)) out.setRows = rows.map(r => ({ reps: shiftReps(r.reps, step.reps), target: stepTarget(r.target, type, step) }))
  return out
}

const easier = (t, type) => stepTarget(t, type, { rir: -1, rpe: -1, pct: -10, reps: 0 })
const midOf = t => {
  const m = String(t ?? '').match(/^(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?$/)
  return m ? (Number(m[1]) + Number(m[2] ?? m[1])) / 2 : null
}

export const METHODS = [
  ['keep', 'Same method'],
  ['straight', 'Straight sets'],
  ['topback', 'Top set + back-off sets'],
  ['custom', 'Custom…'],
]

// The old block's week entry for new week w (the pattern repeats if the new
// block is longer).
const oldWeek = (ex, w, oldWeeks) => (Array.isArray(ex.week_targets) ? ex.week_targets[((w - 1) % Math.max(1, oldWeeks))] : null)

// New week_targets + base fields for one exercise.
// plan: { method, custom, name } ; returns { row, error }
export function nextExercise(ex, { method = 'keep', custom = '', customType } = {}, weeks, oldWeeks, step = DEFAULT_STEP) {
  const type = ex.progression_type || 'rir'
  const W = Array.from({ length: weeks }, (_, i) => i + 1)
  if (ex.kind === 'conditioning') return { row: { ...ex } }

  if (method === 'custom') {
    const p = parseExerciseLine(`X ${custom}`)
    if (!p || !p.sets || !p.reps) return { error: 'Type it like 4x6-8 @1, RPE 8, or 5@8, 8@7, 8@7' }
    const nt = p.progression_type === 'percent' ? 'percent' : /rpe/i.test(custom) ? 'rpe' : customType || type
    // keep last block's week-to-week EFFORT pattern on the new method
    const w1 = midOf(setTargets(oldWeek(ex, 1, oldWeeks), ex)[0]?.target)
    const wts = W.map(w => {
      const t = midOf(setTargets(oldWeek(ex, w, oldWeeks), ex)[0]?.target)
      let d = w1 != null && t != null && type !== 'percent' && nt !== 'percent' ? t - w1 : 0
      if (type !== nt) d = -d // RIR and RPE run opposite ways
      const sh = v => (d ? shiftRange(v, d, 0, nt === 'rpe' ? 10 : Infinity) ?? v : v)
      const e = { sets: p.sets, reps: p.reps, target: sh(p.target) }
      if (p.setRows) e.setRows = p.setRows.map(r => ({ reps: r.reps, target: sh(r.target) }))
      return e
    })
    return { row: { ...ex, sets: p.sets, reps: p.reps, rir: p.target, progression_type: nt, week_targets: wts } }
  }

  const wts = W.map(w => {
    let wt = stepWeek(oldWeek(ex, w, oldWeeks), ex, step)
    if (method === 'straight') {
      const r = setTargets(wt, ex)[0] || { reps: wt.reps, target: wt.target }
      wt = { sets: wt.sets, reps: r.reps, target: r.target }
    } else if (method === 'topback') {
      const rows = setTargets(wt, ex)
      const top = rows[0] || { reps: wt.reps, target: wt.target }
      const n = Math.max(2, rows.length)
      wt = { sets: n, reps: top.reps, target: top.target, setRows: [top, ...Array.from({ length: n - 1 }, () => ({ reps: top.reps, target: easier(top.target, type) }))] }
    }
    return wt
  })
  return { row: { ...ex, sets: wts[0]?.sets ?? ex.sets, reps: wts[0]?.reps ?? ex.reps, rir: wts[0]?.target ?? ex.rir, week_targets: wts } }
}

// "W1 3×8 @ RPE 7.5 · W2 …" for the review screen
export function weeksPreview(row) {
  const lab = row.progression_type === 'rpe' ? 'RPE ' : row.progression_type === 'percent' ? '' : 'RIR '
  const pct = row.progression_type === 'percent' ? '%' : ''
  return (row.week_targets || []).map((wt, i) => {
    const rows = setTargets(wt, row)
    const same = rows.every(r => r.reps === rows[0]?.reps && r.target === rows[0]?.target)
    const one = r => `${r.reps}${r.target !== '' ? ` @ ${lab}${r.target}${pct}` : ''}`
    return `W${i + 1} ${!rows.length ? '—' : same ? `${rows.length}×${one(rows[0])}` : rows.map(one).join(', ')}`
  }).join(' · ')
}

// "Block 2" -> "Block 3", "Wave 1 · Derivatives" -> "Wave 2 · Derivatives"
export function nextBlockName(name, count) {
  const m = String(name || '').match(/^(.*?)(\d+)(.*)$/)
  return m ? `${m[1]}${Number(m[2]) + 1}${m[3]}` : `Block ${count + 1}`
}

// Manual-week clients keep their place but switch to automatic, so they roll
// into the new block on their own: start date = this Monday minus the weeks
// already done. blocks in order; returns 'YYYY-MM-DD'.
export function rolloverStart(assignment, blocks, thisMonday) {
  let before = 0
  for (const b of blocks) { if (b.id === assignment.current_block_id) break; before += Number(b.weeks) || 4 }
  if (!blocks.some(b => b.id === assignment.current_block_id)) before = 0
  const done = before + (Number(assignment.current_week) || 1) - 1
  const [y, m, d] = thisMonday.split('-').map(Number)
  const dt = new Date(y, m - 1, d - done * 7)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
