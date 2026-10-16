// Round profile photo with an initials fallback, plus the uploader used on the
// client Profile page (and by the coach for a client).
import { useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { initials, setAvatar, clearAvatar } from '../lib/avatar'

export default function Avatar({ url, name, size = 36, ring, style }) {
  const [broken, setBroken] = useState(false)
  const base = { width: size, height: size, borderRadius: '50%', flexShrink: 0, border: ring || '1.5px solid var(--line)', ...style }
  if (url && !broken) return <img src={url} alt={name || ''} onError={() => setBroken(true)} style={{ ...base, objectFit: 'cover', background: 'var(--steel)' }} />
  return <div aria-label={name || ''} style={{ ...base, background: 'var(--steel)', display: 'grid', placeItems: 'center', fontSize: Math.round(size * 0.36), fontWeight: 800, color: '#fff' }}>{initials(name)}</div>
}

export function AvatarPicker({ userId, url, name, onChange, size = 96 }) {
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function pick(e) {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setBusy(true); setErr('')
    try { onChange?.(await setAvatar(userId, f, url)) } catch (x) { setErr(x.message) }
    setBusy(false)
  }
  async function remove() {
    setBusy(true); setErr('')
    try { await clearAvatar(userId, url); onChange?.(null) } catch (x) { setErr(x.message) }
    setBusy(false)
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <button type="button" onClick={() => input.current?.click()} disabled={busy} aria-label="Change profile photo"
        style={{ position: 'relative', padding: 0, border: 'none', background: 'none', cursor: 'pointer', borderRadius: '50%' }}>
        <Avatar url={url} name={name} size={size} ring="2px solid var(--orange)" style={{ opacity: busy ? 0.5 : 1 }} />
        <span style={{ position: 'absolute', right: 0, bottom: 0, width: 30, height: 30, borderRadius: '50%', background: 'var(--orange)', display: 'grid', placeItems: 'center', border: '2px solid var(--coal, #111)' }}>
          <Camera size={15} color="#fff" />
        </span>
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
        <button type="button" className="btn-ghost" onClick={() => input.current?.click()} disabled={busy} style={{ padding: '6px 12px', fontSize: 13 }}>
          {busy ? 'Saving…' : url ? 'Change photo' : 'Add a photo'}
        </button>
        {url && !busy && <button type="button" onClick={remove} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12.5, padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>Remove</button>}
        {err && <span style={{ fontSize: 12.5, color: 'var(--red)' }}>{err}</span>}
      </div>
      {/* accept=image/* gives iPhone/Android the "Take Photo" or "Photo Library" choice */}
      <input ref={input} type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} />
    </div>
  )
}
