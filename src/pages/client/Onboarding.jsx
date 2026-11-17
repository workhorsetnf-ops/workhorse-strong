// Hands-free onboarding, client side (Update 184).
//   ContractGate   — a new client sees only their contract until it's signed
//   OnboardingCard — on Home: fill in the forms, then book the onboarding call
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { callApi } from '../../lib/push'
import { onboardingStage, slotsByDay } from '../../lib/onboarding'

// Unsigned contracts for a client who came in through a payment. null while loading.
export function useOnboardingContracts(profile) {
  const [pending, setPending] = useState(profile?.onboarding_started_at ? null : [])
  async function load() {
    if (!profile?.onboarding_started_at) { setPending([]); return }
    const { data } = await supabase.from('contracts').select('*').eq('client_id', profile.id).eq('status', 'sent').order('sent_at')
    const rows = data || []
    setPending(rows)
    // signed already but the welcome email never went (closed the app mid-way, Kit was down): try again
    if (!rows.length && !profile.onboarding_welcome_at) callApi('/api/onboard', { action: 'signed' }).catch(() => {})
  }
  useEffect(() => { load() }, [profile?.id, profile?.onboarding_started_at])
  return { pending, reload: load }
}

export function ContractGate({ contracts, profile, onSigned }) {
  const c = contracts[0]
  const [name, setName] = useState(profile?.full_name || '')
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function sign() {
    if (!name.trim()) { setErr('Type your full name to sign.'); return }
    if (!agree) { setErr('Tick the box to confirm you agree.'); return }
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('sign_contract', { target_contract_id: c.id, signer_name: name.trim() })
    if (error) { setErr(error.message); setBusy(false); return }
    if (contracts.length === 1) { try { await callApi('/api/onboard', { action: 'signed' }) } catch { /* retried on next open */ } }
    setBusy(false); setAgree(false)
    onSigned()
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div className="eyebrow">Step 1 of 3 · Before we start</div>
      <h1 style={{ fontSize: 24, margin: '6px 0 6px' }}>{c.title}</h1>
      <p className="muted" style={{ fontSize: 13.5, marginBottom: 12 }}>Read through and sign your coaching agreement. The rest of the app opens as soon as it’s signed.</p>
      <div className="card" style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: '50dvh', overflowY: 'auto' }}>{c.body}</div>
      <div className="card" style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label className="muted" style={{ fontSize: 12 }}>Type your full name — this is your legal signature</label>
        <input value={name} onChange={e => { setName(e.target.value); setErr('') }} placeholder="Full name" />
        {name.trim() && <div style={{ fontFamily: "'Caveat', cursive", fontSize: 30, color: 'var(--orange-hot)', borderBottom: '2px solid var(--line)', paddingBottom: 6 }}>{name}</div>}
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
          <input type="checkbox" style={{ width: 'auto', marginTop: 2 }} checked={agree} onChange={e => { setAgree(e.target.checked); setErr('') }} />
          I have read this agreement and typing my name above is my legal signature.
        </label>
        {err && <div style={{ color: 'var(--red)', fontSize: 13, fontWeight: 600 }}>{err}</div>}
        <button className="btn" disabled={busy} onClick={sign}>{busy ? 'Signing…' : 'Sign and continue'}</button>
      </div>
    </div>
  )
}

const dayLabel = day => new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))
const timeLabel = iso => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

