// Turns a typed or pasted program into exercise rows.
//
// The point is that a coach already writes programs as text somewhere else.
// Rather than making them re-enter it field by field, parse the notation they
// already use:
//
//   A) Incline chest press 3x8-12 @2
//   Pec deck 3 x 10-15 RIR 1
//   Back squat 4-9@1, 6-12@2, 6-12@3        <- per-set: top set then backoffs
//   Bench press 5x5 @80%
//   Leg press 3x12                          <- no target given, caller supplies
//   B1) DB RDL 2x4-8 RIR 1-2                <- B1/B2 = superset (same letter)
//   B2) Chest-supported row 2x8-12 RIR 1
//   Box jump 3x3 rest 30s | Stop if jump height drops   <- " | " starts a note
//
// Anything it can't read is handed back as an issue rather than silently
// dropped or guessed at, so nothing lands in a client's program unnoticed.

// ")" and ":" may end the line — a stray "A)" with nothing after it should be
// caught as a nameless row, not become an exercise called "A)".
// "." and "-" still require a following space so "A-frame carry" and "A.M. bike"
// don't get their first letter eaten.
// "A1)" / "A2)" mark a superset or circuit (same letter, numbered).
const LETTER = /^\s*([A-Z][1-9]?)\s*(?:[):]\s*|[.-]\s+)/i
// "3x8-12", "3 X 8-12", "4×6"
// Work can be reps ("8-12"), time ("20s", "45 sec", "2 min", "1:30") or
// distance ("30m", "40 yd"). Time/distance are tried first so "20s" doesn't
// become 20 reps. Note: "m" means metres; minutes must be "min".
const TIME_WORK = '[0-9]+(?:\\.[0-9]+)?\\s*(?:seconds|secs|sec|s|minutes|mins|min)(?![a-z])|[0-9]+:[0-5][0-9]'
const DIST_WORK = '[0-9]+(?:\\.[0-9]+)?\\s*(?:meters|metres|m|yards|yds|yd)(?![a-z])'
const SETS_X_REPS = new RegExp(`(\\d+)\\s*[x×X]\\s*(${TIME_WORK}|${DIST_WORK}|[0-9]+(?:\\s*-\\s*[0-9]+)?|AMRAP)`, 'i')
// interval style: "20s on / 90s off" -> the "off" part is the rest
const OFF = /(?:\bon\b)?\s*\/?\s*([0-9]+(?:\.[0-9]+)?\s*(?:seconds|secs|sec|s|minutes|mins|min)|[0-9]+:[0-5][0-9])\s*off\b/i

// "20 sec" -> "20s", "2 minutes" -> "2 min", "30 m" -> "30m"; tells time from distance
export function workOf(raw) {
  const t = clean(raw).toLowerCase()
  let m = t.match(/^([0-9]+(?:\.[0-9]+)?)\s*(seconds|secs|sec|s)$/)
  if (m) return { value: `${m[1]}s`, metric: 'time' }
  m = t.match(/^([0-9]+(?:\.[0-9]+)?)\s*(minutes|mins|min)$/)
  if (m) return { value: `${m[1]} min`, metric: 'time' }
  if (/^[0-9]+:[0-5][0-9]$/.test(t)) return { value: t, metric: 'time' }
  m = t.match(/^([0-9]+(?:\.[0-9]+)?)\s*(meters|metres|m)$/)
  if (m) return { value: `${m[1]}m`, metric: 'distance' }
  m = t.match(/^([0-9]+(?:\.[0-9]+)?)\s*(yards|yds|yd)$/)
  if (m) return { value: `${m[1]} yd`, metric: 'distance' }
  return { value: t.replace(/\s*-\s*/, '-').toUpperCase() === 'AMRAP' ? 'AMRAP' : t.replace(/\s*-\s*/, '-'), metric: 'reps' }
}
// "@2", "@ 75%", "RIR 1-2", "RPE 8"
const AT_TARGET = /@\s*([0-9]+(?:\.[0-9]+)?)\s*(%?)/
const RIR_TARGET = /\bRIR\s*([0-9]+(?:\s*-\s*[0-9]+)?)/i
const RPE_TARGET = /\bRPE\s*([0-9]+(?:\.[0-9]+)?)/i
// longest unit first, so "3 min" isn't cut to "3 m"
const REST = /\brest\s*([0-9]+\s*(?:secs|sec|s|mins|min|m)?)\b/i
// one per-set chunk: "6-12@2" or "5 @ 80%"
const PER_SET = /([0-9]+(?:\s*-\s*[0-9]+)?|AMRAP)\s*@\s*([0-9]+(?:\.[0-9]+)?)\s*(%?)/gi

