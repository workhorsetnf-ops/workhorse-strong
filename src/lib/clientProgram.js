// Which training program each client is on, with the block and week they're
// in — the same block/week their Train page shows. One query per table for
// every client, so a list page doesn't fire a request per card.
import { resolveAssignment } from './weeks'

// assignments: rows of program_assignments with programs(name)
// blocks: program_blocks rows for those programs
// -> { [clientId]: { name, block, week, label } }
export function programLabels(assignments, blocks) {
  const byProgram = {}
  for (const b of blocks || []) (byProgram[b.program_id] ||= []).push(b)
  for (const list of Object.values(byProgram)) list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const out = {}
  for (const a of assignments || []) {
    const name = a.programs?.name
    if (!name) continue
    const list = byProgram[a.program_id] || []
    const pos = resolveAssignment(a, list)
    const block = list.length > 1 && pos.block ? pos.block.name : null
    const week = pos.block ? pos.weekInBlock : null
    out[a.client_id] = {
      name, block, week,
      label: [name, block, week ? `Week ${week}` : null].filter(Boolean).join(' · '),
    }
  }
  return out
}

export async function loadProgramLabels(supabase, clientId = null) {
  let q = supabase.from('program_assignments').select('*, programs(name)')
  if (clientId) q = q.eq('client_id', clientId)
  const { data: assignments, error } = await q
  if (error || !assignments?.length) return {}
  const ids = [...new Set(assignments.map(a => a.program_id))]
  const { data: blocks } = await supabase.from('program_blocks').select('*').in('program_id', ids)
  return programLabels(assignments, blocks || [])
}
