// Public sign-up page from the coach's link: /join/<code>
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { callApi } from '../lib/push'

export default function Join({ code }) {
  const [state, setState] = useState('checking')   // checking | open | closed
  const [f, setF] = useState({ full_name: '', email: '', password: '', again: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    callApi('/api/join', { code, check: true }).then(() => setState('open')).catch(e => { setErr(e.message); setState('closed') })
  }, [code])

  const set = (k, v) => { setF(x => ({ ...x, [k]: v })); setErr('') }
  async function submit(e) {
    e.preventDefault()
    if (f.password !== f.again) { setErr('The two passwords don’t match.'); return }
    setBusy(true); setErr('')
    try {
      await callApi('/api/join', { code, full_name: f.full_name, email: f.email, password: f.password })
      const { error } = await supabase.auth.signInWithPassword({ email: f.email.trim().toLowerCase(), password: f.password })
      if (error) throw new Error('Account created. Please sign in.')
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
              <p style={{ fontSize: 14 }}>{err || 'This sign-up link has expired.'}</p>
              <a href="/" className="btn-ghost" style={{ textAlign: 'center', textDecoration: 'none' }}>Already have an account? Sign in</a>
            </>
          )}
          {state === 'open' && (
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div className="eyebrow">Welcome to the team</div>
                <h1 style={{ fontSize: 24, margin: '6px 0 2px' }}>Create your account</h1>
                <p className="muted" style={{ fontSize: 13 }}>Use the email you want to sign in with. You’ll go straight into the app.</p>
              </div>
              <input placeholder="Full name" autoComplete="name" value={f.full_name} onChange={e => set('full_name', e.target.value)} />
              <input type="email" placeholder="Email" autoComplete="email" inputMode="email" autoCapitalize="none" value={f.email} onChange={e => set('email', e.target.value)} />
              <input type="password" placeholder="Password (8+ characters)" autoComplete="new-password" value={f.password} onChange={e => set('password', e.target.value)} />
              <input type="password" placeholder="Type it again" autoComplete="new-password" value={f.again} onChange={e => set('again', e.target.value)} />
              {err && <div style={{ color: 'var(--red)', fontSize: 13, fontWeight: 600 }}>{err}</div>}
              <button className="btn" type="submit" disabled={busy || !f.full_name || !f.email || !f.password || !f.again}>{busy ? 'Creating your account…' : 'Create account'}</button>
              <a href="/" className="muted" style={{ fontSize: 12.5, textAlign: 'center' }}>Already have an account? Sign in</a>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
