// Shared program resolution: weeks, rotations, and per-set targets.
//
// One place that answers three questions, so the day tabs, the calendar and the
// coach builder can never drift apart again:
//   1. what overall week is this client on?
//   2. which block / week-in-block is that?
//   3. which rotation is up that week, and does this day run in it?

// Days elapsed between two dates, counted in whole calendar days.
// Deliberately NOT (a - b) / 86400000 — that drifts by an hour across a DST
// changeover and can round to the wrong day. Comparing UTC-midnight indexes of
// the local Y/M/D is exact in every timezone.
function dayIndex(d) {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5)
}

export function daysBetween(startDate, date = new Date()) {
  if (!startDate) return null
  const sd = typeof startDate === 'string' ? new Date(startDate + 'T00:00:00') : startDate
  if (isNaN(sd)) return null
  return dayIndex(date) - dayIndex(sd)
}

// Overall week of the whole program (1-based). Null if no start date or the
// start date is still in the future.
export function overallWeek(startDate, date = new Date()) {
  const diff = daysBetween(startDate, date)
  if (diff === null || diff < 0) return null
  return Math.floor(diff / 7) + 1
}

// Walk the ordered blocks to turn an overall week into { block, weekInBlock }.
// Returns null once the program has run out of weeks.
export function resolveBlockWeek(blocks, wkOverall) {
  if (!wkOverall || !blocks?.length) return null
  let cursor = 0
  for (const b of blocks) {
    const w = b.weeks || 4
    if (wkOverall <= cursor + w) return { block: b, weekInBlock: wkOverall - cursor }
    cursor += w
  }
  return null
}

// The client's live position, honouring week_mode.
// 'auto'   -> derived from start_date, so it advances on its own every Monday-ish
// 'manual' -> whatever the coach last set on the assignment
// Auto falls back to manual if there's no usable start date or the program has
// already run out, so a client is never left with no workout to look at.
export function resolveAssignment(assignment, blocks) {
  const manual = {
    block: blocks?.find(b => b.id === assignment?.current_block_id) || blocks?.[0] || null,
    weekInBlock: assignment?.current_week || 1,
    source: 'manual',
  }
  if (assignment?.week_mode !== 'auto') return manual
  const wk = overallWeek(assignment.start_date)
  if (!wk) return { ...manual, source: 'manual-fallback' }
  const r = resolveBlockWeek(blocks, wk)
  if (!r) return { ...manual, source: 'manual-fallback' }
  return { block: r.block, weekInBlock: r.weekInBlock, source: 'auto' }
}

// Which rotation is up on a given week of a block.
// Calendar weeks: with two rotations, A runs weeks 1,3,5,7 and B runs 2,4,6,8.
export function rotationForWeek(rotations, weekInBlock) {
  if (!rotations?.length || !weekInBlock) return null
  return rotations[(weekInBlock - 1) % rotations.length] || null
}

// Does this workout day appear in this week?
// A day with no rotation_id runs EVERY week — that's how a conditioning day or
// a lifestyle day stays put while the lifting rotation alternates around it.
export function dayShowsInWeek(day, rotations, weekInBlock) {
  if (!rotations?.length) return true
  if (!day?.rotation_id) return true
  const r = rotationForWeek(rotations, weekInBlock)
  return r ? day.rotation_id === r.id : true
}

// The weeks of a block that a given rotation actually runs on — used to grey out
// the progression columns that rotation will never see.
export function weeksForRotation(rotations, rotationId, blockWeeks) {
  const all = Array.from({ length: blockWeeks || 4 }, (_, i) => i + 1)
  if (!rotations?.length || !rotationId) return all
  const idx = rotations.findIndex(r => r.id === rotationId)
  if (idx < 0) return all
  return all.filter(w => (w - 1) % rotations.length === idx)
}

// Default names for a freshly created set of rotations.
export function defaultRotationName(i) {
  return `Rotation ${String.fromCharCode(65 + i)}`
}

// ---------------------------------------------------------------------------
// PER-SET TARGETS
// ---------------------------------------------------------------------------
// A week entry looks like { sets, reps, target } and applies to every set.
// It may ALSO carry setRows: [{ reps, target }, ...] so a heavy top set can run
// a different rep range and load than its backoffs. setRows is optional and
// absent on everything written before this existed, so the base values stay the
// fallback and old programs keep working untouched.

// Normalise a week entry into exactly one target per set.
export function setTargets(weekEntry, exercise) {
  const base = {
    reps: weekEntry?.reps ?? exercise?.reps ?? '',
    target: weekEntry?.target ?? exercise?.rir ?? '',
  }
  const count = Number(weekEntry?.sets ?? exercise?.sets ?? 0) || 0
  const rows = Array.isArray(weekEntry?.setRows) ? weekEntry.setRows : []
  // Short setRows pad from the base, long ones truncate — the set count is the
  // single source of truth, so changing it can never desync the two.
  return Array.from({ length: count }, (_, i) => ({
    reps: (rows[i]?.reps ?? '') !== '' ? String(rows[i].reps) : String(base.reps),
    target: (rows[i]?.target ?? '') !== '' ? String(rows[i].target) : String(base.target),
  }))
}

// True when the sets are not all identical — i.e. worth showing per set.
export function hasVariedSets(weekEntry, exercise) {
  const rows = setTargets(weekEntry, exercise)
  if (rows.length < 2) return false
  return rows.some(r => r.reps !== rows[0].reps || r.target !== rows[0].target)
}

