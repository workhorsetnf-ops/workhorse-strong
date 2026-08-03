import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleLogin() {
    setBusy(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setBusy(false)
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            display: 'inline-block', background: 'var(--orange)', padding: '6px 14px',
            borderRadius: 4, fontWeight: 900, fontSize: 13, letterSpacing: '0.12em',
            textTransform: 'uppercase', marginBottom: 14
          }}>Workhorse</div>
          <h1 style={{ fontSize: 32 }}>Strong</h1>
          <p className="muted" style={{ marginTop: 6, fontSize: 14 }}>Clock in. Do the work.</p>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
            autoComplete="current-password" onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          {error && <div style={{ color: 'var(--red)', fontSize: 13, fontWeight: 600 }}>{error}</div>}
          <button className="btn" onClick={handleLogin} disabled={busy || !email || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="muted" style={{ fontSize: 12.5, textAlign: 'center' }}>
            No account? Your coach sends the invite.
          </p>
        </div>
      </div>
    </div>
  )
}
