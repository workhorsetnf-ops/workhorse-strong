import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

export default function ClientCheckin() {
  const { profile } = useAuth()
  const [form, setForm] = useState({ weight: '', waist: '', sleep_avg: '', energy: 7, hunger: 5, notes: '' })
  const [customForm, setCustomForm] = useState(null)     // { id, name }
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [photos, setPhotos] = useState({ Front: null, Side: null, Back: null })
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function load() {
    const { data } = await supabase.from('checkins').select('*')
      .eq('client_id', profile.id).order('submitted_at', { ascending: false }).limit(6)
    setHistory(data || [])
  }
  useEffect(() => {
    if (!profile) return
    load()
    supabase.from('checkin_form_assignments').select('form_id, checkin_forms(id, name)')
      .eq('client_id', profile.id).maybeSingle()
      .then(({ data }) => {
        if (!data?.checkin_forms) return
        setCustomForm(data.checkin_forms)
        supabase.from('checkin_form_questions').select('*')
          .eq('form_id', data.form_id).order('position')
          .then(({ data: qs }) => setQuestions(qs || []))
      })
  }, [profile])

  async function submit() {
    setBusy(true)
    const photoRows = []
    for (const [label, file] of Object.entries(photos)) {
      if (!file) continue
      const path = `${profile.id}/${Date.now()}-${label.toLowerCase()}-${file.name}`
      const { error } = await supabase.storage.from('checkin-photos').upload(path, file)
      if (!error) photoRows.push({ label, path })
    }
    const urls = photoRows.map(r => r.path)
    const form_responses = questions
      .map(q => ({ label: q.label, value: answers[q.id] ?? '' }))
      .filter(r => String(r.value).trim() !== '')
    const { error } = await supabase.from('checkins').insert({
      client_id: profile.id,
      weight: +form.weight || null, waist: +form.waist || null, sleep_avg: +form.sleep_avg || null,
      energy: +form.energy, hunger: +form.hunger, notes: form.notes, photo_urls: urls,
      photos: photoRows,
      form_responses, form_name: customForm?.name || ''
    })
    setBusy(false)
    if (!error) {
      setDone(true)
      setForm({ weight: '', waist: '', sleep_avg: '', energy: 7, hunger: 5, notes: '' })
      setAnswers({})
      setPhotos({ Front: null, Side: null, Back: null })
      load()
      setTimeout(() => setDone(false), 3000)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header>
        <div className="eyebrow">Weekly</div>
        <h1 style={{ fontSize: 24, marginTop: 4 }}>Check-in</h1>
      </header>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <input inputMode="decimal" placeholder="Weight" value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })} />
          <input inputMode="decimal" placeholder="Waist" value={form.waist} onChange={e => setForm({ ...form, waist: e.target.value })} />
          <input inputMode="decimal" placeholder="Sleep hrs" value={form.sleep_avg} onChange={e => setForm({ ...form, sleep_avg: e.target.value })} />
        </div>
        {[['Energy', 'energy'], ['Hunger', 'hunger']].map(([label, key]) => (
          <div key={key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
              <span>{label}</span><span style={{ color: 'var(--orange-hot)' }}>{form[key]}/10</span>
            </div>
            <input type="range" min="1" max="10" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}
              style={{ accentColor: 'var(--orange)', padding: 0 }} />
          </div>
        ))}
        {questions.map(q => (
          <div key={q.id}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
              {q.label}{q.qtype === 'scale' && <span style={{ color: 'var(--orange-hot)', marginLeft: 8 }}>{answers[q.id] || 5}/10</span>}
            </div>
            {q.qtype === 'text' && (
              <textarea rows="2" value={answers[q.id] || ''} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))} />
            )}
            {q.qtype === 'number' && (
              <input inputMode="decimal" value={answers[q.id] || ''} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))} />
            )}
            {q.qtype === 'scale' && (
              <input type="range" min="1" max="10" value={answers[q.id] || 5}
                onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                style={{ accentColor: 'var(--orange)', padding: 0 }} />
            )}
            {q.qtype === 'choice' && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(Array.isArray(q.options) ? q.options : []).map(opt => (
                  <button key={opt} type="button"
                    className={answers[q.id] === opt ? 'btn' : 'btn-ghost'}
                    style={{ padding: '8px 14px', fontSize: 13 }}
                    onClick={() => setAnswers(a => ({ ...a, [q.id]: opt }))}>{opt}</button>
                ))}
              </div>
            )}
          </div>
        ))}
        <textarea rows="3" placeholder="How did the week go? Shows, travel, sleep, anything I should know." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        <div>
          <div className="eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>Progress photos</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {['Front', 'Side', 'Back'].map(label => (
              <label key={label} className="btn-ghost" style={{ textAlign: 'center', borderColor: photos[label] ? 'var(--orange)' : 'var(--line)', color: photos[label] ? 'var(--orange-hot)' : 'var(--white)' }}>
                {photos[label] ? `${label} ✓` : label}
                <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                  onChange={e => setPhotos(ph => ({ ...ph, [label]: e.target.files[0] || null }))} />
              </label>
            ))}
          </div>
        </div>
        <button className="btn" onClick={submit} disabled={busy}>{done ? 'Submitted ✓' : busy ? 'Submitting…' : 'Submit check-in'}</button>
      </div>

      {history.length > 0 && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>History</div>
          {history.map(c => (
            <div className="card" key={c.id} style={{ marginBottom: 10, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 700 }}>
                <span>{new Date(c.submitted_at).toLocaleDateString()}</span>
                <span className="muted">{c.weight ? `${c.weight} lbs` : ''}</span>
              </div>
              {c.coach_feedback && (
                <div style={{ marginTop: 8, borderLeft: '3px solid var(--orange)', paddingLeft: 10, fontSize: 13.5 }}>
                  <span className="eyebrow" style={{ fontSize: 10 }}>Coach feedback</span>
                  <p style={{ marginTop: 3 }}>{c.coach_feedback}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
