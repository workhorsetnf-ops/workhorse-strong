import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

function StatusBadge({ status }) {
  const map = {
    sent: { label: 'Needs your signature', bg: 'rgba(255,90,0,0.15)', color: 'var(--orange-hot)' },
    signed: { label: 'Signed', bg: 'rgba(76,175,109,0.15)', color: 'var(--green)' },
    void: { label: 'Void', bg: 'var(--steel)', color: 'var(--muted)' },
  }
  const s = map[status] || map.sent
  return (
    <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', padding: '3px 9px', borderRadius: 20, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  )
}

export default function ClientContracts() {
  const { profile } = useAuth()
  const [contracts, setContracts] = useState([])
  const [signing, setSigning] = useState(null)
  const [signerName, setSignerName] = useState('')
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!profile) return
    const { data } = await supabase.from('contracts').select('*').eq('client_id', profile.id).order('sent_at', { ascending: false })
    setContracts(data || [])
  }
  useEffect(() => { load() }, [profile])

  function startSign(id) {
    setSigning(id); setSignerName(profile?.full_name || ''); setAgree(false)
  }

  async function submitSign(id) {
    if (!signerName.trim()) { alert('Type your full name to sign.'); return }
    if (!agree) { alert('Check the box confirming you agree, first.'); return }
    setBusy(true)
    const { error } = await supabase.rpc('sign_contract', { target_contract_id: id, signer_name: signerName.trim() })
    setBusy(false)
    if (error) { alert('Could not sign: ' + error.message); return }
    setSigning(null); setSignerName(''); setAgree(false)
    load()
  }

  const pending = contracts.filter(c => c.status === 'sent')
  const other = contracts.filter(c => c.status !== 'sent')

  return (
    <div>
      <div className="eyebrow">Paperwork</div>
      <h1 style={{ fontSize: 24, margin: '6px 0 16px' }}>Contracts</h1>

      {contracts.length === 0 && <div className="card muted">Nothing here yet.</div>}

      {pending.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          {pending.map(c => (
            <div className="card" key={c.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <strong style={{ fontSize: 15.5 }}>{c.title}</strong>
                <StatusBadge status={c.status} />
              </div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>Sent {new Date(c.sent_at).toLocaleDateString()}</div>

              <div className="muted" style={{ fontSize: 13.5, marginTop: 10, background: 'var(--steel)', borderRadius: 8, padding: '12px 14px', whiteSpace: 'pre-wrap', maxHeight: 240, overflowY: 'auto', lineHeight: 1.55 }}>
                {c.body}
              </div>

              {signing === c.id ? (
                <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label className="muted" style={{ fontSize: 12 }}>Type your full name — this is your legal signature</label>
                  <input value={signerName} onChange={e => setSignerName(e.target.value)} placeholder="Full name" />
                  {signerName.trim() && (
                    <div style={{ fontFamily: "'Caveat', cursive", fontSize: 30, color: 'var(--orange-hot)', borderBottom: '2px solid var(--line)', paddingBottom: 6 }}>
                      {signerName}
                    </div>
                  )}
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5 }}>
                    <input type="checkbox" style={{ width: 'auto', marginTop: 2 }} checked={agree} onChange={e => setAgree(e.target.checked)} />
                    I have read this agreement and typing my name above constitutes my legal signature.
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" disabled={busy} onClick={() => submitSign(c.id)}>{busy ? 'Signing…' : 'Sign contract'}</button>
                    <button className="btn-ghost" onClick={() => setSigning(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="btn" style={{ marginTop: 12 }} onClick={() => startSign(c.id)}>Review & sign</button>
              )}
            </div>
          ))}
        </div>
      )}

      {other.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, marginBottom: 10 }}>History</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {other.map(c => (
              <div className="card" key={c.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <strong style={{ fontSize: 14.5 }}>{c.title}</strong>
                  <StatusBadge status={c.status} />
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                  {c.status === 'signed' && c.signed_at ? `Signed ${new Date(c.signed_at).toLocaleDateString()}` : `Sent ${new Date(c.sent_at).toLocaleDateString()}`}
                </div>
                {c.status === 'signed' && (
                  <Link to={`/app/contracts/print/${c.id}`} target="_blank" className="btn-ghost" style={{ textDecoration: 'none', display: 'inline-block', marginTop: 10 }}>View / Print</Link>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
