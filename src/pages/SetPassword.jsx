// Shown after someone opens an invite or "forgot password" email link.
// The link signs them in; this is where they pick the password they'll use.
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function SetPassword() {
  const { session, linkType, passwordSet, signOut } = useAuth()
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const invite = linkType === 'invite'

  async function save(e) {
    e.preventDefault()
    if (a.length < 8) { setErr('Use at least 8 characters.'); return }
    if (a !== b) { setErr('The two passwords don’t match.'); return }
    setBusy(true); setErr('')
    const { error } = await supabase.auth.updateUser({ password: a })
    setBusy(false)
    if (error) { setErr(error.message); return }
    window.history.replaceState(null, '', window.location.pathname)
    passwordSet()
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <form onSubmit={save} style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <img src="/logo.png" alt="Workhorse Training & Nutrition" style={{ width: 150, height: 150, objectFit: 'contain', margin: '0 auto' }} />
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div className="eyebrow">{invite ? 'Welcome' : 'Reset password'}</div>
            <h1 style={{ fontSize: 24, margin: '6px 0 2px' }}>{invite ? 'Create your password' : 'Choose a new password'}</h1>
            <p className="muted" style={{ fontSize: 13 }}>For {session?.user?.email}. You’ll use this to sign in from now on.</p>
          </div>
          <input type="password" placeholder="New password (8+ characters)" autoComplete="new-password" value={a} onChange={e => { setA(e.target.value); setErr('') }} />
          <input type="password" placeholder="Type it again" autoComplete="new-password" value={b} onChange={e => { setB(e.target.value); setErr('') }} />
          {err && <div style={{ color: 'var(--red)', fontSize: 13, fontWeight: 600 }}>{err}</div>}
          <button className="btn" type="submit" disabled={busy || !a || !b}>{busy ? 'Saving…' : invite ? 'Create password' : 'Save new password'}</button>
          <button type="button" className="btn-ghost" onClick={signOut} style={{ fontSize: 12.5 }}>Cancel</button>
        </div>
      </form>
    </div>
  )
}
