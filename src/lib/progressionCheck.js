// Coach: does every program actually progress week to week? (Update 174)
// Each program keeps its own rules; this only checks the targets are THERE for
// every week a client will see, so the client screen has a progression to show.
import { setTargets, weeksForRotation } from './weeks'

const filled = wt => !!wt && Number(wt.sets) > 0 && String(wt.reps ?? '').trim() !== ''
const hasTarget = wt => String(wt?.target ?? '').trim() !== '' ||
  (Array.isArray(wt?.setRows) && wt.setRows.some(r => String(r?.target ?? '').trim() !== ''))
const shape = (ex, w) => JSON.stringify(setTargets(Array.isArray(ex.week_targets) ? ex.week_targets[w - 1] : null, ex))

// ex: program_exercises row; weeks: the week numbers this exercise's day runs.
// -> { missing: [w], noTarget: [w], noWeeks, flat }
export function checkExercise(ex, weeks) {
  const wts = Array.isArray(ex.week_targets) ? ex.week_targets : []
  const out = { missing: [], noTarget: [], noWeeks: false, flat: false }
  if (weeks.length < 2) return out
  const any = weeks.some(w => filled(wts[w - 1]))
  if (!any) { out.noWeeks = true; return out }
  const anyTarget = weeks.some(w => hasTarget(wts[w - 1]))
  for (const w of weeks) {
    if (!filled(wts[w - 1])) out.missing.push(w)
    else if (anyTarget && !hasTarget(wts[w - 1])) out.noTarget.push(w)
  }
  out.flat = !out.missing.length && new Set(weeks.map(w => shape(ex, w))).size === 1
  return out
}

// Gaps get the nearest earlier filled week (or the first later one if week 1
// is the gap). Returns the new week_targets array, or null if nothing to fill.
export function fillGaps(ex, weeks) {
  const c = checkExercise(ex, weeks)
  const gaps = [...c.missing, ...c.noTarget]
  if (!gaps.length) return null
  const wts = Array.isArray(ex.week_targets) ? ex.week_targets.map(x => (x ? { ...x } : x)) : []
  const good = w => filled(wts[w - 1]) && !c.noTarget.includes(w) && !c.missing.includes(w)
  const src = w => {
    for (let k = w - 1; k >= 1; k--) if (weeks.includes(k) && good(k)) return wts[k - 1]
    for (const k of weeks) if (k > w && good(k)) return wts[k - 1]
    return null
  }
  for (const w of gaps.sort((a, b) => a - b)) {
    const s = src(w)
    if (!s) continue
    const copy = JSON.parse(JSON.stringify(s))
    if (c.noTarget.includes(w) && filled(wts[w - 1])) wts[w - 1] = { ...wts[w - 1], target: copy.target, ...(copy.setRows ? { setRows: copy.setRows } : {}) }
    else wts[w - 1] = copy
  }
  return Array.from(wts, x => x ?? null)
}

// Whole app. programs, blocks, days, exercises, rotations: plain rows.
// -> [{ program, blocks: [{ block, flatBlock, items: [{ex, day, issue, fixable}], flat: [{ex, day}] }], problems }]
export function checkPrograms({ programs, blocks, days, exercises, rotations = [] }) {
  const daysBy = groupBy(days.filter(d => (d.track || 'exercise') === 'exercise'), 'block_id')
  const exBy = groupBy(exercises.filter(e => e.kind !== 'conditioning'), 'day_id')
  const rotBy = groupBy(rotations, 'block_id')
  return programs.map(program => {
    const bs = blocks.filter(b => b.program_id === program.id).sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    let problems = 0
    const out = bs.map(block => {
      const rots = (rotBy[block.id] || []).sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      const items = [], flat = []
      let lifts = 0, still = 0
      for (const day of daysBy[block.id] || []) {
        const weeks = weeksForRotation(rots, day.rotation_id, Number(block.weeks) || 1)
        for (const ex of exBy[day.id] || []) {
          const c = checkExercise(ex, weeks)
          if (weeks.length < 2) continue
          lifts++
          if (c.noWeeks) { still++; items.push({ ex, day, weeks, issue: 'No week-by-week targets set. Clients see the same thing every week.', fixable: false }) }
          else {
            if (c.missing.length) items.push({ ex, day, weeks, issue: `Week ${c.missing.join(', ')} ${c.missing.length > 1 ? 'are' : 'is'} blank`, fixable: true })
            if (c.noTarget.length) items.push({ ex, day, weeks, issue: `No RIR/RPE/% target in week ${c.noTarget.join(', ')}`, fixable: true })
            if (c.flat) { still++; flat.push({ ex, day }) }
          }
        }
      }
      const flatBlock = lifts > 0 && still === lifts
      problems += items.length + (flatBlock ? 1 : 0)
      return { block, flatBlock, items, flat }
    })
    return { program, blocks: out, problems }
  })
}

function groupBy(rows, key) {
  const m = {}
  for (const r of rows) (m[r[key]] ||= []).push(r)
  return m
}