function clean(s) {
  return String(s || '').replace(/\s+/g, ' ').trim()
}

// Lines that are obviously headings rather than exercises, so pasting a whole
// day straight out of a document doesn't create an exercise called "Day 1".
const SKIP = /^\s*(day\s*\d|week\s*\d|block\s*\d|push|pull|legs|upper|lower|warm\s*-?\s*up|cool\s*-?\s*down|notes?)\s*[:\-–]?\s*$/i

export function parseExerciseLine(raw) {
  const original = String(raw || '')
  let line = clean(original)
  if (!line) return null
  if (SKIP.test(line)) return null

  const out = { name: '', letter: '', sets: null, reps: '', metric: 'reps', target: '', progression_type: 'rir', rest: '', notes: '', setRows: null, issues: [] }

  // anything after " | " (or " // ") is a coach note shown to the client
  const nm = line.match(/\s(?:\||\/\/)\s*(.*)$/)
  if (nm) { out.notes = clean(nm[1]); line = clean(line.slice(0, nm.index)) }

  const lm = line.match(LETTER)
  if (lm) { out.letter = lm[1].toUpperCase(); line = line.slice(lm[0].length) }

  const om = line.match(OFF)
  if (om) { out.rest = workOf(om[1]).value; line = line.replace(om[0], ' ') }
  const rm = line.match(REST)
  if (rm) { out.rest = clean(rm[1]); line = line.replace(rm[0], ' ') }

  // --- per-set form first: "4-9@1, 6-12@2" ---
  // Only treat it as per-set when there are at least two chunks, otherwise
  // "Bench 5 @80%" is a normal single target, not a one-set exercise.
  PER_SET.lastIndex = 0
  const chunks = [...line.matchAll(PER_SET)]
  if (chunks.length >= 2) {
    const first = chunks[0]
    out.name = clean(line.slice(0, first.index).replace(/[,;:]\s*$/, ''))
    out.setRows = chunks.map(c => ({ reps: clean(c[1]).replace(/\s*-\s*/, '-'), target: c[2] }))
    out.sets = out.setRows.length
    out.progression_type = chunks.some(c => c[3] === '%') ? 'percent' : 'rir'
    // the base values are what a set with no override falls back to
    out.reps = out.setRows[0].reps
    out.target = out.setRows[0].target
    if (!out.name) out.issues.push('no exercise name')
    return out
  }

  // --- standard form: "3x8-12 @2" ---
  const sm = line.match(SETS_X_REPS)
  if (sm) {
    out.name = clean(line.slice(0, sm.index))
    out.sets = +sm[1]
    const w = workOf(sm[2])
    out.reps = w.value
    out.metric = w.metric
    line = line.slice(sm.index + sm[0].length)
  } else {
    // No sets given at all — still a valid exercise, just needs defaults.
    // Strip any trailing target notation off the name so "Pec deck @2" doesn't
    // become an exercise literally called "Pec deck @2".
    const cut = line.search(/@|\bRIR\b|\bRPE\b/i)
    out.name = clean(cut > 0 ? line.slice(0, cut) : line)
    line = cut > 0 ? line.slice(cut) : ''
  }

  const rpe = line.match(RPE_TARGET)
  const rir = line.match(RIR_TARGET)
  const at = line.match(AT_TARGET)
  if (rpe) { out.target = rpe[1]; out.progression_type = 'rpe' }
  else if (rir) { out.target = clean(rir[1]).replace(/\s*-\s*/, '-'); out.progression_type = 'rir' }
  else if (at) { out.target = at[1]; out.progression_type = at[2] === '%' ? 'percent' : 'rir' }

  if (!out.name) out.issues.push('no exercise name')
  return out
}

export function parseProgramText(text) {
  const lines = String(text || '').split(/\r?\n/)
  const rows = []
  for (const l of lines) {
    const parsed = parseExerciseLine(l)
    if (parsed) rows.push({ ...parsed, raw: clean(l) })
  }
  return rows
}

