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

// swap: { alt_name, alt_library_id, scope? }; libById for the alternative's media.
export function applySwap(ex, swap, libById = {}) {
  if (!swap) return ex
  const alt = libById[swap.alt_library_id] || {}
  return { ...ex, name: swap.alt_name, video_url: alt.video_url || '', icon_url: alt.icon_url || null,
    based_on_lift: ex.based_on_lift || ex.name, swappedFrom: ex.name, swapReason: swap.reason, swapScope: swap.scope || 'day' }
}

// Update 187: a swap can last just today or the rest of the block.
// "No equipment" isn't going to change next session; a taken machine might.
export const SCOPES = [['day', 'Just today'], ['block', 'Rest of this block']]
export const scopeForReason = reason => (reason === 'equipment' ? 'block' : 'day')

// Today's swap wins over a block-long one (e.g. the block swap's machine is taken today).
export function activeSwap(dayRow, blockRow) {
  if (dayRow) return { ...dayRow, scope: 'day' }
  if (blockRow) return { ...blockRow, scope: 'block' }
  return null
}

// Build next block (Update 187): when everyone on the program kept the same
// block-long swap for an exercise, the new block uses that exercise instead.
// rows: exercise_block_swaps for this block's exercises; clientIds: everyone assigned.
// -> { [exerciseId]: { alt_name, reason } }
export function blockSwapCarry(rows, clientIds) {
  const ids = [...new Set(clientIds || [])]
  if (!ids.length) return {}
  const by = {}
  for (const r of rows || []) if (ids.includes(r.client_id)) (by[r.exercise_id] ||= []).push(r)
  const out = {}
  for (const [exId, list] of Object.entries(by)) {
    const names = new Set(list.map(r => r.alt_name))
    if (list.length === ids.length && names.size === 1) out[exId] = { alt_name: list[0].alt_name, reason: list[0].reason || '' }
  }
  return out
}
