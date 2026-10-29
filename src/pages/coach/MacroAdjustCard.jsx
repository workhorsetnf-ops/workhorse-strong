// Weekly review: suggested macro change from the scale trend vs phase goal.
// Approve as-is, tweak the numbers first, or leave it.
import { useEffect, useState } from 'react'
import { Scale } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { notifyEvent } from '../../lib/push'
import { addDays } from '../../lib/dashboard'
import { weightTrend, suggestAdjustment, clientNote } from '../../lib/macroAdjust'

export default function MacroAdjustCard({ profile, daily, days, review, onApplied }) {
  const { profile: me } = useAuth()
  const [lastChange, setLastChange] = useState(undefined)   // undefined = loading, null = never
  const [edit, setEdit] = useState(null)
  const [tell, setTell] = useState(true)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)

  useEffect(() => {
    setDone(null); setEdit(null)
    supabase.from('macro_changes').select('created_at').eq('client_id', profile.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data, error }) => setLastChange(error ? null : data ? Math.floor((Date.now() - new Date(data.created_at)) / 864e5) : null))
  }, [profile.id, days[0]])

  if (lastChange === undefined) return null
  const macros = { p: profile.protein_g, c: profile.carbs_g, f: profile.fat_g }
  const trend = weightTrend(daily, days, addDays)
  const s = suggestAdjustment({ phase: profile.phase || 'cut', macros, trend, adherence: review.nutrition, lastChangeDays: lastChange })
  const to = edit || s.to
  const kcal = x => x.p * 4 + x.c * 4 + x.f * 9
  const changed = to.p !== s.from.p || to.c !== s.from.c || to.f !== s.from.f
  const color = s.kind === 'down' || s.kind === 'up' ? 'var(--orange)' : s.kind === 'adherence' ? '#e5484d' : 'var(--line)'

  async function approve() {
    setBusy(true)
    const row = { protein_g: to.p, carbs_g: to.c, fat_g: to.f, calories: kcal(to) }
    const { error } = await supabase.from('profiles').update(row).eq('id', profile.id)
    if (error) { setBusy(false); alert('Could not update macros: ' + error.message); return }
    await supabase.from('macro_changes').insert({ client_id: profile.id, from_macros: { ...s.from, kcal: kcal(s.from) }, to_macros: { ...to, kcal: kcal(to) }, reason: s.why })
    if (tell && me) {
      const first = String(profile.full_name || '').split(/\s+/)[0]
      const { error: mErr } = await supabase.from('messages').insert({ sender_id: me.id, recipient_id: profile.id, body: clientNote({ from: s.from, to }, first) })
      if (!mErr) notifyEvent('message', { to: profile.id })
    }
    setBusy(false); setDone(to); onApplied?.(row)
  }

  const cell = (k, label) => (
    <div style={{ textAlign: 'center' }}>
      <div className="muted" style={{ fontSize: 11 }}>{label}</div>
      <div style={{ fontSize: 13 }} className="muted">{s.from[k]}g</div>
      <input inputMode="numeric" value={to[k]} onChange={e => setEdit({ ...to, [k]: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
        style={{ width: 64, textAlign: 'center', fontWeight: 800, color: to[k] !== s.from[k] ? 'var(--orange)' : undefined }} />
    </div>
  )

  return (
    <div className="card" style={{ borderLeft: `3px solid ${color}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <strong style={{ fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}><Scale size={16} color="var(--orange)" /> Macro check</strong>
      {done ? (
        <p style={{ fontSize: 14, color: 'var(--green)', margin: 0 }}>Updated to P {done.p} / C {done.c} / F {done.f} · {kcal(done)} kcal{tell ? ', and they got a message.' : '.'}</p>
      ) : (
        <>
          <p style={{ fontSize: 14, margin: 0 }}>
            <strong>{s.kind === 'down' ? `Suggest −${Math.abs(s.deltaKcal)} kcal` : s.kind === 'up' ? `Suggest +${s.deltaKcal} kcal` : s.kind === 'adherence' ? 'Hold: adherence first' : 'Hold'}</strong>
            <span className="muted"> · {s.why}</span>
          </p>
          {s.kind !== 'nodata' && (
            <>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                {cell('p', 'Protein')}{cell('c', 'Carbs')}{cell('f', 'Fat')}
                <div className="muted" style={{ fontSize: 13, paddingBottom: 8 }}>{kcal(s.from)} → <strong style={{ color: changed ? 'var(--orange)' : undefined }}>{kcal(to)} kcal</strong></div>
              </div>
              {changed && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className="btn" onClick={approve} disabled={busy}>{busy ? 'Saving…' : 'Approve change'}</button>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <input type="checkbox" checked={tell} onChange={e => setTell(e.target.checked)} style={{ width: 'auto' }} /> Message them the new numbers
                  </label>
                  {edit && <button className="btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => setEdit(null)}>Reset</button>}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