export function OnboardingCard({ profile }) {
  const [info, setInfo] = useState(null)
  const [slots, setSlots] = useState(null)
  const [day, setDay] = useState(null)
  const [pick, setPick] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function load() {
    if (!profile?.onboarding_started_at) return
    const [{ data: s }, { data: cs }, { data: asg }, { data: bk }, { data: cfg }] = await Promise.all([
      supabase.from('onboarding_settings').select('call_type_id').eq('id', 1).maybeSingle(),
      supabase.from('contracts').select('status').eq('client_id', profile.id),
      supabase.from('standalone_form_assignments').select('status').eq('client_id', profile.id),
      supabase.from('bookings').select('status, call_type_id, starts_at, created_at').eq('client_id', profile.id),
      supabase.from('coach_call_settings').select('booking_enabled, timezone').eq('id', 1).maybeSingle(),
    ])
    const callTypeId = s?.call_type_id || null
    const stage = onboardingStage({ profile, contracts: cs || [], assignments: asg || [], bookings: bk || [], callTypeId })
    const { data: ct } = callTypeId ? await supabase.from('call_types').select('name, duration_minutes').eq('id', callTypeId).maybeSingle() : { data: null }
    setInfo({ stage, callTypeId, callName: ct?.name || 'Onboarding call', minutes: ct?.duration_minutes, open: !!cfg?.booking_enabled, tz: cfg?.timezone || 'America/New_York', formsLeft: (asg || []).filter(a => a.status === 'pending').length })
    if (stage === 'call' && cfg?.booking_enabled) {
      const { data: free } = await supabase.rpc('open_slots', { target_call_type_id: callTypeId })
      const groups = slotsByDay(free || [], cfg?.timezone)
      setSlots(groups); setDay(d => d && groups.some(g => g.day === d) ? d : groups[0]?.day || null)
    }
  }
  useEffect(() => { load() }, [profile?.id])

  async function book() {
    if (!pick) return
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('book_call', { slot_start: pick, note: 'Onboarding call', target_client_id: null, target_call_type_id: info.callTypeId })
    setBusy(false)
    if (error) { setErr(error.message); setPick(null); load(); return }
    window.location.reload()   // Home picks up the booked call
  }

  if (!info || !info.stage || info.stage === 'done' || info.stage === 'contract' || info.stage === 'setup') return null

  if (info.stage === 'forms') {
    return (
      <div className="card" style={{ borderColor: 'var(--orange)' }}>
        <div className="eyebrow">Step 2 of 3 · Getting started</div>
        <h2 style={{ fontSize: 18, margin: '6px 0 4px' }}>Fill in your onboarding form{info.formsLeft > 1 ? 's' : ''}</h2>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 12 }}>This is how your coach builds your plan. Once it’s done you’ll book your onboarding call.</p>
        <Link to="/app/intake-forms" className="btn" style={{ textDecoration: 'none', display: 'inline-block' }}>Start{info.formsLeft > 1 ? ` (${info.formsLeft} forms)` : ''}</Link>
      </div>
    )
  }

  const today = slots?.find(g => g.day === day)
  return (
    <div className="card" style={{ borderColor: 'var(--orange)' }}>
      <div className="eyebrow">Step 3 of 3 · Last step</div>
      <h2 style={{ fontSize: 18, margin: '6px 0 4px' }}>Book your {info.callName.toLowerCase().includes('call') ? info.callName.toLowerCase() : `${info.callName.toLowerCase()} call`}</h2>
      <p className="muted" style={{ fontSize: 13.5, marginBottom: 12 }}>{info.minutes ? `${info.minutes} minutes. ` : ''}We’ll walk through the app together and go over what to expect.</p>
      {!info.open ? <p style={{ fontSize: 13.5 }}>Your coach will reach out to set a time.</p>
        : !slots ? <p className="muted" style={{ fontSize: 13.5 }}>Finding open times…</p>
        : !slots.length ? <p style={{ fontSize: 13.5 }}>No open times right now. Check back soon, or message your coach.</p>
        : (
          <>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6 }}>
              {slots.map(g => (
                <button key={g.day} type="button" className={g.day === day ? 'btn' : 'btn-ghost'} style={{ whiteSpace: 'nowrap', fontSize: 13 }} onClick={() => { setDay(g.day); setPick(null) }}>{dayLabel(g.day)}</button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 6, marginTop: 8 }}>
              {(today?.slots || []).map(s => (
                <button key={s.starts_at} type="button" className={pick === s.starts_at ? 'btn' : 'btn-ghost'} style={{ fontSize: 13 }} onClick={() => setPick(s.starts_at)}>{timeLabel(s.starts_at)}</button>
              ))}
            </div>
            {err && <div style={{ color: 'var(--red)', fontSize: 13, fontWeight: 600, marginTop: 8 }}>{err}</div>}
            <button className="btn" style={{ marginTop: 12, width: '100%' }} disabled={!pick || busy} onClick={book}>
              {busy ? 'Booking…' : pick ? `Book ${dayLabel(day)} at ${timeLabel(pick)}` : 'Pick a time'}
            </button>
          </>
        )}
    </div>
  )
}
