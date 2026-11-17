// /welcome/<token>: the link in the "set up your account" email (Update 184).
// A new client confirms their name, picks a password, and lands in the app,
// where the contract is the first thing they see.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { callApi } from '../lib/push'

export default function Welcome({ token }) {
  const [state, setState] = useState('checking')   // checking | open | closed
  const [email, setEmail] = useState('')
  const [f, setF] = useState({ full_name: '', password: '', again: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    callApi('/api/onboard', { action: 'check', token })
      .then(r => { setEmail(r.email || ''); setF(x => ({ ...x, full_name: r.name || '' })); setState('open') })
      .catch(e => { setErr(e.message); setState('closed') })
  }, [token])

  const set = (k, v) => { setF(x => ({ ...x, [k]: v })); setErr('') }
  async function submit(e) {
    e.preventDefault()
    if (f.full_name.trim().length < 2) { setErr('Please enter your full name.'); return }
    if (f.password.length < 8) { setErr('Use at least 8 characters.'); return }
    if (f.password !== f.again) { setErr('The two passwords don’t match.'); return }
    setBusy(true); setErr('')
    try {
      const r = await callApi('/api/onboard', { action: 'claim', token, full_name: f.full_name.trim(), password: f.password })
      const { error } = await supabase.auth.signInWithPassword({ email: r.email || email, password: f.password })
      if (error) throw new Error('Password saved. Please sign in.')
      window.history.replaceState(null, '', '/app')
    } catch (x) { setErr(x.message); setBusy(false) }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <img src="/logo.png" alt="Workhorse Training & Nutrition" style={{ width: 170, height: 170, objectFit: 'contain', margin: '0 auto' }} />
          <p className="muted" style={{ marginTop: 2, fontSize: 15 }}>Clock in. Do the work.</p>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {state === 'checking' && <p className="muted" style={{ fontSize: 14 }}>Checking your link…</p>}
          {state === 'closed' && (
            <>
              <div className="eyebrow">Link not active</div>
              <p style={{ fontSize: 14 }}>{err}</p>
              <a href="/" className="btn-ghost" style={{ textAlign: 'center', textDecoration: 'none' }}>Go to sign in</a>
            </>
          )}
          {state === 'open' && (
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div className="eyebrow">You’re in</div>
                <h1 style={{ fontSize: 24, margin: '6px 0 2px' }}>Set up your account</h1>
                <p className="muted" style={{ fontSize: 13 }}>Your login is <b>{email}</b>. Next you’ll sign your coaching agreement.</p>
              </div>
              <input placeholder="Full name" autoComplete="name" value={f.full_name} onChange={e => set('full_name', e.target.value)} />
              <input type="password" placeholder="Choose a password (8+ characters)" autoComplete="new-password" value={f.password} onChange={e => set('password', e.target.value)} />
              <input type="password" placeholder="Type it again" autoComplete="new-password" value={f.again} onChange={e => set('again', e.target.value)} />
              {err && <div style={{ color: 'var(--red)', fontSize: 13, fontWeight: 600 }}>{err}</div>}
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Setting up…' : 'Continue'}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
