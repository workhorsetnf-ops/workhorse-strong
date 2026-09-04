import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

function QuestionInput({ q, value, onChange }) {
  if (q.qtype === 'number') {
    return <input inputMode="decimal" value={value ?? ''} onChange={e => onChange(e.target.value)} />
  }
  if (q.qtype === 'scale') {
    return (
      <div style={{ display: 'flex', gap: 4 }}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
          <button key={n} type="button" onClick={() => onChange(n)}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 6, fontSize: 12.5, fontWeight: 800,
              background: value === n ? 'var(--orange)' : 'var(--steel)',
              color: value === n ? '#fff' : 'var(--muted)',
            }}>{n}</button>
        ))}
      </div>
    )
  }
  if (q.qtype === 'choice') {
    return (
      <select value={value ?? ''} onChange={e => onChange(e.target.value)}>
        <option value="">Select…</option>
        {(Array.isArray(q.options) ? q.options : []).map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }
  if (q.qtype === 'yesno') {
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        {['Yes', 'No'].map(o => (
          <button key={o} type="button" onClick={() => onChange(o)}
            className={value === o ? 'btn' : 'btn-ghost'} style={{ flex: 1 }}>{o}</button>
        ))}
      </div>
    )
  }
  return <textarea rows="3" value={value ?? ''} onChange={e => onChange(e.target.value)} />
}

export default function ClientIntakeForms() {
  const { profile } = useAuth()
  const [assignments, setAssignments] = useState([])
  const [forms, setForms] = useState({})       // formId -> { form, questions }
  const [responses, setResponses] = useState({}) // formId -> response row
  const [answers, setAnswers] = useState({})   // formId -> { questionId: value }
  const [openForm, setOpenForm] = useState(null)
  const [submitting, setSubmitting] = useState(null)

  async function load() {
    if (!profile) return
    const { data: a } = await supabase.from('standalone_form_assignments').select('*').eq('client_id', profile.id).order('assigned_at', { ascending: false })
    setAssignments(a || [])
    const nextForms = {}
    for (const asn of a || []) {
      const [{ data: f }, { data: qs }] = await Promise.all([
        supabase.from('standalone_forms').select('*').eq('id', asn.form_id).single(),
        supabase.from('standalone_form_questions').select('*').eq('form_id', asn.form_id).order('position'),
      ])
      nextForms[asn.form_id] = { form: f, questions: qs || [] }
    }
    setForms(nextForms)
    const { data: r } = await supabase.from('standalone_form_responses').select('*').eq('client_id', profile.id)
    setResponses(Object.fromEntries((r || []).map(x => [x.form_id, x])))
  }
  useEffect(() => { load() }, [profile])

  function setAnswer(formId, questionId, value) {
    setAnswers(prev => ({ ...prev, [formId]: { ...(prev[formId] || {}), [questionId]: value } }))
  }

  async function submit(asn) {
    const { questions } = forms[asn.form_id] || { questions: [] }
    const local = answers[asn.form_id] || {}
    for (const q of questions) {
      if (q.required !== false && (local[q.id] === undefined || local[q.id] === '' || local[q.id] === null)) {
        alert(`Please answer: ${q.label}`)
        return
      }
    }
    setSubmitting(asn.id)
    const answerRows = questions.map(q => ({ label: q.label, value: local[q.id] ?? '' }))
    const { error } = await supabase.from('standalone_form_responses').insert({
      assignment_id: asn.id, client_id: profile.id, form_id: asn.form_id, answers: answerRows,
    })
    if (error) { setSubmitting(null); alert('Could not submit: ' + error.message); return }
    await supabase.rpc('complete_standalone_form', { target_assignment_id: asn.id })
    setSubmitting(null)
    load()
  }

  const pending = assignments.filter(a => a.status !== 'completed')
  const completed = assignments.filter(a => a.status === 'completed')

  return (
    <div>
      <div className="eyebrow">Paperwork</div>
      <h1 style={{ fontSize: 24, margin: '6px 0 16px' }}>Forms</h1>

      {assignments.length === 0 && <div className="card muted">Nothing assigned right now.</div>}

      {pending.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          {pending.map(asn => {
            const entry = forms[asn.form_id]
            if (!entry?.form) return null
            const isOpen = openForm === asn.id
            return (
              <div className="card" key={asn.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <strong style={{ fontSize: 15.5 }}>{entry.form.name}</strong>
                    {entry.form.description && <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{entry.form.description}</div>}
                  </div>
                  <button className="btn" style={{ padding: '8px 16px', fontSize: 12.5 }} onClick={() => setOpenForm(isOpen ? null : asn.id)}>
                    {isOpen ? 'Close' : 'Fill out'}
                  </button>
                </div>
                {isOpen && (
                  <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {entry.questions.map(q => (
                      <div key={q.id}>
                        <label style={{ fontSize: 13.5, display: 'block', marginBottom: 6 }}>
                          {q.label}{q.required === false && <span className="muted"> (optional)</span>}
                        </label>
                        <QuestionInput q={q} value={(answers[asn.form_id] || {})[q.id]} onChange={v => setAnswer(asn.form_id, q.id, v)} />
                      </div>
                    ))}
                    <button className="btn" disabled={submitting === asn.id} onClick={() => submit(asn)}>
                      {submitting === asn.id ? 'Submitting…' : 'Submit'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {completed.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, marginBottom: 10 }}>Completed</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {completed.map(asn => {
              const entry = forms[asn.form_id]
              const response = responses[asn.form_id]
              if (!entry?.form) return null
              const isOpen = openForm === asn.id
              return (
                <div className="card" key={asn.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, cursor: 'pointer' }}
                    onClick={() => setOpenForm(isOpen ? null : asn.id)}>
                    <strong style={{ fontSize: 14.5 }}>{entry.form.name}</strong>
                    <span className="muted" style={{ fontSize: 12.5 }}>
                      {response ? `Submitted ${new Date(response.submitted_at).toLocaleDateString()}` : 'Done'}
                    </span>
                  </div>
                  {isOpen && response && (
                    <div style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(Array.isArray(response.answers) ? response.answers : []).map((a, i) => (
                        <div key={i} style={{ fontSize: 13.5 }}>
                          <span className="muted">{a.label}</span>
                          <div style={{ fontWeight: 600, marginTop: 1 }}>{String(a.value ?? '—')}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
