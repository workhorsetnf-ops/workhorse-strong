// What an archived (former) client sees when they sign in. Their data is kept,
// so if the coach restores them everything is still there.
import { useAuth } from '../../context/AuthContext'

export default function ClientArchived() {
  const { profile, signOut } = useAuth()
  const first = String(profile?.full_name || '').split(/\s+/)[0]
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
        <img src="/logo.png" alt="Workhorse Training & Nutrition" style={{ width: 160, height: 160, objectFit: 'contain', margin: '0 auto 12px' }} />
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left' }}>
          <div className="eyebrow">Account archived</div>
          <h1 style={{ fontSize: 24, margin: 0 }}>{first ? `Thanks for the work, ${first}.` : 'Thanks for the work.'}</h1>
          <p className="muted" style={{ fontSize: 14 }}>Your coaching with Workhorse Training & Nutrition has ended, so the app is closed for this account. Your progress is saved.</p>
          <p className="muted" style={{ fontSize: 14 }}>Ready to get back to it? Reach out to Anthony and he can reopen your account with everything where you left it.</p>
          <button className="btn-ghost" onClick={signOut}>Sign out</button>
        </div>
      </div>
    </div>
  )
}