// ---------------------------------------------------------------------------
// Paste a whole block
//
// Same line notation as a day, plus two things:
//
//   === Day 1: Upper A ===                  <- a heading starts a new workout
//   Warm-up: 5 min bike, band pull-aparts    <- goes in that workout's warm-up box
//   A) Bench 3x5-6 RIR 2 > 3x4-6 RIR 2 > 3x3-5 RIR 1-2 > 3x3-4 RIR 1
//   Pogo Hops 2x15 > 2x20 > 3x20 | Quick, stiff ankles
//
// " > " separates weeks. Anything a week leaves out carries over from the week
// before ("> RIR 1" keeps the sets and reps, just changes the target), and the
// last week given repeats to the end of the block, so a line with no ">" is the
// same every week. Name, letter, rest and the note come from the first week.
// ---------------------------------------------------------------------------

// "=== Day 1: Upper A ===", "## Upper A", "== Lower B (Day 5) =="
const BLOCK_HEADING = /^\s*(?:={2,}|#{1,3})\s*(.*?)\s*=*\s*$/
const HEADING_DAY_FIRST = /^day\s*([1-7])\s*(?:[:\-–—|.)]\s*)?(.*)$/i
const HEADING_DAY_LAST = /^(.*?)\s*[([]\s*day\s*([1-7])\s*[)\]]\s*$/i
const WARMUP_LINE = /^\s*warm\s*-?\s*up\s*:\s*(.+)$/i
// " > " or an arrow; a bare ">" with no spaces is left alone so a note
// like "RIR >2" can't split a line by accident
const WEEK_SPLIT = /\s+>\s+|\s*[→⇒]\s*/
const NOTE_SPLIT = /\s(?:\||\/\/)\s*/

function parseHeading(text) {
  let label = clean(text)
  let dayNumber = null
  let m = label.match(HEADING_DAY_FIRST)
  if (m) { dayNumber = +m[1]; label = clean(m[2]) }
  else if ((m = label.match(HEADING_DAY_LAST))) { label = clean(m[1]); dayNumber = +m[2] }
  return { label: label || (dayNumber ? `Day ${dayNumber}` : 'Workout'), dayNumber }
}

// One week's worth of "3x4-6 RIR 2". Reuses the line parser with a stand-in
// name, so every notation the day paste accepts works here too.
export function parseWeekSegment(seg) {
  const r = parseExerciseLine('_ ' + seg)
  const issues = []
  if (!r) return { sets: null, reps: '', metric: 'reps', target: '', progression_type: null, setRows: null, rest: '', issues: ['empty week'] }
  if (r.name !== '_') issues.push(`couldn't read "${clean(seg)}"`)
  const hasTarget = r.target !== ''
  return {
    sets: r.sets, reps: r.reps, metric: r.metric, target: r.target,
    // only claim a progression type when the week actually typed a target
    progression_type: hasTarget ? r.progression_type : null,
    setRows: r.setRows, rest: r.rest, issues,
  }
}

// A full exercise line, including its week chain.
export function parseBlockExerciseLine(raw) {
  const original = clean(raw)
  if (!original) return null
  let head = original
  let note = ''
  const nm = head.match(NOTE_SPLIT)
  if (nm) { note = clean(head.slice(nm.index + nm[0].length)); head = clean(head.slice(0, nm.index)) }

  const parts = head.split(WEEK_SPLIT).map(clean)
  const first = parseExerciseLine(parts[0])
  if (!first) return null
  const row = { ...first, notes: note, raw: original, warnings: [], weeks: [] }

  let prev = {
    sets: first.sets, reps: first.reps, target: first.target,
    setRows: first.setRows ? first.setRows.map(x => ({ ...x })) : null,
  }
  row.weeks.push({ ...prev })

  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i]
    if (!seg) { row.issues.push(`week ${i + 1} is empty`); continue }
    const s = parseWeekSegment(seg)
    for (const msg of s.issues) row.issues.push(`week ${i + 1}: ${msg}`)
    if (s.rest) row.warnings.push(`rest in week ${i + 1} ignored — rest is set once, on week 1`)
    if (s.sets != null && s.metric !== first.metric) {
      row.issues.push(`week ${i + 1} switches from ${first.metric} to ${s.metric} — keep the same kind of work all block`)
    }
    if (s.progression_type && s.progression_type !== first.progression_type) {
      row.issues.push(`week ${i + 1} uses ${s.progression_type.toUpperCase()} but week 1 uses ${first.progression_type.toUpperCase()}`)
    }
    let next
    if (s.setRows) {
      next = { sets: s.setRows.length, reps: s.setRows[0].reps, target: s.setRows[0].target, setRows: s.setRows.map(x => ({ ...x })) }
    } else if (s.sets != null) {
      next = { sets: s.sets, reps: s.reps, target: s.target !== '' ? s.target : prev.target, setRows: null }
    } else {
      // target-only week ("> RIR 1"): keep the shape, change the effort
      next = {
        sets: prev.sets, reps: prev.reps, target: s.target !== '' ? s.target : prev.target,
        setRows: prev.setRows && s.target !== '' ? prev.setRows.map(x => ({ ...x, target: s.target })) : prev.setRows,
      }
    }
    row.weeks.push(next)
    prev = next
  }
  return row
}

