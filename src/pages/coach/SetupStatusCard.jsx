// Coach Home: active clients who haven't finished the "Get set up" checklist,
// with what's missing. Hidden when everyone's set up.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { setupItems, SHORT } from '../../lib/setup'

export default function SetupStatusCard() {
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    (async () => {
      const { data: clients } = await supabase.from('profiles').select('id, full_name').eq('role', 'client').eq('status', 'active')
      const ids = (clients || []).map(c => c.id)
      if (!ids.length) return setRows([])
      const ninety = new Date(Date.now() - 90 * 864e5).toISOString()
      const [setup, synced, steps, wl, ml, ck] = await Promise.all([
        supabase.from('client_setup').select('*').in('client_id', ids),
        supabase.from('daily_logs').select('client_id').in('client_id', ids).eq('steps_source', 'shortcut').limit(5000),
        supabase.from('daily_logs').select('client_id').in('client_id', ids).not('steps', 'is', null).limit(5000),
        supabase.from('workout_logs').select('client_id').in('client_id', ids).gte('logged_at', ninety).limit(5000),
        supabase.from('meal_logs').select('client_id').in('client_id', ids).limit(5000),
        supabase.from('checkins').select('client_id').in('client_id', ids).limit(5000),
      ])
      if (setup.error) return setRows([])   // migration not run yet
      const has = r => new Set((r.data || []).map(x => x.client_id))
      const S = Object.fromEntries((setup.data || []).map(s => [s.client_id, s]))
      const sy = has(synced), st = has(steps), w = has(wl), m = has(ml), c = has(ck)
      const out = (clients || []).map(cl => {
        const s = S[cl.id] || {}
        const r = setupItems({ platform: s.platform || 'ios', installed: !!s.installed_at, pushOn: !!s.push_on_at,
          stepsSynced: sy.has(cl.id), anySteps: st.has(cl.id), workout: w.has(cl.id), food: m.has(cl.id), checkin: c.has(cl.id) })
        return { ...cl, ...r, missing: r.items.filter(i => !i.done).map(i => SHORT[i.key]), never: !S[cl.id] }
      }).filter(r => r.done < r.total).sort((a, b) => a.done - b.done)
      setRows(out)
    })()
  }, [])
  if (!rows || !rows.length) return null
  const shown = open ? rows : rows.slice(0, 5)
  return (
    <div className="card" style={{ marginBottom: 20, borderLeft: '3px solid var(--orange)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong style={{ fontSize: 15 }}>Setup not finished · {rows.length}</strong>
        <span className="muted" style={{ fontSize: 12 }}>Notifications only count once they open the new app version</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
        {shown.map(r => (
          <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 14 }}>
            <Link to={`/coach/review/${r.id}`} style={{ fontWeight: 700, color: 'inherit', textDecoration: 'none', minWidth: 130 }}>{r.full_name || 'Client'}</Link>
            <span className="muted" style={{ fontSize: 12 }}>{r.done}/{r.total}</span>
            <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {r.missing.map(m => <span key={m} style={{ fontSize: 11.5, padding: '2px 8px', borderRadius: 10, background: 'rgba(255,106,0,.14)', color: 'var(--orange-hot)', fontWeight: 700 }}>{m}</span>)}
            </span>
          </div>
        ))}
      </div>
      {rows.length > 5 && <button className="btn-ghost" style={{ marginTop: 10, padding: '5px 11px', fontSize: 12 }} onClick={() => setOpen(o => !o)}>{open ? 'Show fewer' : `Show all ${rows.length}`}</button>}
    </div>
  )
}
