// Week-to-week progression for the client (Update 173).
// Every program carries its own rules in its week targets (reps, RIR/RPE/% per
// week, per set). This reads those targets and tells the client, in plain words:
//   1. what changed from last week (and what it means: heavier, harder…)
//   2. what to load today, worked out from what they actually did last week
//   3. the whole block at a glance, so they can see where it's heading.
import { setTargets } from './weeks'
import { parseRange, progressionCall } from './progression'
import { dash } from './targets'

export const rowsForWeek = (ex, week) =>
  setTargets(Array.isArray(ex?.week_targets) ? ex.week_targets[week - 1] : null, ex)

const mid = r => (r ? (r.lo + r.hi) / 2 : null)
// reps-in-reserve a target asks for: RIR as is, RPE 8 -> 2 left
export function rirAim(target, type) {
  const r = parseRange(target)
  if (!r) return null
  return type === 'rpe' ? Math.max(0, 10 - mid(r)) : mid(r)
}
// reps to aim for inside a range: the middle, rounded down ("5-8" -> 6)
export function repsAim(reps) {
  const r = parseRange(reps)
  return r ? Math.floor(mid(r)) : null
}

// Estimated max from a set, counting the reps left in the tank (Epley + RIR).
export const e1rm = (w, reps, rir = 0) => w * (1 + (reps + rir) / 30)
export const loadFor = (max, reps, rir = 0) => max / (1 + (reps + rir) / 30)
const roundLoad = w => (w >= 100 ? Math.round(w / 5) * 5 : Math.round(w / 2.5) * 2.5)

const effortWord = (type, from, to) => {
  const a = mid(parseRange(from)), b = mid(parseRange(to))
  if (a == null || b == null || a === b) return ''
  if (type === 'percent') return b > a ? 'heavier' : 'lighter'
  const harder = type === 'rpe' ? b > a : b < a
  return harder ? 'push closer to failure' : 'a little more in the tank'
}
const effortLabel = type => (type === 'rpe' ? 'RPE' : type === 'percent' ? '%' : 'RIR')
const fmt = (row, type) => {
  const t = String(row.target ?? '')
  if (!t) return dash(row.reps)
  return type === 'percent' ? `${dash(row.reps)} @ ${dash(t)}%` : `${dash(row.reps)} @ ${effortLabel(type)} ${dash(t)}`
}
const sameRows = (a, b) => a.length === b.length && a.every((r, i) => r.reps === b[i].reps && r.target === b[i].target)

// What changed between two weeks. -> { changed, headline, lines: [string] }
export function weekChange(prev, cur, type = 'rir') {
  if (!cur.length) return { changed: false, headline: '', lines: [] }
  if (sameRows(prev, cur)) return { changed: false, headline: 'Same targets as last week', lines: ['Beat last week: a rep more or a little more weight at the same effort.'] }
  const lines = []
  if (prev.length !== cur.length) lines.push(`${cur.length} sets (was ${prev.length})`)
  const uniform = rows => rows.every(r => r.reps === rows[0].reps && r.target === rows[0].target)
  const pr = prev.length ? prev : cur
  if (uniform(pr) && uniform(cur)) {
    const a = pr[0], b = cur[0]
    if (a.reps !== b.reps) lines.push(`Reps ${dash(a.reps)} → ${dash(b.reps)}`)
    if (a.target !== b.target && (a.target || b.target)) {
      const w = effortWord(type, a.target, b.target)
      lines.push(`${effortLabel(type)} ${dash(a.target) || '–'} → ${dash(b.target) || '–'}${w ? ` (${w})` : ''}`)
    }
  } else {
    cur.forEach((r, i) => {
      const p = pr[i]
      if (!p) lines.push(`Set ${i + 1}: ${fmt(r, type)} (new set)`)
      else if (p.reps !== r.reps || p.target !== r.target) {
        const w = effortWord(type, p.target, r.target)
        lines.push(`Set ${i + 1}: ${fmt(p, type)} → ${fmt(r, type)}${w ? ` (${w})` : ''}`)
      }
    })
  }
  // headline: the one thing to take from it
  const rA = mid(parseRange(pr[0]?.reps)), rB = mid(parseRange(cur[0]?.reps))
  const effort = effortWord(type, pr[0]?.target, cur[0]?.target)
  let headline = 'New targets this week'
  if (rA != null && rB != null && rB < rA) headline = 'Fewer reps, heavier weight'
  else if (rA != null && rB != null && rB > rA) headline = 'More reps, lighter weight'
  else if (effort === 'push closer to failure') headline = 'Same reps, push harder'
  else if (effort === 'a little more in the tank') headline = 'Same reps, back off a touch'
  else if (effort === 'heavier') headline = 'Heavier this week'
  else if (prev.length !== cur.length) headline = cur.length > prev.length ? 'One more set this week' : 'One less set this week'
  return { changed: true, headline, lines }
}

