// Client: add shows, TV tapings and travel. Training advice on the Train page
// adapts around them, and the coach sees them on Home.
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { localDateStr } from '../../lib/weeks'
import { EVENT_KINDS } from '../../lib/clientEvents'

const BLANK = () => ({ kind: 'show', title: '', location: '', start_date: localDateStr(), end_date: '' })
const md = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

export default function ShowsTravel({ profile, events, onChange }) {
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const today = localDateStr()
  const upcoming = (events || []).filter(e => e.end_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date))

  async function save() {
    if (!form.start_date) return
    const end = form.end_date && form.end_date >= form.start_date ? form.end_date : form.start_date
    setBusy(true)
    const { error } = await supabase.from('client_events').insert({
      client_id: profile.id, kind: form.kind, title: form.title.trim().slice(0, 120), location: form.location.trim().slice(0, 120),
      start_date: form.start_date, end_date: end,
    })
    setBusy(false)
    if (error) { alert(error.message.includes('client_events') ? 'Shows & travel isn’t switched on yet. Ask your coach.' : 'Could not save: ' + error.message); return }
    setForm(null); onChange?.()
  }
  async function remove(id) {
    await supabase.from('client_events').delete().eq('id', id)
    onChange?.()
  }

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ fontSize: 15 }}>🎤 Shows & travel</strong>
        <button className="btn-ghost" style={{ padding: '5px 11px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setForm(f => f ? null : BLANK())}>
          <Plus size={13} /> Add
        </button>
      </div>
      {form && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10, background: 'var(--steel)', borderRadius: 8, padding: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {Object.entries(EVENT_KINDS).map(([k, v]) => (
              <button key={k} type="button" className={form.kind === k ? 'btn' : 'btn-ghost'} style={{ padding: '7px 4px', fontSize: 12 }}
                onClick={() => setForm({ ...form, kind: k })}>{v.icon} {v.label.split(' /')[0]}</button>
            ))}
          </div>
          <input placeholder={form.kind === 'travel' ? 'Where to? (e.g. Orlando)' : 'Show name (e.g. Dynamite)'} value={form.kind === 'travel' ? form.location : form.title}
            onChange={e => setForm(form.kind === 'travel' ? { ...form, location: e.target.value } : { ...form, title: e.target.value })} />
          {form.kind !== 'travel' && <input placeholder="City (optional)" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
            <label>{form.kind === 'travel' ? 'Leave' : 'Date'} <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} style={{ width: 'auto' }} /></label>
            <label>{form.kind === 'travel' ? 'Back' : 'Last day (if more than one)'} <input type="date" value={form.end_date} min={form.start_date} onChange={e => setForm({ ...form, end_date: e.target.value })} style={{ width: 'auto' }} /></label>
          </div>
          <button className="btn" style={{ alignSelf: 'flex-start', padding: '8px 16px', fontSize: 13 }} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      )}
      {upcoming.length === 0 && !form && <p className="muted" style={{ fontSize: 13, margin: 0 }}>Add your bookings and trips. Your training advice adjusts around them and your coach sees them too.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {upcoming.map(e => (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <span style={{ width: 22 }}>{EVENT_KINDS[e.kind]?.icon}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <strong>{e.title || (e.kind === 'travel' ? `Travel${e.location ? ` to ${e.location}` : ''}` : EVENT_KINDS[e.kind]?.label)}</strong>
              {e.title && e.location && <span className="muted"> · {e.location}</span>}
              <span className="muted" style={{ display: 'block', fontSize: 12 }}>{md(e.start_date)}{e.end_date !== e.start_date ? ` → ${md(e.end_date)}` : ''}</span>
            </span>
            <button onClick={() => remove(e.id)} aria-label="Delete" style={{ background: 'none', color: 'var(--muted)' }}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}
