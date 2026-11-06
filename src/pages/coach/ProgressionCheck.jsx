// Coach: Progression check across every program (Update 174).
// Flags anything that would leave a client with nothing to progress from week
// to week: blank weeks, missing RIR/RPE/% targets, exercises with no weekly
// targets, and whole blocks where nothing changes.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { checkPrograms, fillGaps } from '../../lib/progressionCheck'

async function all(table, cols) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(cols).range(from, from + 999)
    if (error) return { data: out, error }
    out.push(...(data || [])); if (!data || data.length < 1000) break
  }
  return { data: out }
}

export default function ProgressionCheck({ onOpen, onClose }) {
  const [res, setRes] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [showOk, setShowOk] = useState(false)

  async function load() {
    const [p, b, d, e, r] = await Promise.all([
      all('programs', 'id, name'), all('program_blocks', 'id, program_id, name, weeks, position'),
      all('program_days', 'id, block_id, day_label, day_number, track, rotation_id'),
      all('program_exercises', 'id, day_id, name, sets, reps, rir, kind, week_targets'),
      all('program_rotations', 'id, block_id, position'),
    ])
    const bad = [p, b, d, e].find(x => x.error)
    if (bad) { setErr('Could not read your programs: ' + bad.error.message); return }
    setRes(checkPrograms({ programs: p.data, blocks: b.data, days: d.data, exercises: e.data, rotations: r.error ? [] : r.data }))
  }
  useEffect(() => { load() }, [])

  async function fix(items, key) {
    setBusy(key)
    for (const it of items.filter(i => i.fixable)) {
      const wts = fillGaps(it.ex, it.weeks)
      if (!wts) continue
      const { error } = await supabase.from('program_exercises').update({ week_targets: wts }).eq('id', it.ex.id)
      if (error) { setErr('Could not save: ' + error.message); break }
    }
    setBusy(''); await load()
  }

  const withProblems = (res || []).filter(x => x.problems)
  const clean = (res || []).filter(x => !x.problems)
  return (
    <div className="card" style={{ marginBottom: 20, borderLeft: '3px solid var(--orange)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow" style={{ fontSize: 10 }}>Progression check</div>
          <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
            Every program, checked for what clients see from week to week. Each program keeps its own rules. This only flags weeks that are blank or never change.
          </p>
        </div>
        <button className="btn-ghost" onClick={onClose} style={{ padding: '5px 10px', fontSize: 12 }}>Close</button>
      </div>
      {!res && !err && <p className="muted" style={{ fontSize: 13, margin: 0 }}>Checking every program…</p>}
      {res && !withProblems.length && <p style={{ fontSize: 14, color: 'var(--green)', fontWeight: 700, margin: 0 }}>✓ All {res.length} programs have targets for every week.</p>}

      {withProblems.map(({ program, blocks, problems }) => {
        const fixable = blocks.flatMap(b => b.items.filter(i => i.fixable))
        return (
          <div key={program.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 15, flex: 1 }}>{program.name}</strong>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--red)' }}>{problems} to fix</span>
              {fixable.length > 0 && (
                <button className="btn" style={{ padding: '5px 10px', fontSize: 12 }} disabled={!!busy} onClick={() => fix(fixable, program.id)}>
                  {busy === program.id ? 'Filling…' : `Fill ${fixable.length} gap${fixable.length === 1 ? '' : 's'}`}
                </button>
              )}
            </div>
            {blocks.filter(b => b.items.length || b.flatBlock).map(({ block, flatBlock, items, flat }) => (
              <div key={block.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="muted" style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase' }}>{block.name} · {block.weeks} wk</span>
                  <button className="btn-ghost" style={{ padding: '2px 8px', fontSize: 11.5 }} onClick={() => onOpen(program.id, block.id)}>Open</button>
                </div>
                {flatBlock && <div style={{ fontSize: 13, color: 'var(--red)' }}>Nothing in this block changes from week to week. Clients see the same targets every week.</div>}
                {items.map((it, k) => (
                  <div key={it.ex.id + k} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                    <span style={{ flex: 1 }}><strong>{it.ex.name}</strong> <span className="muted">· {it.day.day_label || `Day ${it.day.day_number}`}</span> · {it.issue}</span>
                    {it.fixable && <button className="btn-ghost" style={{ padding: '2px 8px', fontSize: 11.5 }} disabled={!!busy} title="Copies the week before into the gap" onClick={() => fix([it], it.ex.id + k)}>{busy === it.ex.id + k ? '…' : 'Fill'}</button>}
                  </div>
                ))}
                {!flatBlock && flat.length > 0 && <div className="muted" style={{ fontSize: 12 }}>{flat.length} exercise{flat.length === 1 ? '' : 's'} keep the same targets all block (fine if you meant it: clients add reps/weight).</div>}
              </div>
            ))}
          </div>
        )
      })}
      {clean.length > 0 && withProblems.length > 0 && (
        <button className="btn-ghost" style={{ alignSelf: 'flex-start', fontSize: 12, padding: '4px 10px' }} onClick={() => setShowOk(v => !v)}>{showOk ? 'Hide' : 'Show'} {clean.length} program{clean.length === 1 ? '' : 's'} with no problems</button>
      )}
      {showOk && clean.map(c => <div key={c.program.id} style={{ fontSize: 13 }}><span style={{ color: 'var(--green)' }}>✓</span> {c.program.name}</div>)}
      {err && <span style={{ color: 'var(--red)', fontSize: 13 }}>{err}</span>}
    </div>
  )
}
