// Exercise swaps: find a program exercise's approved alternatives, and show a
// swapped exercise under its new name with its own video and icon.
import { normName, baseName } from './exmatch.js'

export const REASONS = [['taken', 'Machine taken'], ['hurts', 'It hurts'], ['equipment', 'No equipment'], ['other', 'Other']]

// library: [{ id, name, video_url, icon_url }], alts: [{ library_id, alt_id, position }]
export function alternativesFor(exName, library, alts) {
  const key = normName(exName)
  // exact name first; then without set/side notes, so "Bulgarian Split Squat
  // (each side)" in a program still finds "Bulgarian Split Squat" (Update 171)
  const base = normName(baseName(exName))
  const me = library.find(l => normName(l.name) === key) || library.find(l => normName(baseName(l.name)) === base)
  if (!me) return []
  const byId = Object.fromEntries(library.map(l => [l.id, l]))
  return alts.filter(a => a.library_id === me.id).sort((a, b) => a.position - b.position).map(a => byId[a.alt_id]).filter(Boolean)
}

// swap: { alt_name, alt_library_id }; libById for the alternative's media.
export function applySwap(ex, swap, libById = {}) {
  if (!swap) return ex
  const alt = libById[swap.alt_library_id] || {}
  return { ...ex, name: swap.alt_name, video_url: alt.video_url || '', icon_url: alt.icon_url || null,
    based_on_lift: ex.based_on_lift || ex.name, swappedFrom: ex.name, swapReason: swap.reason }
}
