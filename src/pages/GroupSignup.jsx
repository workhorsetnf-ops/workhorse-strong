// Public sign-up for the group offer: /start (Update 166), and Workhorse 90 at
// /start/90 (Update 180): same programs, 90 days, a monthly group call, paid in
// full or in 2 payments.
// 1. pick a program  2. your numbers (for starting targets)  3. account
// -> account created as a group member -> signed in -> Stripe Checkout.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { callApi } from '../lib/push'
import { ACTIVITY } from '../lib/macros'

const GOALS = [['cut', 'Lose fat'], ['maintain', 'Recomp / maintain'], ['build', 'Build muscle']]
const ACTIVITY_HINT = { 'lifting-only': 'Training, not wrestling right now', 'light-schedule': '1-2 shows or practices a week', 'working-talent': 'Regular shows + training', 'heavy-schedule': 'Lots of shows and travel' }

export default function GroupSignup({ offer = 'monthly' }) {
  const w90 = offer === 'w90'
  const [option, setOption] = useState('full')   // Workhorse 90: 'full' | 'split'
  const [info, setInfo] = useState(null)       // { tracks, price }
  const [step, setStep] = useState(1)
  const [track, setTrack] = useState(null)
  const [n, setN] = useState({ weight: '', height_ft: '', height_in: '', age: '', sex: '', activity: 'light-schedule', goal: 'cut' })
  const [f, setF] = useState({ full_name: '', email: '', password: '', again: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')

  useEffect(() => {
    callApi('/api/group-signup', { list: true, ...(w90 ? { offer: 'w90' } : {}) }).then(setInfo).catch(e => setInfo({ tracks: [], error: e.message }))
  }, [])

  const numbersOk = Number(n.weight) >= 80 && Number(n.height_ft) >= 4 && Number(n.age) >= 16 && n.sex
  async function submit(e) {
    e.preventDefault()
    if (f.password !== f.again) return setErr('The two passwords don’t match.')
    setErr(''); setBusy('Creating your account…')
    try {
      await callApi('/api/group-signup', { track_id: track.id, full_name: f.full_name, email: f.email, password: f.password, numbers: n, ...(w90 ? { offer: 'w90' } : {}) })
      const { error } = await supabase.auth.signInWithPassword({ email: f.email.trim().toLowerCase(), password: f.password })
      if (error) throw new Error('Account created. Sign in to finish joining.')
      setBusy('Opening secure checkout…')
      const { url } = await callApi('/api/group-billing', { action: 'checkout', ...(w90 ? { offer: 'w90', option } : {}) })
      window.location.href = url
    } catch (x) { setErr(x.message); setBusy('') }
  }

  const price = w90 ? (option === 'full' ? '$495 · 90 days' : '2 × $249') : (info?.price || '$50/month')
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <img src="/logo.png" alt="Workhorse Training & Nutrition" style={{ width: 140, height: 140, objectFit: 'contain', margin: '0 auto' }} />
          <p className="muted" style={{ marginTop: 2, fontSize: 15 }}>Clock in. Do the work.</p>
        </div>

        {!info && <div className="card muted">Loading…</div>}
        {info && !info.tracks?.length && (
          <div className="card">
            <div className="eyebrow">Not open yet</div>
            <p style={{ fontSize: 14 }}>{info.error || 'Sign-ups for the program aren’t open right now. Check back soon.'}</p>
          </div>
        )}

        {info?.tracks?.length > 0 && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div className="eyebrow">Step {step} of 3</div>
              <strong style={{ color: 'var(--orange-hot)' }}>{price}</strong>
            </div>

            {step === 1 && (
              <>
                <div>
                  {w90 && <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: '.08em', color: 'var(--orange-hot)', marginBottom: 4 }}>WORKHORSE 90</div>}
                  <h1 style={{ fontSize: 24, margin: '0 0 4px' }}>Pick your program</h1>
                  <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>{w90
                    ? '90 days of the full training program in the app, the team chat, and a live group call with Anthony every month.'
                    : 'Full training program in the app, new blocks every month, cancel anytime.'}</p>
                </div>
                {info.tracks.map(t => {
                  const on = track?.id === t.id
                  return (
                    <button key={t.id} type="button" onClick={() => setTrack(t)} aria-pressed={on}
                      style={{ textAlign: 'left', padding: '14px 14px', borderRadius: 12, cursor: 'pointer', background: on ? 'rgba(255,85,0,.12)' : 'var(--steel)', border: `2px solid ${on ? 'var(--orange)' : 'transparent'}`, color: 'inherit' }}>
                      <div style={{ fontSize: 16, fontWeight: 900 }}>{t.name}</div>
                      {t.description && <div className="muted" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{t.description}</div>}
                    </button>
                  )
                })}
                <button className="btn" disabled={!track} onClick={() => setStep(2)}>Continue</button>
              </>
            )}

            {step === 2 && (
              <>
                <div>
                  <h1 style={{ fontSize: 24, margin: '0 0 4px' }}>Your numbers</h1>
                  <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>Sets your starting calories and macros in the app.</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input inputMode="decimal" placeholder="Weight (lbs)" value={n.weight} onChange={e => setN({ ...n, weight: e.target.value })} />
                  <input inputMode="numeric" placeholder="Age" value={n.age} onChange={e => setN({ ...n, age: e.target.value })} />
                  <input inputMode="numeric" placeholder="Height (ft)" value={n.height_ft} onChange={e => setN({ ...n, height_ft: e.target.value })} />
                  <input inputMode="numeric" placeholder="Height (in)" value={n.height_in} onChange={e => setN({ ...n, height_in: e.target.value })} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[['male', 'Male'], ['female', 'Female']].map(([v, l]) => (
                    <button key={v} type="button" className={n.sex === v ? 'btn' : 'btn-ghost'} onClick={() => setN({ ...n, sex: v })}>{l}</button>
                  ))}
                </div>
                <label style={{ fontSize: 13, fontWeight: 700 }}>Goal
                  <select value={n.goal} onChange={e => setN({ ...n, goal: e.target.value })} style={{ marginTop: 4 }}>
                    {GOALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 13, fontWeight: 700 }}>Wrestling schedule
                  <select value={n.activity} onChange={e => setN({ ...n, activity: e.target.value })} style={{ marginTop: 4 }}>
                    {ACTIVITY.map(([v, l]) => <option key={v} value={v}>{l}: {ACTIVITY_HINT[v]}</option>)}
                  </select>
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-ghost" onClick={() => setStep(1)}>Back</button>
                  <button className="btn" style={{ flex: 1 }} disabled={!numbersOk} onClick={() => setStep(3)}>Continue</button>
                </div>
              </>
            )}

            {step === 3 && (
              <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <h1 style={{ fontSize: 24, margin: '0 0 4px' }}>Create your account</h1>
                  <p className="muted" style={{ fontSize: 13.5, margin: 0 }}><strong>{track?.name}</strong> · {price}. You’ll pay on the next screen (secure checkout by Stripe).</p>
                </div>
                {w90 && (
                  <div role="radiogroup" aria-label="How to pay" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[['full', '$495', 'Pay in full · 90 days'], ['split', '2 × $249', 'Today, then in 6 weeks']].map(([v, big, small]) => (
                      <button key={v} type="button" role="radio" aria-checked={option === v} onClick={() => setOption(v)}
                        style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 12, cursor: 'pointer', background: option === v ? 'rgba(255,85,0,.12)' : 'var(--steel)', border: `2px solid ${option === v ? 'var(--orange)' : 'transparent'}`, color: 'inherit' }}>
                        <div style={{ fontSize: 17, fontWeight: 900 }}>{big}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{small}</div>
                      </button>
                    ))}
                  </div>
                )}
                <input placeholder="Full name" autoComplete="name" value={f.full_name} onChange={e => { setF({ ...f, full_name: e.target.value }); setErr('') }} />
                <input type="email" placeholder="Email" autoComplete="email" inputMode="email" autoCapitalize="none" value={f.email} onChange={e => { setF({ ...f, email: e.target.value }); setErr('') }} />
                <input type="password" placeholder="Password (8+ characters)" autoComplete="new-password" value={f.password} onChange={e => { setF({ ...f, password: e.target.value }); setErr('') }} />
                <input type="password" placeholder="Type it again" autoComplete="new-password" value={f.again} onChange={e => { setF({ ...f, again: e.target.value }); setErr('') }} />
                {err && <div style={{ color: 'var(--red)', fontSize: 13, fontWeight: 600 }}>{err}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn-ghost" onClick={() => setStep(2)} disabled={!!busy}>Back</button>
                  <button className="btn" type="submit" style={{ flex: 1 }} disabled={!!busy || !f.full_name || !f.email || !f.password || !f.again}>{busy || `Continue to payment`}</button>
                </div>
              </form>
            )}
            <a href="/" className="muted" style={{ fontSize: 12.5, textAlign: 'center' }}>Already a member? Sign in</a>
          </div>
        )}
      </div>
    </div>
  )
}
