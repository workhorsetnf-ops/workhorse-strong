// "My profile": the client keeps their own details up to date. Coach-set items
// (phase, macros, check-in day, targets) are shown read-only; the database only
// accepts the personal fields from a client anyway.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { WEEKDAYS } from '../../lib/dashboard'

const lab = { fontSize: 11.5, display: 'block', marginBottom: 4 }
const fromProfile = p => ({
  full_name: p?.full_name || '', phone: p?.phone || '', age: p?.age ?? '', sex: p?.sex || 'male',
  height_ft: p?.height_in ? Math.floor(p.height_in / 12) : '', height_inch: p?.height_in ? p.height_in % 12 : '',
  goal: p?.goal || '', limitations: p?.limitations || '',
})

export default function ClientProfile() {
  const { profile, session, refreshProfile, signOut } = useAuth()
  const [form, setForm] = useState(() => fromProfile(profile))
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState(null)
  const [pw, setPw] = useState({ a: '', b: '' })
  const [pwNote, setPwNote] = useState(null)

  useEffect(() => { setForm(fromProfile(profile)) }, [profile?.id])
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setNote(null) }

  async function save(e) {
    e.preventDefault()
    if (!form.full_name.trim()) { setNote({ ok: false, text: 'Please enter your name.' }); return }
    const ft = form.height_ft === '' ? null : +form.height_ft, inch = form.height_inch === '' ? 0 : +form.height_inch
    if ((ft !== null && (ft < 3 || ft > 8)) || inch < 0 || inch > 11) { setNote({ ok: false, text: 'Height looks off: feet 3–8, inches 0–11.' }); return }
    if (form.age !== '' && (+form.age < 13 || +form.age > 100)) { setNote({ ok: false, text: 'Age looks off.' }); return }
    setSaving(true)
    const { error } = await supabase.from('profiles').update({
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      age: form.age === '' ? null : Math.round(+form.age),
      sex: form.sex,
      height_in: ft === null ? null : ft * 12 + inch,
      goal: form.goal.trim(),
      limitations: form.limitations.trim(),
    }).eq('id', profile.id)
    setSaving(false)
    if (error) { setNote({ ok: false, text: 'Could not save: ' + error.message }); return }
    await refreshProfile?.()
    setNote({ ok: true, text: 'Saved. Your coach will see the update.' })
  }

  async function changePassword(e) {
    e.preventDefault()
    if (pw.a.length < 8) { setPwNote({ ok: false, text: 'Use at least 8 characters.' }); return }
    if (pw.a !== pw.b) { setPwNote({ ok: false, text: 'The two passwords don’t match.' }); return }
    const { error } = await supabase.auth.updateUser({ password: pw.a })
    if (error) { setPwNote({ ok: false, text: error.message }); return }
    setPw({ a: '', b: '' }); setPwNote({ ok: true, text: 'Password changed.' })
  }

  const p = profile || {}
  const macros = p.protein_g || p.carbs_g || p.fat_g ? `${p.protein_g || 0}P · ${p.carbs_g || 0}C · ${p.fat_g || 0}F` : '—'
  const coachRows = [
    ['Phase', p.phase ? p.phase[0].toUpperCase() + p.phase.slice(1) : '—'],
    ['Daily macros', macros],
    ['Check-in day', p.checkin_day != null ? WEEKDAYS[p.checkin_day] : '—'],
    ['Steps target', p.steps_target ? Number(p.steps_target).toLocaleString() : '—'],
    ['Water', p.water_oz ? `${p.water_oz} oz` : '—'],
    ['Goal weight', p.target_weight ? `${p.target_weight} lb` : '—'],
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
      <header>
        <div className="eyebrow">Account</div>
        <h1 style={{ fontSize: 28, margin: '6px 0 4px' }}>My profile</h1>
        <p className="muted" style={{ fontSize: 14 }}>Keep this up to date so your coach is working from the right numbers.</p>
      </header>

      <form className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={save}>
        <div className="eyebrow">Your details</div>
        <div><label className="muted" style={lab}>Full name</label><input value={form.full_name} onChange={e => set('full_name', e.target.value)} autoComplete="name" /></div>
        <div><label className="muted" style={lab}>Email (login)</label><input value={session?.user?.email || p.email || ''} disabled style={{ opacity: 0.7 }} />
          <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>To change your login email, message your coach.</div></div>
        <div><label className="muted" style={lab}>Phone</label><input type="tel" inputMode="tel" placeholder="(555) 555-5555" value={form.phone} onChange={e => set('phone', e.target.value)} autoComplete="tel" /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label className="muted" style={lab}>Age</label><input inputMode="numeric" value={form.age} onChange={e => set('age', e.target.value.replace(/\D/g, ''))} /></div>
          <div><label className="muted" style={lab}>Sex</label>
            <select value={form.sex} onChange={e => set('sex', e.target.value)}><option value="male">Male</option><option value="female">Female</option></select></div>
          <div><label className="muted" style={lab}>Height (ft)</label><input inputMode="numeric" placeholder="6" value={form.height_ft} onChange={e => set('height_ft', e.target.value.replace(/\D/g, ''))} /></div>
          <div><label className="muted" style={lab}>Height (in)</label><input inputMode="numeric" placeholder="0" value={form.height_inch} onChange={e => set('height_inch', e.target.value.replace(/\D/g, ''))} /></div>
        </div>
        <div><label className="muted" style={lab}>Your goal</label><input placeholder="e.g. Drop to 205 for TV" value={form.goal} onChange={e => set('goal', e.target.value)} /></div>
        <div><label className="muted" style={lab}>Injuries / limitations</label>
          <textarea rows={3} placeholder="e.g. Left shoulder flares up on overhead pressing" value={form.limitations} onChange={e => set('limitations', e.target.value)} /></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
          {note && <span style={{ fontSize: 13, color: note.ok ? 'var(--green)' : 'var(--red)' }}>{note.text}</span>}
        </div>
      </form>

      <section className="card" style={{ padding: 18 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Set by your coach</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
          {coachRows.map(([k, v]) => (
            <div key={k}><div className="muted" style={{ fontSize: 11.5 }}>{k}</div><div style={{ fontWeight: 700, fontSize: 15 }}>{v}</div></div>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>Want any of these changed? <Link to="/app/messages">Message your coach</Link>.</p>
      </section>

      <form className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={changePassword}>
        <div className="eyebrow">Change password</div>
        <div><label className="muted" style={lab}>New password</label><input type="password" autoComplete="new-password" value={pw.a} onChange={e => { setPw({ ...pw, a: e.target.value }); setPwNote(null) }} /></div>
        <div><label className="muted" style={lab}>Type it again</label><input type="password" autoComplete="new-password" value={pw.b} onChange={e => { setPw({ ...pw, b: e.target.value }); setPwNote(null) }} /></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-ghost" type="submit" disabled={!pw.a}>Update password</button>
          {pwNote && <span style={{ fontSize: 13, color: pwNote.ok ? 'var(--green)' : 'var(--red)' }}>{pwNote.text}</span>}
        </div>
      </form>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link to="/app/reminders" className="btn-ghost" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Bell size={15} /> Reminders</Link>
        <button className="btn-ghost" onClick={signOut}>Sign out</button>
      </div>
      <Link to="/app" className="muted" style={{ fontSize: 13 }}>← Back to Home</Link>
    </div>
  )
}
