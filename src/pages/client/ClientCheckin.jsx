import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import CheckinEditor from '../CheckinEditor'
import { notifyEvent } from '../../lib/push'
import { useAuth } from '../../context/AuthContext'
import { localDateStr, lastNDays, summarizeWeek } from '../../lib/weeks'
import { WeekTable } from './ClientProgress'
import QuickCheckin from './QuickCheckin'
import { checkinDueDate } from '../../lib/dashboard'

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
  const [histLoaded, setHistLoaded] = useState(false)
  const [editingId, setEditingId] = useState(null)

  async function load() {
    const { data } = await supabase.from('checkins').select('*')
      .eq('client_id', profile.id).order('submitted_at', { ascending: false }).limit(6)
    setHistory(data || [])
    setHistLoaded(true)
  }
  async function loadWeek() {
    const days = lastNDays(7)
    const [{ data: dl }, { data: wl }] = await Promise.all([
      supabase.from('daily_logs').select('*').eq('client_id', profile.id).gte('log_date', days[0]).lte('log_date', days[6]),
      supabase.from('workout_logs').select('logged_at').eq('client_id', profile.id).neq('session_track', 'conditioning')
        .gte('logged_at', new Date(Date.now() - 9 * 864e5).toISOString()),
    ])
    setDailyRows(dl || [])
    setWorkoutDates(new Set((wl || []).map(w => localDateStr(new Date(w.logged_at)))))
  }
  useEffect(() => {
    if (!profile) return
    load()
    loadWeek()
    // their own form if the coach assigned one, otherwise the default weekly form
    ;(async () => {
      const { data: a } = await supabase.from('checkin_form_assignments').select('form_id, checkin_forms(id, name, is_default)')
        .eq('client_id', profile.id).maybeSingle()
      let f = a?.checkin_forms || null
      if (!f) {
        const { data: d } = await supabase.from('checkin_forms').select('id, name, is_default').eq('is_default', true).maybeSingle()
        f = d || null
      }
      if (!f) return
      setCustomForm(f)
      const { data: qs } = await supabase.from('checkin_form_questions').select('*').eq('form_id', f.id).order('position')
      setQuestions(qs || [])
    })()
  }, [profile])

  const week = lastNDays(7)
  const summary = useMemo(
    () => summarizeWeek(week, Object.fromEntries(dailyRows.map(r => [r.log_date, r])), workoutDates),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dailyRows, workoutDates, week.join()])
  const fewWeighIns = summary.days_weighed < 5

  // Pre-fill the weight/waist and sleep questions from data the app already has,
  // once, without overwriting anything the client has typed.
  const r1 = n => (n === null || n === undefined || n === '' || isNaN(Number(n)) ? '' : String(Math.round(Number(n) * 10) / 10))
  useEffect(() => {
    if (!questions.length) return
    setAnswers(prev => {
      const next = { ...prev }
      for (const q of questions) {
        if (next[q.id] !== undefined) continue
        if (q.qtype === 'body_prev') { const last = history[0]; if (last) next[q.id] = { weight: r1(last.weight), waist: r1(last.waist) } }
        else if (q.qtype === 'body_now' && summary.weight != null) next[q.id] = { weight: r1(summary.weight), waist: '' }
        else if (q.qtype === 'number' && q.options?.prefill && summary[q.options.prefill] != null) next[q.id] = r1(summary[q.options.prefill])
      }
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, history, summary.weight, summary.sleep_avg])

  // The weekly form opens ON their check-in day and stays open (overdue) until
  // they send it; it can't be opened early. Daily quick check-ins live at the top.
  const today = localDateStr()
  const lastSent = history[0]?.submitted_at ? localDateStr(new Date(history[0].submitted_at)) : null
  const weeklyDue = checkinDueDate({ checkinDay: profile?.checkin_day, frequency: profile?.checkin_frequency, lastCheckin: lastSent, today, startDate: profile?.start_date })
  const notDueYet = !!(weeklyDue && weeklyDue > today)
  const overdueDays = weeklyDue && weeklyDue < today ? Math.round((new Date(today + 'T00:00:00') - new Date(weeklyDue + 'T00:00:00')) / 864e5) : 0
  const showForm = histLoaded && !notDueYet
  const fmtDay = d => new Date(d + 'T00:00:00').toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })

  const bodyNow = questions.find(q => q.qtype === 'body_now')
  const usesDefault = !!customForm?.is_default
  const bodyText = v => [v?.weight && `${v.weight} lbs`, v?.waist && `${v.waist} in`].filter(Boolean).join(', ')

  async function submit() {
    if (fewWeighIns && !window.confirm(`Only ${summary.days_weighed} of 7 weigh-ins are logged, so your weekly average won't be accurate. Submit anyway?`)) return
    setBusy(true)
    const photoRows = []
    const photoFails = []
    for (const [label, file] of Object.entries(photos)) {
      if (!file) continue
      const path = `${profile.id}/${Date.now()}-${label.toLowerCase()}-${file.name}`
      const { error } = await supabase.storage.from('checkin-photos').upload(path, file)
      if (!error) photoRows.push({ label, path })
      else photoFails.push(label)
    }
    const urls = photoRows.map(r => r.path)
    const form_responses = questions
      .map(q => ({
        label: q.label,
        // a 1-10 slider left on 5 is still an answer
        value: q.qtype === 'scale' ? (answers[q.id] ?? '5') : (q.qtype === 'body_prev' || q.qtype === 'body_now') ? bodyText(answers[q.id]) : (answers[q.id] ?? ''),
      }))
      .filter(r => String(r.value).trim() !== '')
    const nowBody = bodyNow ? answers[bodyNow.id] : null
    const waist = +(nowBody?.waist ?? form.waist) || null
    const weight = summary.weight ?? (+nowBody?.weight || null)
    const { error } = await supabase.from('checkins').insert({
      client_id: profile.id,
      weight, waist, sleep_avg: summary.sleep_avg,
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
    // Used to fail silently: the button just re-enabled and nothing was saved,
    // so the client thought they'd checked in and the coach saw nothing.
    if (error) {
      console.error('Check-in insert failed', error)
      alert(`Your check-in didn't save, so your coach can't see it yet. Please screenshot this and send it to your coach.\n\n${error.message}`)
      return
    }
    if (photoFails.length) alert(`Your check-in was saved, but these photos didn't upload: ${photoFails.join(', ')}. Try adding them again next time, or send them to your coach in Messages.`)
    if (!error) {
      notifyEvent('checkin')
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
        <div className="eyebrow">Check-in</div>
        <h1 style={{ fontSize: 24, marginTop: 4 }}>Check-in</h1>
      </header>

      <QuickCheckin profile={profile} />

      {histLoaded && notDueYet && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="eyebrow" style={{ fontSize: 10 }}>Weekly check-in</div>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>
            {lastSent
              ? <><span style={{ color: 'var(--orange-hot)' }}>✓</span> Sent {new Date(history[0].submitted_at).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}. </>
              : 'Your first one '}
            {lastSent ? 'Your next one opens ' : 'opens '}<span style={{ color: 'var(--orange-hot)' }}>{fmtDay(weeklyDue)}</span>.
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            Nothing to do here today.{profile?.adherence_tier ? ' Your daily quick check-in is the short one, on your Home screen and at the top of this page when it\'s due.' : ' Keep logging your Daily Log and it all gets averaged for you.'}
            {' '}Something you need me to know before then? <Link to="/app/messages" style={{ color: 'var(--orange-hot)', fontWeight: 700 }}>Message me →</Link>
          </div>
        </div>
      )}

      {showForm && (<>
      <div className="eyebrow" style={{ marginBottom: -8 }}>Weekly check-in · {overdueDays ? <span style={{ color: 'var(--red)' }}>was due {fmtDay(weeklyDue)}, send it today</span> : 'due today'}</div>
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
        {!bodyNow && (
          <div>
            <label className="muted" style={{ fontSize: 12 }}>Waist (in) — measure at the navel</label>
            <input inputMode="decimal" placeholder="e.g. 36.5" value={form.waist} onChange={e => setForm({ ...form, waist: e.target.value })} />
          </div>
        )}
        {questions.map(q => (
          <div key={q.id}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
              {q.label}{q.qtype === 'scale' && <span style={{ color: 'var(--orange-hot)', marginLeft: 8 }}>{answers[q.id] || 5}/10</span>}
            </div>
            {q.qtype === 'text' && (
              <textarea rows="2" value={answers[q.id] || ''} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))} />
            )}
            {(q.qtype === 'body_prev' || q.qtype === 'body_now') && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div><div className="muted" style={{ fontSize: 11.5 }}>Weight (lbs)</div>
                    <input inputMode="decimal" placeholder="e.g. 150" value={answers[q.id]?.weight ?? ''} onChange={e => setAnswers(a => ({ ...a, [q.id]: { ...(a[q.id] || {}), weight: e.target.value } }))} /></div>
                  <div><div className="muted" style={{ fontSize: 11.5 }}>Waist (in){q.qtype === 'body_now' ? ', at the navel' : ''}</div>
                    <input inputMode="decimal" placeholder="e.g. 32" value={answers[q.id]?.waist ?? ''} onChange={e => setAnswers(a => ({ ...a, [q.id]: { ...(a[q.id] || {}), waist: e.target.value } }))} /></div>
                </div>
                <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                  {q.qtype === 'body_prev' ? (history[0] ? 'Filled in from your last check-in. Fix it if it\'s off.' : 'Your first check-in: fill in what you were last week, if you know it.')
                    : summary.weight != null ? `Weight filled in from your ${summary.days_weighed}-day average.` : 'Log your daily weigh-ins and this fills itself in.'}
                </div>
              </>
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
        {!usesDefault && (
          <textarea rows="3" placeholder="How did the week go? Shows, travel, sleep, anything I should know." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        )}
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
        <button className="btn" onClick={submit} disabled={busy}>{done ? 'Submitted ✓' : busy ? 'Submitting…' : 'Submit weekly check-in'}</button>
      </div>
      </>)}

      {history.length > 0 && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>History</div>
          {history.map(c => (
            <div className="card" key={c.id} style={{ marginBottom: 10, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 700 }}>
                <span>{new Date(c.submitted_at).toLocaleDateString()}</span>
                <span className="muted">{c.weight ? `${c.weight} lbs${c.period_start ? ' (7-day avg)' : ''}` : ''}</span>
              </div>
              {/* Editable until the coach marks it reviewed, e.g. sent before it was finished */}
              {(c.status || 'pending') !== 'done' && editingId !== c.id && (
                <button className="btn-ghost" style={{ marginTop: 8, padding: '5px 10px', fontSize: 12 }} onClick={() => setEditingId(c.id)}>Edit answers</button>
              )}
              {editingId === c.id && (
                <CheckinEditor checkin={c} onCancel={() => setEditingId(null)}
                  onSaved={row => { setHistory(h => h.map(x => x.id === row.id ? row : x)); setEditingId(null) }} />
              )}
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