// Whole pasted block -> { days: [{ label, dayNumber, warmup, exercises }], skipped: [{ raw, why }] }
// blockWeeks lets it flag a line that lists more weeks than the block has.
export function parseBlockText(text, blockWeeks = 4) {
  const days = []
  const skipped = []
  let cur = null
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = clean(rawLine)
    if (!line) continue
    const hm = line.match(BLOCK_HEADING)
    if (hm && hm[1]) {
      const { label, dayNumber } = parseHeading(hm[1])
      const prevNum = days.length ? days[days.length - 1].dayNumber : 0
      cur = { label, dayNumber: dayNumber || Math.min(7, prevNum + 1), warmup: '', exercises: [] }
      days.push(cur)
      continue
    }
    if (hm) continue // a bare "=====" divider
    const wm = line.match(WARMUP_LINE)
    if (wm) {
      if (!cur) { skipped.push({ raw: line, why: 'warm-up before the first workout heading' }); continue }
      cur.warmup = cur.warmup ? `${cur.warmup}\n${clean(wm[1])}` : clean(wm[1])
      continue
    }
    const row = parseBlockExerciseLine(line)
    if (!row) continue // a heading-style word like "PUSH" on its own
    if (!cur) { skipped.push({ raw: line, why: 'before the first workout heading (=== Day 1: Upper A ===)' }); continue }
    if (row.weeks.length > blockWeeks) {
      row.issues.push(`${row.weeks.length} weeks listed but this block is ${blockWeeks} weeks`)
    }
    cur.exercises.push(row)
  }
  return { days, skipped }
}

// The program_exercises rows for one pasted workout (everything except
// day_id, which the caller adds once the workout exists).
// Letters typed in the paste are kept; a repeated letter moves to the next
// free one. Lines without a letter stay unlettered (primers, finishers).
export function blockExerciseRows(exercises, blockWeeks = 4) {
  const used = new Set()
  const typed = exercises.map(r => (r.letter || '').toUpperCase())
  const rows = []
  exercises.forEach((r, i) => {
    let letter = typed[i]
    if (letter && used.has(letter)) {
      letter = ''
      for (let c = 0; c < 26; c++) {
        const L = String.fromCharCode(65 + c)
        if (!used.has(L) && !typed.includes(L)) { letter = L; break }
      }
    }
    if (letter) used.add(letter)
    const metric = r.metric || 'reps'
    const fallbackReps = metric === 'time' ? '30 sec' : metric === 'distance' ? '40 yd' : '8-12'
    const week_targets = Array.from({ length: blockWeeks }, (_, w) => {
      const src = r.weeks[Math.min(w, r.weeks.length - 1)] || {}
      const entry = {
        sets: src.sets || 3,
        reps: String(src.reps || fallbackReps),
        target: String(src.target ?? ''),
      }
      if (src.setRows) entry.setRows = src.setRows.map(x => ({ reps: String(x.reps), target: String(x.target) }))
      return entry
    })
    const w1 = week_targets[0]
    rows.push({
      name: r.name, kind: 'exercise', description: '', tracking_type: '', letter,
      video_url: '', notes: r.notes || '', icon_url: null,
      metric, rest: r.rest || '', progression_type: r.progression_type || 'rir',
      sets: w1.sets, reps: w1.reps, rir: w1.target,
      week_targets, position: i,
    })
  })
  return rows
}
