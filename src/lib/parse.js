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
//
// Anything it can't read is handed back as an issue rather than silently
// dropped or guessed at, so nothing lands in a client's program unnoticed.

// ")" and ":" may end the line — a stray "A)" with nothing after it should be
// caught as a nameless row, not become an exercise called "A)".
// "." and "-" still require a following space so "A-frame carry" and "A.M. bike"
// don't get their first letter eaten.
const LETTER = /^\s*([A-Z])\s*(?:[):]\s*|[.-]\s+)/i
// "3x8-12", "3 X 8-12", "4×6"
const SETS_X_REPS = /(\d+)\s*[x×X]\s*([0-9]+(?:\s*-\s*[0-9]+)?|[0-9]+s|AMRAP)/
// "@2", "@ 75%", "RIR 1-2", "RPE 8"
const AT_TARGET = /@\s*([0-9]+(?:\.[0-9]+)?)\s*(%?)/
const RIR_TARGET = /\bRIR\s*([0-9]+(?:\s*-\s*[0-9]+)?)/i
const RPE_TARGET = /\bRPE\s*([0-9]+(?:\.[0-9]+)?)/i
const REST = /\brest\s*([0-9]+\s*(?:s|sec|secs|m|min|mins)?)/i
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

  const out = { name: '', letter: '', sets: null, reps: '', target: '', progression_type: 'rir', rest: '', setRows: null, issues: [] }

  const lm = line.match(LETTER)
  if (lm) { out.letter = lm[1].toUpperCase(); line = line.slice(lm[0].length) }

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
    out.reps = clean(sm[2]).replace(/\s*-\s*/, '-')
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