// Today's loads when the targets changed: work out last week's max from its
// best set (weight, reps, reps left), then the weight that hits today's reps at
// today's effort. -> { weights: [n|null], max } or null when it can't tell.
export function plannedLoads(lastSets, prevRows, curRows, type = 'rir') {
  if (type === 'percent') return null // load comes from their max on file
  let best = 0
  lastSets.forEach((s, i) => {
    const w = Number(s?.weight), reps = Number(s?.reps)
    if (!(w > 0) || !(reps > 0)) return
    const logged = s.rir === '' || s.rir == null ? null : Number(s.rir)
    const left = Number.isFinite(logged) ? (type === 'rpe' ? Math.max(0, 10 - logged) : logged)
      : rirAim((prevRows[i] || prevRows[prevRows.length - 1] || {}).target, type) ?? 0
    best = Math.max(best, e1rm(w, reps, Math.min(left, 5)))
  })
  if (!best) return null
  const weights = curRows.map(r => {
    const reps = repsAim(r.reps)
    if (reps == null) return null
    return roundLoad(loadFor(best, reps, rirAim(r.target, type) ?? 0))
  })
  return weights.some(w => w) ? { weights, max: Math.round(best) } : null
}

// Everything the exercise card needs for one exercise in one week.
// last: { date, sets: {1: {weight, reps, rir}} } (the most recent session before today)
// thisMonday: 'YYYY-MM-DD'. Returns null for conditioning / time / distance work.
export function weekGuide(ex, week, last, thisMonday) {
  if (!ex || ex.kind === 'conditioning') return null
  const type = ex.progression_type || 'rir'
  const cur = rowsForWeek(ex, week)
  if (!cur.length) return null
  // last session was last week (or earlier) -> judge it against LAST week's
  // targets; done earlier this same week -> against this week's
  const lastWasEarlier = !last?.date || !thisMonday || last.date < thisMonday
  const prevWeek = week > 1 && lastWasEarlier ? week - 1 : week
  const prev = rowsForWeek(ex, prevWeek)
  const change = week > 1 ? weekChange(rowsForWeek(ex, week - 1), cur, type) : null
  const lastSets = last?.sets ? Object.keys(last.sets).map(Number).sort((a, b) => a - b).map(n => last.sets[n]) : []

  let call = null
  if (lastSets.length) {
    if (prevWeek !== week && !sameRows(prev, cur)) {
      const plan = plannedLoads(lastSets, prev, cur, type)
      if (plan) {
        const ws = plan.weights
        const uniq = [...new Set(ws.filter(Boolean))]
        call = {
          call: 'plan', title: uniq.length === 1 ? `Start around ${uniq[0]} lb` : `Start around ${ws.map(w => w || '–').join(' / ')} lb`,
          detail: `New targets this week. From last week's sets you're good for about ${plan.max} lb for one. ${uniq.length === 1 ? 'That weight' : 'Those weights'} should land you on today's reps at today's effort. Adjust if the first set feels off.`,
          weights: ws,
        }
      } else if (type === 'percent') {
        call = { call: 'plan', title: 'New percentages this week', detail: 'Your loads are worked out from your max on file. Use the weights shown in each set.' }
      }
    } else {
      call = progressionCall(lastSets, prev, type)
    }
  }
  return { week, type, cur, change, call }
}

// The whole block, one line per week, for the "See every week" view.
export function blockWeeks(ex, weeks) {
  const type = ex.progression_type || 'rir'
  const n = Math.max(Number(weeks) || 0, Array.isArray(ex.week_targets) ? ex.week_targets.length : 0)
  return Array.from({ length: n }, (_, i) => {
    const rows = rowsForWeek(ex, i + 1)
    const allSame = rows.every(r => r.reps === rows[0]?.reps && r.target === rows[0]?.target)
    return { week: i + 1, text: !rows.length ? '—' : allSame ? `${rows.length} × ${fmt(rows[0], type)}` : rows.map(r => fmt(r, type)).join(', ') }
  })
}
