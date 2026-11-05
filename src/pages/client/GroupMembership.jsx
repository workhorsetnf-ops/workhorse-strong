// Group members: the paywall (not paid yet / ended) and the payment-problem
// banner (Update 166).
import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { callApi } from '../../lib/push'

export const isGroup = p => p?.plan === 'group'
export const groupHasAccess = p => !isGroup(p) || p.group_status === 'active' || p.group_status === 'past_due'
// 1:1-only screens a group member never sees
export const GROUP_HIDDEN = ['/app/checkin', '/app/form-checks', '/app/intake-forms', '/app/contracts', '/app/documents', '/app/bloodwork', '/app/roadmap']
export const hiddenForGroup = path => GROUP_HIDDEN.some(h => path === h || path.startsWith(h + '/'))

async function goBilling(action, setErr, setBusy) {
  setBusy(action); setErr('')
  try { const { url } = await callApi('/api/group-billing', { action }); window.location.href = url }
  catch (e) { setErr(e.message); setBusy('') }
}

export function GroupPaywall() {
  const { profile, refreshProfile, signOut } = useAuth()
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const justPaid = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('joined')
  const [waiting, setWaiting] = useState(justPaid)

  // back from Stripe: the webhook usually lands within a few seconds
  useEffect(() => {
    if (!justPaid) return
    let n = 0
    const t = setInterval(async () => { n++; await refreshProfile?.(); if (n >= 16) { clearInterval(t); setWaiting(false) } }, 2500)
    return () => clearInterval(t)
  }, [])

  const ended = profile?.group_status === 'canceled'
  return (
    <div style={{ minHeight: '80dvh', display: 'grid', placeItems: 'center', padding: 8 }}>
      <div className="card" style={{ maxWidth: 420, width: '100%', display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'center' }}>
        {waiting ? (
          <>
            <div className="eyebrow">Almost there</div>
            <h1 style={{ fontSize: 22, margin: 0 }}>Confirming your payment…</h1>
            <p className="muted" style={{ fontSize: 14, margin: 0 }}>This takes a few seconds. Your program loads as soon as it’s through.</p>
          </>
        ) : (
          <>
            <div className="eyebrow">{ended ? 'Membership ended' : 'One step left'}</div>
            <h1 style={{ fontSize: 22, margin: 0 }}>{ended ? 'Come back and pick up where you left off' : 'Finish joining to unlock your program'}</h1>
            <p className="muted" style={{ fontSize: 14, margin: 0 }}>
              {ended ? 'Your history, PRs and logs are all still here.' : 'Your account is ready. Complete checkout and your program, food tracking and the team chat open up.'}
            </p>
            <button className="btn" disabled={!!busy} onClick={() => goBilling('checkout', setErr, setBusy)}>{busy === 'checkout' ? 'Opening checkout…' : ended ? 'Rejoin' : 'Continue to payment'}</button>
            {justPaid && <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Already paid? It can take a minute. Pull to refresh, or message support if it doesn’t show.</p>}
          </>
        )}
        {err && <p style={{ color: 'var(--red)', fontSize: 13, margin: 0 }}>{err}</p>}
        <button className="btn-ghost" onClick={signOut}>Sign out</button>
      </div>
    </div>
  )
}

export function GroupPaymentBanner() {
  const { profile } = useAuth()
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  if (!isGroup(profile) || profile.group_status !== 'past_due') return null
  return (
    <div className="card" style={{ borderLeft: '3px solid var(--red)', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ flex: 1, fontSize: 13.5 }}><strong>Your last payment didn’t go through.</strong> <span className="muted">Update your card to keep your program.</span></span>
      <button className="btn" style={{ padding: '7px 12px', fontSize: 13 }} disabled={!!busy} onClick={() => goBilling('portal', setErr, setBusy)}>{busy ? 'Opening…' : 'Update card'}</button>
      {err && <span style={{ color: 'var(--red)', fontSize: 12.5, flexBasis: '100%' }}>{err}</span>}
    </div>
  )
}

// Profile page: renew date / cancel / receipts through Stripe's portal
export function GroupMembershipCard() {
  const { profile } = useAuth()
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  if (!isGroup(profile)) return null
  const end = profile.group_period_end ? new Date(profile.group_period_end).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="eyebrow">Membership</div>
      <div style={{ fontSize: 14 }}>
        {profile.group_status === 'active' && (profile.group_cancel_at_period_end ? `Cancelled. Access until ${end}.` : end ? `Active · renews ${end}` : 'Active')}
        {profile.group_status === 'past_due' && 'Payment problem: update your card to keep access.'}
        {profile.group_status === 'canceled' && 'Ended.'}
        {profile.group_status === 'pending' && 'Not paid yet.'}
      </div>
      {profile.stripe_customer_id && <button className="btn-ghost" disabled={!!busy} onClick={() => goBilling('portal', setErr, setBusy)}>{busy ? 'Opening…' : 'Manage membership (card, cancel, receipts)'}</button>}
      {err && <span style={{ color: 'var(--red)', fontSize: 12.5 }}>{err}</span>}
    </div>
  )
}
