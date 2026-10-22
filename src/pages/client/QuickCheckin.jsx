import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { localDateStr } from '../../lib/weeks'
import { addDays } from '../../lib/dashboard'
import { quickDone, quickDue } from '../../lib/adherence'

const CADENCE = {
  3: 'Daily for now: it gets lighter as your weeks stay on track',
  2: 'Every other day',
  1: 'Twice a week (Monday & Thursday)',
}
const filled = v => v !== null && v !== undefined && v !== ''

// The short check-in on Home for clients on an adherence tier. Five quick
// fields, pre-filled from anything already in today's Daily Log, so nothing is
// typed twice. Only shows on the days their tier asks for it.
export default function QuickCheckin({ profile }) {
  const tier = profile?.adherence_tier
  const today = localDateStr()
  const [rows, setRows] = useState(null)
  const [f, setF] = useState({ weight: '', sleep_hours: '', readiness: null, steps: '', note: '' })
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data } = await supabase.from('daily_logs').select('*').eq('client_id', profile.id)
      .gte('log_date', addDays(today, -7)).lte('log_date', today)
    setRows(data || [])
    const t = (data || []).find(r => r.log_date === today) || {}
    setF({ weight: t.weight ?? '', sleep_hours: t.sleep_hours ?? '', readiness: t.readiness ?? null, steps: t.steps ?? '', note: t.note ?? '' })
  }
  useEffect(() => { if (profile && tier) load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [profile?.id, tier])

  if (!tier || !rows) return null
  const done = new Set(rows.filter(quickDone).map(r => r.log_date))
  const doneToday = done.has(today)
  const due = quickDue(tier, done, today)
  if (!due && !doneToday) return null

  const any = ['weight', 'sleep_hours', 'readiness', 'steps', 'note'].some(k => filled(f[k]) && String(f[k]).trim() !== '')
  async function save() {
    if (!any) return
    setBusy(true)
    const patch = { client_id: profile.id, log_date: today, quick_checkin_at: new Date().toISOString() }
    // only write what they filled, so an empty box never wipes a Daily Log value
    if (filled(f.weight)) patch.weight = Number(f.weight)
    if (filled(f.sleep_hours)) patch.sleep_hours = Number(f.sleep_hours)
    if (filled(f.readiness)) patch.readiness = f.readiness
    if (filled(f.steps)) patch.steps = Math.round(Number(f.steps))
    if (String(f.note || '').trim()) patch.note = String(f.note).trim()
    const { error } = await supabase.from('daily_logs').upsert(patch, { onConflict: 'client_id,log_date' })
    setBusy(false)
    if (error) { alert('Could not save: ' + error.message); return }
    setOpen(false)
    load()
  }

  if (doneToday && !open) {
    return (
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px' }}>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>Quick check-in done <span style={{ color: 'var(--orange-hot)' }}>✓</span></div>
        <button className="btn-ghost" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setOpen(true)}>Edit</button>
      </div>
    )
  }

  const lab = { fontSize: 11.5, color: 'var(--muted)', fontWeight: 700 }
  return (
    <div className="card" style={{ borderLeft: '3px solid var(--orange)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div className="eyebrow" style={{ fontSize: 10 }}>Quick check-in · about 30 seconds</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{CADENCE[tier]}. Missed a day? Logging a rough one still counts.</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div><div style={lab}>Weight (lb)</div><input inputMode="decimal" placeholder="e.g. 218.4" value={f.weight} onChange={e => setF({ ...f, weight: e.target.value })} /></div>
        <div><div style={lab}>Sleep (hrs)</div><input inputMode="decimal" placeholder="e.g. 7.5" value={f.sleep_hours} onChange={e => setF({ ...f, sleep_hours: e.target.value })} /></div>
      </div>
      <div>
        <div style={lab}>Recovery</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          {[1, 2, 3, 4, 5].map(v => (
            <button key={v} type="button" onClick={() => setF({ ...f, readiness: f.readiness === v ? null : v })}
              style={{ flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 15, fontWeight: 800, background: f.readiness === v ? 'var(--orange)' : 'var(--steel)', color: f.readiness === v ? '#fff' : 'var(--muted)' }}>{v}</button>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 10.5, marginTop: 4, display: 'flex', justifyContent: 'space-between' }}><span>Beat up</span><span>Fresh</span></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
        <div><div style={lab}>Steps <span style={{ fontWeight: 400 }}>(optional)</span></div><input inputMode="numeric" placeholder="e.g. 9000" value={f.steps} onChange={e => setF({ ...f, steps: e.target.value })} /></div>
        <div><div style={lab}>Anything I should know? <span style={{ fontWeight: 400 }}>(optional)</span></div><input placeholder="Travel, a match, a rough day…" value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" disabled={!any || busy} onClick={save} style={{ flex: 1 }}>{busy ? 'Saving…' : 'Done'}</button>
        {doneToday && <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>}
      </div>
    </div>
  )
}
