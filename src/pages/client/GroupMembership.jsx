// Group members: the paywall (not paid yet / ended) and the payment-problem
// banner (Update 166). Workhorse 90 (Update 180): pay in full or in 2 parts,
// a renewal screen when the 90 days are up, and a heads-up near the end.
import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { callApi } from '../../lib/push'
import { groupAccess, w90CanRenew } from '../../lib/groupAccess'

export const isGroup = p => p?.plan === 'group'
export const groupHasAccess = p => groupAccess(p)
export const isW90 = p => isGroup(p) && p.group_tier === 'w90'
const fmtDay = d => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '')
// 1:1-only screens a group member never sees
export const GROUP_HIDDEN = ['/app/checkin', '/app/form-checks', '/app/intake-forms', '/app/contracts', '/app/documents', '/app/bloodwork', '/app/roadmap']
export const hiddenForGroup = path => GROUP_HIDDEN.some(h => path === h || path.startsWith(h + '/'))

async function goBilling(action, setErr, setBusy, extra = {}) {
  setBusy(extra.option || extra.offer || action); setErr('')
  try { const { url } = await callApi('/api/group-billing', { action, ...extra }); window.location.href = url }
  catch (e) { setErr(e.message); setBusy('') }
}

// Workhorse 90 payment choices (and, on renewal, dropping to the monthly group)
export function W90Options({ busy, setBusy, setErr, withMonthly = false }) {
  const go = (extra) => goBilling('checkout', setErr, setBusy, extra)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button className="btn" disabled={!!busy} onClick={() => go({ offer: 'w90', option: 'full' })}>
        {busy === 'full' ? 'Opening checkout…' : 'Pay in full: $495 for 90 days'}</button>
      <button className="btn" disabled={!!busy} onClick={() => go({ offer: 'w90', option: 'split' })}>
        {busy === 'split' ? 'Opening checkout…' : '2 payments of $249 (today + in 6 weeks)'}</button>
      {withMonthly && (
        <button className="btn-ghost" disabled={!!busy} onClick={() => go({ offer: 'monthly' })}>
          {busy === 'monthly' ? 'Opening checkout…' : 'Or keep the program for $50/month (no calls)'}</button>
      )}
    </div>
  )
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

  const w90 = isW90(profile)
  const timeUp = w90 && ['active', 'past_due'].includes(profile?.group_status) && !groupAccess(profile)
  const ended = profile?.group_status === 'canceled' || timeUp
  const title = timeUp ? 'Your 90 days are up' : ended ? 'Come back and pick up where you left off' : w90 ? 'Finish joining Workhorse 90' : 'Finish joining to unlock your program'
  const sub = timeUp ? 'Strong work. Run it back for another 90 days, or keep the program going month to month. Your history, PRs and logs are all still here.'
    : ended ? 'Your history, PRs and logs are all still here.'
    : w90 ? 'Your account is ready. Pick how you want to pay and your program, food tracking, team chat and the monthly group call open up.'
    : 'Your account is ready. Complete checkout and your program, food tracking and the team chat open up.'
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
            <div className="eyebrow">{timeUp ? 'Workhorse 90 complete' : ended ? 'Membership ended' : 'One step left'}</div>
            <h1 style={{ fontSize: 22, margin: 0 }}>{title}</h1>
            <p className="muted" style={{ fontSize: 14, margin: 0 }}>{sub}</p>
            {w90
              ? <W90Options busy={busy} setBusy={setBusy} setErr={setErr} withMonthly={ended} />
              : <button className="btn" disabled={!!busy} onClick={() => goBilling('checkout', setErr, setBusy)}>{busy === 'checkout' ? 'Opening checkout…' : ended ? 'Rejoin' : 'Continue to payment'}</button>}
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
  if (!isGroup(profile)) return null
  if (profile.group_status !== 'past_due') {
    // Workhorse 90: heads-up in the last 14 days, with renewal right there
    if (!w90CanRenew(profile) || !groupAccess(profile)) return null
    return (
      <div className="card" style={{ borderLeft: '3px solid var(--orange)', margin: '0 0 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontSize: 13.5 }}><strong>Your Workhorse 90 ends {fmtDay(profile.group_access_until)}.</strong> <span className="muted">Renew now and the new 90 days start when these end.</span></span>
        <W90Options busy={busy} setBusy={setBusy} setErr={setErr} />
        {err && <span style={{ color: 'var(--red)', fontSize: 12.5 }}>{err}</span>}
      </div>
    )
  }
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
  if (isW90(profile)) {
    const until = profile.group_access_until
    const secondDue = profile.group_option === 'split' && profile.group_period_end && new Date(profile.group_period_end) > new Date() && (!until || new Date(profile.group_period_end) < new Date(until))
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="eyebrow">Membership</div>
        <div style={{ fontSize: 14 }}>
          <strong>Workhorse 90</strong>
          {profile.group_status === 'past_due' ? ' · Payment problem: update your card to keep access.'
            : groupAccess(profile) ? (until ? ` · access until ${fmtDay(until)}` : ' · active') : ' · ended'}
          {secondDue && profile.group_status !== 'past_due' && <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Second payment of $249 on {fmtDay(profile.group_period_end)}.</div>}
        </div>
        {w90CanRenew(profile) && groupAccess(profile) && <W90Options busy={busy} setBusy={setBusy} setErr={setErr} />}
        {profile.stripe_customer_id && <button className="btn-ghost" disabled={!!busy} onClick={() => goBilling('portal', setErr, setBusy)}>{busy === 'portal' ? 'Opening…' : 'Card & receipts'}</button>}
        {err && <span style={{ color: 'var(--red)', fontSize: 12.5 }}>{err}</span>}
      </div>
    )
  }
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
