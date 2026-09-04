import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const TYPE_LABEL = { text: 'Text answer', number: 'Number', scale: 'Scale 1–10', choice: 'Multiple choice', yesno: 'Yes / No' }

export default function CoachIntakeForms() {
  const [forms, setForms] = useState([])
  const [clients, setClients] = useState([])
  const [assignments, setAssignments] = useState([])
  const [responses, setResponses] = useState([])
  const [open, setOpen] = useState(null)
  const [questions, setQuestions] = useState([])
  const [newForm, setNewForm] = useState({ name: '', description: '' })
  const [newQ, setNewQ] = useState({ label: '', qtype: 'text', options: '', required: true })
  const [editingQ, setEditingQ] = useState(null)
  const [editQ, setEditQ] = useState({ label: '', qtype: 'text', options: '', required: true })
  const [assignPick, setAssignPick] = useState({})
  const [openResponse, setOpenResponse] = useState(null)

  async function load() {
    const [{ data: f }, { data: c }, { data: a }, { data: r }] = await Promise.all([
      supabase.from('standalone_forms').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name').eq('role', 'client').order('full_name'),
      supabase.from('standalone_form_assignments').select('*'),
      supabase.from('standalone_form_responses').select('*').order('submitted_at', { ascending: false }).limit(100),
    ])
    setForms(f || []); setClients(c || []); setAssignments(a || []); setResponses(r || [])
  }
  useEffect(() => { load() }, [])

  async function loadQuestions(formId) {
    const { data } = await supabase.from('standalone_form_questions').select('*').eq('form_id', formId).order('position')
    setQuestions(data || [])
  }

  function openForm(id) {
    if (open === id) { setOpen(null); return }
    setOpen(id); loadQuestions(id)
  }

  async function createForm() {
    if (!newForm.name.trim()) return
    await supabase.from('standalone_forms').insert({ name: newForm.name.trim(), description: newForm.description.trim() })
    setNewForm({ name: '', description: '' }); load()
  }

  async function addQuestion(formId) {
    if (!newQ.label.trim()) return
    await supabase.from('standalone_form_questions').insert({
      form_id: formId, label: newQ.label.trim(), qtype: newQ.qtype, required: newQ.required, position: questions.length,
      options: newQ.qtype === 'choice' ? newQ.options.split(',').map(t => t.trim()).filter(Boolean) : []
    })
    setNewQ({ label: '', qtype: 'text', options: '', required: true })
    loadQuestions(formId)
  }

  function startEditQ(qu) {
    setEditingQ(qu.id)
    setEditQ({ label: qu.label, qtype: qu.qtype, options: Array.isArray(qu.options) ? qu.options.join(', ') : '', required: qu.required !== false })
  }

  async function saveQuestion(formId, qId) {
    if (!editQ.label.trim()) return
    await supabase.from('standalone_form_questions').update({
      label: editQ.label.trim(),
      qtype: editQ.qtype,
      required: editQ.required,
      options: editQ.qtype === 'choice' ? editQ.options.split(',').map(t => t.trim()).filter(Boolean) : []
    }).eq('id', qId)
    setEditingQ(null)
    loadQuestions(formId)
  }

  async function deleteQuestion(formId, qId) {
    await supabase.from('standalone_form_questions').delete().eq('id', qId)
    loadQuestions(formId)
  }

  async function deleteForm(id) {
    if (!confirm('Delete this form, its questions, and any assignments/responses?')) return
    await supabase.from('standalone_forms').delete().eq('id', id)
    setOpen(null); load()
  }

  async function assignForm(clientId) {
    const formId = assignPick[clientId]
    if (!formId) return
    const { error } = await supabase.from('standalone_form_assignments')
      .upsert({ client_id: clientId, form_id: formId }, { onConflict: 'client_id,form_id' })
    if (error) { alert('Could not assign: ' + error.message); return }
    setAssignPick(p => ({ ...p, [clientId]: '' }))
    load()
  }

  async function unassignForm(assignmentId) {
    await supabase.from('standalone_form_assignments').delete().eq('id', assignmentId)
    load()
  }

  const clientsById = Object.fromEntries(clients.map(c => [c.id, c]))
  const formsById = Object.fromEntries(forms.map(f => [f.id, f]))

  return (
    <div>
      <div className="eyebrow">Paperwork</div>
      <h1 style={{ fontSize: 28, margin: '6px 0 6px' }}>Intake Forms</h1>
      <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>
        Standalone forms for onboarding — PAR-Q, liability waivers, intake questionnaires. Assign once, a client fills it once. (For the recurring weekly check-in questions, use Forms instead.)
      </p>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        <input placeholder="New form name (e.g. Liability Waiver)" value={newForm.name} onChange={e => setNewForm({ ...newForm, name: e.target.value })} onKeyDown={e => e.key === 'Enter' && createForm()} />
        <input placeholder="Description (optional)" value={newForm.description} onChange={e => setNewForm({ ...newForm, description: e.target.value })} />
        <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={createForm}>Create form</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
        {forms.map(f => (
          <div className="card" key={f.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <strong style={{ fontSize: 16 }}>{f.name}</strong>
                {f.description && <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{f.description}</div>}
                <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>
                  Assigned to {assignments.filter(a => a.form_id === f.id).length} client(s)
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-ghost" onClick={() => openForm(f.id)}>{open === f.id ? 'Close' : 'Edit questions'}</button>
                <button className="btn-ghost" style={{ color: 'var(--red)' }} onClick={() => deleteForm(f.id)}>Delete</button>
              </div>
            </div>

            {open === f.id && (
              <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
                {questions.map((qu, i) => (
                  <div key={qu.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                    {editingQ === qu.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
                          <input value={editQ.label} onChange={e => setEditQ({ ...editQ, label: e.target.value })} onKeyDown={e => e.key === 'Enter' && saveQuestion(f.id, qu.id)} />
                          <select value={editQ.qtype} onChange={e => setEditQ({ ...editQ, qtype: e.target.value })}>
                            <option value="text">Text answer</option>
                            <option value="number">Number</option>
                            <option value="scale">Scale 1–10</option>
                            <option value="choice">Multiple choice</option>
                            <option value="yesno">Yes / No</option>
                          </select>
                        </div>
                        {editQ.qtype === 'choice' && (
                          <input placeholder="Options, separated by commas" value={editQ.options} onChange={e => setEditQ({ ...editQ, options: e.target.value })} />
                        )}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                          <input type="checkbox" style={{ width: 'auto' }} checked={editQ.required} onChange={e => setEditQ({ ...editQ, required: e.target.checked })} />
                          Required
                        </label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn" style={{ padding: '8px 16px', fontSize: 12 }} onClick={() => saveQuestion(f.id, qu.id)}>Save</button>
                          <button className="btn-ghost" style={{ padding: '8px 14px', fontSize: 12 }} onClick={() => setEditingQ(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 14 }}>
                          <span className="muted" style={{ marginRight: 8 }}>{i + 1}.</span>{qu.label}
                          <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
                            ({TYPE_LABEL[qu.qtype]}{qu.qtype === 'choice' && Array.isArray(qu.options) ? `: ${qu.options.join(' / ')}` : ''}{qu.required === false ? ', optional' : ''})
                          </span>
                        </div>
                        <div style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn-ghost" style={{ padding: '3px 10px', fontSize: 11, marginRight: 6 }} onClick={() => startEditQ(qu)}>Edit</button>
                          <button className="btn-ghost" style={{ padding: '3px 9px', fontSize: 11, color: 'var(--red)' }} onClick={() => deleteQuestion(f.id, qu.id)}>✕</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8, marginTop: 12 }}>
                  <input placeholder="Question (e.g. Any past injuries or surgeries?)" value={newQ.label} onChange={e => setNewQ({ ...newQ, label: e.target.value })} onKeyDown={e => e.key === 'Enter' && addQuestion(f.id)} />
                  <select value={newQ.qtype} onChange={e => setNewQ({ ...newQ, qtype: e.target.value })}>
                    <option value="text">Text answer</option>
                    <option value="number">Number</option>
                    <option value="scale">Scale 1–10</option>
                    <option value="choice">Multiple choice</option>
                    <option value="yesno">Yes / No</option>
                  </select>
                  <button className="btn" style={{ padding: '10px 16px', fontSize: 13 }} onClick={() => addQuestion(f.id)}>Add</button>
                </div>
                {newQ.qtype === 'choice' && (
                  <input style={{ marginTop: 8 }} placeholder="Options, separated by commas (e.g. Yes, No, Not sure)"
                    value={newQ.options} onChange={e => setNewQ({ ...newQ, options: e.target.value })} />
                )}
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, marginTop: 8 }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={newQ.required} onChange={e => setNewQ({ ...newQ, required: e.target.checked })} />
                  Required
                </label>
              </div>
            )}
          </div>
        ))}
        {forms.length === 0 && <div className="card muted">No forms yet — create one above.</div>}
      </div>

      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Assign to clients</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
        {clients.map(c => {
          const mine = assignments.filter(a => a.client_id === c.id)
          const available = forms.filter(f => !mine.some(a => a.form_id === f.id))
          return (
            <div className="card" key={c.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <strong style={{ fontSize: 14.5 }}>{c.full_name || c.id.slice(0, 8)}</strong>
                {available.length > 0 && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select style={{ width: 'auto', minWidth: 200 }} value={assignPick[c.id] || ''} onChange={e => setAssignPick(p => ({ ...p, [c.id]: e.target.value }))}>
                      <option value="">Assign a form…</option>
                      {available.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                    <button className="btn-ghost" onClick={() => assignForm(c.id)}>Add</button>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: mine.length ? 8 : 0 }}>
                {mine.map(a => (
                  <span key={a.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'var(--steel)',
                    padding: '4px 6px 4px 10px', borderRadius: 20,
                  }}>
                    {formsById[a.form_id]?.name || 'Form'}
                    <span style={{
                      fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 20,
                      background: a.status === 'completed' ? 'rgba(76,175,109,0.18)' : 'rgba(255,90,0,0.18)',
                      color: a.status === 'completed' ? 'var(--green)' : 'var(--orange-hot)',
                    }}>{a.status === 'completed' ? 'Done' : 'Pending'}</span>
                    <button onClick={() => unassignForm(a.id)} style={{ background: 'none', color: 'var(--muted)', padding: 0, fontSize: 12 }}>✕</button>
                  </span>
                ))}
                {mine.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>No forms assigned.</span>}
              </div>
            </div>
          )
        })}
        {clients.length === 0 && <div className="card muted">No clients yet.</div>}
      </div>

      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Recent submissions</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {responses.map(r => (
          <div className="card" key={r.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, cursor: 'pointer' }}
              onClick={() => setOpenResponse(o => o === r.id ? null : r.id)}>
              <div>
                <strong style={{ fontSize: 14.5 }}>{clientsById[r.client_id]?.full_name || 'Client'}</strong>
                <span className="muted" style={{ fontSize: 13, marginLeft: 8 }}>{formsById[r.form_id]?.name || 'Form'}</span>
              </div>
              <span className="muted" style={{ fontSize: 12.5 }}>{new Date(r.submitted_at).toLocaleDateString()}</span>
            </div>
            {openResponse === r.id && (
              <div style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(Array.isArray(r.answers) ? r.answers : []).map((a, i) => (
                  <div key={i} style={{ fontSize: 13.5 }}>
                    <span className="muted">{a.label}</span>
                    <div style={{ fontWeight: 600, marginTop: 1 }}>{String(a.value ?? '—')}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {responses.length === 0 && <div className="card muted">Nothing submitted yet.</div>}
      </div>
    </div>
  )
}
