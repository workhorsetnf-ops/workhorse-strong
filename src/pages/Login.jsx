import { useState } from 'react'
import { supabase, authLink } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // an expired / already-used email link lands here with an error in the URL
  const [error, setError] = useState(authLink.error ? `${authLink.error}. Request a new link below.` : '')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState(authLink.error ? 'forgot' : 'login')   // 'login' | 'forgot' | 'sent'

  async function handleLogin() {
    setBusy(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setError(error.message === 'Invalid login credentials' ? 'Email or password is incorrect. Use “Forgot password?” to set a new one.' : error.message)
    setBusy(false)
  }

  async function sendReset() {
    if (!email.trim()) { setError('Enter your email first.'); return }
    setBusy(true); setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
    setBusy(false)
    if (error) { setError(error.message); return }
    setMode('sent')
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div className="glow-behind" style={{ display: 'inline-block' }}>
            <img src="/logo.png" alt="Workhorse Training & Nutrition" style={{ width: 232, height: 232, objectFit: 'contain', margin: '0 auto' }} />
          </div>
          <p className="muted" style={{ marginTop: 2, fontSize: 15, letterSpacing: '0.02em' }}>Clock in. Do the work.</p>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'sent' ? (
            <>
              <div style={{ fontWeight: 700 }}>Check your email</div>
              <p className="muted" style={{ fontSize: 13.5 }}>If {email.trim()} has an account, a link to set a new password is on its way. Open it on this device. Check spam if it’s not there in a minute.</p>
              <button className="btn-ghost" onClick={() => { setMode('login'); setError('') }}>Back to sign in</button>
            </>
          ) : (
            <>
              {mode === 'forgot' && <div><div style={{ fontWeight: 700 }}>Forgot password</div><p className="muted" style={{ fontSize: 13 }}>We’ll email you a link to set a new one.</p></div>}
              <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email"
                onKeyDown={e => e.key === 'Enter' && mode === 'forgot' && sendReset()} />
              {mode === 'login' && <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
                autoComplete="current-password" onKeyDown={e => e.key === 'Enter' && handleLogin()} />}
              {error && <div style={{ color: 'var(--red)', fontSize: 13, fontWeight: 600 }}>{error}</div>}
              {mode === 'login' ? (
                <>
                  <button className="btn" onClick={handleLogin} disabled={busy || !email || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
                  <button className="btn-ghost" style={{ fontSize: 13 }} onClick={() => { setMode('forgot'); setError('') }}>Forgot password?</button>
                </>
              ) : (
                <>
                  <button className="btn" onClick={sendReset} disabled={busy || !email}>{busy ? 'Sending…' : 'Email me a reset link'}</button>
                  <button className="btn-ghost" style={{ fontSize: 13 }} onClick={() => { setMode('login'); setError('') }}>Back to sign in</button>
                </>
              )}
              <p className="muted" style={{ fontSize: 12.5, textAlign: 'center' }}>No account? Your coach sends the invite.</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
