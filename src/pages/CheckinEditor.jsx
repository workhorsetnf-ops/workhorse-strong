import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Merge the questions a form asks with the answers a check-in stored, so a
// check-in sent half-done shows its unanswered questions as blanks to fill in.
// Stored answers whose question has since been removed from the form are kept.
export function editorRows(questions, responses) {
  const stored = Array.isArray(responses) ? responses : []
  const byLabel = new Map(stored.map(r => [String(r.label).trim().toLowerCase(), r]))
  const rows = (questions || []).map(q => {
    const hit = byLabel.get(String(q.label).trim().toLowerCase())
    return { label: q.label, qtype: q.qtype || 'text', options: Array.isArray(q.options) ? q.options : [], value: hit ? String(hit.value ?? '') : '' }
  })
  const asked = new Set(rows.map(r => r.label.trim().toLowerCase()))
  for (const r of stored) {
    if (!asked.has(String(r.label).trim().toLowerCase())) rows.push({ label: r.label, qtype: 'text', options: [], value: String(r.value ?? '') })
  }
  return rows
}

// Same shape the client form saves: label + value, blanks dropped.
export const toResponses = rows => rows
  .map(r => ({ label: r.label, value: String(r.value ?? '').trim() }))
  .filter(r => r.value !== '')

// The questions this check-in was sent with: the form it names, else the
// client's assigned form, else the default form.
async function loadQuestions(checkin) {
  let formId = null
  if (checkin.form_name) {
    const { data } = await supabase.from('checkin_forms').select('id').eq('name', checkin.form_name).limit(1)
    formId = data?.[0]?.id || null
  }
  if (!formId) {
    const { data: a } = await supabase.from('checkin_form_assignments').select('form_id').eq('client_id', checkin.client_id).maybeSingle()
    formId = a?.form_id || null
  }
  if (!formId) {
    const { data: d } = await supabase.from('checkin_forms').select('id').eq('is_default', true).maybeSingle()
    formId = d?.id || null
  }
  if (!formId) return []
  const { data: qs } = await supabase.from('checkin_form_questions').select('*').eq('form_id', formId).order('position')
  return qs || []
}

const num = v => (String(v ?? '').trim() === '' ? null : Number(v))

export default function CheckinEditor({ checkin, onSaved, onCancel }) {
  const [rows, setRows] = useState(null)
  const [notes, setNotes] = useState(checkin.notes || '')
  const [weight, setWeight] = useState(checkin.weight ?? '')
  const [waist, setWaist] = useState(checkin.waist ?? '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    loadQuestions(checkin).then(qs => { if (live) setRows(editorRows(qs, checkin.form_responses)) })
    return () => { live = false }
  }, [checkin])

  const set = (i, value) => setRows(rs => rs.map((r, k) => (k === i ? { ...r, value } : r)))

  async function save() {
    const w = num(weight), wa = num(waist)
    if ((w !== null && !(w > 0)) || (wa !== null && !(wa > 0))) { alert('Weight and waist need to be numbers.'); return }
    setBusy(true)
    const patch = { form_responses: toResponses(rows || []), notes, weight: w, waist: wa }
    const { data, error } = await supabase.from('checkins').update(patch).eq('id', checkin.id).select()
    setBusy(false)
    if (error) { alert('Could not save: ' + error.message); return }
    if (!data?.length) { alert("Couldn't save. This check-in may have been deleted, or you don't have permission to edit it."); return }
    onSaved && onSaved(data[0])
  }

  if (!rows) return <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>Loading questions…</div>
  const lbl = { fontSize: 12.5, fontWeight: 700, marginBottom: 4 }
  return (
    <div style={{ marginTop: 10, background: 'var(--steel)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <span className="eyebrow" style={{ fontSize: 10 }}>Edit check-in</span>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div><div className="muted" style={{ fontSize: 11.5 }}>Weight (lbs)</div><input inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} /></div>
        <div><div className="muted" style={{ fontSize: 11.5 }}>Waist (in)</div><input inputMode="decimal" value={waist} onChange={e => setWaist(e.target.value)} /></div>
      </div>
      {rows.map((r, i) => (
        <div key={i}>
          <div style={lbl}>{r.label}{!r.value && <span style={{ color: 'var(--orange-hot)', fontWeight: 600, marginLeft: 6, fontSize: 11 }}>not answered</span>}</div>
          {r.qtype === 'scale' ? (
            <select value={r.value} onChange={e => set(i, e.target.value)}>
              <option value="">—</option>
              {Array.from({ length: 10 }, (_, k) => String(k + 1)).map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          ) : r.qtype === 'choice' && r.options.length ? (
            <select value={r.value} onChange={e => set(i, e.target.value)}>
              <option value="">—</option>
              {[...new Set([...r.options, ...(r.value && !r.options.includes(r.value) ? [r.value] : [])])].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : r.qtype === 'number' ? (
            <input inputMode="decimal" value={r.value} onChange={e => set(i, e.target.value)} />
          ) : (
            <textarea rows="2" value={r.value} onChange={e => set(i, e.target.value)} />
          )}
        </div>
      ))}
      <div>
        <div style={lbl}>Notes</div>
        <textarea rows="3" value={notes} onChange={e => setNotes(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        <button className="btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  )
}
