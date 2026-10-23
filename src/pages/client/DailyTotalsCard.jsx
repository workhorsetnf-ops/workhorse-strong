// "Just log my totals": the day's protein / carbs / fat in one entry instead of
// meal by meal. Saved as a single "Daily totals" food-log row (one per day,
// edited in place), which counts as the whole day everywhere food is added up.
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { localDateStr } from '../../lib/weeks'
import { addDays } from '../../lib/dashboard'
import { DAILY_TOTALS, isDailyTotals, totalsOf } from '../../lib/foodlog'

const r0 = n => Math.round(Number(n) || 0)

export default function DailyTotalsCard({ clientId, onSaved }) {
  const today = localDateStr()
  const [day, setDay] = useState(today)
  const [rows, setRows] = useState(null)
  const [f, setF] = useState({ p: '', c: '', fat: '' })
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function load(d = day) {
    const { data } = await supabase.from('meal_logs').select('*').eq('client_id', clientId).eq('logged_on', d)
    setRows(data || [])
    const t = (data || []).find(isDailyTotals)
    setF(t ? { p: String(t.protein_g ?? ''), c: String(t.carbs_g ?? ''), fat: String(t.fat_g ?? '') } : { p: '', c: '', fat: '' })
  }
  useEffect(() => { if (clientId && open) load(day) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientId, day, open])

  const existing = (rows || []).find(isDailyTotals)
  const itemized = (rows || []).filter(l => !isDailyTotals(l))
  const logged = totalsOf(itemized)
  const kcal = r0(f.p) * 4 + r0(f.c) * 4 + r0(f.fat) * 9
  const ready = [f.p, f.c, f.fat].every(v => String(v).trim() !== '' && !isNaN(Number(v)))

  async function save() {
    if (!ready) return
    setBusy(true)
    const vals = { protein_g: r0(f.p), carbs_g: r0(f.c), fat_g: r0(f.fat) }
    const { error } = existing
      ? await supabase.from('meal_logs').update(vals).eq('id', existing.id)
      : await supabase.from('meal_logs').insert({ client_id: clientId, logged_on: day, meal: DAILY_TOTALS, meal_name: DAILY_TOTALS, ...vals })
    setBusy(false)
    if (error) { alert('Could not save: ' + error.message); return }
    await load(day); onSaved?.(); setOpen(false)
  }
  async function remove() {
    if (!existing || !window.confirm('Remove the daily totals for this day?')) return
    await supabase.from('meal_logs').delete().eq('id', existing.id)
    await load(day); onSaved?.()
  }

  if (!open) {
    return (
      <button type="button" className="btn-ghost" onClick={() => setOpen(true)} style={{ textAlign: 'left', padding: '11px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontWeight: 800, fontSize: 13.5 }}>Rather just log your totals? <span style={{ color: 'var(--orange-hot)' }}>Enter the day's macros →</span></span>
        <span className="muted" style={{ fontSize: 12 }}>Type in your protein, carbs and fat for the day (e.g. from another tracking app) instead of every meal.</span>
      </button>
    )
  }

  const lab = { fontSize: 11.5, color: 'var(--muted)', fontWeight: 700 }
  return (
    <div className="card" style={{ borderLeft: '3px solid var(--orange)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div className="eyebrow" style={{ fontSize: 10 }}>Daily totals</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[[today, 'Today'], [addDays(today, -1), 'Yesterday']].map(([d, l]) => (
            <button key={d} type="button" className={day === d ? 'btn' : 'btn-ghost'} onClick={() => setDay(d)} style={{ padding: '5px 12px', fontSize: 12 }}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <div><div style={lab}>Protein (g)</div><input inputMode="numeric" placeholder={logged.items ? String(r0(logged.p)) : 'e.g. 190'} value={f.p} onChange={e => setF({ ...f, p: e.target.value })} /></div>
        <div><div style={lab}>Carbs (g)</div><input inputMode="numeric" placeholder={logged.items ? String(r0(logged.c)) : 'e.g. 220'} value={f.c} onChange={e => setF({ ...f, c: e.target.value })} /></div>
        <div><div style={lab}>Fat (g)</div><input inputMode="numeric" placeholder={logged.items ? String(r0(logged.f)) : 'e.g. 65'} value={f.fat} onChange={e => setF({ ...f, fat: e.target.value })} /></div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{kcal ? `${kcal.toLocaleString()} kcal` : ''}</div>
      {itemized.length > 0 && (
        <div className="muted" style={{ fontSize: 12 }}>
          You've also logged {itemized.length} item{itemized.length === 1 ? '' : 's'} {day === today ? 'today' : 'yesterday'} ({r0(logged.p)}P / {r0(logged.c)}C / {r0(logged.f)}F). Your totals count as the whole day, so enter everything you ate; the items won't be added on top.
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn" disabled={!ready || busy} onClick={save}>{busy ? 'Saving…' : existing ? 'Update totals' : 'Save totals'}</button>
        <button className="btn-ghost" onClick={() => setOpen(false)}>Close</button>
        {existing && <button className="btn-ghost" style={{ color: 'var(--red)', marginLeft: 'auto' }} onClick={remove}>Remove</button>}
      </div>
    </div>
  )
}
