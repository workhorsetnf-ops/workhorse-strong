// Weekly review: swaps the client is keeping for the whole current block
// (Update 187), with a way to put the original exercise back.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { resolveAssignment } from '../../lib/weeks'

const WHY = { taken: 'machine taken', hurts: 'it hurt', equipment: 'no equipment', other: 'other' }

export default function BlockSwaps({ clientId }) {
  const [rows, setRows] = useState([])
  const [blockName, setBlockName] = useState('')
  useEffect(() => {
    let live = true
    ;(async () => {
      const { data: asg } = await supabase.from('program_assignments').select('*').eq('client_id', clientId).maybeSingle()
      if (!asg) return
      const { data: blocks } = await supabase.from('program_blocks').select('*').eq('program_id', asg.program_id).order('position')
      const pos = resolveAssignment(asg, blocks || [])
      if (!pos.block) return
      const { data: days } = await supabase.from('program_days').select('id').eq('block_id', pos.block.id)
      const dayIds = (days || []).map(d => d.id)
      if (!dayIds.length) return
      const { data: exs } = await supabase.from('program_exercises').select('id').in('day_id', dayIds)
      const exIds = (exs || []).map(e => e.id)
      if (!exIds.length) return
      const { data, error } = await supabase.from('exercise_block_swaps').select('*').eq('client_id', clientId).in('exercise_id', exIds)
      if (live && !error) { setRows(data || []); setBlockName(pos.block.name || '') }
    })()
    return () => { live = false }
  }, [clientId])

  async function remove(r) {
    if (!confirm(`Put ${r.from_name} back for the rest of the block?`)) return
    await supabase.from('exercise_block_swaps').delete().eq('id', r.id)
    setRows(list => list.filter(x => x.id !== r.id))
  }
  if (!rows.length) return null
  return (
    <div className="card" style={{ borderLeft: '3px solid var(--orange)' }}>
      <strong style={{ fontSize: 15 }}>⇄ Swapped for the whole block{blockName ? ` · ${blockName}` : ''} · {rows.length}</strong>
      {rows.map(r => (
        <div key={r.id} style={{ fontSize: 13.5, marginTop: 6, display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ flex: 1 }}>{r.from_name} → <strong>{r.alt_name}</strong>{r.reason && <span className="muted"> ({WHY[r.reason]})</span>}</span>
          <button className="btn-ghost" style={{ padding: '3px 9px', fontSize: 11.5 }} onClick={() => remove(r)}>Put back</button>
        </div>
      ))}
      <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>Build next block fills these in for you if they still apply.</p>
    </div>
  )
}
