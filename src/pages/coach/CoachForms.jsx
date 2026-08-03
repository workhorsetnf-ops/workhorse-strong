import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function CoachForms() {
  const [forms, setForms] = useState([])
  const [clients, setClients] = useState([])
  const [assignments, setAssignments] = useState([])
  const [open, setOpen] = useState(null)
  const [questions, setQuestions] = useState([])
  const [newForm, setNewForm] = useState('')
  const [newQ, setNewQ] = useState({ label: '', qtype: 'text', options: '' })
  const [editingQ, setEditingQ] = useState(null)
  const [editQ, setEditQ] = useState({ label: '', qtype: 'text', options: '' })

  async function load() {
    const [{ data: f }, { data: c }, { data: a }] = await Promise.all([
      supabase.from('checkin_forms').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name').eq('role', 'client').order('full_name'),
      supabase.from('checkin_form_assignments').select('*'),
    ])
    setForms(f || []); setClients(c || []); setAssignments(a || [])
  }
  useEffect(() => { load() }, [])

  async function loadQuestions(formId) {
    const { data } = await supabase.from('checkin_form_questions').select('*').eq('form_id', formId).order('position')
    setQuestions(data || [])
  }

  function openForm(id) {
    if (open === id) { setOpen(null); return }
    setOpen(id); loadQuestions(id)
  }

  async function createForm() {
    if (!newForm.trim()) return
    await supabase.from('checkin_forms').insert({ name: newForm.trim() })
    setNewForm(''); load()
  }

  async function addQuestion(formId) {
    if (!newQ.label.trim()) return
    await supabase.from('checkin_form_questions').insert({
      form_id: formId, label: newQ.label.trim(), qtype: newQ.qtype, position: questions.length,
      options: newQ.qtype === 'choice' ? newQ.options.split(',').map(t => t.trim()).filter(Boolean) : []
    })
    setNewQ({ label: '', qtype: 'text', options: '' })
    loadQuestions(formId)
  }

  function startEditQ(qu) {
    setEditingQ(qu.id)
    setEditQ({ label: qu.label, qtype: qu.qtype, options: Array.isArray(qu.options) ? qu.options.join(', ') : '' })
  }

  async function saveQuestion(formId, qId) {
    if (!editQ.label.trim()) return
    await supabase.from('checkin_form_questions').update({
      label: editQ.label.trim(),
      qtype: editQ.qtype,
      options: editQ.qtype === 'choice' ? editQ.options.split(',').map(t => t.trim()).filter(Boolean) : []
    }).eq('id', qId)
    setEditingQ(null)
    loadQuestions(formId)
  }

  async function deleteQuestion(formId, qId) {
    await supabase.from('checkin_form_questions').delete().eq('id', qId)
    loadQuestions(formId)
  }

  async function deleteForm(id) {
    if (!confirm('Delete this form and its questions?')) return
    await supabase.from('checkin_forms').delete().eq('id', id)
    setOpen(null); load()
  }

  async function assignForm(clientId, formId) {
    if (!formId) {
      await supabase.from('checkin_form_assignments').delete().eq('client_id', clientId)
    } else {
      await supabase.from('checkin_form_assignments').upsert({ client_id: clientId, form_id: formId }, { onConflict: 'client_id' })
    }
    load()
  }

  const typeLabel = { text: 'Text answer', number: 'Number', scale: 'Scale 1–10', choice: 'Multiple choice' }

  return (
    <div>
      <div className="eyebrow">Check-ins</div>
      <h1 style={{ fontSize: 28, margin: '6px 0 20px' }}>Forms</h1>

      <div className="card" style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input placeholder="New form name (e.g. Weekly Check-in — Cut)" value={newForm} onChange={e => setNewForm(e.target.value)} onKeyDown={e => e.key === 'Enter' && createForm()} />
        <button className="btn" style={{ whiteSpace: 'nowrap' }} onClick={createForm}>Create form</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
        {forms.map(f => (
          <div className="card" key={f.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div>
                <strong style={{ fontSize: 16 }}>{f.name}</strong>
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
                          </select>
                        </div>
                        {editQ.qtype === 'choice' && (
                          <input placeholder="Options, separated by commas" value={editQ.options} onChange={e => setEditQ({ ...editQ, options: e.target.value })} />
                        )}
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
                            ({typeLabel[qu.qtype]}{qu.qtype === 'choice' && Array.isArray(qu.options) ? `: ${qu.options.join(' / ')}` : ''})
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
                  <input placeholder="Question (e.g. How was travel this week?)" value={newQ.label} onChange={e => setNewQ({ ...newQ, label: e.target.value })} onKeyDown={e => e.key === 'Enter' && addQuestion(f.id)} />
                  <select value={newQ.qtype} onChange={e => setNewQ({ ...newQ, qtype: e.target.value })}>
                    <option value="text">Text answer</option>
                    <option value="number">Number</option>
                    <option value="scale">Scale 1–10</option>
                    <option value="choice">Multiple choice</option>
                  </select>
                  <button className="btn" style={{ padding: '10px 16px', fontSize: 13 }} onClick={() => addQuestion(f.id)}>Add</button>
                </div>
                {newQ.qtype === 'choice' && (
                  <input style={{ marginTop: 8 }} placeholder="Options, separated by commas (e.g. Great, Okay, Rough)"
                    value={newQ.options} onChange={e => setNewQ({ ...newQ, options: e.target.value })} />
                )}
              </div>
            )}
          </div>
        ))}
        {forms.length === 0 && <div className="card muted">No forms yet — create one above.</div>}
      </div>

      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Assign to clients</h2>
      <table className="data">
        <thead><tr><th>Client</th><th>Check-in form</th></tr></thead>
        <tbody>
          {clients.map(c => (
            <tr key={c.id}>
              <td style={{ fontWeight: 700 }}>{c.full_name || c.id.slice(0, 8)}</td>
              <td>
                <select style={{ width: 'auto', minWidth: 240 }}
                  value={assignments.find(a => a.client_id === c.id)?.form_id || ''}
                  onChange={e => assignForm(c.id, e.target.value)}>
                  <option value="">Standard check-in only</option>
                  {forms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
        Every client always gets the standard fields (weight, waist, sleep, energy, hunger, photos). An assigned form adds your custom questions on top.
      </p>
    </div>
  )
}
