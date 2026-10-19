// A paste-friendly notes box: shows a one-line preview, opens into a big
// textarea, saves on demand. Used for program instructions and day notes.
import { useEffect, useState } from 'react'

export default function NotesBox({ label, hint, value, onSave, placeholder, rows = 6 }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(value || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  useEffect(() => { if (!open) setText(value || '') }, [value, open])
  const dirty = text !== (value || '')
  const preview = String(value || '').split('\n').find(l => l.trim()) || ''

  async function save() {
    setSaving(true)
    await onSave(text.replace(/\s+$/, ''))
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 1800)
    setOpen(false)
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost"
        style={{ width: '100%', textAlign: 'left', padding: '7px 10px', fontSize: 12.5, display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <span style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>📝 {label}</span>
        <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
          {saved ? 'Saved ✓' : preview || 'Add / paste…'}
        </span>
      </button>
    )
  }
  return (
    <div style={{ border: '1px solid var(--orange)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <strong style={{ fontSize: 12.5 }}>📝 {label}</strong>
      {hint && <span className="muted" style={{ fontSize: 11.5 }}>{hint}</span>}
      <textarea rows={rows} autoFocus value={text} placeholder={placeholder} onChange={e => setText(e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, lineHeight: 1.45, fontFamily: 'inherit', resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" className="btn" disabled={saving || !dirty} onClick={save} style={{ padding: '6px 14px', fontSize: 12 }}>{saving ? 'Saving…' : 'Save'}</button>
        <button type="button" className="btn-ghost" onClick={() => { setText(value || ''); setOpen(false) }} style={{ padding: '6px 12px', fontSize: 12 }}>Cancel</button>
      </div>
    </div>
  )
}
