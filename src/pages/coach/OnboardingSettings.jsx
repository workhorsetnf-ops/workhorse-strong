// Hands-free onboarding settings + who's mid-onboarding (Update 184).
// Lives at the top of Contracts. Set once; after that a new payment runs the
// whole thing: account -> setup email -> contract -> welcome email -> forms -> call.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { callApi } from '../../lib/push'
import { onboardingStage, STAGE_LABELS } from '../../lib/onboarding'

export default function OnboardingSettings() {
  const [s, setS] = useState(null)
  const [tpls, setTpls] = useState([])
  const [forms, setForms] = useState([])
  const [types, setTypes] = useState([])
  const [calls, setCalls] = useState(null)
  const [hours, setHours] = useState(0)
  const [kit, setKit] = useState(null)
  const [people, setPeople] = useState([])
  const [copied, setCopied] = useState(null)
  const [missing, setMissing] = useState(false)

  async function load() {
    const { data: row, error } = await supabase.from('onboarding_settings').select('*').eq('id', 1).maybeSingle()
    if (error) { setMissing(true); return }   // migration not run yet
    setS(row || { id: 1, enabled: false, form_ids: [] })
    const [{ data: t }, { data: f }, { data: ct }, { data: cs }, { count }] = await Promise.all([
      supabase.from('contract_templates').select('id, name').order('name'),
      supabase.from('standalone_forms').select('id, name').order('name'),
      supabase.from('call_types').select('id, name, duration_minutes, active').order('position'),
      supabase.from('coach_call_settings').select('booking_enabled').eq('id', 1).maybeSingle(),
      supabase.from('coach_availability').select('id', { count: 'exact', head: true }).eq('active', true),
    ])
    setTpls(t || []); setForms(f || []); setTypes(ct || []); setCalls(cs); setHours(count || 0)
    callApi('/api/onboard', { action: 'kit' }).then(setKit).catch(e => setKit({ ready: false, sequences: [], error: e.message }))
    loadPeople(row)
  }

  async function loadPeople(row) {
    const since = new Date(Date.now() - 60 * 864e5).toISOString()
    const { data: ps } = await supabase.from('profiles').select('id, full_name, email, onboarding_started_at, onboarding_welcome_at, last_seen_at').gte('onboarding_started_at', since).order('onboarding_started_at', { ascending: false })
    const ids = (ps || []).map(p => p.id)
    if (!ids.length) { setPeople([]); return }
    const [{ data: cs }, { data: asg }, { data: bk }] = await Promise.all([
      supabase.from('contracts').select('client_id, status').in('client_id', ids),
      supabase.from('standalone_form_assignments').select('client_id, status').in('client_id', ids),
      supabase.from('bookings').select('client_id, status, call_type_id, starts_at, created_at').in('client_id', ids),
    ])
    const by = (rows, id) => (rows || []).filter(r => r.client_id === id)
    setPeople((ps || []).map(p => ({ ...p, stage: onboardingStage({ profile: p, contracts: by(cs, p.id), assignments: by(asg, p.id), bookings: by(bk, p.id), callTypeId: row?.call_type_id, setupDone: !!p.last_seen_at }) })))
  }

  useEffect(() => { load() }, [])

  async function save(patch) {
    const next = { ...s, ...patch }
    setS(next)
    await supabase.from('onboarding_settings').upsert({ ...next, id: 1, updated_at: new Date().toISOString() }, { onConflict: 'id' })
  }
  const toggleForm = id => save({ form_ids: (s.form_ids || []).includes(id) ? s.form_ids.filter(x => x !== id) : [...(s.form_ids || []), id] })

  async function copyLink(p) {
    try {
      const { link } = await callApi('/api/onboard', { action: 'link', client_id: p.id })
      try { await navigator.clipboard.writeText(link) } catch { window.prompt('Copy this link:', link) }
      setCopied(p.id); setTimeout(() => setCopied(null), 2500)
    } catch (e) { alert(e.message) }
  }

  if (missing) return <div className="card" style={{ marginBottom: 24 }}><b>Auto-onboarding</b><p className="muted" style={{ fontSize: 13, marginTop: 4 }}>Run migration_update184_auto_onboarding.sql in Supabase to turn this on.</p></div>
  if (!s) return null

  const problems = []
  if (!s.contract_template_id) problems.push('Pick the contract new clients sign.')
  if (!s.call_type_id) problems.push('Pick which call type is the onboarding call.')
  if (calls && !calls.booking_enabled) problems.push('Client booking is switched off in Calls, so new clients can’t book their onboarding call.')
  if (!hours) problems.push('You have no weekly hours set in Calls, so there are no times to book.')
  if (kit && !kit.ready) problems.push(kit.error ? `Kit: ${kit.error}` : 'Kit isn’t connected: add KIT_API_KEY in Vercel.')
  if (kit?.ready && !s.kit_setup_sequence_id) problems.push('Pick the Kit sequence for the “set up your account” email.')
  if (kit?.ready && !s.kit_welcome_sequence_id) problems.push('Pick the Kit sequence for the welcome email.')

  const seqSelect = (key, label) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }} className="muted">{label}
      <select value={s[key] || ''} onChange={e => save({ [key]: e.target.value ? Number(e.target.value) : null })} disabled={!kit?.ready}>
        <option value="">{kit?.ready ? 'Choose a sequence…' : 'Connect Kit first'}</option>
        {(kit?.sequences || []).map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
      </select>
    </label>
  )

  return (
    <div className="card" style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 18 }}>Auto-onboarding</h2>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>When someone new pays: account → setup email → contract → welcome email → forms → onboarding call. Nothing for you to do.</p>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={!!s.enabled} onChange={e => save({ enabled: e.target.checked })} />
          {s.enabled ? 'On' : 'Off'}
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }} className="muted">Contract they sign
          <select value={s.contract_template_id || ''} onChange={e => save({ contract_template_id: e.target.value || null })}>
            <option value="">Choose a template…</option>
            {tpls.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }} className="muted">Onboarding call
          <select value={s.call_type_id || ''} onChange={e => save({ call_type_id: e.target.value || null })}>
            <option value="">Choose a call type…</option>
            {types.map(t => <option key={t.id} value={t.id}>{t.name} ({t.duration_minutes} min){t.active ? '' : ' — off'}</option>)}
          </select>
        </label>
        {seqSelect('kit_setup_sequence_id', 'Email 1: set up your account (Kit)')}
        {seqSelect('kit_welcome_sequence_id', 'Email 2: welcome, after signing (Kit)')}
      </div>

      <div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>Onboarding forms they fill in</div>
        {forms.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {forms.map(f => (
              <button key={f.id} type="button" className={(s.form_ids || []).includes(f.id) ? 'btn' : 'btn-ghost'} style={{ fontSize: 13 }} onClick={() => toggleForm(f.id)}>{f.name}</button>
            ))}
          </div>
        ) : <p className="muted" style={{ fontSize: 13 }}>No forms yet. Make one in Intake Forms.</p>}
      </div>

      {problems.length > 0 && (
        <div style={{ background: 'rgba(255,85,0,0.1)', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
          <b>{s.enabled ? 'Fix these so it runs end to end:' : 'Before you switch it on:'}</b>
          <ul style={{ margin: '6px 0 0 18px' }}>{problems.map(p => <li key={p}>{p}</li>)}</ul>
          {calls && !calls.booking_enabled && (
            <button className="btn-ghost" style={{ marginTop: 8 }} onClick={async () => { await supabase.from('coach_call_settings').update({ booking_enabled: true }).eq('id', 1); load() }}>Switch client booking on</button>
          )}
        </div>
      )}

      {people.length > 0 && (
        <div>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>New clients (last 60 days)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {people.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderTop: '1px solid var(--line)', paddingTop: 6 }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <b style={{ fontSize: 14 }}>{p.full_name}</b>
                  <div className="muted" style={{ fontSize: 12 }}>{p.email} · paid {new Date(p.onboarding_started_at).toLocaleDateString()}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', padding: '3px 9px', borderRadius: 20, background: p.stage === 'done' ? 'rgba(76,175,109,0.15)' : 'rgba(255,85,0,0.15)', color: p.stage === 'done' ? 'var(--green)' : 'var(--orange-hot)' }}>{STAGE_LABELS[p.stage] || p.stage}</span>
                {p.stage === 'setup' && <button className="btn-ghost" style={{ fontSize: 12.5 }} onClick={() => copyLink(p)}>{copied === p.id ? 'Copied ✓' : 'Copy setup link'}</button>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
