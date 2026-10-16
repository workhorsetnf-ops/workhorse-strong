// Clients page: the shareable sign-up link, and "Add client" for setting
// someone up yourself with a temporary password.
import { useEffect, useState } from 'react'
import { Link2, UserPlus, Copy, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { callApi } from '../../lib/push'

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'   // no 0/O/1/I mix-ups
const randomCode = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => ALPHA[b % ALPHA.length]).join('')
export const tempPassword = () => `Workhorse-${randomCode(4)}`

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

export default function InviteClients({ onAdded }) {
  const [link, setLink] = useState(null)
  const [msg, setMsg] = useState('')
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ full_name: '', email: '', password: tempPassword() })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)   // { name, email, password }
  const [err, setErr] = useState('')

  useEffect(() => { supabase.from('join_link').select('*').eq('id', 1).maybeSingle().then(({ data }) => setLink(data || null)) }, [])
  const url = link ? `${window.location.origin}/join/${link.code}` : ''
  const flash = t => { setMsg(t); setTimeout(() => setMsg(''), 2500) }

  async function newLink() {
    if (!window.confirm('Make a new sign-up link?\n\nThe current link stops working right away. Anyone who already signed up is not affected.')) return
    const code = `WH-${randomCode(6)}`
    const { error } = await supabase.from('join_link').upsert({ id: 1, code, enabled: true, updated_at: new Date().toISOString() })
    if (error) { flash('Could not change it: ' + error.message); return }
    setLink(l => ({ ...(l || {}), code, enabled: true })); flash('New link ready. The old one no longer works.')
  }
  async function toggle() {
    const enabled = !link.enabled
    const { error } = await supabase.from('join_link').update({ enabled }).eq('id', 1)
    if (!error) setLink(l => ({ ...l, enabled }))
  }

  async function add(e) {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      await callApi('/api/add-client', f)
      setDone({ name: f.full_name.trim(), email: f.email.trim().toLowerCase(), password: f.password })
      setF({ full_name: '', email: '', password: tempPassword() })
      onAdded?.()
    } catch (x) { setErr(x.message) }
    setBusy(false)
  }
  const loginText = d => `Hey ${d.name.split(' ')[0]}! You're set up on the Workhorse Strong app 💪\n\n${window.location.origin}\nEmail: ${d.email}\nTemporary password: ${d.password}\n\nOnce you're in, change your password under Profile.`

  return (
    <div className="card" style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Link2 size={17} color="var(--orange)" /><strong style={{ fontSize: 15 }}>Sign-up link</strong>
          {link && !link.enabled && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)' }}>TURNED OFF</span>}
        </div>
        {link === null ? (
          <p className="muted" style={{ fontSize: 13 }}>Run the Update 112 SQL in Supabase to turn on sign-up links.</p>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Send this to new clients. They create their own login and land on your list, ready for a program.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input readOnly value={url} onFocus={e => e.target.select()} style={{ flex: '1 1 260px', opacity: link.enabled ? 1 : 0.5, fontFamily: 'monospace', fontSize: 13 }} />
              <button className="btn" onClick={async () => flash((await copy(url)) ? 'Link copied.' : 'Press and hold the link to copy it.')} disabled={!link.enabled} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Copy size={14} /> Copy</button>
              <button className="btn-ghost" onClick={newLink} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><RefreshCw size={14} /> New link</button>
              <button className="btn-ghost" onClick={toggle}>{link.enabled ? 'Turn off' : 'Turn on'}</button>
            </div>
          </>
        )}
        {msg && <p style={{ fontSize: 12.5, color: 'var(--green)', marginTop: 6 }}>{msg}</p>}
      </div>

      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
        {!open ? (
          <button className="btn-ghost" onClick={() => { setOpen(true); setDone(null) }} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><UserPlus size={15} /> Add client yourself</button>
        ) : done ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <strong style={{ color: 'var(--green)', fontSize: 14 }}>{done.name} is set up ✓</strong>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, background: 'var(--steel)', padding: 10, borderRadius: 8, margin: 0 }}>{loginText(done)}</pre>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" onClick={async () => flash((await copy(loginText(done))) ? 'Login details copied. Paste them in a text to the client.' : 'Press and hold the text to copy it.')} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Copy size={14} /> Copy login details</button>
              <button className="btn-ghost" onClick={() => setDone(null)}>Add another</button>
              <button className="btn-ghost" onClick={() => { setOpen(false); setDone(null) }}>Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={add} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <strong style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}><UserPlus size={15} color="var(--orange)" /> Add a client</strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
              <input placeholder="Full name" value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} />
              <input type="email" placeholder="Email" autoCapitalize="none" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
              <input placeholder="Temporary password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} style={{ fontFamily: 'monospace' }} />
            </div>
            {err && <div style={{ color: 'var(--red)', fontSize: 13, fontWeight: 600 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" type="submit" disabled={busy || !f.full_name || !f.email || f.password.length < 8}>{busy ? 'Creating…' : 'Create account'}</button>
              <button type="button" className="btn-ghost" onClick={() => { setOpen(false); setErr('') }}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
