import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { localDateStr, lastNDays, summarizeWeek } from '../../lib/weeks'
import { WeekTable } from './ClientProgress'

export default function ClientCheckin() {
  const { profile } = useAuth()
  // Weight, sleep, steps, energy, hunger etc. are no longer typed here — they're
  // averaged from the Daily Log, so the client can't estimate them from memory.
  const [form, setForm] = useState({ waist: '', notes: '' })
  const [dailyRows, setDailyRows] = useState([])
  const [workoutDates, setWorkoutDates] = useState(new Set())
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
  async function loadWeek() {
    const days = lastNDays(7)
    const [{ data: dl }, { data: wl }] = await Promise.all([
      supabase.from('daily_logs').select('*').eq('client_id', profile.id).gte('log_date', days[0]).lte('log_date', days[6]),
      supabase.from('workout_logs').select('logged_at').eq('client_id', profile.id)
        .gte('logged_at', new Date(Date.now() - 9 * 864e5).toISOString()),
    ])
    setDailyRows(dl || [])
    setWorkoutDates(new Set((wl || []).map(w => localDateStr(new Date(w.logged_at)))))
  }
  useEffect(() => {
    if (!profile) return
    load()
    loadWeek()
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

  const week = lastNDays(7)
  const summary = useMemo(
    () => summarizeWeek(week, Object.fromEntries(dailyRows.map(r => [r.log_date, r])), workoutDates),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dailyRows, workoutDates, week.join()])
  const fewWeighIns = summary.days_weighed < 5

  async function submit() {
    if (fewWeighIns && !window.confirm(`Only ${summary.days_weighed} of 7 weigh-ins are logged, so your weekly average won't be accurate. Submit anyway?`)) return
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
      weight: summary.weight, waist: +form.waist || null, sleep_avg: summary.sleep_avg,
      energy: summary.energy, hunger: summary.hunger, steps: summary.steps,
      adherence: summary.adherence, sessions: summary.sessions, cardio_min: summary.cardio_min,
      stress: summary.stress, digestion: summary.digestion,
      period_start: summary.period_start, period_end: summary.period_end,
      days_logged: summary.days_logged, days_weighed: summary.days_weighed, daily_summary: summary.daily,
      notes: form.notes, photo_urls: urls,
      photos: photoRows,
      form_responses, form_name: customForm?.name || ''
    })
    setBusy(false)
    if (!error) {
      setDone(true)
      setForm({ waist: '', notes: '' })
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

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <div className="eyebrow" style={{ fontSize: 10 }}>Your last 7 days</div>
          <span className="muted" style={{ fontSize: 11.5 }}>Auto from your Daily Log</span>
        </div>
        <WeekTable summary={summary} />
        <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, fontSize: 13,
          background: fewWeighIns ? 'rgba(214,69,69,0.15)' : 'var(--steel)', border: '1px solid ' + (fewWeighIns ? 'var(--red)' : 'transparent') }}>
          {fewWeighIns
            ? <>Only <strong>{summary.days_weighed} of 7</strong> weigh-ins logged. Fill in any days you missed so your average is right.</>
            : <><strong>{summary.days_weighed} of 7</strong> weigh-ins logged. Nice.</>}
          {' '}<Link to="/app/progress" style={{ color: 'var(--orange-hot)', fontWeight: 700 }}>Open Daily Log →</Link>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label className="muted" style={{ fontSize: 12 }}>Waist (in) — measure at the navel</label>
          <input inputMode="decimal" placeholder="e.g. 36.5" value={form.waist} onChange={e => setForm({ ...form, waist: e.target.value })} />
        </div>
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
                {/* No capture attribute: that forces the camera and hides the
                    gallery, so a client who shot their photos earlier had no way
                    to submit them. Without it they get the normal picker —
                    camera or existing photo, their choice. */}
                <input type="file" accept="image/*" style={{ display: 'none' }}
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
                <span className="muted">{c.weight ? `${c.weight} lbs${c.period_start ? ' (7-day avg)' : ''}` : ''}</span>
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
