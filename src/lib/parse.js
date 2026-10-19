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
