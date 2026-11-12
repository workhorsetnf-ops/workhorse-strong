// Team: assistant (VA) logins (Update 179). Only the head coach sees this page.
// An assistant can do everything you can except create or change programs and
// the libraries, and anything they send to clients goes out from your account.
import { useEffect, useState } from 'react'
import { UserPlus, Copy, KeyRound, Power } from 'lucide-react'
import { callApi } from '../../lib/push'
import { tempPassword } from './InviteClients'

const fmt = d => (d ? new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—')

export default function CoachTeam() {
  const [team, setTeam] = useState(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ full_name: '', email: '', password: tempPassword() })
  const [busy, setBusy] = useState('')
  const [done, setDone] = useState(null)   // login details to hand over: { name, email, password }

  async function load() {
    try { setTeam((await callApi('/api/team', { action: 'list' })).team); setErr('') }
    catch (x) { setErr(x.message); setTeam([]) }
  }
  useEffect(() => { load() }, [])

  async function act(label, body, after) {
    setBusy(label); setErr('')
    try { await callApi('/api/team', body); after?.(); await load() }
    catch (x) { setErr(x.message) }
    setBusy('')
  }

  const add = e => {
    e.preventDefault()
    const sent = { name: f.full_name.trim(), email: f.email.trim().toLowerCase(), password: f.password }
    act('add', { action: 'add', ...f }, () => { setDone(sent); setOpen(false); setF({ full_name: '', email: '', password: tempPassword() }) })
  }
  const toggle = m => {
    const off = (m.status || 'active') === 'active'
    if (off && !window.confirm(`Turn off ${m.full_name || 'this assistant'}'s access?\n\nThey're signed out of everything right away. You can switch them back on any time.`)) return
    act(m.id, { action: off ? 'deactivate' : 'reactivate', id: m.id })
  }
  const reset = m => {
    const pw = window.prompt(`New temporary password for ${m.full_name || 'this assistant'} (8+ characters):`, tempPassword())
    if (!pw) return
    act(m.id, { action: 'password', id: m.id, password: pw }, () => setDone({ name: m.full_name || '', email: m.email || '', password: pw }))
  }
  const loginText = d => `Hey ${(d.name || '').split(' ')[0]}! Here's your Workhorse Strong team login:\n\n${window.location.origin}\nEmail: ${d.email}\nTemporary password: ${d.password}\n\nChange your password once you're in.`

  return (
    <div>
      <div className="eyebrow">Business</div>
      <h1 style={{ fontSize: 28, margin: '6px 0 6px' }}>Team</h1>
      <p className="muted" style={{ marginBottom: 18, maxWidth: 640 }}>
        Assistants get their own login and can do everything you can, except create or change programs and the
        exercise library (they can view them and assign programs). Messages they send go out from your account,
        marked with their name, so clients keep one thread with you.
      </p>

      {err && <div className="card" style={{ borderColor: 'var(--red)', color: 'var(--red)', marginBottom: 14 }}>{err}</div>}

      {done && (
        <div className="card" style={{ marginBottom: 14 }}>
          <strong>Login ready for {done.name || done.email}</strong>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, margin: '10px 0' }}>{loginText(done)}</pre>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
              onClick={async () => { try { await navigator.clipboard.writeText(loginText(done)) } catch { /* ignore */ } }}><Copy size={14} /> Copy login</button>
            <button className="btn-ghost" onClick={() => setDone(null)}>Done</button>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        {!open ? (
          <button className="btn" onClick={() => { setOpen(true); setDone(null) }} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <UserPlus size={15} /> Add assistant</button>
        ) : (
          <form onSubmit={add} style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 420 }}>
            <input placeholder="Full name" value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} required />
            <input type="email" placeholder="Email (their login)" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} required />
            <input placeholder="Temporary password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} required minLength={8} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" disabled={busy === 'add'}>{busy === 'add' ? 'Adding…' : 'Create login'}</button>
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </form>
        )}
      </div>

      {team === null ? <p className="muted">Loading…</p> : team.length === 0 ? (
        <p className="muted">No assistants yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {team.map(m => {
            const active = (m.status || 'active') === 'active'
            return (
              <div className="card" key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', opacity: active ? 1 : 0.65 }}>
                <div>
                  <strong>{m.full_name || 'Unnamed'}</strong>
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: active ? 'var(--green)' : 'var(--red)' }}>
                    {active ? 'ACTIVE' : 'ACCESS OFF'}</span>
                  <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>
                    {m.email} · added {fmt(m.created_at)}{m.last_seen_at ? ` · last in ${fmt(m.last_seen_at)}` : ''}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-ghost" disabled={busy === m.id} onClick={() => reset(m)} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <KeyRound size={14} /> Reset password</button>
                  <button className="btn-ghost" disabled={busy === m.id} onClick={() => toggle(m)}
                    style={{ display: 'inline-flex', gap: 6, alignItems: 'center', color: active ? 'var(--red)' : undefined }}>
                    <Power size={14} /> {active ? 'Turn off access' : 'Turn access back on'}</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