// "3 × 8-12" when uniform, "4-9, 6-12 × 2" when not — so a mixed exercise reads
// honestly in the one-line summary instead of showing a rep range it isn't using.
export function repsSummary(weekEntry, exercise) {
  const rows = setTargets(weekEntry, exercise)
  if (!rows.length) return ''
  // judge on REPS alone — sets that share a rep range but differ in load should
  // still read as "3 × 8-12", with the variation shown on the load side
  if (rows.every(r => r.reps === rows[0].reps)) return `${rows.length} × ${rows[0].reps}`
  const parts = []
  for (const r of rows) {
    const last = parts[parts.length - 1]
    if (last && last.reps === r.reps) last.n++
    else parts.push({ reps: r.reps, n: 1 })
  }
  return parts.map(p => (p.n > 1 ? `${p.reps} × ${p.n}` : p.reps)).join(', ')
}

// Same idea for the load/RIR side: one value when they agree, otherwise a list.
export function targetSummary(weekEntry, exercise) {
  const rows = setTargets(weekEntry, exercise)
  if (!rows.length) return ''
  const uniq = [...new Set(rows.map(r => r.target))]
  return uniq.length === 1 ? uniq[0] : rows.map(r => r.target).join('/')
}

// Drop setRows entirely when every set matches the base, so a coach who opens
// the per-set editor and changes nothing doesn't leave redundant data behind.
export function compactSetRows(weekEntry) {
  const rows = Array.isArray(weekEntry?.setRows) ? weekEntry.setRows : null
  if (!rows) return weekEntry
  const varied = rows.some(r =>
    (r?.reps ?? '') !== '' && String(r.reps) !== String(weekEntry.reps) ||
    (r?.target ?? '') !== '' && String(r.target) !== String(weekEntry.target))
  if (varied) return weekEntry
  const { setRows, ...rest } = weekEntry
  return rest
}

// ---------------------------------------------------------------------------
// Daily tracking → weekly averages (Update 85)
//
// Clients log each day; the check-in summarises the last 7 days so nothing is
// estimated from memory. Dates are always LOCAL Y-M-D strings — toISOString()
// is UTC and turns "tonight" into tomorrow for anyone west of London.
// ---------------------------------------------------------------------------

export function localDateStr(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// The n calendar days ending on `end` (a Y-M-D string), oldest first.
export function lastNDays(n = 7, end = localDateStr()) {
  const [y, m, d] = end.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => localDateStr(new Date(y, m - 1, d - (n - 1 - i))))
}

export const DAILY_FIELDS = ['weight', 'steps', 'sleep_hours', 'nutrition_hit', 'trained', 'cardio_min', 'energy', 'hunger', 'stress', 'digestion']

const num = v => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v))
const round = (v, dp) => (v === null ? null : Math.round(v * 10 ** dp) / 10 ** dp)
function avg(values, dp) {
  const xs = values.map(num).filter(v => v !== null)
  return xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length, dp) : null
}

// True when a row has anything the client actually entered (readiness alone
// comes from a different widget and doesn't count as logging the day).
export function dayHasData(row) {
  if (!row) return false
  return DAILY_FIELDS.some(k => (typeof row[k] === 'boolean' ? true : num(row[k]) !== null))
}

// days: Y-M-D strings. logsByDate: { 'Y-M-D': daily_logs row }.
// workoutDates: Set of Y-M-D strings with at least one logged set — counts as
// trained even if they never ticked the box, because the log is the evidence.
export function summarizeWeek(days, logsByDate = {}, workoutDates = new Set()) {
  const rows = days.map(d => logsByDate[d] || null)
  const pick = k => rows.map(r => (r ? r[k] : null))
  const hits = rows.filter(r => r && r.nutrition_hit === true).length
  const misses = rows.filter(r => r && r.nutrition_hit === false).length
  const trainedDays = days.filter((d, i) => workoutDates.has(d) || rows[i]?.trained === true)
  const cardio = pick('cardio_min').map(num).filter(v => v !== null)
  const daily = days.map((d, i) => {
    const r = rows[i] || {}
    const out = { date: d }
    for (const k of DAILY_FIELDS) out[k] = typeof r[k] === 'boolean' ? r[k] : num(r[k])
    out.trained = workoutDates.has(d) || r.trained === true ? true : (r.trained === false ? false : null)
    out.workout_logged = workoutDates.has(d)
    return out
  })
  return {
    period_start: days[0],
    period_end: days[days.length - 1],
    days_logged: days.filter((d, i) => dayHasData(rows[i]) || workoutDates.has(d)).length,
    days_weighed: pick('weight').filter(v => num(v) !== null).length,
    weight: avg(pick('weight'), 1),
    steps: avg(pick('steps'), 0),
    sleep_avg: avg(pick('sleep_hours'), 1),
    adherence: hits + misses ? round(hits / (hits + misses), 3) : null,
    sessions: trainedDays.length,
    cardio_min: cardio.length ? cardio.reduce((a, b) => a + b, 0) : null,
    energy: avg(pick('energy'), 1),
    hunger: avg(pick('hunger'), 1),
    stress: avg(pick('stress'), 1),
    digestion: avg(pick('digestion'), 1),
    daily,
  }
}
