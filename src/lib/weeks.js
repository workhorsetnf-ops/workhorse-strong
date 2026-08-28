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
