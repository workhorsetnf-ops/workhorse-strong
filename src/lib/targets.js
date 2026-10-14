// Effort targets (RIR / RPE / %) as single numbers or ranges, e.g. "2" or "1-2".

// Tidy what the coach typed: "1 to 2", "1–2", "1 - 2" all become "1-2".
// ok=false when it isn't a number or a low-high range, so it never saves junk.
export function normalizeTarget(raw) {
  const s = String(raw ?? '').trim().replace(/\s*(?:to|–|—|-)\s*/gi, '-').replace(/\s+/g, '')
  if (s === '') return { value: '', ok: true }
  const m = s.match(/^(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?$/)
  if (!m) return { value: s, ok: false }
  if (m[2] !== undefined) {
    const lo = Number(m[1]), hi = Number(m[2])
    if (lo === hi) return { value: m[1], ok: true }
    return { value: lo < hi ? `${m[1]}-${m[2]}` : `${m[2]}-${m[1]}`, ok: true }
  }
  return { value: m[1], ok: true }
}

// Reps are free text (AMRAP, 30s, 8-12), only the dash is tidied.
export const normalizeReps = raw => String(raw ?? '').trim().replace(/(\d)\s*(?:to|–|—|-)\s*(\d)/gi, '$1-$2')

// Display a range with a proper dash: "1-2" -> "1–2".
export const dash = v => String(v ?? '').replace(/(\d)\s*-\s*(\d)/g, '$1–$2')

export const EFFORT_LABEL = { rir: 'RIR', rpe: 'RPE', percent: '%' }

// "RIR 1–2", "RPE 8", "75%"
export function effortText(type, target) {
  const t = dash(target)
  if (!t) return ''
  if (type === 'percent') return `${t}%`
  return `${type === 'rpe' ? 'RPE' : 'RIR'} ${t}`
}

// Plain-English meaning for clients.
export function effortMeaning(type, target) {
  const t = dash(target)
  if (!t) return ''
  if (type === 'percent') return `Use ${t}% of your max`
  if (type === 'rpe') return `Effort ${t} out of 10 (10 = nothing left)`
  const one = t === '1'
  if (t === '0') return 'Take each set to failure — no reps left'
  return `Stop each set with ${t} good rep${one ? '' : 's'} left in the tank`
}
