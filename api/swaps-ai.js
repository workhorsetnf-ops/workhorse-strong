// Fill in exercise swaps with Claude (Update 187). Coach (or assistant) only.
//   POST { ids?: [libraryId] }      -> fill these (e.g. a just-added exercise)
//   POST {}                         -> fill the next batch still missing swaps
//   POST { reset: true }            -> clear every Claude-filled swap first (yours stay)
//   -> { filled, added, left }
// The app calls it repeatedly until left = 0, showing progress.
// Env: ANTHROPIC_API_KEY (required), ANTHROPIC_MODEL (optional).
import { admin, userFromReq } from './_push.js'
import { askClaude } from './_claude.js'
import { BATCH, SWAP_TOOL, swapPrompt, parseSwapAi, withPositions, needingSwaps, swappable } from '../src/lib/autoSwaps.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const sb = admin()
    const me = await userFromReq(sb, req)
    if (!me || me.role !== 'coach') return res.status(403).json({ error: 'Coach only' })
    return res.json(await fillSwaps(sb, req.body || {}, globalThis.fetch))
  } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
}

export async function fillSwaps(sb, body, fetchFn) {
  if (!process.env.ANTHROPIC_API_KEY) { const e = new Error('Add ANTHROPIC_API_KEY in Vercel first.'); e.status = 400; throw e }
  if (body.reset) {
    await sb.from('exercise_alternatives').delete().eq('source', 'auto')
    await sb.from('exercise_library').update({ swaps_filled_at: null }).not('swaps_filled_at', 'is', null)
  }
  const [{ data: library, error: le }, { data: alts, error: ae }] = await Promise.all([
    sb.from('exercise_library').select('id, name, category, kind, swaps_filled_at'),
    sb.from('exercise_alternatives').select('library_id, alt_id, position, source'),
  ])
  if (le || ae) { const e = new Error((le || ae).message.includes('swaps_filled_at') || (ae?.message || '').includes('source') ? 'Run the Update 187 SQL in Supabase first.' : (le || ae).message); e.status = 400; throw e }

  const ids = Array.isArray(body.ids) ? new Set(body.ids) : null
  const pool = ids ? swappable(library).filter(l => ids.has(l.id)) : needingSwaps(library, alts)
  const targets = pool.slice(0, BATCH)
  if (!targets.length) return { filled: 0, added: 0, left: ids ? 0 : needingSwaps(library, alts).length }

  const { system, user } = swapPrompt(targets, library)
  let ans
  try { ans = await askClaude({ system, tool: SWAP_TOOL, maxTokens: 4000, fetchFn, content: [{ type: 'text', text: user }] }) }
  catch (e) { const err = new Error(`Claude couldn’t pick swaps: ${e.message}`); err.status = 502; throw err }

  const rows = withPositions(parseSwapAi(ans.data, targets, library), alts)
  if (rows.length) {
    const { error } = await sb.from('exercise_alternatives').upsert(rows, { onConflict: 'library_id,alt_id', ignoreDuplicates: true })
    if (error) throw error
  }
  await sb.from('exercise_library').update({ swaps_filled_at: new Date().toISOString() }).in('id', targets.map(t => t.id))
  const left = ids ? 0 : Math.max(0, pool.length - targets.length)
  return { filled: targets.length, added: rows.length, left }
}
